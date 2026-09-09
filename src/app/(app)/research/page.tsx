import Link from "next/link";
import { pageContext } from "@/services/page";
import { listResearch } from "@/services/research";
import { Card, DemoBadge } from "@/components/ui";
import { ResearchTable } from "./ResearchTable";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  await pageContext();
  const rows = await listResearch();
  const scored = rows.filter((r) => r.overall != null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold">Research</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Transparent 0–100 score for every security. Click a row for the full breakdown.
          </p>
        </div>
        <DemoBadge />
      </div>

      {scored.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-muted)]">
            No scores yet. Run <span className="tnum">npm run db:seed</span> or trigger a data refresh.
          </p>
        </Card>
      ) : (
        <Card>
          <ResearchTable rows={rows} />
        </Card>
      )}

      <p className="text-[11px] text-[var(--color-faint)]">
        Scores blend a peer percentile with an absolute anchor for each component. Component weights
        are configurable per risk profile. See{" "}
        <Link href="/legal" className="text-[var(--color-accent)]">
          methodology
        </Link>
        .
      </p>
    </div>
  );
}
