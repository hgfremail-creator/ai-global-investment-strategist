"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import {
  HORIZONS,
  HORIZON_LABELS,
  RISK_LABELS,
  RISK_SCORES,
  type Horizon,
  type RiskScore,
} from "@/lib/enums";

type Defaults = { capitalUsd: number; riskScore: RiskScore; horizon: Horizon };

type Result = {
  applied: { riskScore: number; horizon: string; capitalUsd: number };
  rows: { ticker: string; name: string; sleeve: string; weight: number; usdMinor: number }[];
  factorExposure: { aiFactor: number; semiconductor: number; usTech: number; defensive: number };
  estVol: number;
  warnings: string[];
  diffVsCurrent: { ticker: string; name: string; current: number; hypothetical: number; delta: number }[];
  customStress?: { estimatedImpactPct: number; byTicker: { ticker: string; impactPct: number; contributionPct: number }[] };
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (minor: number) => `$${Math.round(minor / 100).toLocaleString("en-US")}`;

export function WhatIfTool({ defaults, sectors }: { defaults: Defaults; sectors: string[] }) {
  const [capital, setCapital] = useState(String(defaults.capitalUsd));
  const [risk, setRisk] = useState<RiskScore>(defaults.riskScore);
  const [horizon, setHorizon] = useState<Horizon>(defaults.horizon);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [minGold, setMinGold] = useState("");
  const [shockEq, setShockEq] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (Number(capital) > 0 && Number(capital) !== defaults.capitalUsd) body.capitalUsd = Number(capital);
    if (risk !== defaults.riskScore) body.riskScore = risk;
    if (horizon !== defaults.horizon) body.horizon = horizon;
    if (excluded.length) body.excludeSectors = excluded;
    if (Number(minGold) > 0) body.minGoldPct = Number(minGold) / 100;
    if (Number(shockEq)) body.customShock = { equity: Number(shockEq) / 100 };

    const res = await fetch("/api/whatif", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    setResult(data);
  }

  const field =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm";

  return (
    <div className="space-y-4">
      <Card title="Scenario">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Capital (USD)</span>
            <input className={`${field} w-40 tnum`} value={capital} onChange={(e) => setCapital(e.target.value)} inputMode="decimal" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Risk level</span>
            <select className={field} value={risk} onChange={(e) => setRisk(Number(e.target.value) as RiskScore)}>
              {RISK_SCORES.map((r) => (
                <option key={r} value={r}>
                  {r}/5 — {RISK_LABELS[r].title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Horizon</span>
            <select className={field} value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABELS[h]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Minimum gold %</span>
            <input className={`${field} w-24 tnum`} value={minGold} onChange={(e) => setMinGold(e.target.value)} placeholder="e.g. 25" inputMode="decimal" />
          </label>
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-xs text-[var(--color-muted)]">Exclude sectors</span>
          <div className="flex flex-wrap gap-1.5">
            {sectors.map((s) => (
              <button
                key={s}
                onClick={() => setExcluded((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  excluded.includes(s)
                    ? "border-[var(--color-sell)] bg-[var(--color-sell)]/15 text-[var(--color-sell)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)]"
                }`}
              >
                {excluded.includes(s) ? "✕ " : ""}
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">Custom equity shock % (optional)</span>
            <input className={`${field} w-24 tnum`} value={shockEq} onChange={(e) => setShockEq(e.target.value)} placeholder="e.g. -15" inputMode="decimal" />
          </label>
        </div>

        <button
          onClick={run}
          disabled={busy}
          className="mt-4 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Recomputing…" : "Recompute portfolio"}
        </button>
        {error && <p className="mt-2 text-xs text-[var(--color-sell)]">{error}</p>}
      </Card>

      {result && (
        <>
          <Card title="Hypothetical portfolio" subtitle={`Risk ${result.applied.riskScore}/5 · ${HORIZON_LABELS[result.applied.horizon as Horizon]} · $${result.applied.capitalUsd.toLocaleString("en-US")}`}>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-[var(--color-muted)]">Positions</div><div className="tnum font-semibold">{result.rows.length}</div></div>
              <div><div className="text-xs text-[var(--color-muted)]">Est. volatility</div><div className="tnum font-semibold">{pct(result.estVol)}</div></div>
              <div><div className="text-xs text-[var(--color-muted)]">AI-factor exposure</div><div className="tnum font-semibold">{pct(result.factorExposure.aiFactor)}</div></div>
              <div><div className="text-xs text-[var(--color-muted)]">Semiconductor exposure</div><div className="tnum font-semibold">{pct(result.factorExposure.semiconductor)}</div></div>
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-md border border-[var(--color-reduce)]/40 bg-[var(--color-reduce)]/10 p-2 text-xs text-[var(--color-reduce)]">
                {result.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            )}
          </Card>

          <Card title="Change vs your current strategy">
            {result.diffVsCurrent.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Essentially unchanged.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                    <th className="pb-2">Security</th>
                    <th className="pb-2 text-right">Current</th>
                    <th className="pb-2 text-right">Hypothetical</th>
                    <th className="pb-2 text-right">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.diffVsCurrent.map((d) => (
                    <tr key={d.ticker} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5">{d.ticker} <span className="text-[var(--color-muted)]">{d.name}</span></td>
                      <td className="py-1.5 text-right tnum">{d.current ? pct(d.current) : "—"}</td>
                      <td className="py-1.5 text-right tnum">{d.hypothetical ? pct(d.hypothetical) : "—"}</td>
                      <td className={`py-1.5 text-right tnum ${d.delta > 0 ? "text-[var(--color-buy)]" : "text-[var(--color-sell)]"}`}>
                        {d.delta > 0 ? "+" : ""}{pct(d.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {result.customStress && (
            <Card title="Custom stress result" subtitle="Hypothetical — first-order factor shock">
              <div className={`tnum text-lg font-semibold ${result.customStress.estimatedImpactPct < 0 ? "text-[var(--color-sell)]" : "text-[var(--color-buy)]"}`}>
                {pct(result.customStress.estimatedImpactPct)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.customStress.byTicker.slice(0, 8).map((b) => (
                  <span key={b.ticker} className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
                    {b.ticker} {pct(b.contributionPct)}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card title="Hypothetical holdings">
            <table className="w-full text-sm">
              <tbody>
                {result.rows.sort((a, b) => b.weight - a.weight).map((r) => (
                  <tr key={r.ticker} className="border-t border-[var(--color-border)] first:border-t-0">
                    <td className="py-1.5">{r.ticker} <span className="text-[var(--color-muted)]">{r.name}</span></td>
                    <td className="py-1.5 text-right tnum">{pct(r.weight)}</td>
                    <td className="py-1.5 text-right tnum text-[var(--color-muted)]">{usd(r.usdMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
