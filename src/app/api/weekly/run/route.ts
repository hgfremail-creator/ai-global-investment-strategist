import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runWeeklyReview } from "@/services/weeklyReview";

// Authenticated convenience endpoint so a user can trigger a weekly review from
// the UI. The scheduled path is POST /api/cron/weekly-review (bearer secret).
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!portfolio) return NextResponse.json({ error: "No portfolio" }, { status: 400 });

  const res = await runWeeklyReview(portfolio.id, { force: true });
  return NextResponse.json({ ok: true, ...res });
}
