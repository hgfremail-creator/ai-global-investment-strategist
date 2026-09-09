import { pageContext } from "@/services/page";
import { getLatestStrategy } from "@/services/strategyRead";
import { Card, Empty } from "@/components/ui";

export default async function WeeklyReviewPage() {
  const { ctx } = await pageContext();
  const s = await getLatestStrategy(ctx.portfolio.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-lg font-semibold">Weekly Review</h1>
      {s?.researchReport ? (
        <Card>
          <article className="prose-invert whitespace-pre-wrap text-sm text-[var(--color-muted)]">
            {s.researchReport.markdown}
          </article>
        </Card>
      ) : (
        <Card>
          <Empty>
            The weekly investment review — what happened, what changed, what to buy / hold / reduce /
            sell, new opportunities, increased risks, and a week-over-week allocation table with a
            reason for every change — is delivered in Phase 7.
          </Empty>
        </Card>
      )}
    </div>
  );
}
