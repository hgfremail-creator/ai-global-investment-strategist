import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function Page() {
  return (
    <PhasePlaceholder
      title="Research"
      phase={3}
      delivers={[
        "Individual company analysis for every security in the universe",
        "Transparent 0–100 score with per-component contribution",
        "Fundamentals, valuation vs history / sector / growth, momentum, AI-exposure score",
        "Bull / base / bear case and devil's-advocate pass for high-conviction names",
      ]}
    />
  );
}
