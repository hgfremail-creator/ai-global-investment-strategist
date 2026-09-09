import { describe, expect, it } from "vitest";
import { computeChanges } from "@/engine/diff";

const sleevesA = { growth: 0.5, defensiveEquity: 0.2, gold: 0.12, bonds: 0.13, cash: 0.03, diversifiers: 0 };
const sleevesB = { growth: 0.42, defensiveEquity: 0.22, gold: 0.15, bonds: 0.16, cash: 0.05, diversifiers: 0 };

describe("computeChanges", () => {
  it("detects sleeve moves above the threshold and labels direction", () => {
    const ch = computeChanges([], [], sleevesA, sleevesB);
    const growth = ch.find((c) => c.label.startsWith("Growth"));
    expect(growth?.deltaText).toMatch(/^-8\.0%/);
    expect(growth?.reason).toMatch(/Reduced/);
    const gold = ch.find((c) => c.label.startsWith("Gold"));
    expect(gold?.reason).toMatch(/Increased/);
  });

  it("classifies added / removed / reweighted positions", () => {
    const prev = [{ ticker: "NVDA", weight: 0.08 }, { ticker: "MSFT", weight: 0.07 }, { ticker: "OLD", weight: 0.05 }];
    const next = [{ ticker: "NVDA", weight: 0.1 }, { ticker: "MSFT", weight: 0.07 }, { ticker: "NEW", weight: 0.04 }];
    const ch = computeChanges(prev, next, sleevesA, sleevesA);
    expect(ch.find((c) => c.label === "NEW")?.previousValue).toBe("0%");
    expect(ch.find((c) => c.label === "OLD")?.newValue).toBe("0%");
    expect(ch.find((c) => c.label === "NVDA")?.deltaText).toBe("+2.0%");
    expect(ch.find((c) => c.label === "MSFT")).toBeUndefined(); // unchanged
  });

  it("returns nothing when nothing moved beyond the threshold", () => {
    const prev = [{ ticker: "NVDA", weight: 0.08 }];
    const next = [{ ticker: "NVDA", weight: 0.083 }];
    expect(computeChanges(prev, next, sleevesA, sleevesA)).toEqual([]);
  });
});
