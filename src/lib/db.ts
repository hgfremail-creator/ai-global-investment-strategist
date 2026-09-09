import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { sqliteUrl } from "./db-path";

// Prisma runs engine-free here (engineType = "client" + a driver adapter) so it
// works on platforms without a native Prisma query engine (e.g. Windows on ARM).
//
// Production PostgreSQL (e.g. Vercel): set DATABASE_PROVIDER=postgresql + a
// postgres DATABASE_URL. `npm run build` then swaps the schema datasource
// provider and runs `prisma db push`. Both adapters are imported statically;
// only the configured one is instantiated. See DEPLOY.md.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeAdapter() {
  if ((process.env.DATABASE_PROVIDER ?? "sqlite") === "postgresql") {
    return new PrismaPg({ connectionString: process.env.DATABASE_URL });
  }
  return new PrismaBetterSQLite3({ url: sqliteUrl() });
}

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: makeAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
