import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function Page() {
  return (
    <PhasePlaceholder
      title="AI Advisor"
      phase={9}
      delivers={[
        "Conversational interface answering strictly from the app's current data and sources",
        'Handles questions like "Why did you reduce NVIDIA?", "What is my biggest risk?", "Which three names have the best risk/reward?"',
        "What-if tool: change capital, risk score, horizon, or exclude a sector and recalculate",
        "Every answer cites the stored data and sources it used; no fabricated figures",
      ]}
    />
  );
}
