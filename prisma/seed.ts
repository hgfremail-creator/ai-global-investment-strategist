import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { MARKETS, SECURITIES } from "../src/data/universe";
import { sqliteUrl } from "../src/lib/db-path";

const prisma = new PrismaClient({ adapter: new PrismaBetterSQLite3({ url: sqliteUrl() }) });

async function main() {
  console.log("Seeding demo universe…");

  // Markets
  const marketByCode = new Map<string, string>();
  for (const m of MARKETS) {
    const row = await prisma.market.upsert({
      where: { code: m.code },
      create: m,
      update: { name: m.name, currency: m.currency, benchmarkSymbol: m.benchmarkSymbol },
    });
    marketByCode.set(m.code, row.id);
  }

  // Securities
  for (const s of SECURITIES) {
    const marketId = marketByCode.get(s.market);
    if (!marketId) throw new Error(`missing market ${s.market}`);
    const existing = await prisma.security.findFirst({
      where: { ticker: s.ticker, marketId },
    });
    const data = {
      ticker: s.ticker,
      name: s.name,
      marketId,
      countryCode: s.country,
      sector: s.sector,
      industry: s.industry,
      currency: s.currency,
      assetClass: s.assetClass,
      factorLoadings: JSON.stringify(s.factors),
      isDemo: true,
    };
    if (existing) {
      await prisma.security.update({ where: { id: existing.id }, data });
    } else {
      await prisma.security.create({ data });
    }
  }
  console.log(`  ${MARKETS.length} markets, ${SECURITIES.length} securities`);

  // Demo user with completed onboarding
  const email = "demo@strategist.app";
  const passwordHash = await bcrypt.hash("demodemo", 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Demo Investor", passwordHash, baseCurrency: "USD" },
    update: { passwordHash },
  });

  const hasProfile = await prisma.riskProfile.findFirst({
    where: { userId: user.id, active: true },
  });
  if (!hasProfile) {
    const { DEFAULT_CONSTRAINTS } = await import("../src/lib/config");
    await prisma.riskProfile.create({
      data: {
        userId: user.id,
        active: true,
        riskScore: 2,
        horizon: "Y5_10",
        objective: "GROWTH_PROTECTION",
        constraintsJson: JSON.stringify(DEFAULT_CONSTRAINTS[2]),
      },
    });
  }

  let portfolio = await prisma.portfolio.findFirst({ where: { userId: user.id } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        name: "Primary",
        baseCurrency: "USD",
        capitalUsdMinor: 100_000_00,
      },
    });
  }

  // A pre-existing NVDA position so "existing exposure" logic is demonstrable.
  const nvda = await prisma.security.findFirst({ where: { ticker: "NVDA" } });
  if (nvda) {
    await prisma.portfolioPosition.upsert({
      where: { portfolioId_securityId: { portfolioId: portfolio.id, securityId: nvda.id } },
      create: {
        portfolioId: portfolio.id,
        securityId: nvda.id,
        quantity: 40,
        avgPriceMinor: 120_00,
        isUserSupplied: true,
      },
      update: {},
    });
  }

  // Ingest market/fundamental/macro/news data (demo provider unless keys set)
  const { ingestAll } = await import("../src/data/ingestion");
  const { providerStatus } = await import("../src/data/providers");
  const status = providerStatus();
  console.log(
    `  providers: market=${status.marketData.label}${status.marketData.isDemo ? " (sim)" : ""}, ` +
      `macro=${status.macro.label}, news=${status.news.label}`,
  );
  const ingest = await ingestAll({ lookbackDays: 400 });
  console.log(
    `  ingested: ${ingest.prices} prices, ${ingest.fundamentals} fundamentals, ` +
      `${ingest.macro} macro points, ${ingest.benchmarks} benchmark points, ${ingest.news} news`,
  );

  // Initial strategy version
  const { generateStrategy } = await import("../src/services/strategy");
  const res = await generateStrategy(portfolio.id, { reason: "seed" });
  console.log(`  demo user ${email} / demodemo — strategy v${res.version}`);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
