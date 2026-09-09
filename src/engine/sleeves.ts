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
