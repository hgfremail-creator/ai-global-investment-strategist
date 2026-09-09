import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { sqliteUrl } from "./db-path";

// Prisma runs engine-free here (queryCompiler + driver adapter) so it works on
// platforms without a native Prisma query engine (e.g. Windows on ARM).
// For PostgreSQL in production, swap to @prisma/adapter-pg (see ARCHITECTURE.md §1).

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSQLite3({ url: sqliteUrl() });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
