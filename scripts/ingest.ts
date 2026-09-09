// Manual data refresh. Usage: npm run db:ingest [-- --lookback 500]
import { ingestAll } from "../src/data/ingestion";
import { providerStatus } from "../src/data/providers";

const arg = process.argv.indexOf("--lookback");
const lookbackDays = arg > -1 ? Number(process.argv[arg + 1]) : undefined;

const status = providerStatus();
console.log("Providers:");
for (const [k, v] of Object.entries(status)) {
  console.log(`  ${k.padEnd(12)} ${v.label}${v.isDemo ? "  (SIMULATED)" : ""}`);
}

const report = await ingestAll({ lookbackDays });
console.log("Ingestion report:", report);
process.exit(0);
