/**
 * PRNG — Pseudo-Random Number Generator.
 *
 * Linear Congruential Generator (LCG): a deterministic algorithm that produces
 * a stream of uniform numbers in [0, 1) from a seed. Same seed → same stream
 * (reproducibility). Every probability distribution in the simulator is built
 * exclusively on top of `nextU01()`, with no external libraries.
 */
export class Prng {
  private state: number;

  constructor(seed: number) {
    const normalized = Math.floor(Math.abs(seed)) >>> 0;
    this.state = normalized === 0 ? 1 : normalized;
  }

  /** Next pseudo-random number, uniform in [0, 1). */
  nextU01(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  getSeed(): number {
    return this.state;
  }
}
