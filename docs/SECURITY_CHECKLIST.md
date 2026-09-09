# Security checklist

| # | Control | Status | Where |
|---|---|---|---|
| 1 | All provider / auth / AI secrets are server-only env vars; no `NEXT_PUBLIC_` secret | ✅ | `.env.example`, `src/test/security-source.test.ts` |
| 2 | Client bundle contains no secret name or value | ✅ automated | `npm run verify:no-secrets` (run after build) |
| 3 | `"use client"` components never value-import `@/lib/db` / `@/lib/auth` / `@/ai/client` / `@/services/*` | ✅ automated | `src/test/security-source.test.ts` |
| 4 | Passwords hashed with bcrypt (cost 12) | ✅ | `src/lib/auth.ts` |
| 5 | Session cookie: httpOnly, sameSite=lax, secure in prod, JWT (HS256) signed with `AUTH_SECRET` | ✅ | `src/lib/session-token.ts`, `src/lib/auth.ts` |
| 6 | Edge middleware guards every non-public route; only verifies the JWT (no DB/bcrypt in Edge) | ✅ | `src/middleware.ts`, `src/lib/session-token.ts` |
| 7 | Cron endpoint uses a constant-time bearer-secret compare | ✅ | `src/app/api/cron/weekly-review/route.ts` |
| 8 | Every API route validates its body with Zod | ✅ | `src/app/api/**/route.ts`, `src/lib/validation.ts` |
| 9 | Prisma parameterises all queries (no string-built SQL) | ✅ | ORM only |
| 10 | Security headers (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) | ✅ | `next.config.ts` |
| 11 | Content-Security-Policy | ⬜ Phase 12 | to add in `next.config.ts` middleware |
| 12 | Rate limiting on AI / advisor / what-if routes | ⬜ Phase 12 | token-bucket per user |
| 13 | AI prompt hash stored, not raw keys; no secret logged | ✅ | `src/services/recommendations.ts` (`AIAnalysis`) |
| 14 | AI output guardrails (no fabricated data / sources / targets) applied to LLM **and** fallback | ✅ | `src/ai/guardrails.ts` + tests |
| 15 | `dubious ownership` / arbitrary code from data — data treated as data, never executed | ✅ | design |
| 16 | Dependency audit reviewed before deploy | ⬜ Phase 12 | `npm audit` in CI |

Run before any deploy: `npm run typecheck && npm run test:all && npm run build && npm run verify:no-secrets && npm run verify:history`.
