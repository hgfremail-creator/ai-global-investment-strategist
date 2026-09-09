import { readFileSync } from "node:fs";
import path from "node:path";

// Runs in every integration test worker BEFORE any @/ import, so the Prisma
// singleton in @/lib/db picks up the temp database created by globalSetup.
const sidecar = path.join(process.cwd(), ".vitest-it-db");
try {
  process.env.DATABASE_URL = readFileSync(sidecar, "utf8").trim();
} catch {
  throw new Error("integration setup: missing .vitest-it-db (globalSetup did not run)");
}
process.env.DATABASE_PROVIDER = "sqlite";
process.env.AUTH_SECRET = "integration-test-secret-integration-test-secret";
process.env.MARKET_DATA_PROVIDER = "demo";
process.env.MACRO_PROVIDER = "demo";
process.env.NEWS_PROVIDER = "demo";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.FRED_API_KEY;
delete process.env.NEWSAPI_KEY;
