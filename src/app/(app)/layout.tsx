import { redirect } from "next/navigation";
import { getSessionUser, OPEN_ACCESS } from "@/lib/auth";
import { loadUserContext, isOnboarded } from "@/services/context";
import { Sidebar } from "@/components/layout/nav";
import { DisclaimerGate, DisclaimerBanner } from "@/components/layout/disclaimer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ctx = await loadUserContext(user.id);
  if (!isOnboarded(ctx) && !OPEN_ACCESS) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-[var(--color-accent)] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar userEmail={user.email} openAccess={OPEN_ACCESS} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DisclaimerBanner />
        <main id="main" className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <DisclaimerGate />
    </div>
  );
}
