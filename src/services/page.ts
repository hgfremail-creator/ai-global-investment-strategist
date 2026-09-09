import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadUserContext, isOnboarded, type UserContext } from "./context";

/** For pages inside the (app) group — session + onboarding already guaranteed by layout,
 *  but this gives typed non-null context. */
export async function pageContext(): Promise<{
  user: { id: string; email: string; name: string | null; baseCurrency: string };
  ctx: UserContext & {
    riskProfile: NonNullable<UserContext["riskProfile"]>;
    portfolio: NonNullable<UserContext["portfolio"]>;
  };
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await loadUserContext(user.id);
  if (!isOnboarded(ctx)) redirect("/onboarding");
  return {
    user,
    ctx: ctx as UserContext & {
      riskProfile: NonNullable<UserContext["riskProfile"]>;
      portfolio: NonNullable<UserContext["portfolio"]>;
    },
  };
}
