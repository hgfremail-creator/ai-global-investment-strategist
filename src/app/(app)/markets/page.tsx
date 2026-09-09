import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function Page() {
  return (
    <PhasePlaceholder
      title="Markets"
      phase={2}
      delivers={[
        "Global market dashboard: US, Japan, Taiwan, France, Germany equity benchmarks",
        "Macro panel: inflation, policy rates, 10y yields, USD/EUR/JPY/TWD, credit spreads, gold, oil",
        "Market-regime summary with supporting indicators",
        "All figures sourced and dated; simulated data clearly labelled",
      ]}
    />
  );
}
