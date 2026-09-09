import { generateStrategy } from "./strategy";

// Phase 7 fleshes this out: pull fresh data, recompute scores/regime/allocation,
// diff against the previous version, explain each change, compute risk + stress,
// persist a new immutable StrategyVersion + ResearchReport. For now it delegates
// to generateStrategy so the cron endpoint and versioning chain are exercised.

export async function runWeeklyReview(portfolioId: string, opts: { force?: boolean } = {}) {
  const res = await generateStrategy(portfolioId, {
    reason: "weekly-review",
    force: opts.force,
    weekOf: new Date(),
  });
  return { portfolioId, ...res };
}
