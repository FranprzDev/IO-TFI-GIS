import { MCM } from "./mcm";

export class Random {
  private spareNormal: number | null = null;

  constructor(private readonly mcm: MCM) {}

  uniform(a: number, b: number): number {
    return a + (b - a) * this.mcm.nextU01();
  }

  /* 
    Este método está hecho con una implementación del método de Box Muller 
    De forma que no utiliza las funciones "sin" & "cos" por que son funciones penalizadas x el v8 de google.
  */
  normal(mu: number, sigma: number): number {
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

  /* Utilizamos el método de Knuth (Bibliografía aplicada) */
  poisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let p = 1;
    let k = 0;

    do {
      k += 1;
      p *= this.mcm.nextU01();
    } while (p > L);

    return k - 1;
  }

  binomial(n: number, p: number): number {
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (this.mcm.nextU01() < p) successes += 1;
    }
    return successes;
  }
}
