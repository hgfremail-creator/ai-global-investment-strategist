import { describe, expect, it } from "vitest";
import { baseSleeves, tiltSleeves } from "@/engine/sleeves";
import { DEFAULT_CONSTRAINTS } from "@/lib/config";
import { HORIZONS, RISK_SCORES, SLEEVES } from "@/lib/enums";

const sum = (w: Record<string, number>) =>
  SLEEVES.reduce((a, s) => a + w[s], 0);

describe("sleeve allocation", () => {
  it("base matrix rows sum to 1 for every risk/horizon", () => {
    for (const r of RISK_SCORES) {
      for (const h of HORIZONS) {
        expect(sum(baseSleeves(r, h))).toBeCloseTo(1, 6);
      }
    }
  });

  it("tilted sleeves always sum to exactly 1 and are non-negative", () => {
    for (const r of RISK_SCORES) {
      for (const h of HORIZONS) {
        for (const regime of ["STRONG_RISK_ON", "RISK_ON", "NEUTRAL", "RISK_OFF", "CRISIS"]) {
          const w = tiltSleeves(baseSleeves(r, h), regime, DEFAULT_CONSTRAINTS[r]);
          expect(sum(w)).toBeCloseTo(1, 6);
          for (const s of SLEEVES) expect(w[s]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("respects the growth ceiling and defensive floor per risk profile", () => {
    for (const r of RISK_SCORES) {
      const c = DEFAULT_CONSTRAINTS[r];
      for (const h of HORIZONS) {
        const w = tiltSleeves(baseSleeves(r, h), "STRONG_RISK_ON", c);
        expect(w.growth).toBeLessThanOrEqual(c.maxGrowth + 1e-6);
        const defensive = w.defensiveEquity + w.gold + w.bonds + w.cash;
        expect(defensive).toBeGreaterThanOrEqual(c.minDefensive - 1e-6);
      }
    }
  });

  it("shifts toward defensives in a crisis regime vs strong risk-on", () => {
    for (const r of RISK_SCORES) {
      const on = tiltSleeves(baseSleeves(r, "Y5_10"), "STRONG_RISK_ON", DEFAULT_CONSTRAINTS[r]);
      const crisis = tiltSleeves(baseSleeves(r, "Y5_10"), "CRISIS", DEFAULT_CONSTRAINTS[r]);
      expect(crisis.growth).toBeLessThanOrEqual(on.growth + 1e-9);
      expect(crisis.gold + crisis.bonds + crisis.cash).toBeGreaterThanOrEqual(
        on.gold + on.bonds + on.cash - 1e-9,
      );
    }
  });

  it("is monotonic: higher risk score (lower risk) => not more growth", () => {
    for (let i = 0; i < RISK_SCORES.length - 1; i++) {
      const a = tiltSleeves(baseSleeves(RISK_SCORES[i], "Y5_10"), "NEUTRAL", DEFAULT_CONSTRAINTS[RISK_SCORES[i]]);
      const b = tiltSleeves(baseSleeves(RISK_SCORES[i + 1], "Y5_10"), "NEUTRAL", DEFAULT_CONSTRAINTS[RISK_SCORES[i + 1]]);
      expect(b.growth).toBeLessThanOrEqual(a.growth + 1e-9);
    }
  });
});
