import { APP } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-tight">{APP.name}</div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            AI-powered global investment research · Paper investing only
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--color-faint)]">
          This is a research and portfolio-analysis tool, not investment advice.
          Investments involve risk, including loss of capital.
        </p>
      </div>
    </div>
  );
}
