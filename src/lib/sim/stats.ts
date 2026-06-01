export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const s = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return s / (values.length - 1);
}

export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function ci95(values: number[]): { lower: number; upper: number } {
  if (values.length === 0) return { lower: 0, upper: 0 };
  const m = mean(values);
  const sd = stddev(values);
  const half = 1.96 * (sd / Math.sqrt(Math.max(1, values.length)));
  return { lower: m - half, upper: m + half };
}
