// Cross-platform production build wrapper.
//  - preloads the readlink shim (harmless off the affected filesystem)
//  - for a PostgreSQL target: swaps the Prisma datasource provider and syncs the
//    schema with `prisma db push` (the committed migrations are SQLite-specific;
//    the app's own history lives in data, not schema)
//  - runs `prisma generate` then `next build`
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const env = { ...process.env };
// NODE_OPTIONS is whitespace-split with no quoting → keep the path CWD-relative.
env.NODE_OPTIONS = [env.NODE_OPTIONS, "--require=./scripts/fs-readlink-shim.cjs"]
  .filter(Boolean)
  .join(" ");

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const usingPostgres = (env.DATABASE_PROVIDER ?? "sqlite") === "postgresql";
const SCHEMA = "prisma/schema.prisma";

if (usingPostgres) {
  const src = readFileSync(SCHEMA, "utf8");
  if (src.includes('provider = "sqlite"')) {
    writeFileSync(SCHEMA, src.replace('provider = "sqlite"', 'provider = "postgresql"'));
    console.log("build: switched Prisma datasource provider → postgresql");
  }
}

run("prisma", ["generate"]);

if (usingPostgres && env.DATABASE_URL) {
  run("prisma", ["db", "push", "--skip-generate", "--accept-data-loss"]);
}

run("next", ["build", "--turbopack"]);
