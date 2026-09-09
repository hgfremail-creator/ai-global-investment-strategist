// Portfolio construction engine (pure). See ARCHITECTURE.md §6 and
// docs/PORTFOLIO_ALGORITHM.md. No I/O; fully deterministic; unit-tested.
//
// Pipeline: sleeve targets (input) → per-sleeve candidate selection →
// within-sleeve weights (score × risk-parity, clamped) → global constraint
// projection (sector / country / currency / single-name) → portfolio-vol check →
// existing-holdings reconciliation → factor look-through → exact-100% rounding.

import type { ConstraintSet } from "@/lib/config";
import { SLEEVES, type Sleeve } from "@/lib/enums";
import type { FactorLoadings } from "./aiExposure";
import { allocateMinor } from "@/lib/money";

export type Candidate = {
  ticker: string;
  name: string;
  sleeve: Sleeve;
  assetClass: string;
  country: string;
  sector: string;
  currency: string;
  score: number; // 0..100 overall
  vol: number; // annualised realised vol (fraction); >0
  factors: FactorLoadings;
  priceUsd: number;
};

export type ExistingHolding = {
  ticker: string;
  quantity: number;
  avgPriceUsd: number;
  marketValueUsd: number;
};

export type AllocationInput = {
  capitalUsdMinor: number;
  sleeveTargets: Record<Sleeve, number>;
  constraints: ConstraintSet;
  candidates: Candidate[];
  existing: ExistingHolding[];
  horizonBucket: "short" | "medium" | "long";
};

export type AllocationRow = {
  ticker: string;
  name: string;
  sleeve: Sleeve;
  assetClass: string;
  country: string;
  sector: string;
  currency: string;
  weight: number; // 0..1, rounded to 0.001
  usdMinor: number;
  score: number;
  vol: number;
};

export type ReconRow = {
  ticker: string;
  existingWeight: number;
  targetWeight: number;
  deltaWeight: number; // target - existing
  note: string;
};

export type AllocationResult = {
  rows: AllocationRow[];
  sleeveActual: Record<Sleeve, number>;
  factorExposure: { aiFactor: number; semiconductor: number; usTech: number; defensive: number; rates: number; gold: number };
  countryExposure: Record<string, number>;
  sectorExposure: Record<string, number>;
  currencyExposure: Record<string, number>;
  estPortfolioVol: number;
  boundConstraints: string[];
  warnings: string[];
  reconciliation: ReconRow[];
};

const EPS = 1e-9;

/** The single-name cap applies to concentration RISK. Cash and government bonds
 *  are not single-name risks in that sense, so they get a looser cap. */
function nameCap(assetClass: string, maxSingleName: number): number {
  if (assetClass === "CASH") return 1;
  if (assetClass === "GOV_BOND") return Math.max(maxSingleName, 0.25);
  return maxSingleName;
}

function emptySleeves(): Record<Sleeve, number> {
  return Object.fromEntries(SLEEVES.map((s) => [s, 0])) as Record<Sleeve, number>;
}

