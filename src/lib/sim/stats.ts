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

/** Welford online algorithm — tracks mean and M2 without storing all values. */
export class OnlineStat {
  private n = 0;
  private _mean = 0;
  private m2 = 0;

  push(x: number) {
    this.n++;
    const delta = x - this._mean;
    this._mean += delta / this.n;
    this.m2 += delta * (x - this._mean);
  }

  get count() { return this.n; }
  get mean() { return this._mean; }

  get variance() {
    return this.n < 2 ? 0 : this.m2 / (this.n - 1);
  }

  ci95(): { lower: number; upper: number } {
    const sd = Math.sqrt(this.variance);
    const half = 1.96 * (sd / Math.sqrt(Math.max(1, this.n)));
    return { lower: this._mean - half, upper: this._mean + half };
  }
}
