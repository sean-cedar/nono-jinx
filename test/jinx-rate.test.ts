import { describe, it, expect } from "vitest";

/** Mirrors web/src/lib/redis.ts computeJinxRate */
function computeJinxRate(jinxed: number, completed: number): number {
  const total = jinxed + completed;
  if (total === 0) return 0;
  const pct = (jinxed / total) * 100;
  if (completed > 0 && pct < 100) return Math.floor(pct);
  return Math.round(pct);
}

describe("computeJinxRate", () => {
  it("floors instead of rounding up to 100% when completed no-nos exist", () => {
    expect(computeJinxRate(592, 1)).toBe(99);
  });

  it("returns 100% only when every tracked outcome was jinxed", () => {
    expect(computeJinxRate(100, 0)).toBe(100);
  });

  it("returns 0% when nothing was jinxed", () => {
    expect(computeJinxRate(0, 5)).toBe(0);
  });
});
