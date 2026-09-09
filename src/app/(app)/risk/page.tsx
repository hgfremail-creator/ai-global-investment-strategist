import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function Page() {
  return (
    <PhasePlaceholder
      title="Risk"
      phase={6}
      delivers={[
        "Portfolio volatility, expected & historical drawdown, Sharpe / Sortino",
        "Concentration (HHI), country / currency / sector exposure",
        "AI-factor, semiconductor and US-tech look-through exposure with concentration warnings",
        "Valuation, liquidity and geopolitical risk gauges",
        "Stress tests: AI crash, recession, inflation shock, geopolitical crisis, Japan rate shock",
      ]}
    />
  );
}
