import { generateStrategy } from "./strategy";
import { ingestAll } from "@/data/ingestion";

// Phase 7 fleshes this out: diff against the previous version, explain each
// change, compute risk + stress, persist a ResearchReport. For now it refreshes
// data then regenerates the strategy so the cron endpoint, ingestion and the
// immutable versioning chain are all exercised end to end.

export async function runWeeklyReview(portfolioId: string, opts: { force?: boolean } = {}) {
  const ingest = await ingestAll({ lookbackDays: 60 });
  const res = await generateStrategy(portfolioId, {
    reason: "weekly-review",
    force: opts.force,
    weekOf: new Date(),
  });
  return { portfolioId, ingest, ...res };
}
