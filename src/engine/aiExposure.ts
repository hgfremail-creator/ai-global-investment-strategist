// AI-exposure sub-model → 0..100. Combines look-through factor loadings with
// sector/industry keyword signals. Deterministic and explainable.

export type FactorLoadings = {
  aiFactor: number;
  semiconductor: number;
  usTech: number;
  defensive: number;
  rates: number;
  gold: number;
};

const AI_INDUSTRY_HINTS: { re: RegExp; weight: number; label: string }[] = [
  { re: /semiconductor|foundry|fabless|chip/i, weight: 0.9, label: "semiconductors" },
  { re: /semiconductor equipment|semiconductor test|assembly & test/i, weight: 0.85, label: "semi equipment" },
  { re: /networking/i, weight: 0.7, label: "networking" },
  { re: /data-?centre|data-?center/i, weight: 0.8, label: "data-centre infrastructure" },
  { re: /cloud/i, weight: 0.65, label: "cloud" },
  { re: /software|enterprise software/i, weight: 0.5, label: "software" },
  { re: /cybersecurity/i, weight: 0.6, label: "cybersecurity" },
  { re: /robot/i, weight: 0.55, label: "robotics" },
  { re: /electrification|power/i, weight: 0.45, label: "power / electrification" },
  { re: /automation/i, weight: 0.45, label: "automation" },
];

export function aiExposureScore(input: {
  factors: FactorLoadings;
  sector: string;
  industry: string;
}): { score: number; drivers: string[] } {
  const drivers: string[] = [];
  const f = input.factors;

  // factor component (0..1)
  const factorComponent = Math.min(
    1,
    0.6 * f.aiFactor + 0.3 * f.semiconductor + 0.1 * f.usTech,
  );
  if (f.aiFactor > 0.6) drivers.push(`high direct AI factor loading (${f.aiFactor.toFixed(2)})`);
  else if (f.aiFactor > 0.3) drivers.push(`moderate AI factor loading (${f.aiFactor.toFixed(2)})`);
  if (f.semiconductor > 0.6) drivers.push(`semiconductor supply-chain exposure (${f.semiconductor.toFixed(2)})`);

  // industry keyword component (0..1)
  let kw = 0;
  for (const hint of AI_INDUSTRY_HINTS) {
    if (hint.re.test(input.industry) || hint.re.test(input.sector)) {
      kw = Math.max(kw, hint.weight);
      drivers.push(`industry signal: ${hint.label}`);
    }
  }

  const combined = Math.min(1, 0.7 * factorComponent + 0.45 * kw);
  if (drivers.length === 0) drivers.push("no material AI infrastructure or monetisation exposure identified");

  return { score: Math.round(combined * 1000) / 10, drivers: [...new Set(drivers)] };
}
