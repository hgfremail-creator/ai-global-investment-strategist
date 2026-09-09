import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ingestAll } from "@/data/ingestion";

// Manual data refresh (also runs inside the weekly job). Auth: logged-in user.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const lookbackDays = Number(url.searchParams.get("lookbackDays")) || undefined;
  const report = await ingestAll({ lookbackDays });
  return NextResponse.json({ ok: true, report });
}
