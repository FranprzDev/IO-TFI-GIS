export interface Rng {
  nextU01(): number;
  getSeed(): number;
}

export class LcgRng implements Rng {
  private state: number;

  constructor(seed: number) {
    const normalized = Math.floor(Math.abs(seed)) >>> 0;
    this.state = normalized === 0 ? 1 : normalized;
  }

  nextU01(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  getSeed(): number {
    return this.state;
  }
}
