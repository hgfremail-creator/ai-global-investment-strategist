import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session-token";

const PUBLIC_PATHS = ["/login", "/register", "/legal"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/admin");

  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!userId && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (userId && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
