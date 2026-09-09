// Edge-safe: JWT verification only. No DB, no bcrypt, no next/headers.
// Imported by middleware.ts and by the fuller server-only helpers in auth.ts.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "gis_session";
const enc = new TextEncoder();

export function sessionSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 24) {
    throw new Error("AUTH_SECRET missing or too short (need 24+ chars)");
  }
  return enc.encode(s);
}

export function sessionMaxAge(): number {
  return Number(process.env.AUTH_SESSION_MAX_AGE ?? 604800);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAge()}s`)
    .sign(sessionSecret());
}

export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
