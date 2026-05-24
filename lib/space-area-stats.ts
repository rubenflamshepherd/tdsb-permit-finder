export type SpaceAreaStatsSummary = {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
};

export type SpaceAreaBin = {
  start: number;
  end: number;
  count: number;
};

export type SpaceAreaDistribution = SpaceAreaStatsSummary & { values: number[] };

// Canonical unit is sqft. sqm values are derived via SQM_PER_SQFT so the
// shape of the distribution is identical in both units (TDSB rounds the two
// fields independently and occasionally publishes only one, which previously
// produced subtly different histograms).
export const SQM_PER_SQFT = 0.092903;

export type SpaceAreaTypeStats = {
  spaceTypeId: number;
  name: string;
  distribution: SpaceAreaDistribution | null;
};

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function computeStats(values: number[]): SpaceAreaStatsSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: quantileSorted(sorted, 0.5),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
  };
}

export function percentileForValue(values: number[], target: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (target < sorted[0]) return 0;
  if (target > sorted[sorted.length - 1]) return 100;
  let lessCount = 0;
  while (lessCount < sorted.length && sorted[lessCount] < target) lessCount++;
  let eqCount = 0;
  while (lessCount + eqCount < sorted.length && sorted[lessCount + eqCount] === target) eqCount++;
  const rank = lessCount + eqCount / 2;
  return (rank / sorted.length) * 100;
}

export function binValues(values: number[], binCount: number): SpaceAreaBin[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (lo === hi) return [{ start: lo, end: hi, count: sorted.length }];
  const width = (hi - lo) / binCount;
  const bins: SpaceAreaBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: lo + i * width,
    end: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of sorted) {
    let idx = Math.floor((v - lo) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}
