import { MCM } from "./mcm";

export class Random {
  private spareNormal: number | null = null;

  constructor(private readonly mcm: MCM) {}

  uniform(a: number, b: number): number {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) {
      throw new Error("Uniform requires finite a < b");
    }
    return a + (b - a) * this.mcm.nextU01();
  }

  normal(mu: number, sigma: number): number {
    if (!Number.isFinite(mu) || !Number.isFinite(sigma) || sigma <= 0) {
      throw new Error("Normal requires finite mu and sigma > 0");
    }

    if (this.spareNormal !== null) {
      const z = this.spareNormal;
      this.spareNormal = null;
      return mu + sigma * z;
    }

    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = 2 * this.mcm.nextU01() - 1;
      v = 2 * this.mcm.nextU01() - 1;
      s = u * u + v * v;
    } while (s <= 0 || s >= 1);

    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.spareNormal = v * mul;
    return mu + sigma * (u * mul);
  }

  poisson(lambda: number): number {
    if (!Number.isFinite(lambda) || lambda <= 0) {
      throw new Error("Poisson requires finite lambda > 0");
    }

    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let p = 1;
      let k = 0;
      do {
        k += 1;
        p *= this.mcm.nextU01();
      } while (p > L);
      return k - 1;
    }

    const normalApprox = Math.round(this.normal(lambda, Math.sqrt(lambda)));
    return Math.max(0, normalApprox);
  }

  binomial(n: number, p: number): number {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("Binomial requires an integer n >= 0");
    }
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error("Binomial requires 0 <= p <= 1");
    }

    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (this.mcm.nextU01() < p) successes += 1;
    }
    return successes;
  }
}
