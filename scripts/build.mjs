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

const run = (cmd, args, envOverride) => {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: envOverride ? { ...env, ...envOverride } : env,
  });
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

if (usingPostgres) {
  // Prisma DDL (`db push`) wants a DIRECT connection; the app runtime uses the
  // pooled one. Accept whichever env var name the platform's DB integration set.
  const directUrl =
    env.DIRECT_URL ||
    env.POSTGRES_URL_NON_POOLING ||
    env.DATABASE_URL_UNPOOLED ||
    env.DATABASE_URL ||
    env.POSTGRES_PRISMA_URL ||
    env.POSTGRES_URL;
  if (directUrl) {
    run("prisma", ["db", "push", "--skip-generate", "--accept-data-loss"], {
      DATABASE_URL: directUrl,
    });
  } else {
    console.warn(
      "build: DATABASE_PROVIDER=postgresql but no connection string in env — " +
        "skipping `prisma db push`. Set DATABASE_URL and redeploy, then run the seed.",
    );
  }
}

run("next", ["build", "--turbopack"]);
