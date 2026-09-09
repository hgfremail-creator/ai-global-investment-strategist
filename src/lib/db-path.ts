import path from "node:path";

/**
 * Resolve the SQLite file the better-sqlite3 adapter should open, matching how
 * the Prisma CLI resolves `file:` URLs (relative to the prisma/ schema dir).
 * Assumes the process runs from the project root (next dev/build, tsx scripts).
 */
export function sqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!raw.startsWith("file:")) return raw;
  const rel = raw.slice("file:".length);
  if (path.isAbsolute(rel)) return `file:${rel}`;
  const abs = path.resolve(process.cwd(), "prisma", rel.replace(/^\.\//, ""));
  return `file:${abs}`;
}
