import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function Page() {
  return (
    <PhasePlaceholder
      title="Opportunities"
      phase={5}
      delivers={[
        "Ranked list of the best current risk/reward ideas across the global universe",
        "Per-security score breakdown (business quality, growth, valuation, momentum, AI exposure, balance sheet, risk)",
        '"Why this stock" and "Why not this stock" explanations',
        "Suggested portfolio weight, entry strategy and conviction",
      ]}
    />
  );
}
