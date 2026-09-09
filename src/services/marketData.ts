import { prisma } from "@/lib/db";
import { MACRO_KEYS } from "@/data/providers/types";

function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : to / from - 1;
}

/** Return the close on or immediately before `daysAgo` from the latest point. */
function priorClose(points: { date: Date; close: number }[], daysAgo: number): number | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1].date.getTime();
  const target = latest - daysAgo * 86_400_000;
  let best: number | null = null;
  for (const p of points) {
    if (p.date.getTime() <= target) best = p.close;
  }
  return best ?? points[0].close;
}

export type BenchmarkRow = {
  symbol: string;
  name: string;
  last: number;
  asOf: string;
  ret1w: number | null;
  ret1m: number | null;
  ret3m: number | null;
  retYtd: number | null;
};

export async function getBenchmarkDashboard(): Promise<BenchmarkRow[]> {
  const symbols = ["SP500", "NDX", "MSCI_WORLD", "NKY", "TWSE", "CAC", "DAX"];
  const rows: BenchmarkRow[] = [];
  for (const symbol of symbols) {
    const points = await prisma.benchmark.findMany({
      where: { symbol },
      orderBy: { date: "asc" },
      select: { date: true, close: true, name: true },
    });
    if (points.length === 0) continue;
    const last = points[points.length - 1];
    const ytdStart = points.find((p) => p.date.getUTCFullYear() === last.date.getUTCFullYear());
    rows.push({
      symbol,
      name: last.name,
      last: last.close,
      asOf: last.date.toISOString().slice(0, 10),
      ret1w: priorClose(points, 7) != null ? pctChange(priorClose(points, 7)!, last.close) : null,
      ret1m: priorClose(points, 30) != null ? pctChange(priorClose(points, 30)!, last.close) : null,
      ret3m: priorClose(points, 91) != null ? pctChange(priorClose(points, 91)!, last.close) : null,
      retYtd: ytdStart ? pctChange(ytdStart.close, last.close) : null,
    });
  }
  return rows;
}

export type MacroRow = {
  key: string;
  label: string;
  region: string;
  value: number;
  unit: string | null;
  asOf: string;
  change1m: number | null; // absolute change vs ~1m ago
};

const MACRO_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Inflation & activity", keys: ["CPI_YOY", "CORE_CPI_YOY", "US_UNEMP"] },
  { title: "Policy rates", keys: ["FEDFUNDS", "ECB_MRO"] },
  { title: "Government yields", keys: ["US2Y", "US10Y", "US_REAL10Y", "DE10Y", "JP10Y"] },
  { title: "Credit & risk", keys: ["IG_OAS", "HY_OAS"] },
  { title: "FX & commodities", keys: ["DXY", "EURUSD", "USDJPY", "GOLD", "BRENT"] },
];

export async function getMacroDashboard(): Promise<{ title: string; rows: MacroRow[] }[]> {
  const out: { title: string; rows: MacroRow[] }[] = [];
  for (const group of MACRO_GROUPS) {
    const rows: MacroRow[] = [];
    for (const key of group.keys) {
      const points = await prisma.macroIndicator.findMany({
        where: { key },
        orderBy: { date: "asc" },
        select: { date: true, value: true, unit: true, region: true },
      });
      if (points.length === 0) continue;
      const last = points[points.length - 1];
      const prior = priorClose(
        points.map((p) => ({ date: p.date, close: p.value })),
        30,
      );
      rows.push({
        key,
        label: MACRO_KEYS.find((m) => m.key === key)?.label ?? key,
        region: last.region,
        value: last.value,
        unit: last.unit,
        asOf: last.date.toISOString().slice(0, 10),
        change1m: prior != null ? Math.round((last.value - prior) * 1000) / 1000 : null,
      });
    }
    if (rows.length) out.push({ title: group.title, rows });
  }
  return out;
}