function groupSum(rows: { key: string; w: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = (out[r.key] ?? 0) + r.w;
  return out;
}

/** How many names to hold in a sleeve so no name must exceed maxSingleName,
 *  plus a diversification buffer, bounded by availability. */
function targetNameCount(sleeveWeight: number, maxSingleName: number, available: number): number {
  if (available <= 1) return available;
  const min = Math.ceil(sleeveWeight / Math.min(maxSingleName, sleeveWeight + EPS));
  return Math.max(1, Math.min(available, min + 2));
}

function selectSleeve(
  sleeve: Sleeve,
  sleeveWeight: number,
  cands: Candidate[],
  c: ConstraintSet,
  horizonBucket: AllocationInput["horizonBucket"],
): Candidate[] {
  const inSleeve = cands.filter((x) => x.sleeve === sleeve);
  if (inSleeve.length === 0) return [];

  if (sleeve === "cash") return inSleeve.slice(0, 1);

  if (sleeve === "gold") {
    // Prefer the higher-scoring instrument; keep at most 2 for optionality.
    return [...inSleeve].sort((a, b) => b.score - a.score).slice(0, Math.min(2, inSleeve.length));
  }

  if (sleeve === "bonds") {
    // Duration fit: short horizon favours short-duration, long favours intermediate.
    const shortNames = /1-3y|short|SHY/i;
    const scored = inSleeve.map((x) => {
      let fit = x.score;
      const isShort = shortNames.test(x.name) || shortNames.test(x.ticker);
      if (horizonBucket === "short") fit += isShort ? 8 : -4;
      if (horizonBucket === "long") fit += isShort ? -6 : 4;
      return { x, fit };
    });
    return scored.sort((a, b) => b.fit - a.fit).slice(0, Math.min(3, inSleeve.length)).map((s) => s.x);
  }

  // equity sleeves (growth / defensiveEquity) + diversifiers
  const eligible = inSleeve
    .filter((x) => x.assetClass !== "EQUITY" || x.score >= c.minScoreToHold)
    .sort((a, b) => b.score - a.score);
  const pool = eligible.length ? eligible : [...inSleeve].sort((a, b) => b.score - a.score);
  const n = targetNameCount(sleeveWeight, c.maxSingleName, pool.length);
  return pool.slice(0, n);
}

function withinSleeveWeights(
  selected: Candidate[],
  sleeveWeight: number,
  maxSingleName: number,
): { weights: Map<string, number>; shortfall: number } {
  const out = new Map<string, number>();
  if (selected.length === 0) return { weights: out, shortfall: sleeveWeight };
  const capOf = (s: Candidate) => nameCap(s.assetClass, maxSingleName);
  if (selected.length === 1) {
    const w = Math.min(sleeveWeight, capOf(selected[0]));
    out.set(selected[0].ticker, w);
    return { weights: out, shortfall: sleeveWeight - w };
  }

  const minScore = Math.min(...selected.map((s) => s.score));
  const scoreW = selected.map((s) => Math.max(0.05, s.score - minScore + 10));
  const rpW = selected.map((s) => 1 / Math.max(0.05, s.vol));
  const norm = (a: number[]) => {
    const t = a.reduce((x, y) => x + y, 0) || 1;
    return a.map((v) => v / t);
  };
  const sw = norm(scoreW);
  const rw = norm(rpW);
  const frac = norm(selected.map((_, i) => 0.55 * sw[i] + 0.45 * rw[i]));

  // If the sleeve is too big to diversify under maxSingleName given how many
  // names we have, cap every name at maxSingleName and report the shortfall so
  // the caller can spill it (usually into cash).
  const caps = selected.map(capOf);
  const capacity = caps.reduce((a, b) => a + b, 0);
  if (capacity <= sleeveWeight + EPS) {
    selected.forEach((s, i) => out.set(s.ticker, caps[i]));
    return { weights: out, shortfall: Math.max(0, sleeveWeight - capacity) };
  }

  // Water-filling: distribute sleeveWeight by `frac`, clamp to each name's cap,
  // redistribute the excess to names with room, repeat.
  let target = selected.map((_, i) => frac[i] * sleeveWeight);
  for (let iter = 0; iter < 30; iter++) {
    const over = target.map((w, i) => Math.max(0, w - caps[i]));
    const excess = over.reduce((a, b) => a + b, 0);
    if (excess < EPS) break;
    const room = target.map((w, i) => (w < caps[i] ? caps[i] - w : 0));
    const roomTotal = room.reduce((a, b) => a + b, 0);
    target = target.map((w, i) =>
      Math.min(caps[i], Math.min(w, caps[i]) + (roomTotal > EPS ? (room[i] / roomTotal) * excess : 0)),
    );
  }
  selected.forEach((s, i) => out.set(s.ticker, target[i]));
  const placed = [...out.values()].reduce((a, b) => a + b, 0);
  return { weights: out, shortfall: Math.max(0, sleeveWeight - placed) };
}

/** Scale down members of an over-weight group, redistribute to the rest. */
function projectGroupConstraint(
  weights: Map<string, number>,
  keyOf: (t: string) => string,
  maxGroup: number,
  label: string,
  bound: string[],
): boolean {
  const groups = new Map<string, string[]>();
  for (const t of weights.keys()) {
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  let changed = false;
  for (const [k, tickers] of groups) {
    const gw = tickers.reduce((a, t) => a + (weights.get(t) ?? 0), 0);
    if (gw <= maxGroup + 1e-6) continue;
    changed = true;
    bound.push(`${label}:${k} (${(gw * 100).toFixed(1)}% → ${(maxGroup * 100).toFixed(0)}%)`);
    const scale = maxGroup / gw;
    const freed = gw - maxGroup;
    for (const t of tickers) weights.set(t, (weights.get(t) ?? 0) * scale);
    const others = [...weights.keys()].filter((t) => keyOf(t) !== k);
    const otherTotal = others.reduce((a, t) => a + (weights.get(t) ?? 0), 0);
    if (otherTotal > EPS) {
      for (const t of others) weights.set(t, (weights.get(t) ?? 0) + freed * ((weights.get(t) ?? 0) / otherTotal));
    }
  }
  return changed;
}

export function buildPortfolio(input: AllocationInput): AllocationResult {
  const { constraints: c, candidates, capitalUsdMinor } = input;
  const warnings: string[] = [];
  const bound: string[] = [];

  const byTicker = new Map(candidates.map((x) => [x.ticker, x]));

  // ── Steps A + B: select + weight per sleeve ──────────────────────────
  const weights = new Map<string, number>();
  for (const sleeve of SLEEVES) {
    const sw = input.sleeveTargets[sleeve] ?? 0;
    if (sw < 1e-4) continue;
    const selected = selectSleeve(sleeve, sw, candidates, c, input.horizonBucket);
    if (selected.length === 0) {
      if (sw >= 0.03) {
        warnings.push(`No candidates for the ${sleeve} sleeve — its ${(sw * 100).toFixed(1)}% was redistributed to cash.`);
      }
      weights.set("USDCASH", (weights.get("USDCASH") ?? 0) + sw);
      continue;
    }
    const { weights: w, shortfall } = withinSleeveWeights(selected, sw, c.maxSingleName);
    for (const [t, v] of w) weights.set(t, (weights.get(t) ?? 0) + v);
    if (shortfall > 1e-4) {
      weights.set("USDCASH", (weights.get("USDCASH") ?? 0) + shortfall);
      if (shortfall > 0.02) {
        warnings.push(
          `The ${sleeve} sleeve (${(sw * 100).toFixed(1)}%) could not be diversified below the ${(c.maxSingleName * 100).toFixed(0)}% single-name cap with the available instruments; ${(shortfall * 100).toFixed(1)}% was moved to cash.`,
        );
      }
    }
  }

  // Guard: if USDCASH got weight but isn't a candidate, synthesise from any cash candidate
  if (weights.has("USDCASH") && !byTicker.has("USDCASH")) {
    const cashCand = candidates.find((x) => x.assetClass === "CASH");
    if (cashCand && cashCand.ticker !== "USDCASH") {
      weights.set(cashCand.ticker, (weights.get(cashCand.ticker) ?? 0) + weights.get("USDCASH")!);
      weights.delete("USDCASH");
    }
  }

  // ── Step C: global constraint projection ─────────────────────────────
  const keyCountry = (t: string) => byTicker.get(t)?.country ?? "??";
  const keySector = (t: string) => byTicker.get(t)?.sector ?? "??";
  const keyCurrency = (t: string) => byTicker.get(t)?.currency ?? "??";

  for (let iter = 0; iter < 40; iter++) {
    let changed = false;
    // single-name
    for (const [t, w] of weights) {
      const cap = nameCap(byTicker.get(t)?.assetClass ?? "EQUITY", c.maxSingleName);
      if (w > cap + 1e-6) {
        bound.push(`single-name:${t} (${(w * 100).toFixed(1)}% → ${(cap * 100).toFixed(0)}%)`);
        const freed = w - cap;
        weights.set(t, cap);
        const others = [...weights.keys()].filter((x) => x !== t);
        const ot = others.reduce((a, x) => a + (weights.get(x) ?? 0), 0);
        if (ot > EPS) for (const x of others) weights.set(x, (weights.get(x) ?? 0) + freed * ((weights.get(x) ?? 0) / ot));
        changed = true;
      }
    }
    changed = projectGroupConstraint(weights, keySector, c.maxSector, "sector", bound) || changed;
    changed = projectGroupConstraint(weights, keyCountry, c.maxCountry, "country", bound) || changed;
    changed = projectGroupConstraint(weights, keyCurrency, c.maxCurrency, "currency", bound) || changed;
    if (!changed) break;
  }

  // Final hard clamp: guarantee each name's cap; overflow goes to cash.
  {
    const cashTicker =
      [...weights.keys()].find((t) => byTicker.get(t)?.assetClass === "CASH") ??
      candidates.find((x) => x.assetClass === "CASH")?.ticker;
    let overflow = 0;
    for (const [t, w] of weights) {
      const cap = nameCap(byTicker.get(t)?.assetClass ?? "EQUITY", c.maxSingleName);
      if (w > cap + 1e-9 && t !== cashTicker) {
        overflow += w - cap;
        weights.set(t, cap);
      }
    }
    if (overflow > 0 && cashTicker) {
      weights.set(cashTicker, (weights.get(cashTicker) ?? 0) + overflow);
    }
  }

  // renormalise
  let total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (total <= EPS) {
    warnings.push("No feasible allocation — defaulting to 100% cash.");
    weights.clear();
    weights.set(candidates.find((x) => x.assetClass === "CASH")?.ticker ?? "USDCASH", 1);
    total = 1;
  }
  for (const [t, w] of weights) weights.set(t, w / total);

  // ── Step D: portfolio-vol check ─────────────────────────────────────
  const rowsPre = [...weights.entries()]
    .map(([t, w]) => ({ c: byTicker.get(t), w }))
    .filter((r): r is { c: Candidate; w: number } => !!r.c);

  const estVol = estimatePortfolioVol(rowsPre);
  if (estVol > c.maxPortfolioVol + 1e-4) {
    bound.push(`portfolio-vol (${(estVol * 100).toFixed(1)}% → ${(c.maxPortfolioVol * 100).toFixed(0)}%)`);
    const target = c.maxPortfolioVol / estVol; // <1
    // shift weight from highest-vol names toward the lowest-vol name (usually cash/bonds)
    const sorted = [...rowsPre].sort((a, b) => b.c.vol - a.c.vol);
    const safe = [...rowsPre].sort((a, b) => a.c.vol - b.c.vol)[0];
    let moved = 0;
    for (const r of sorted) {
      if (r.c.ticker === safe.c.ticker) continue;
      const cut = weights.get(r.c.ticker)! * (1 - target) * 0.6;
      weights.set(r.c.ticker, weights.get(r.c.ticker)! - cut);
      moved += cut;
    }
    weights.set(safe.c.ticker, (weights.get(safe.c.ticker) ?? 0) + moved);
    warnings.push(
      `Estimated volatility (${(estVol * 100).toFixed(1)}%) exceeded the ${(c.maxPortfolioVol * 100).toFixed(0)}% cap for this risk profile; shifted ${(moved * 100).toFixed(1)}% toward the lowest-volatility holding.`,
    );
  }

  // ── Step G: round to exact 100% ─────────────────────────────────────
  const entries = [...weights.entries()].filter(([, w]) => w > 0.0005);
  const rounded = entries.map(([t, w]) => ({ t, w: Math.round(w * 1000) / 1000 }));
  let sum = rounded.reduce((a, r) => a + r.w, 0);
  // put the residual on the lowest-risk holding (cash/bond), else the largest
  const residual = Math.round((1 - sum) * 1000) / 1000;
  if (Math.abs(residual) >= 0.001) {
    const idx =
      rounded.findIndex((r) => byTicker.get(r.t)?.assetClass === "CASH") >= 0
        ? rounded.findIndex((r) => byTicker.get(r.t)?.assetClass === "CASH")
        : rounded.reduce((mi, r, i, arr) => (r.w > arr[mi].w ? i : mi), 0);
    rounded[idx].w = Math.round((rounded[idx].w + residual) * 1000) / 1000;
  }
  sum = rounded.reduce((a, r) => a + r.w, 0);

  const usd = allocateMinor(capitalUsdMinor, rounded.map((r) => r.w));

  const rows: AllocationRow[] = rounded.map((r, i) => {
    const cand = byTicker.get(r.t)!;
    return {
      ticker: cand.ticker,
      name: cand.name,
      sleeve: cand.sleeve,
      assetClass: cand.assetClass,
      country: cand.country,
      sector: cand.sector,
      currency: cand.currency,
      weight: r.w,
      usdMinor: usd[i],
      score: cand.score,
      vol: cand.vol,
    };
  }).sort((a, b) => b.weight - a.weight);

  // ── exposures ──────────────────────────────────────────────────────
  const sleeveActual = emptySleeves();
  for (const row of rows) sleeveActual[row.sleeve] += row.weight;

  const factorExposure = { aiFactor: 0, semiconductor: 0, usTech: 0, defensive: 0, rates: 0, gold: 0 };
  for (const row of rows) {
    const f = byTicker.get(row.ticker)!.factors;
    factorExposure.aiFactor += row.weight * f.aiFactor;
    factorExposure.semiconductor += row.weight * f.semiconductor;
    factorExposure.usTech += row.weight * f.usTech;
    factorExposure.defensive += row.weight * f.defensive;
    factorExposure.rates += row.weight * f.rates;
    factorExposure.gold += row.weight * f.gold;
  }
  for (const k of Object.keys(factorExposure) as (keyof typeof factorExposure)[]) {
    factorExposure[k] = Math.round(factorExposure[k] * 1000) / 1000;
  }

  const countryExposure = groupSum(rows.map((r) => ({ key: r.country, w: r.weight })));
  const sectorExposure = groupSum(rows.map((r) => ({ key: r.sector, w: r.weight })));
  const currencyExposure = groupSum(rows.map((r) => ({ key: r.currency, w: r.weight })));

  // Report group caps that could not be met (too few diversifying instruments).
  const capWarn = (exp: Record<string, number>, max: number, label: string) => {
    for (const [k, v] of Object.entries(exp)) {
      if (v > max + 0.02) {
        warnings.push(
          `${label} exposure to ${k} is ${(v * 100).toFixed(0)}%, above the ${(max * 100).toFixed(0)}% guideline for this risk profile — there are not enough diversifying instruments in the current universe to reduce it further.`,
        );
      }
    }
  };
  capWarn(sectorExposure, c.maxSector, "Sector");
  capWarn(countryExposure, c.maxCountry, "Country");
  capWarn(currencyExposure, c.maxCurrency, "Currency");

  if (factorExposure.aiFactor > 0.7) {
    warnings.push(
      `Although the portfolio holds ${rows.length} securities, its economic exposure to the AI-infrastructure theme is ${(factorExposure.aiFactor * 100).toFixed(0)}% — highly concentrated. Owning several AI names is not the same as being diversified.`,
    );
  }
  if (factorExposure.semiconductor > 0.4) {
    warnings.push(`Semiconductor supply-chain exposure is ${(factorExposure.semiconductor * 100).toFixed(0)}% — a single cyclical driver.`);
  }

  // ── Step E: existing-holdings reconciliation ────────────────────────
  const capitalUsd = capitalUsdMinor / 100;
  const reconciliation: ReconRow[] = input.existing.map((h) => {
    const existingWeight = capitalUsd > 0 ? h.marketValueUsd / capitalUsd : 0;
    const targetWeight = rows.find((r) => r.ticker === h.ticker)?.weight ?? 0;
    const delta = Math.round((targetWeight - existingWeight) * 1000) / 1000;
    let note: string;
    if (targetWeight === 0) {
      note = `Not in the target portfolio. Current exposure ${(existingWeight * 100).toFixed(1)}% — consider reducing / reallocating.`;
    } else if (delta > 0.01) {
      note = `Below target — the model would add ~${(delta * 100).toFixed(1)}%.`;
    } else if (delta < -0.01) {
      note = `Above target by ${(-delta * 100).toFixed(1)}% — consider trimming.`;
    } else {
      note = "Roughly at target — hold.";
    }
    return { ticker: h.ticker, existingWeight: Math.round(existingWeight * 1000) / 1000, targetWeight, deltaWeight: delta, note };
  });

  const estPortfolioVol = Math.round(estimatePortfolioVol(rows.map((r) => ({ c: byTicker.get(r.ticker)!, w: r.weight }))) * 1000) / 1000;

  return {
    rows,
    sleeveActual: roundRecord(sleeveActual),
    factorExposure,
    countryExposure: roundRecord(countryExposure),
    sectorExposure: roundRecord(sectorExposure),
    currencyExposure: roundRecord(currencyExposure),
    estPortfolioVol,
    boundConstraints: [...new Set(bound)],
    warnings,
    reconciliation,
  };
}

function roundRecord(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
}

/** Diversified vol estimate: assume a uniform pairwise correlation of 0.45 between
 *  risk assets and ~0 for cash. Conservative but keeps the engine deterministic. */
export function estimatePortfolioVol(rows: { c: Candidate; w: number }[]): number {
  const RHO = 0.45;
  let variance = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      const rho = i === j ? 1 : rows[i].c.assetClass === "CASH" || rows[j].c.assetClass === "CASH" ? 0.0 : RHO;
      variance += rows[i].w * rows[j].w * rows[i].c.vol * rows[j].c.vol * rho;
    }
  }
  return Math.sqrt(Math.max(0, variance));
}
