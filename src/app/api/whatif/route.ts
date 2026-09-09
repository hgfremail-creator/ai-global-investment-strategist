import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runWhatIf } from "@/services/whatIf";
import { HORIZONS } from "@/lib/enums";

const schema = z.object({
  capitalUsd: z.number().positive().max(1_000_000_000).optional(),
  riskScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  horizon: z.enum(HORIZONS).optional(),
  excludeSectors: z.array(z.string()).max(20).optional(),
  excludeAssetClasses: z.array(z.string()).max(6).optional(),
  minGoldPct: z.number().min(0).max(0.6).optional(),
  customShock: z
    .object({
      equity: z.number().min(-0.9).max(0.9).optional(),
      growthEquity: z.number().min(-0.9).max(0.9).optional(),
      gold: z.number().min(-0.9).max(0.9).optional(),
      bonds: z.number().min(-0.9).max(0.9).optional(),
      jpy: z.number().min(-0.5).max(0.5).optional(),
      usd: z.number().min(-0.5).max(0.5).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });

  const portfolio = await prisma.portfolio.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!portfolio) return NextResponse.json({ error: "No portfolio" }, { status: 400 });

  const result = await runWhatIf(portfolio.id, parsed.data);
  return NextResponse.json(result);
}
