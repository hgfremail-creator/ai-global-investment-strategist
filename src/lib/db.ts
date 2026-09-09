import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { sqliteUrl } from "./db-path";

// Prisma runs engine-free here (engineType = "client" + a driver adapter) so it
// works on platforms without a native Prisma query engine (e.g. Windows on ARM).
//
// Production PostgreSQL:
//   1. set   DATABASE_PROVIDER=postgresql   and a postgres DATABASE_URL
//   2. change prisma/schema.prisma  datasource `provider` to "postgresql"
//   3. npm i @prisma/adapter-pg pg   &&   npx prisma migrate deploy
// The branch below then uses @prisma/adapter-pg automatically.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAdapter(): any {
  if ((process.env.DATABASE_PROVIDER ?? "sqlite") === "postgresql") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaPg } = require("@prisma/adapter-pg");
      return new PrismaPg({ connectionString: process.env.DATABASE_URL });
    } catch {
      throw new Error(
        "DATABASE_PROVIDER=postgresql but @prisma/adapter-pg is not installed. Run: npm i @prisma/adapter-pg pg",
      );
    }
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
