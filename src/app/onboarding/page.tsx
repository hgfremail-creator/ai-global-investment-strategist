import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadUserContext, isOnboarded } from "@/services/context";
import { getFxRates } from "@/data/fx";
import { OnboardingWizard } from "./Wizard";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await loadUserContext(user.id);
  if (isOnboarded(ctx)) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-lg font-semibold">Set up your strategy</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        A few questions so the strategist can construct and continuously review a portfolio for you.
        Everything is simulated — no real money moves.
      </p>
      <OnboardingWizard fxRates={getFxRates()} />
    </div>
  );
}
