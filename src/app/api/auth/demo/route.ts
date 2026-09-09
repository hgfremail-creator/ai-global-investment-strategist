import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { toJson } from "@/lib/json";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";

export const maxDuration = 120;

// One-click access: find-or-create a ready-made, fully-onboarded account and open
// a session. No signup form, no onboarding wizard. Disable with DISABLE_DEMO_LOGIN=true.
export async function POST() {
  if (process.env.DISABLE_DEMO_LOGIN === "true") {
    return NextResponse.json({ error: "Demo access is disabled" }, { status: 404 });
  }

  const email = "demo@strategist.app";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: "Demo Investor",
        passwordHash: await hashPassword("demodemo"),
        baseCurrency: "USD",
      },
    });
  }

  let profile = await prisma.riskProfile.findFirst({ where: { userId: user.id, active: true } });
  if (!profile) {
    profile = await prisma.riskProfile.create({
      data: {
        userId: user.id,
        active: true,
        riskScore: 2,
        horizon: "Y5_10",
        objective: "GROWTH_PROTECTION",
        constraintsJson: toJson(DEFAULT_CONSTRAINTS[2]),
      },
    });
  }

  let portfolio = await prisma.portfolio.findFirst({ where: { userId: user.id } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId: user.id, name: "Primary", baseCurrency: "USD", capitalUsdMinor: 100_000_00 },
    });
  }

  const hasStrategy = await prisma.strategyVersion.count({ where: { portfolioId: portfolio.id } });
  if (!hasStrategy) {
    try {
      const { generateStrategy } = await import("@/services/strategy");
      await generateStrategy(portfolio.id, { reason: "demo-access" });
    } catch (err) {
      // securities may not be seeded yet — log in anyway; the dashboard degrades gracefully
      console.error("demo strategy generation deferred:", (err as Error).message);
    }
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
