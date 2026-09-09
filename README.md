# AI Global Investment Strategist

A production-oriented **paper-investing research application** that behaves like a disciplined
global investment strategist: it analyses major markets (US, Japan, Taiwan, France, Germany +
gold / bonds / cash), constructs a diversified portfolio from your capital, risk tolerance,
horizon and existing holdings, explains every allocation, reviews the portfolio weekly, and
keeps an immutable history of every recommendation.

> **This is not investment advice and not a broker.** All trading is simulated. Investments
> involve risk, including loss of capital. See [`/legal`](src/app/legal/page.tsx) and
> `docs/COMPLIANCE_CHECKLIST.md`.

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
| 7 | Weekly strategy engine, change diffing + explanations, Weekly Review + report | ⬜ |
| 8 | Historical tracking + version comparison | ⬜ |
| 9 | Stress-test UI, what-if tool, natural-language advisor | ⬜ |
| 10–12 | UI refinement, full test sweep, production hardening | ⬜ |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design and roadmap.

---

## Quick start

```bash
npm install
npm run approve-scripts        # if prompted — allow better-sqlite3 / prisma / esbuild build scripts
cp .env.example .env           # then set AUTH_SECRET and CRON_SECRET (see below)
npm run db:migrate             # create the SQLite dev database
npm run db:seed                # load the demo universe + demo user
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
| `npm test` | Vitest engine/unit suite |
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

## Repository layout

See [`ARCHITECTURE.md` §12](ARCHITECTURE.md#12-directory-layout).
