import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { askAdvisor } from "@/services/advisor";

const schema = z.object({ question: z.string().min(2).max(1000) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid question" }, { status: 400 });

  const portfolio = await prisma.portfolio.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!portfolio) return NextResponse.json({ error: "No portfolio" }, { status: 400 });

  const answer = await askAdvisor(portfolio.id, parsed.data.question);
  return NextResponse.json(answer);
}
