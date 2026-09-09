import { seedAll } from "../src/data/seed-core";
import { providerStatus } from "../src/data/providers";

const status = providerStatus();
console.log("Seeding demo universe…");
console.log(
  `  providers: market=${status.marketData.label}${status.marketData.isDemo ? " (sim)" : ""}, ` +
    `macro=${status.macro.label}, news=${status.news.label}`,
);

const res = await seedAll();
console.log(`  ${res.markets} markets, ${res.securities} securities`);
console.log(
  `  ingested: ${res.ingest.prices} prices, ${res.ingest.fundamentals} fundamentals, ` +
    `${res.ingest.macro} macro points, ${res.ingest.benchmarks} benchmark points, ${res.ingest.news} news`,
);
console.log(
  res.demoUser
    ? `  demo user demo@strategist.app / demodemo — strategy v${res.version}`
    : "  demo user skipped (SEED_DEMO_USER=false)",
);
console.log("Seed complete.");
process.exit(0);
