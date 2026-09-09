"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { scoreTone } from "@/components/ScoreBreakdown";
import type { ResearchRow } from "@/services/research";

const ASSET_LABEL: Record<string, string> = {
  EQUITY: "Equity",
  GOLD: "Gold",
  GOV_BOND: "Govt bond",
  IG_BOND: "IG bond",
  CASH: "Cash",
  DIVERSIFIER: "Diversifier",
};

type SortKey = "overall" | "ticker" | "aiExposure" | "valuation" | "growth" | "risk";

export function ResearchTable({ rows }: { rows: ResearchRow[] }) {
  const [country, setCountry] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("overall");

  const countries = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((r) => r.country))).sort()],
    [rows],
  );
  const assets = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((r) => r.assetClass)))],
    [rows],
  );

  const filtered = useMemo(() => {
    const f = rows.filter(
      (r) =>
        (country === "ALL" || r.country === country) &&
        (assetClass === "ALL" || r.assetClass === assetClass),
    );
    f.sort((a, b) => {
      if (sort === "ticker") return a.ticker.localeCompare(b.ticker);
      const av = sort === "overall" ? (a.overall ?? -1) : (a.components?.[sort] ?? -1);
      const bv = sort === "overall" ? (b.overall ?? -1) : (b.components?.[sort] ?? -1);
      return bv - av;
    });
    return f;
  }, [rows, country, assetClass, sort]);

  const sel =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs";

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className={sel} value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c === "ALL" ? "All countries" : c}
            </option>
          ))}
        </select>
        <select className={sel} value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
          {assets.map((a) => (
            <option key={a} value={a}>
              {a === "ALL" ? "All asset classes" : ASSET_LABEL[a] ?? a}
            </option>
          ))}
        </select>
        <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="overall">Sort: Overall score</option>
          <option value="aiExposure">Sort: AI exposure</option>
          <option value="growth">Sort: Growth</option>
          <option value="valuation">Sort: Valuation</option>
          <option value="risk">Sort: Risk (safer first)</option>
          <option value="ticker">Sort: Ticker</option>
        </select>
        <span className="self-center text-[11px] text-[var(--color-faint)]">{filtered.length} securities</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              <th className="pb-2">Security</th>
              <th className="pb-2">Class</th>
              <th className="pb-2 text-right">Overall</th>
              <th className="pb-2 text-right">Quality</th>
              <th className="pb-2 text-right">Growth</th>
              <th className="pb-2 text-right">Value</th>
              <th className="pb-2 text-right">Mom.</th>
              <th className="pb-2 text-right">AI</th>
              <th className="pb-2 text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.ticker} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                <td className="py-2">
                  <Link href={`/research/${encodeURIComponent(r.ticker)}`} className="font-medium hover:text-[var(--color-accent)]">
                    {r.ticker}
                  </Link>
                  <span className="ml-2 text-[var(--color-muted)]">{r.name}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--color-faint)]">{r.country}</span>
                </td>
                <td className="py-2 text-[var(--color-muted)]">{ASSET_LABEL[r.assetClass] ?? r.assetClass}</td>
                <td className="py-2 text-right">
                  {r.overall == null ? (
                    <span className="text-[var(--color-faint)]">—</span>
                  ) : (
                    <span className={cx("tnum font-semibold", scoreTone(r.overall))}>{r.overall.toFixed(0)}</span>
                  )}
                </td>
                {(["businessQuality", "growth", "valuation", "marketMomentum", "aiExposure", "risk"] as const).map((k) => (
                  <td key={k} className="py-2 text-right tnum text-[var(--color-muted)]">
                    {r.components ? r.components[k].toFixed(0) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
