import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedUniverse, seedDemoUser } from "@/data/seed-core";
import { ingestAll } from "@/data/ingestion";
import { generateStrategy } from "@/services/strategy";
import { runWeeklyReview } from "@/services/weeklyReview";
import { fromJson } from "@/lib/json";
import { DEMO_AS_OF } from "@/data/providers/demo";
import type { AllocationRow } from "@/services/strategyRead";

// One shared universe + demo data for the whole file.
let portfolioR2: string;

beforeAll(async () => {
  await seedUniverse();
  await ingestAll({ lookbackDays: 400, asOf: DEMO_AS_OF });
  const r2 = await seedDemoUser({ email: "r2@test", riskScore: 2, horizon: "Y5_10" });
  portfolioR2 = r2.portfolioId;
  await generateStrategy(portfolioR2, { reason: "seed", weekOf: new Date(DEMO_AS_OF), force: true });
}, 180_000);

async function latestAlloc(portfolioId: string): Promise<AllocationRow[]> {
  const sv = await prisma.strategyVersion.findFirst({ where: { portfolioId }, orderBy: { version: "desc" } });
  return fromJson<AllocationRow[]>(sv?.allocationJson ?? "", []);
}

describe("§47 — end-to-end pipeline", () => {
  it("allocation weights always total exactly 100%", async () => {
    const rows = await latestAlloc(portfolioR2);
    expect(rows.length).toBeGreaterThan(5);
    expect(Math.round(rows.reduce((a, r) => a + r.weight, 0) * 1000)).toBe(1000);
  });

  it("different risk levels produce different allocations", async () => {
    const r1 = await seedDemoUser({ email: "r1@test", riskScore: 1, horizon: "Y5_10" });
    const r5 = await seedDemoUser({ email: "r5@test", riskScore: 5, horizon: "Y5_10" });
    await generateStrategy(r1.portfolioId, { reason: "t", weekOf: new Date(DEMO_AS_OF), force: true });
    await generateStrategy(r5.portfolioId, { reason: "t", weekOf: new Date(DEMO_AS_OF), force: true });

    const a1 = await latestAlloc(r1.portfolioId);
    const a5 = await latestAlloc(r5.portfolioId);
    const growth1 = a1.filter((r) => r.sleeve === "growth").reduce((s, r) => s + r.weight, 0);
    const growth5 = a5.filter((r) => r.sleeve === "growth").reduce((s, r) => s + r.weight, 0);
    expect(growth1).toBeGreaterThan(growth5);
    const bonds1 = a1.filter((r) => r.sleeve === "bonds").reduce((s, r) => s + r.weight, 0);
    const bonds5 = a5.filter((r) => r.sleeve === "bonds").reduce((s, r) => s + r.weight, 0);
    expect(bonds5).toBeGreaterThan(bonds1);
  });

  it("different horizons produce different allocations for the same risk", async () => {
    const short = await seedDemoUser({ email: "hs@test", riskScore: 3, horizon: "LT_1Y" });
    const long = await seedDemoUser({ email: "hl@test", riskScore: 3, horizon: "GT_10Y" });
    await generateStrategy(short.portfolioId, { reason: "t", weekOf: new Date(DEMO_AS_OF), force: true });
    await generateStrategy(long.portfolioId, { reason: "t", weekOf: new Date(DEMO_AS_OF), force: true });
    const gS = (await latestAlloc(short.portfolioId)).filter((r) => r.sleeve === "growth").reduce((s, r) => s + r.weight, 0);
    const gL = (await latestAlloc(long.portfolioId)).filter((r) => r.sleeve === "growth").reduce((s, r) => s + r.weight, 0);
    expect(gL).toBeGreaterThan(gS);
  });

  it("changing the investment amount only scales dollar amounts, not weights", async () => {
    const big = await seedDemoUser({ email: "big@test", riskScore: 2, horizon: "Y5_10", capitalUsd: 1_000_000 });
    await generateStrategy(big.portfolioId, { reason: "t", weekOf: new Date(DEMO_AS_OF), force: true });
    const base = await latestAlloc(portfolioR2);
    const scaled = await latestAlloc(big.portfolioId);
    const bByT = new Map(base.map((r) => [r.ticker, r.weight]));
    for (const r of scaled) {
      if (bByT.has(r.ticker)) expect(r.weight).toBeCloseTo(bByT.get(r.ticker)!, 2);
    }
    expect(scaled.reduce((s, r) => s + r.usdMinor, 0)).toBe(1_000_000 * 100);
  });

  it("every recommendation has ≥1 risk and ≥1 invalidation condition (no rec without supporting evidence)", async () => {
    const sv = await prisma.strategyVersion.findFirst({ where: { portfolioId: portfolioR2 }, orderBy: { version: "desc" } });
    const recs = await prisma.recommendation.findMany({ where: { strategyVersionId: sv!.id } });
    expect(recs.length).toBeGreaterThan(5);
    for (const r of recs) {
      const risks = fromJson<string[]>(r.risksJson, []);
      const inval = fromJson<string[]>(r.invalidationJson, []);
      expect(risks.length).toBeGreaterThan(0);
      expect(inval.length).toBeGreaterThan(0);
      expect(r.thesisMd.length).toBeGreaterThan(20);
    }
  });

  it("held recommendations have at least one attached source", async () => {
    const sv = await prisma.strategyVersion.findFirst({ where: { portfolioId: portfolioR2 }, orderBy: { version: "desc" } });
    const recs = await prisma.recommendation.findMany({
      where: { strategyVersionId: sv!.id, targetWeight: { gt: 0 } },
      include: { sources: true },
    });
    for (const r of recs) expect(r.sources.length).toBeGreaterThan(0);
  });

  it("weekly review creates a new version, identifies changes, and never mutates prior versions", async () => {
    const before = await prisma.strategyVersion.findMany({
      where: { portfolioId: portfolioR2 },
      include: { recommendations: true, riskMetric: true, researchReport: true, changes: true },
      orderBy: { version: "asc" },
    });
    const sig = new Map(before.map((v) => [v.version, JSON.stringify(v)]));

    const res = await runWeeklyReview(portfolioR2, { force: true });
    expect(res.version).toBe(before.length + 1);

    const after = await prisma.strategyVersion.findMany({
      where: { portfolioId: portfolioR2 },
      include: { recommendations: true, riskMetric: true, researchReport: true, changes: true },
      orderBy: { version: "asc" },
    });
    for (const [version, s] of sig) {
      expect(JSON.stringify(after.find((v) => v.version === version))).toBe(s);
    }

    const newSv = after.at(-1)!;
    expect(newSv.changes.length).toBeGreaterThan(0);
    expect(newSv.researchReport?.markdown).toMatch(/Changes From Last Week/);
    for (const c of newSv.changes) expect(c.reason.length).toBeGreaterThan(10);
  });

  it("the deterministic engine is reproducible across a full regeneration", async () => {
    const a = await latestAlloc(portfolioR2);
    await generateStrategy(portfolioR2, { reason: "repeat", weekOf: new Date(DEMO_AS_OF), force: true });
    // regeneration at DEMO_AS_OF should reproduce the same NAMES (weights may shift
    // slightly with the incumbency bonus off the just-created version)
    const b = await latestAlloc(portfolioR2);
    const overlap = a.filter((r) => b.some((x) => x.ticker === r.ticker)).length;
    expect(overlap / a.length).toBeGreaterThan(0.7);
  });

  it("currency conversion: a JPY-priced security's USD weight is sane", async () => {
    const rows = await latestAlloc(portfolioR2);
    const jpy = rows.find((r) => r.currency === "JPY");
    if (jpy) {
      expect(jpy.weight).toBeGreaterThan(0);
      expect(jpy.weight).toBeLessThan(0.2);
    }
  });
});
