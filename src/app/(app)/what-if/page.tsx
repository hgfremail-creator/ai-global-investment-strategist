import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card } from "@/components/ui";
import { WhatIfTool } from "./WhatIfTool";
import { formatMoney } from "@/lib/money";
import { HORIZON_LABELS, RISK_LABELS, type Horizon, type RiskScore } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const { ctx } = await pageContext();
  const s = await getLatestStrategy(ctx.portfolio.id);
  const sectors = Array.from(new Set((s?.allocation ?? []).map((r) => r.sector))).sort();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">What-If</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Recompute the portfolio for a different capital amount, risk level, horizon, or with a
          sector excluded — and run a custom market shock. Nothing here is saved.
        </p>
      </div>

      <Card>
        <div className="text-xs text-[var(--color-muted)]">
          Current: {formatMoney(ctx.portfolio.capitalUsdMinor, "USD")} · risk{" "}
          {ctx.riskProfile.riskScore}/5 ({RISK_LABELS[ctx.riskProfile.riskScore as RiskScore].title}) ·{" "}
          {HORIZON_LABELS[ctx.riskProfile.horizon as Horizon]}
        </div>
      </Card>

      <WhatIfTool
        defaults={{
          capitalUsd: ctx.portfolio.capitalUsdMinor / 100,
          riskScore: ctx.riskProfile.riskScore as RiskScore,
          horizon: ctx.riskProfile.horizon as Horizon,
        }}
        sectors={sectors}
      />
    </div>
  );
}
