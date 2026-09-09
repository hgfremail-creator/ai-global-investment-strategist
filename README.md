# AI Global Investment Strategist

A production-oriented **paper-investing research application** that behaves like a disciplined
global investment strategist: it analyses major markets (US, Japan, Taiwan, France, Germany +
gold / bonds / cash), constructs a diversified portfolio from your capital, risk tolerance,
horizon and existing holdings, explains every allocation, reviews the portfolio weekly, and
keeps an immutable history of every recommendation.

> **This is not investment advice and not a broker.** All trading is simulated. Investments
> involve risk, including loss of capital. See [`/legal`](src/app/legal/page.tsx) and
> `docs/COMPLIANCE_CHECKLIST.md`.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhgfremail-creator%2Fai-global-investment-strategist&project-name=ai-global-investment-strategist&repository-name=ai-global-investment-strategist&env=DATABASE_PROVIDER,DATABASE_URL,AUTH_SECRET,CRON_SECRET&envDescription=DATABASE_PROVIDER%20must%20be%20postgresql%3B%20DATABASE_URL%20is%20your%20Postgres%20connection%20string%3B%20AUTH_SECRET%20%2F%20CRON_SECRET%20are%20random%20strings&envLink=https%3A%2F%2Fgithub.com%2Fhgfremail-creator%2Fai-global-investment-strategist%2Fblob%2Fmain%2FDEPLOY.md)

The button imports the repo and prompts for the four required env vars. You still need to
**add a Postgres database** (Vercel Storage → Postgres, or Neon) and **seed the universe
once** — see [`DEPLOY.md`](DEPLOY.md) for both. Optional keys (`ANTHROPIC_API_KEY`,
`FRED_API_KEY`, `NEWSAPI_KEY`) can be added later in the project settings.

---

## Status

