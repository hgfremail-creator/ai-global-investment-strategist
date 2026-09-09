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

// `channel_binding=require` trips up some Prisma CLI / pg client versions; the
// pg driver adapter negotiates SSL fine without it.
const cleanUrl = process.env.DATABASE_URL.replace(/[?&]channel_binding=require/i, (m) =>
  m[0] === "?" ? "?" : "",
).replace(/\?&/, "?").replace(/\?$/, "");

const env = {
  ...process.env,
  DATABASE_URL: cleanUrl,
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

  const directUrl =
    env.DIRECT_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  failed ||= run("prisma", ["generate"]);

  // `db push` is best-effort here: the Vercel build already synced the schema.
  // If this machine can't reach Neon on :5432 (blocked outbound port) we still
  // try the seed itself, which connects via the pg driver adapter.
  if (process.env.SKIP_DB_PUSH !== "1") {
    const push = spawnSync(
      "prisma",
      ["db", "push", "--skip-generate", "--accept-data-loss"],
      { stdio: "inherit", shell: true, env: { ...env, DATABASE_URL: directUrl } },
    );
    if (push.status !== 0) console.warn("→ db push failed/unreachable — continuing (schema was pushed by the Vercel build)");
  }

  failed ||= run("npx", ["tsx", "prisma/seed.ts"]);
} finally {
  copyFileSync(BACKUP, SCHEMA);
  run("prisma", ["generate"]); // restore the sqlite client for local dev
  spawnSync("node", ["-e", "require('fs').unlinkSync('prisma/schema.prisma.seedbak')"], { shell: true });
  console.log("→ schema restored to sqlite");
}
process.exit(failed);
