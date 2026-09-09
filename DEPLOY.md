# Deploying to Vercel

The app runs on **PostgreSQL** in production (SQLite is dev-only — Vercel's filesystem is
read-only and ephemeral). The repo is wired so a Postgres deploy needs no code changes:
`npm run build` detects `DATABASE_PROVIDER=postgresql`, swaps the Prisma datasource provider,
and syncs the schema with `prisma db push`. `src/lib/db.ts` then uses `@prisma/adapter-pg`
(already a dependency).

## 1. Push to GitHub

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

## 2. Import in Vercel

- **vercel.com → Add New → Project → import the repo.** Framework preset: Next.js
  (auto-detected). Leave the build/output settings as-is — `vercel.json` sets
  `buildCommand` to `npm run build` and registers the weekly cron.

## 3. Add a Postgres database

- In the project: **Storage → Create Database → Postgres** (or add a Neon integration).
  Vercel injects `POSTGRES_*` env vars, including `POSTGRES_PRISMA_URL`.

## 4. Environment variables (Project → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_PROVIDER` | `postgresql` | **required** |
| `DATABASE_URL` | value of `POSTGRES_PRISMA_URL` | **required** — copy the pooled URL |
| `AUTH_SECRET` | `openssl rand -base64 48` | **required** |
| `CRON_SECRET` | `openssl rand -base64 32` | **required** — Vercel Cron sends it as the bearer token automatically |
| `AUTH_SESSION_MAX_AGE` | `604800` | optional (7 days) |
| `ANTHROPIC_API_KEY` | your key | optional — without it the deterministic reasoning path is used |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | optional |
| `FRED_API_KEY` | your key | optional — enables the real macro provider |
| `NEWSAPI_KEY` | your key | optional — enables real company/macro news |
| `SEED_DEMO_USER` | `false` | optional — skip the `demo@strategist.app` account when seeding |

Generators:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # CRON_SECRET
```

## 5. Deploy

Trigger the first deployment (push to `main`, or **Deploy** in the dashboard). The build runs
`prisma generate` → `prisma db push` (creates the tables) → `next build`.

## 6. Seed the universe (one-time)

The database now has the schema but no securities/prices. Seed it from your machine against
the production DB:

```bash
vercel env pull .env.production        # pulls DATABASE_URL etc.
DATABASE_PROVIDER=postgresql \
DATABASE_URL="$(grep POSTGRES_PRISMA_URL .env.production | cut -d= -f2- | tr -d '\"')" \
SEED_DEMO_USER=false \
  npx tsx prisma/seed.ts
```

(Or keep `SEED_DEMO_USER` unset to also create the `demo@strategist.app` / `demodemo`
account.) The seed ingests ~13k simulated price points; expect it to take a minute or two
against a remote DB.

## 7. Verify

- Visit the deployment URL → register an account → complete onboarding → a strategy is built.
- **Cron:** Project → Settings → Cron Jobs shows `/api/cron/weekly-review` on `0 6 * * 1`
  (Mondays 06:00 UTC). Trigger it once manually from that page to confirm; it returns
  `{ ok: true, results: [...] }`. `maxDuration` is set to 300s on the route.

## Notes

- `better-sqlite3` stays in `dependencies` for local dev; on Vercel it installs (Linux
  prebuilds) but is never loaded because `DATABASE_PROVIDER=postgresql`.
- To move a real market-data provider in later, register its adapter in
  `src/data/providers/index.ts` and add its key to the Vercel env.
- Rotating `CRON_SECRET` or `AUTH_SECRET` invalidates existing sessions / cron auth — expected.
- The in-memory rate limiter (`src/lib/rateLimit.ts`) is per-instance; for multiple serverless
  instances swap its `Map` for Upstash/Redis (noted in `docs/SECURITY_CHECKLIST.md`).
