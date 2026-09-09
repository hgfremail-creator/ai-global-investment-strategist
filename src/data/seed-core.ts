import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { MARKETS, SECURITIES } from "@/data/universe";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";
import { ingestAll } from "@/data/ingestion";
import { generateStrategy } from "@/services/strategy";
import { DEMO_AS_OF } from "@/data/providers/demo";
import type { Horizon, Objective, RiskScore } from "@/lib/enums";

export async function seedUniverse() {
  const marketByCode = new Map<string, string>();
  for (const m of MARKETS) {
    const row = await prisma.market.upsert({
      where: { code: m.code },
      create: m,
      update: { name: m.name, currency: m.currency, benchmarkSymbol: m.benchmarkSymbol },
    });
    marketByCode.set(m.code, row.id);
  }
  for (const s of SECURITIES) {
    const marketId = marketByCode.get(s.market);
    if (!marketId) throw new Error(`missing market ${s.market}`);
    const existing = await prisma.security.findFirst({ where: { ticker: s.ticker, marketId } });
    const data = {
      ticker: s.ticker, name: s.name, marketId, countryCode: s.country, sector: s.sector,
      industry: s.industry, currency: s.currency, assetClass: s.assetClass,
      factorLoadings: JSON.stringify(s.factors), isDemo: true,
    };
    if (existing) await prisma.security.update({ where: { id: existing.id }, data });
    else await prisma.security.create({ data });
  }
  return { markets: MARKETS.length, securities: SECURITIES.length };
}

export async function seedDemoUser(opts: {
  email?: string;
  password?: string;
  riskScore?: RiskScore;
  horizon?: Horizon;
  objective?: Objective;
  capitalUsd?: number;
  withExistingNvda?: boolean;
} = {}) {
  const email = opts.email ?? "demo@strategist.app";
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Demo Investor", passwordHash: await bcrypt.hash(opts.password ?? "demodemo", 12), baseCurrency: "USD" },
    update: {},
  });
  const riskScore = opts.riskScore ?? 2;
  if (!(await prisma.riskProfile.findFirst({ where: { userId: user.id, active: true } }))) {
    await prisma.riskProfile.create({
      data: {
        userId: user.id, active: true, riskScore,
        horizon: opts.horizon ?? "Y5_10",
        objective: opts.objective ?? "GROWTH_PROTECTION",
        constraintsJson: JSON.stringify(DEFAULT_CONSTRAINTS[riskScore]),
      },
    });
  }
  let portfolio = await prisma.portfolio.findFirst({ where: { userId: user.id } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId: user.id, name: "Primary", baseCurrency: "USD", capitalUsdMinor: Math.round((opts.capitalUsd ?? 100_000) * 100) },
    });
  }
  if (opts.withExistingNvda ?? true) {
    const nvda = await prisma.security.findFirst({ where: { ticker: "NVDA" } });
    if (nvda) {
      await prisma.portfolioPosition.upsert({
        where: { portfolioId_securityId: { portfolioId: portfolio.id, securityId: nvda.id } },
        create: { portfolioId: portfolio.id, securityId: nvda.id, quantity: 40, avgPriceMinor: 120_00, isUserSupplied: true },
        update: {},
      });
    }
  }
  return { userId: user.id, portfolioId: portfolio.id };
}

/**
 * Full seed used by prisma/seed.ts and the integration harness.
 * The universe + market data are always seeded (the app needs them). The demo
 * user/portfolio/strategy is skipped when SEED_DEMO_USER=false (e.g. production).
 */
export async function seedAll() {
  const u = await seedUniverse();
  const ingest = await ingestAll({ lookbackDays: 400 });

  if (process.env.SEED_DEMO_USER === "false") {
    return { ...u, ingest, portfolioId: null as string | null, version: 0, demoUser: false };
  }

  const { portfolioId } = await seedDemoUser();
  const res = await generateStrategy(portfolioId, { reason: "seed", weekOf: new Date(DEMO_AS_OF) });
  return { ...u, portfolioId, ingest, version: res.version, demoUser: true };
}
