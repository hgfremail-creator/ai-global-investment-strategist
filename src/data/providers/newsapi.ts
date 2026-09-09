// NewsAPI.org news provider.  Key: https://newsapi.org/register  ->  NEWSAPI_KEY
// Note: the free plan is delayed and development-only; the app labels freshness
// as WEEK for NewsAPI results accordingly.
import { SECURITIES } from "@/data/universe";
import type { NewsArticle, NewsProvider, ProviderSourceMeta } from "./types";

const BASE = "https://newsapi.org/v2/everything";

type NewsApiArticle = {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
  source: { name: string };
};

async function query(params: Record<string, string>, apiKey: string): Promise<NewsApiArticle[]> {
  const url = `${BASE}?${new URLSearchParams({ ...params, apiKey, language: "en", sortBy: "publishedAt", pageSize: "20" })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`NewsAPI ${res.status}`);
    const json = (await res.json()) as { articles?: NewsApiArticle[] };
    return json.articles ?? [];
  } finally {
    clearTimeout(t);
  }
}

function src(title: string, url: string, publisher: string): ProviderSourceMeta {
  return { type: "NEWS", title, url, publisher, freshness: "WEEK", isDemo: false };
}

export class NewsApiProvider implements NewsProvider {
  id = "newsapi";
  label = "NewsAPI.org";
  isDemo = false;

  constructor(private apiKey: string) {}

  async getCompanyNews(symbols: string[], sinceDays: number): Promise<NewsArticle[]> {
    const from = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
    const out: NewsArticle[] = [];
    for (const sym of symbols) {
      const sec = SECURITIES.find((s) => s.ticker === sym);
      if (!sec) continue;
      let articles: NewsApiArticle[] = [];
      try {
        articles = await query({ q: `"${sec.name}"`, from }, this.apiKey);
      } catch {
        continue;
      }
      for (const a of articles.slice(0, 5)) {
        out.push({
          symbol: sym,
          title: a.title,
          url: a.url,
          publisher: a.source?.name ?? "NewsAPI",
          publishedAt: a.publishedAt,
          summary: a.description ?? "",
          source: src(a.title, a.url, a.source?.name ?? "NewsAPI"),
        });
      }
    }
    return out;
  }

  async getMacroNews(regions: string[], sinceDays: number): Promise<NewsArticle[]> {
    const from = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
    let articles: NewsApiArticle[] = [];
    try {
      articles = await query(
        { q: "(Federal Reserve OR ECB OR inflation OR interest rates OR Treasury yields)", from },
        this.apiKey,
      );
    } catch {
      return [];
    }
    return articles.slice(0, 8).map((a) => ({
      region: regions[0] ?? "GLOBAL",
      title: a.title,
      url: a.url,
      publisher: a.source?.name ?? "NewsAPI",
      publishedAt: a.publishedAt,
      summary: a.description ?? "",
      source: src(a.title, a.url, a.source?.name ?? "NewsAPI"),
    }));
  }
}
