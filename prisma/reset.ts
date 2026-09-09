// Drop and recreate the local SQLite database, then apply migrations.
// (Avoids `prisma migrate reset`, which auto-runs the seed and re-prompts.)
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const dbFile = path.resolve(process.cwd(), "prisma", "dev.db");
for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
  if (existsSync(f)) rmSync(f);
}
console.log("Removed local database.");

const res = spawnSync("prisma", ["migrate", "deploy"], { stdio: "inherit", shell: true });
process.exit(res.status ?? 0);
