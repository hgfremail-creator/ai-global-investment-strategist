import "server-only";
import { prisma } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { DEFAULT_CONSTRAINTS, type ConstraintSet } from "@/lib/config";
import type { Horizon, Objective, RiskScore } from "@/lib/enums";

export type UserContext = {
  userId: string;
  baseCurrency: string;
  riskProfile: {
    id: string;
    riskScore: RiskScore;
    horizon: Horizon;
    objective: Objective;
    constraints: ConstraintSet;
  } | null;
  portfolio: {
    id: string;
    name: string;
    capitalUsdMinor: number;
    positionCount: number;
  } | null;
};

export async function loadUserContext(userId: string): Promise<UserContext> {
  const [user, riskProfile, portfolio] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.riskProfile.findFirst({
      where: { userId, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portfolio.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { positions: true } } },
    }),
  ]);

  return {
    userId,
    baseCurrency: user?.baseCurrency ?? "USD",
    riskProfile: riskProfile
      ? {
          id: riskProfile.id,
          riskScore: riskProfile.riskScore as RiskScore,
          horizon: riskProfile.horizon as Horizon,
          objective: riskProfile.objective as Objective,
          constraints: fromJson<ConstraintSet>(
            riskProfile.constraintsJson,
            DEFAULT_CONSTRAINTS[riskProfile.riskScore as RiskScore],
          ),
        }
      : null,
    portfolio: portfolio
      ? {
          id: portfolio.id,
          name: portfolio.name,
          capitalUsdMinor: portfolio.capitalUsdMinor,
          positionCount: portfolio._count.positions,
        }
      : null,
  };
}

export function isOnboarded(ctx: UserContext): boolean {
  return ctx.riskProfile != null && ctx.portfolio != null;
}
