import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;

// Build (or rebuild) the strategy for the current user's portfolio.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const rl = rateLimit(`strategy:${user.id}`, { capacity: 4, refillPerSec: 0.02 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Just built one — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!portfolio) return NextResponse.json({ error: "No portfolio" }, { status: 400 });

  const securities = await prisma.security.count();
  if (securities === 0) {
    return NextResponse.json(
      { error: "The security universe hasn't been seeded yet. Run the one-time seed first (see DEPLOY.md)." },
      { status: 409 },
    );
  }

  try {
    const { generateStrategy } = await import("@/services/strategy");
    const res = await generateStrategy(portfolio.id, { reason: "manual", force: true });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
