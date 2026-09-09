import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { sqliteUrl } from "./db-path";

// Prisma runs engine-free here (engineType = "client" + a driver adapter) so it
// works on platforms without a native Prisma query engine (e.g. Windows on ARM).
//
// Production PostgreSQL (e.g. Vercel): set DATABASE_PROVIDER=postgresql + a
// postgres connection string. Both adapters are imported statically; only the
// configured one is instantiated. See DEPLOY.md.
//
// The client is created LAZILY (on first query) via a Proxy so that
// `next build`'s page-data collection can import route modules without a live
// database configuration.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Connection string for the Postgres branch — tolerant of whichever name the
 *  hosting provider's DB integration populated. */
export function postgresUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    throw new Error(
      "DATABASE_PROVIDER=postgresql but no Postgres connection string is set. " +
        "Set DATABASE_URL (or POSTGRES_PRISMA_URL) in the environment and redeploy.",
    );
  }
  return url;
}

function makeAdapter() {
  if ((process.env.DATABASE_PROVIDER ?? "sqlite") === "postgresql") {
    return new PrismaPg({ connectionString: postgresUrl() });
  }
  return new PrismaBetterSQLite3({ url: sqliteUrl() });
}

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: makeAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const c = getClient();
    const value = Reflect.get(c, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
