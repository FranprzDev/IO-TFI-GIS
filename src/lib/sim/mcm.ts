/**
 * MCM — Método Congruencial Mixto (Mixed Linear Congruential Generator).
 *
 * Es el PRNG (generador de números pseudoaleatorios) del simulador. Aplica la
 * recurrencia congruencial mixta:
 *
 *     X(n+1) = (a · X(n) + c) mod m
 *
 * Es "mixto" porque usa multiplicador (a) **y** constante aditiva (c ≠ 0); si
 * fuera c = 0 sería Multiplicativo (Lehmer). Parámetros: a = 1664525,
 * c = 1013904223, m = 2^32. El estado inicial X(0) es la semilla, por lo que la
 * misma semilla produce siempre la misma secuencia (reproducibilidad). Devuelve
 * números uniformes en [0, 1); todas las distribuciones se construyen sobre él.
 */
export class MCM {
  private static readonly A = 1664525;
  private static readonly C = 1013904223;
  private static readonly M = 4294967296; // 2^32

  private state: number;

  constructor(seed: number) {
    const normalized = Math.floor(Math.abs(seed)) >>> 0;
    this.state = normalized === 0 ? 1 : normalized;
  }

  /** Próximo número pseudoaleatorio, uniforme en [0, 1). */
  nextU01(): number {
    this.state = (MCM.A * this.state + MCM.C) >>> 0;
    return this.state / MCM.M;
  }

  getSeed(): number {
    return this.state;
  }
}