| Phase | Scope | State |
|---|---|---|
| **1** | Architecture, DB schema + migration, demo universe seed, auth, app shell, onboarding, disclaimer gate, strategy/history versioning skeleton, test harness | ✅ done |
| **2** | Data layer: provider interfaces + deterministic demo provider + FRED & NewsAPI adapters, idempotent ingestion, Markets page | ✅ done |
| **3** | Analysis layer: indicators, 8-component 0–100 scoring model, 10-indicator market-regime engine, Research pages | ✅ done |
| **4** | Portfolio construction engine: sleeve tilts, per-sleeve selection, risk-parity weighting, constraint projection, FX, existing-holdings reconciliation, exact-100%; Strategy + Portfolio + Dashboard wired to real allocations | ✅ done |
| **5** | AI reasoning layer: Anthropic structured-output client + Zod + guardrails + deterministic fallback writer + `AIAnalysis` audit; per-position thesis/catalysts/risks/invalidation/committee/devil's-advocate; Opportunities page + "why not" rejected candidates | ✅ done |
| **6** | Risk engine: synthetic-portfolio vol/drawdown/Sharpe/Sortino (correlation-floor blended), HHI, factor look-through, valuation/liquidity/geopolitical gauges; 5 stress-test scenarios; Risk dashboard | ✅ done |
| **7** | Weekly strategy engine: movable demo clock, full refresh pipeline, week-over-week diff with concrete evidence per change, incumbency bonus (low turnover), 15-section weekly report, Weekly Review page + "run now" button | ✅ done |
| **8** | Historical tracking: immutable version browser, side-by-side compare (sleeve/position/factor deltas + reasons), stacked sleeve-history chart, per-version historical snapshot; `npm run verify:history` immutability check | ✅ done |
| **9** | Natural-language advisor (LLM path + deterministic intent router, answers grounded in stored data with citations); What-If tool (recompute for changed capital/risk/horizon/excluded sectors/min-gold + custom market shock) | ✅ done |
| **10** | Paper-performance engine (chains each version's allocation over its live period → NAV vs MSCI World + blended benchmark), performance + drawdown charts on Dashboard, a11y (skip link, aria-current, focus rings) | ✅ done |
| **11** | Full spec §47 sweep: 60 unit tests + 9 integration tests (temp SQLite DB, real pipeline) covering 100%-allocation, risk/horizon/capital recalculation, weekly-change identification, source attachment, no-rec-without-evidence, immutability, determinism, currency; `verify:no-secrets` client-bundle scan; source-hygiene test; SECURITY + COMPLIANCE checklists | ✅ done |
| **12** | Production hardening: PostgreSQL path (`@prisma/adapter-pg` branch + provider swap + docker-compose + Postgres CI job), CSP + per-route rate limiting, GitHub Actions CI, `docs/` complete (METHODOLOGY, API, + the 6 others) | ✅ done |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design and roadmap. **All 12 phases complete.**

---

## Quick start

```bash
npm install                    # allow build scripts for better-sqlite3 / prisma / esbuild if your npm prompts
cp .env.example .env           # set AUTH_SECRET + CRON_SECRET (generator below); everything else is optional
npm run db:migrate             # create the SQLite dev database
npm run db:seed                # load the demo universe + demo user + first strategy
npm run dev                    # http://localhost:3000
```

Generate secrets:

```bash
node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('CRON_SECRET='+require('crypto').randomBytes(32).toString('base64url'))"
```

**Demo login:** `demo@strategist.app` / `demodemo`

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build (via `scripts/build.mjs`) and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit suite (pure engines, ~60 tests) |
| `npm run test:integration` | End-to-end pipeline against a throwaway SQLite DB |
| `npm run test:all` | Both suites |
| `npm run verify:history` | Assert prior strategy versions are immutable after a weekly run |
| `npm run verify:no-secrets` | Scan the built client bundle for leaked secrets (run after `build`) |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:seed` | Seed demo data (incl. initial data ingestion) |
| `npm run db:ingest` | Refresh market/macro/news data (`-- --lookback N`) |
| `npm run db:reset` | Drop DB, re-migrate, re-seed |
| `npm run cron:weekly` | Run the weekly review job locally |

---

## Environment / platform notes

- **Database:** SQLite for local dev (zero setup). Prisma runs **engine-free**
  (`engineType = "client"` + `@prisma/adapter-better-sqlite3`) so it works on platforms
  without a native Prisma query engine, including **Windows on ARM**. For production, switch
  the datasource `provider` to `postgresql` and use `@prisma/adapter-pg` (`docker-compose.yml`
  provides a local Postgres).
- **`scripts/fs-readlink-shim.cjs`:** some Windows volumes return `EISDIR` instead of `EINVAL`
  from `fs.readlink()` on regular files, which breaks Next's build-time module tracing. The
  build wrapper preloads a shim that normalises this. Harmless elsewhere.
- **AI is optional.** With no `ANTHROPIC_API_KEY`, the app uses a deterministic fallback
  writer for explanations (clearly labelled). All portfolio math is deterministic regardless.
- **Market data is simulated** unless a real provider is configured. Simulated data is always
  badged and never presented as real-time.

---

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma (SQLite dev / Postgres
prod) · Recharts · Anthropic API (optional) · Vitest · Zod · decimal.js.

## Deploying with PostgreSQL

1. `docker compose up -d db` (or point at any Postgres).
2. In `.env`: `DATABASE_PROVIDER=postgresql` and a `postgresql://…` `DATABASE_URL`.
3. In `prisma/schema.prisma`, change the datasource `provider` to `"postgresql"`.
4. `npm i @prisma/adapter-pg pg && npx prisma generate && npx prisma migrate deploy`.
   `src/lib/db.ts` then uses `@prisma/adapter-pg` automatically. CI runs the integration
   suite against Postgres on every push.

## Documentation

| Doc | Contents |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | full design, data model, layered engine, roadmap |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | the investment philosophy and how the layers fit together |
| [`docs/SCORING_MODEL.md`](docs/SCORING_MODEL.md) | the 8-component 0–100 score + AI-exposure sub-model |
| [`docs/PORTFOLIO_ALGORITHM.md`](docs/PORTFOLIO_ALGORITHM.md) | sleeve targets → selection → constrained optimiser |
| [`docs/WEEKLY_REFRESH.md`](docs/WEEKLY_REFRESH.md) | the weekly review pipeline + immutability |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | provider adapters, macro series map, provenance |
| [`docs/AI_PROMPTS.md`](docs/AI_PROMPTS.md) | the reasoning-layer contract, prompts, guardrails, fallback |
| [`docs/API.md`](docs/API.md) | every route, request/response shapes |
| [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) | controls + what to run before deploy |
| [`docs/COMPLIANCE_CHECKLIST.md`](docs/COMPLIANCE_CHECKLIST.md) | product guardrails + pre-commercial review list |

## Repository layout

See [`ARCHITECTURE.md` §12](ARCHITECTURE.md#12-directory-layout).
