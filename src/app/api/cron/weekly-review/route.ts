import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const maxDuration = 300; // seconds — the weekly review is heavy

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when the
  // CRON_SECRET env var is set; manual callers send the same header.
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const onlyPortfolio = url.searchParams.get("portfolioId");

  const portfolios = onlyPortfolio
    ? await prisma.portfolio.findMany({ where: { id: onlyPortfolio } })
    : await prisma.portfolio.findMany();

  const { runWeeklyReview } = await import("@/services/weeklyReview");
  const results: unknown[] = [];
  for (const p of portfolios) {
    try {
      results.push(await runWeeklyReview(p.id, { force }));
    } catch (err) {
      results.push({ portfolioId: p.id, error: (err as Error).message });
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}

// Vercel Cron issues GET; keep POST for manual / scripted invocation.
export const GET = handle;
export const POST = handle;
