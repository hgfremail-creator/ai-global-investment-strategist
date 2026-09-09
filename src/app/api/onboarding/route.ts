import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { onboardingSchema } from "@/lib/validation";
import { toJson } from "@/lib/json";
import { toMinor } from "@/lib/money";
import { toUsd } from "@/data/fx";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";
import type { RiskScore } from "@/lib/enums";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const capitalUsd = toUsd(input.capitalAmount, input.capitalCurrency);
  const capitalUsdMinor = toMinor(capitalUsd);

  const result = await prisma.$transaction(async (tx) => {
    await tx.riskProfile.updateMany({
      where: { userId: user.id, active: true },
      data: { active: false },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { baseCurrency: input.capitalCurrency },
    });
    const riskProfile = await tx.riskProfile.create({
      data: {
        userId: user.id,
        active: true,
        riskScore: input.riskScore,
        horizon: input.horizon,
        objective: input.objective,
        constraintsJson: toJson(DEFAULT_CONSTRAINTS[input.riskScore as RiskScore]),
      },
    });

    let portfolio = await tx.portfolio.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!portfolio) {
      portfolio = await tx.portfolio.create({
        data: {
          userId: user.id,
          name: "Primary",
          baseCurrency: input.capitalCurrency,
          capitalUsdMinor,
        },
      });
    } else {
      portfolio = await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { baseCurrency: input.capitalCurrency, capitalUsdMinor },
      });
    }

    // Existing positions (best-effort: match by ticker within the demo universe).
    for (const pos of input.existingPositions ?? []) {
      const security = await tx.security.findFirst({
        where: { ticker: { equals: pos.ticker.toUpperCase() } },
      });
      if (!security) continue;
      await tx.portfolioPosition.upsert({
        where: {
          portfolioId_securityId: { portfolioId: portfolio.id, securityId: security.id },
        },
        create: {
          portfolioId: portfolio.id,
          securityId: security.id,
          quantity: pos.quantity,
          avgPriceMinor: toMinor(pos.avgPrice),
          isUserSupplied: true,
        },
        update: {
          quantity: pos.quantity,
          avgPriceMinor: toMinor(pos.avgPrice),
          isUserSupplied: true,
        },
      });
    }

    return { riskProfileId: riskProfile.id, portfolioId: portfolio.id };
  });

  // Kick off initial strategy generation (implemented in the strategy phase).
  try {
    const { generateStrategy } = await import("@/services/strategy");
    await generateStrategy(result.portfolioId, { reason: "onboarding" });
  } catch (err) {
    console.error("initial strategy generation skipped:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
