"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", hint: "Portfolio overview" },
  { href: "/strategy", label: "Strategy", hint: "Current investment strategy" },
  { href: "/opportunities", label: "Opportunities", hint: "Best current ideas" },
  { href: "/portfolio", label: "Portfolio", hint: "Holdings & allocations" },
  { href: "/markets", label: "Markets", hint: "Global market dashboard" },
  { href: "/research", label: "Research", hint: "Company analysis" },
  { href: "/risk", label: "Risk", hint: "Portfolio risk" },
  { href: "/what-if", label: "What-If", hint: "Scenario & recompute" },
  { href: "/weekly-review", label: "Weekly Review", hint: "Latest report" },
  { href: "/history", label: "History", hint: "Previous strategies" },
  { href: "/advisor", label: "AI Advisor", hint: "Ask questions" },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-surface)] md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold tracking-tight">AI Global Investment</div>
        <div className="text-sm font-semibold tracking-tight text-[var(--color-accent)]">
          Strategist
        </div>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-row flex-wrap gap-1 px-2 pb-2 md:flex-col md:overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                active
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
              )}
            >
              <div className="font-medium">{item.label}</div>
              <div className="hidden text-[11px] text-[var(--color-faint)] md:block">
                {item.hint}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--color-border)] px-4 py-3 text-[11px] text-[var(--color-muted)]">
        <div className="truncate" title={userEmail}>
          {userEmail}
        </div>
        <button onClick={logout} className="mt-1 text-[var(--color-accent)] hover:underline">
          Sign out
        </button>
      </div>
    </aside>
  );
}
