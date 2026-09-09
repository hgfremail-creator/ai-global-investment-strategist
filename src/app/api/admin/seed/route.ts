import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const maxDuration = 300;

// One-time universe seed for a fresh production database — use when you can't
// reach the DB from your machine to run `npm run db:seed:prod`.
//   curl -X POST "https://<app>/api/admin/seed" -H "Authorization: Bearer $CRON_SECRET"
// Add ?force=1 to re-run even if securities already exist.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  const [securities, prices, versions] = await Promise.all([
    prisma.security.count(),
    prisma.price.count(),
    prisma.strategyVersion.count(),
  ]);
  const complete = securities > 40 && prices > 5000 && versions > 0;
  if (complete && !force) {
    return NextResponse.json({
      ok: true, skipped: true, securities, prices, versions,
      note: "already seeded — pass ?force=1 to re-run",
    });
  }

  // Every step is idempotent, so calling this again after a timeout resumes safely.
  const { seedAll } = await import("@/data/seed-core");
  const started = Date.now();
  const res = await seedAll();
  return NextResponse.json({ ok: true, ...res, elapsedMs: Date.now() - started });
}

export const POST = handle;
export const GET = handle;
