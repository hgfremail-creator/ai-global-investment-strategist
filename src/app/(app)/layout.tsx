import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadUserContext, isOnboarded } from "@/services/context";
import { Sidebar } from "@/components/layout/nav";
import { DisclaimerGate, DisclaimerBanner } from "@/components/layout/disclaimer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ctx = await loadUserContext(user.id);
  if (!isOnboarded(ctx)) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar userEmail={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DisclaimerBanner />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
      <DisclaimerGate />
    </div>
  );
}
