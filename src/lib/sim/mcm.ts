
export class MCM {
  /* 
    Esto lo sacamos de https://en.wikipedia.org/wiki/Linear_congruential_generator
    En la parte de donde está la tablita (los valores).
    Es el MCM el primero, que nos recomienda la teoría utilizar.
  */
  private static readonly A = 1664525;
  private static readonly C = 1013904223;
  private static readonly M = 4294967296;

  private state: number;

  constructor(seed: number) {
    const normalized = Math.floor(Math.abs(seed)) >>> 0;
    this.state = normalized === 0 ? 1 : normalized;
  }

  nextU01(): number {
    this.state = (MCM.A * this.state + MCM.C) >>> 0;
    return this.state / MCM.M;
  }

  getSeed(): number {
    return this.state;
  }
}
