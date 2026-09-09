// Pure sleeve-level allocation math. No I/O. Unit-tested in src/test/sleeves.test.ts.
import {
  BASE_SLEEVE_MATRIX,
  REGIME_TILTS,
  type ConstraintSet,
} from "@/lib/config";
import { horizonBucket, SLEEVES, type Horizon, type RiskScore, type Sleeve } from "@/lib/enums";

export type SleeveWeights = Record<Sleeve, number>;

export function baseSleeves(risk: RiskScore, horizon: Horizon): SleeveWeights {
  return { ...BASE_SLEEVE_MATRIX[risk][horizonBucket(horizon)] };
}

function defensiveTotal(w: SleeveWeights): number {
  return w.defensiveEquity + w.gold + w.bonds + w.cash;
}

function normalise(w: SleeveWeights): SleeveWeights {
  const total = SLEEVES.reduce((a, s) => a + Math.max(0, w[s]), 0);
  const out = {} as SleeveWeights;
  for (const s of SLEEVES) out[s] = Math.max(0, w[s]) / total;
  return out;
}

/**
 * Apply the regime tilt to a base sleeve allocation, then enforce the risk
 * profile's growth ceiling, defensive floor and minimum cash. Always returns a
 * set of non-negative weights summing to 1.
 */
export function tiltSleeves(
  base: SleeveWeights,
  regime: string,
  constraints: ConstraintSet,
): SleeveWeights {
  const tilt = REGIME_TILTS[regime] ?? {};
  let out: SleeveWeights = { ...base };
  for (const s of SLEEVES) out[s] = Math.max(0, out[s] + (tilt[s] ?? 0));
  out = normalise(out);

  if (out.growth > constraints.maxGrowth) {
    const excess = out.growth - constraints.maxGrowth;
    out.growth = constraints.maxGrowth;
    out.bonds += excess * 0.5;
    out.gold += excess * 0.3;
    out.cash += excess * 0.2;
  }

  const defShort = constraints.minDefensive - defensiveTotal(out);
  if (defShort > 0) {
    out.growth = Math.max(0, out.growth - defShort);
    out.bonds += defShort * 0.5;
    out.gold += defShort * 0.3;
    out.defensiveEquity += defShort * 0.2;
  }

  if (out.cash < constraints.minCash) {
    const need = constraints.minCash - out.cash;
    out.cash = constraints.minCash;
    out.growth = Math.max(0, out.growth - need);
  }

  return normalise(out);
}

/** Bounded macro + aggregate-valuation tilt applied AFTER the regime tilt.
 *  Inputs are already-normalised signals in roughly [-1, 1]. Total shift is
 *  capped so it can only refine, never dominate, the strategic allocation. */
export function macroValuationTilt(
  sleeves: SleeveWeights,
  signals: {
    realYieldDirection?: number | null; // + = rising real yields (bad for growth & gold)
    curveSignal?: number | null; // + = steepening / positive (pro-cyclical)
    usdDirection?: number | null; // + = stronger USD (headwind for risk)
    universeValuationPct?: number | null; // 0..1 aggregate forward-PE percentile vs history proxy
  },
  constraints: ConstraintSet,
): { sleeves: SleeveWeights; notes: string[] } {
  const notes: string[] = [];
  const out: SleeveWeights = { ...sleeves };
  const CAP = 0.06; // max cumulative shift out of growth

  let growthDelta = 0;
  if (signals.realYieldDirection != null && Math.abs(signals.realYieldDirection) > 0.15) {
    const d = -signals.realYieldDirection * 0.04;
    growthDelta += d;
    notes.push(
      signals.realYieldDirection > 0
        ? "Rising real yields — modestly trimming growth and gold."
        : "Falling real yields — modestly adding to growth and gold.",
    );
    out.gold += -signals.realYieldDirection * 0.02;
  }
  if (signals.usdDirection != null && Math.abs(signals.usdDirection) > 0.2) {
    growthDelta += -signals.usdDirection * 0.02;
    notes.push(signals.usdDirection > 0 ? "Stronger USD — small risk-off adjustment." : "Softer USD — small risk-on adjustment.");
  }
  if (signals.universeValuationPct != null) {
    if (signals.universeValuationPct > 0.8) {
      growthDelta -= 0.03;
      notes.push("Aggregate equity valuations rich vs history — trimming growth toward bonds/cash.");
    } else if (signals.universeValuationPct < 0.3) {
      growthDelta += 0.03;
      notes.push("Aggregate equity valuations undemanding — adding to growth.");
    }
  }

  growthDelta = Math.max(-CAP, Math.min(CAP, growthDelta));
  out.growth = Math.max(0, out.growth + growthDelta);
  const offset = -growthDelta;
  out.bonds += offset * 0.6;
  out.cash += offset * 0.4;

  // re-enforce the hard floors/ceilings
  return { sleeves: tiltSleeves(out, "NEUTRAL", constraints), notes };
}

export type EquitySleeve = "growth" | "defensiveEquity";
const DEFENSIVE_SECTORS = /health care|consumer staples|utilities/i;

/** Assign an equity to the growth or defensive-equity sleeve. */
export function equitySleeveFor(input: {
  defensiveFactor: number;
  sector: string;
  vol: number | null;
}): EquitySleeve {
  let d = 0.6 * input.defensiveFactor;
  if (DEFENSIVE_SECTORS.test(input.sector)) d += 0.35;
  if (input.vol != null && input.vol < 0.22) d += 0.1;
  return d >= 0.42 ? "defensiveEquity" : "growth";
}
