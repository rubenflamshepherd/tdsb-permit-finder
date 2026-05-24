import { describe, expect, it } from "vitest";
import { binValues, computeStats, percentileForValue } from "../lib/space-area-stats";

describe("computeStats", () => {
  it("returns null for an empty array", () => {
    expect(computeStats([])).toBeNull();
  });

  it("returns identical stats for a single value", () => {
    expect(computeStats([1500])).toEqual({
      count: 1,
      min: 1500,
      max: 1500,
      mean: 1500,
      median: 1500,
      p25: 1500,
      p75: 1500,
    });
  });

  it("computes mean, median, and quartiles for an evenly spaced sample", () => {
    expect(computeStats([100, 200, 300, 400, 500])).toEqual({
      count: 5,
      min: 100,
      max: 500,
      mean: 300,
      median: 300,
      p25: 200,
      p75: 400,
    });
  });

  it("interpolates quartiles between adjacent values when needed", () => {
    const stats = computeStats([10, 20, 30, 40]);
    expect(stats).not.toBeNull();
    expect(stats!.p25).toBeCloseTo(17.5, 5);
    expect(stats!.median).toBeCloseTo(25, 5);
    expect(stats!.p75).toBeCloseTo(32.5, 5);
  });

  it("ignores input order", () => {
    expect(computeStats([500, 100, 300, 200, 400])).toEqual(
      computeStats([100, 200, 300, 400, 500]),
    );
  });
});

describe("percentileForValue", () => {
  it("returns 0 for values below the minimum", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 50)).toBe(0);
  });

  it("returns 100 for values above the maximum", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 600)).toBe(100);
  });

  it("places a value equal to the median at the midpoint", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 300)).toBe(50);
  });

  it("uses midpoint rank for the smallest exact value", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 100)).toBe(10);
  });

  it("uses midpoint rank for the largest exact value", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 500)).toBe(90);
  });

  it("counts strict comparisons when the value falls between samples", () => {
    expect(percentileForValue([100, 200, 300, 400, 500], 250)).toBe(40);
  });

  it("returns 0 for an empty distribution", () => {
    expect(percentileForValue([], 1234)).toBe(0);
  });
});

describe("binValues", () => {
  it("returns no bins for an empty array", () => {
    expect(binValues([], 4)).toEqual([]);
  });

  it("returns a single bin when all values are identical", () => {
    expect(binValues([200, 200, 200], 5)).toEqual([
      { start: 200, end: 200, count: 3 },
    ]);
  });

  it("partitions values into equal-width bins, with the max landing in the last bin", () => {
    const bins = binValues([100, 200, 300, 400, 500], 4);
    expect(bins).toHaveLength(4);
    expect(bins[0]).toMatchObject({ start: 100, end: 200, count: 1 });
    expect(bins[1]).toMatchObject({ start: 200, end: 300, count: 1 });
    expect(bins[2]).toMatchObject({ start: 300, end: 400, count: 1 });
    expect(bins[3]).toMatchObject({ start: 400, end: 500, count: 2 });
  });

  it("uses half-open intervals so the max always falls in the last bin", () => {
    const bins = binValues([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(11);
    expect(bins[bins.length - 1].count).toBeGreaterThanOrEqual(1);
  });
});
