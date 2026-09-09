// FRED (Federal Reserve Economic Data) macro provider.
// Free API key: https://fredaccount.stlouisfed.org/apikeys  ->  FRED_API_KEY
import { MACRO_KEYS } from "./types";
import type { MacroProvider, MacroSeries, ProviderSourceMeta } from "./types";

const BASE = "https://api.stlouisfed.org/fred/series/observations";

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`FRED ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

type FredObs = { date: string; value: string };

function source(seriesId: string, label: string): ProviderSourceMeta {
  return {
    type: "MACRO",
    title: `${label} (FRED series ${seriesId})`,
    publisher: "Federal Reserve Bank of St. Louis (FRED)",
    url: `https://fred.stlouisfed.org/series/${seriesId}`,
    freshness: "TODAY",
    isDemo: false,
  };
}

export class FredMacroProvider implements MacroProvider {
  id = "fred";
  label = "FRED (St. Louis Fed)";
  isDemo = false;

  constructor(private apiKey: string) {}

  async getMacroSeries(keys: string[], lookbackDays: number): Promise<MacroSeries[]> {
    const start = new Date(Date.now() - (lookbackDays + 420) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const wanted = keys
      .map((k) => MACRO_KEYS.find((m) => m.key === k))
      .filter((m): m is (typeof MACRO_KEYS)[number] => !!m && !!m.fred);

    const out: MacroSeries[] = [];
    for (const m of wanted) {
      const url = `${BASE}?series_id=${m.fred}&api_key=${this.apiKey}&file_type=json&observation_start=${start}`;
      let json: unknown;
      try {
        json = await fetchJson(url);
      } catch {
        continue; // ingestion layer will demo-fill this key
      }
      const obs = (json as { observations?: FredObs[] }).observations ?? [];
      let clean = obs
        .filter((o) => o.value !== "." && o.value !== "")
        .map((o) => ({ date: o.date, value: Number(o.value) }))
        .filter((o) => Number.isFinite(o.value));

      // CPI series are index levels — convert to YoY %.
      if (m.key === "CPI_YOY" || m.key === "CORE_CPI_YOY") {
        const byMonth = new Map(clean.map((c) => [c.date.slice(0, 7), c.value]));
        clean = clean
          .map((c) => {
            const d = new Date(c.date);
            const prev = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            const base = byMonth.get(prev);
            return base ? { date: c.date, value: Math.round((c.value / base - 1) * 1000) / 10 } : null;
          })
          .filter((c): c is { date: string; value: number } => !!c);
      }

      const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
      const points = clean
        .filter((c) => c.date >= cutoff)
        .map((c) => ({ key: m.key, region: m.region, date: c.date, value: c.value, unit: undefined }));

      if (points.length) {
        out.push({ key: m.key, region: m.region, points, source: source(m.fred!, m.label) });
      }
    }
    return out;
  }
}
