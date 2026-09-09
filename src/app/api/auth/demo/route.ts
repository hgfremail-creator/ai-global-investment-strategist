import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { toJson } from "@/lib/json";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";

export const maxDuration = 30;

// One-click access: find-or-create a ready-made, fully-onboarded account and open
// a session. Fast — the strategy is built separately (dashboard "Build strategy"
// button or the weekly job). Disable with DISABLE_DEMO_LOGIN=true.
export async function POST() {
  if (process.env.DISABLE_DEMO_LOGIN === "true") {
    return NextResponse.json({ error: "Demo access is disabled" }, { status: 404 });
  }

  try {
    const email = "demo@strategist.app";
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: "Demo Investor", passwordHash: await hashPassword("demodemo"), baseCurrency: "USD" },
      });
    }

    if (!(await prisma.riskProfile.findFirst({ where: { userId: user.id, active: true } }))) {
      await prisma.riskProfile.create({
        data: {
          userId: user.id, active: true, riskScore: 2, horizon: "Y5_10",
          objective: "GROWTH_PROTECTION", constraintsJson: toJson(DEFAULT_CONSTRAINTS[2]),
        },
      });
    }
    if (!(await prisma.portfolio.findFirst({ where: { userId: user.id } }))) {
      await prisma.portfolio.create({
        data: { userId: user.id, name: "Primary", baseCurrency: "USD", capitalUsdMinor: 100_000_00 },
      });
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: `Could not open a session: ${(err as Error).message}` }, { status: 500 });
  }
}
