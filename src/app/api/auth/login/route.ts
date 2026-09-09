import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { credentialsSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`login:${ip}`, { capacity: 8, refillPerSec: 0.05 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts — try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = user && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
