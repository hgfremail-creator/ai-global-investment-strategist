import { prisma } from "@/lib/db";
import { generateStrategy } from "./strategy";
import { ingestAll } from "@/data/ingestion";
import { providerStatus } from "@/data/providers";
import { DEMO_AS_OF } from "@/data/providers/demo";

// The weekly refresh: pull fresh data, recompute scores/regime/allocation/risk,
// diff against the previous version, explain every change, generate the report,
// and store a NEW immutable StrategyVersion. Previous versions are never touched.

const DAY = 86_400_000;

export async function runWeeklyReview(portfolioId: string, opts: { force?: boolean } = {}) {
  const prevCount = await prisma.strategyVersion.count({ where: { portfolioId } });
  const usingDemo = providerStatus().marketData.isDemo;

  // With the demo provider we advance a simulated clock one week per version so
  // the review has something real to diff. With a live provider, "now" is now.
  const weekOf = usingDemo
    ? new Date(new Date(DEMO_AS_OF).getTime() + prevCount * 7 * DAY)
    : new Date();
  const asOf = weekOf.toISOString().slice(0, 10);

  const ingest = await ingestAll({ lookbackDays: 400, asOf });
  const res = await generateStrategy(portfolioId, {
    reason: "weekly-review",
    force: opts.force ?? true,
    weekOf,
  });

  return { portfolioId, weekOf: asOf, ingest, ...res };
}
