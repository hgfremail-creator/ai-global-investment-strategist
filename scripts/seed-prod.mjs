// One-time production seed helper. Run from your machine against the deployed
// Postgres DB:
//
//   DATABASE_URL="postgres://…" npm run db:seed:prod
//
// It temporarily switches the Prisma schema to postgresql, regenerates the
// client, seeds the universe + market data, then restores the schema. Set
// SEED_DEMO_USER=false (default here) to skip the demo@strategist.app account.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SCHEMA = "prisma/schema.prisma";
const BACKUP = "prisma/schema.prisma.seedbak";

if (!process.env.DATABASE_URL || !/^postgres/i.test(process.env.DATABASE_URL)) {
  console.error("Set DATABASE_URL to your production Postgres connection string first.");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_PROVIDER: "postgresql",
  SEED_DEMO_USER: process.env.SEED_DEMO_USER ?? "false",
};

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env, ...opts });
  return r.status ?? 1;
};

copyFileSync(SCHEMA, BACKUP);
let failed = 0;
try {
  writeFileSync(
    SCHEMA,
    readFileSync(SCHEMA, "utf8").replace('provider = "sqlite"', 'provider = "postgresql"'),
  );
  console.log("→ schema switched to postgresql");

  failed ||= run("prisma", ["generate"]);
  failed ||= run("prisma", ["db", "push", "--skip-generate", "--accept-data-loss"]);
  failed ||= run("npx", ["tsx", "prisma/seed.ts"]);
} finally {
  copyFileSync(BACKUP, SCHEMA);
  run("prisma", ["generate"]); // restore the sqlite client for local dev
  spawnSync("node", ["-e", "require('fs').unlinkSync('prisma/schema.prisma.seedbak')"], { shell: true });
  console.log("→ schema restored to sqlite");
}
process.exit(failed);
