import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import {
  SESSION_COOKIE,
  sessionMaxAge,
  signSessionToken,
  readSessionToken,
} from "./session-token";

import { toJson } from "./json";
import { DEFAULT_CONSTRAINTS } from "./config";

export { SESSION_COOKIE, readSessionToken };

export const OPEN_ACCESS = process.env.OPEN_ACCESS === "true";
export const DEMO_EMAIL = "demo@strategist.app";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  baseCurrency: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge(),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

function toSessionUser(u: { id: string; email: string; name: string | null; baseCurrency: string }): SessionUser {
  return { id: u.id, email: u.email, name: u.name, baseCurrency: u.baseCurrency };
}

/** In OPEN_ACCESS mode, ensure a ready-to-use demo account exists. */
async function ensureDemoUser(): Promise<SessionUser> {
  let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: DEMO_EMAIL, name: "Demo Investor", passwordHash: await hashPassword("demodemo"), baseCurrency: "USD" },
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
  return toSessionUser(user);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) return toSessionUser(user);
  }
  if (OPEN_ACCESS) return ensureDemoUser();
  return null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
