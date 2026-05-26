import { describe, it, expect } from "vitest";
import { computeJinxRate } from "../lib-stats/jinx-rate";

describe("computeJinxRate", () => {
  it("floors instead of rounding up to 100% when completed no-nos exist", () => {
    expect(computeJinxRate(583, 1)).toBe(99);
    expect(computeJinxRate(592, 1)).toBe(99);
  });

  it("returns 100% only when every tracked outcome was jinxed", () => {
    expect(computeJinxRate(100, 0)).toBe(100);
  });

  it("returns 0% when nothing was jinxed", () => {
    expect(computeJinxRate(0, 5)).toBe(0);
  });
});
