import { LcgRng } from "./rng";
import { createNormalSampler, sampleUniform } from "./distributions";
import { ci95, mean } from "./stats";
import type { KioskRunMetrics, ScenarioInput, SimulationReplicaResult, SimulationResult } from "../../types/simulation";

export interface ProgressInfo {
  replica: number;
  day: number;
  totalReplicas: number;
  totalDays: number;
}

/**
 * Runs a single replica as a generator that yields once per simulated day and
 * returns the replica result. Driving it as a generator lets the synchronous
 * and asynchronous engines share identical simulation logic while controlling
 * how often they hand control back to the caller (for progress / UI repaints).
 */
function* simulateReplica(
  input: ScenarioInput,
  replica: number,
): Generator<{ replica: number; day: number; totalDays: number }, SimulationReplicaResult, void> {
  const seed = input.seed + replica * 9973;
  const rng = new LcgRng(seed);
  // Each replica owns its normal sampler so the Box-Muller spare never leaks
  // between RNG streams (keeps results reproducible per seed).
  const sampleNormal = createNormalSampler();
  const kiosksByCong = new Map<string, typeof input.kiosks>();
  for (const k of input.kiosks) {
    const list = kiosksByCong.get(k.conglomerateId) ?? [];
    list.push(k);
    kiosksByCong.set(k.conglomerateId, list);
  }

  const acc = new Map<string, { devices: number; revenue: number; cost: number; service: number; slots: number; collections: number; usedDays: number; }>();
  for (const kiosk of input.kiosks) {
    acc.set(kiosk.id, { devices: 0, revenue: 0, cost: 0, service: 0, slots: 0, collections: 0, usedDays: 0 });
  }

  const threshold = Math.floor(input.global.capacityMaxDevices * 0.85);

  for (let day = 1; day <= input.global.horizonDays; day++) {
    for (const c of input.conglomerates) {
      const dailyFlow = Math.max(0, Math.round(sampleNormal(rng, c.dailyDemand.mu, c.dailyDemand.sigma)));
      const interested = Math.round(dailyFlow * c.interestPct);
      const kiosks = kiosksByCong.get(c.id) ?? [];
      if (kiosks.length === 0) continue;

      const perKiosk = Math.floor(interested / kiosks.length);
      const remainder = interested % kiosks.length;

      for (let i = 0; i < kiosks.length; i++) {
        const kiosk = kiosks[i];
        const a = acc.get(kiosk.id)!;
        const arrivals = perKiosk + (i < remainder ? 1 : 0);
        a.usedDays += 1;

        for (let j = 0; j < arrivals; j++) {
          const serviceMin = sampleUniform(rng, input.global.serviceTime.a, input.global.serviceTime.b);
          const value = Math.max(0, sampleNormal(rng, input.global.deviceValue.mu, input.global.deviceValue.sigma));
          const dayCapacityLeft = input.global.capacityMaxDevices - a.slots;
          if (dayCapacityLeft <= 0) continue;

          a.devices += 1;
          a.revenue += value;
          a.cost += input.global.operationCostPerDevice;
          a.service += serviceMin;
          a.slots += 1;

          if (a.slots >= threshold) {
            a.collections += 1;
            a.slots = 0;
          }
        }
      }
    }
    yield { replica, day, totalDays: input.global.horizonDays };
  }

  const kiosks: KioskRunMetrics[] = input.kiosks.map((k) => {
    const v = acc.get(k.id)!;
    const capacityDays = v.usedDays * input.global.capacityMaxDevices;
    const utilization = capacityDays > 0 ? v.devices / capacityDays : 0;
    return {
      kioskId: k.id,
      devicesCollected: v.devices,
      revenue: v.revenue,
      cost: v.cost + k.acquisitionPrice,
      margin: v.revenue - (v.cost + k.acquisitionPrice),
      utilization,
      avgServiceMinutes: v.devices > 0 ? v.service / v.devices : 0,
      collectionsTriggered: v.collections,
    };
  });

  const totalDevices = kiosks.reduce((s, k) => s + k.devicesCollected, 0);
  const totalRevenue = kiosks.reduce((s, k) => s + k.revenue, 0);
  const totalCost = kiosks.reduce((s, k) => s + k.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const amortizationDays = totalMargin > 0 ? Math.max(1, Math.round((input.kiosks.reduce((s, k) => s + k.acquisitionPrice, 0) / totalMargin) * input.global.horizonDays)) : Number.POSITIVE_INFINITY;

  const feasible = totalMargin >= 0 && amortizationDays <= input.global.horizonDays;

  return {
    replica,
    seed,
    kiosks,
    totalDevices,
    totalRevenue,
    totalCost,
    totalMargin,
    amortizationDays,
    feasible,
  };
}

function overConfigWarnings(input: ScenarioInput): string[] {
  const warnings: string[] = [];
  const kiosksByCong = new Map<string, number>();
  for (const k of input.kiosks) {
    kiosksByCong.set(k.conglomerateId, (kiosksByCong.get(k.conglomerateId) ?? 0) + 1);
  }

  for (const c of input.conglomerates) {
    const expectedInterested = c.dailyDemand.mu * c.interestPct;
    const kioskCount = kiosksByCong.get(c.id) ?? 0;
    const expectedPerKiosk = kioskCount > 0 ? expectedInterested / kioskCount : 0;
    const threshold = input.global.capacityMaxDevices * 0.2;
    if (kioskCount > 0 && expectedPerKiosk < threshold) {
      warnings.push(`Posible sobreconfiguracion en ${c.nombre}: demanda potencial por kiosko ${expectedPerKiosk.toFixed(1)} < ${threshold.toFixed(1)}`);
    }
  }

  return warnings;
}

export function runSimulation(input: ScenarioInput): SimulationResult {
  return runSimulationWithProgress(input);
}

/**
 * Synchronous engine. Drives every replica generator to completion in one pass.
 * Suitable for the server route and tests where blocking is acceptable.
 */
export function runSimulationWithProgress(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
): SimulationResult {
  const replicas: SimulationReplicaResult[] = [];
  for (let r = 0; r < input.global.replicas; r++) {
    const gen = simulateReplica(input, r + 1);
    let step = gen.next();
    while (!step.done) {
      onProgress?.({ ...step.value, totalReplicas: input.global.replicas });
      step = gen.next();
    }
    replicas.push(step.value);
  }

  return summarize(input, replicas);
}

/**
 * Asynchronous engine for the browser. Identical math to the synchronous engine,
 * but it yields control back to the event loop on a time budget so React can
 * flush progress state and repaint the bar mid-run. Without yielding, the whole
 * simulation runs in one blocking tick and the progress bar jumps 0% -> 100%.
 */
export async function runSimulationWithProgressAsync(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
  yieldEveryMs = 12,
): Promise<SimulationResult> {
  const replicas: SimulationReplicaResult[] = [];
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let lastYield = now();

  for (let r = 0; r < input.global.replicas; r++) {
    const gen = simulateReplica(input, r + 1);
    let step = gen.next();
    while (!step.done) {
      onProgress?.({ ...step.value, totalReplicas: input.global.replicas });
      if (now() - lastYield >= yieldEveryMs) {
        // Hand the thread back so queued state updates can paint.
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = now();
      }
      step = gen.next();
    }
    replicas.push(step.value);
  }

  return summarize(input, replicas);
}

function summarize(input: ScenarioInput, replicas: SimulationReplicaResult[]): SimulationResult {
  const margins = replicas.map((r) => r.totalMargin);
  const revenues = replicas.map((r) => r.totalRevenue);
  const costs = replicas.map((r) => r.totalCost);
  const devices = replicas.map((r) => r.totalDevices);
  const amortizations = replicas.map((r) => (Number.isFinite(r.amortizationDays) ? r.amortizationDays : input.global.horizonDays * 10));
  const feasibleProbability = replicas.filter((r) => r.feasible).length / replicas.length;

  const mCi = ci95(margins);
  const rCi = ci95(revenues);
  const cCi = ci95(costs);
  const dCi = ci95(devices);
  const aCi = ci95(amortizations);

  return {
    scenario: input.scenario,
    runId: `${input.scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input,
    replicas,
    summary: {
      totalMargin: { mean: mean(margins), ci95Lower: mCi.lower, ci95Upper: mCi.upper },
      totalRevenue: { mean: mean(revenues), ci95Lower: rCi.lower, ci95Upper: rCi.upper },
      totalCost: { mean: mean(costs), ci95Lower: cCi.lower, ci95Upper: cCi.upper },
      totalDevices: { mean: mean(devices), ci95Lower: dCi.lower, ci95Upper: dCi.upper },
      amortizationDays: { mean: mean(amortizations), ci95Lower: aCi.lower, ci95Upper: aCi.upper },
      feasibleProbability,
    },
    warnings: overConfigWarnings(input),
  };
}
