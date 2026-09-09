import { describe, expect, it } from "vitest";
import { allocateMinor, fromMinor, toMinor } from "@/lib/money";
import { seededRng } from "@/lib/rng";

describe("money", () => {
  it("round-trips minor units", () => {
    expect(toMinor(100_000)).toBe(10_000_000);
    expect(fromMinor(10_000_000)).toBe(100_000);
    expect(toMinor("1234.56")).toBe(123456);
  });

  it("allocateMinor sums exactly to the total for arbitrary weights", () => {
    const rng = seededRng("alloc");
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + Math.floor(rng() * 8);
      const raw = Array.from({ length: n }, () => rng());
      const s = raw.reduce((a, b) => a + b, 0);
      const weights = raw.map((w) => w / s);
      const total = 1 + Math.floor(rng() * 5_000_000);
      const parts = allocateMinor(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      for (const p of parts) expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it("allocateMinor handles a single weight", () => {
    expect(allocateMinor(999, [1])).toEqual([999]);
  });
});

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRng("x", 1);
    const b = seededRng("x", 1);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
});
