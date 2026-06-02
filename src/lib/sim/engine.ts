import { LcgRng } from "./rng";
import { createNormalSampler, sampleUniform } from "./distributions";
import { OnlineStat } from "./stats";
import { buildSpatialSnapshot } from "@/lib/spatial/voronoi";
import type { Kiosk, KioskRunMetrics, ScenarioInput, SimulationReplicaResult, SimulationResult } from "../../types/simulation";

export interface ProgressInfo {
  replica: number;
  day: number;
  totalReplicas: number;
  totalDays: number;
}

interface RunOptions {
  includeReplicas?: boolean;
}

function* simulateReplica(
  input: ScenarioInput,
  replica: number,
): Generator<{ replica: number; day: number; totalDays: number }, SimulationReplicaResult, void> {
  const seed = input.seed + replica * 9973;
  const rng = new LcgRng(seed);
  const sampleNormal = createNormalSampler();
  const activeKiosks = input.kiosks.filter((k) => k.active !== false);
  const spatial = buildSpatialSnapshot(activeKiosks, input.demandZones, input.global.serviceDistanceKm);
  const totalDemandWeight = Object.values(spatial.demandByKiosk).reduce((sum, item) => sum + item.effectiveDemand, 0);
  const demandShareByKiosk = new Map(
    activeKiosks.map((kiosk) => {
      const assignedDemand = spatial.demandByKiosk[kiosk.id]?.effectiveDemand ?? 0;
      const share = totalDemandWeight > 0 ? assignedDemand / totalDemandWeight : 0;
      return [kiosk.id, share];
    }),
  );

  const acc = new Map<string, { devices: number; revenue: number; cost: number; service: number; slots: number; collections: number; usedDays: number; }>();
  for (const kiosk of activeKiosks) {
    acc.set(kiosk.id, { devices: 0, revenue: 0, cost: 0, service: 0, slots: 0, collections: 0, usedDays: 0 });
  }

  const threshold = Math.floor(input.global.capacityMaxDevices * 0.85);

  for (let day = 1; day <= input.global.horizonDays; day++) {
    const totalInterested = Math.max(0, Math.round(sampleNormal(rng, input.global.totalDailyDemand.mu, input.global.totalDailyDemand.sigma)));
    const arrivalsByKiosk = allocateDailyDemand(activeKiosks, totalInterested, demandShareByKiosk);

    for (const kiosk of activeKiosks) {
      const a = acc.get(kiosk.id)!;
      const arrivals = arrivalsByKiosk.get(kiosk.id) ?? 0;
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
    yield { replica, day, totalDays: input.global.horizonDays };
  }

  const kiosks: KioskRunMetrics[] = activeKiosks.map((k) => {
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
  const amortizationDays = totalMargin > 0
    ? Math.max(1, Math.round((activeKiosks.reduce((s, k) => s + k.acquisitionPrice, 0) / totalMargin) * input.global.horizonDays))
    : Number.POSITIVE_INFINITY;
  const feasible = totalMargin >= 0 && amortizationDays <= input.global.horizonDays;

  return { replica, seed, kiosks, totalDevices, totalRevenue, totalCost, totalMargin, amortizationDays, feasible };
}

function overConfigWarnings(input: ScenarioInput): string[] {
  const warnings: string[] = [];
  const activeKiosks = input.kiosks.filter((k) => k.active !== false);
  const spatial = buildSpatialSnapshot(activeKiosks, input.demandZones, input.global.serviceDistanceKm);
  const totalWeight = Math.max(1, spatial.capturedDemand);

  for (const kiosk of activeKiosks) {
    const assignedDemand = spatial.demandByKiosk[kiosk.id]?.assignedDemand ?? 0;
    const expectedPerDay = input.global.totalDailyDemand.mu * (assignedDemand / totalWeight);
    const threshold = input.global.capacityMaxDevices * 0.2;
    if (expectedPerDay < threshold) {
      warnings.push(`Posible sobreconfiguracion en ${kiosk.nombre}: demanda potencial diaria ${expectedPerDay.toFixed(1)} < ${threshold.toFixed(1)}`);
    }
  }
  return warnings;
}

function allocateDailyDemand(
  kiosks: Kiosk[],
  totalInterested: number,
  demandShareByKiosk: Map<string, number>,
): Map<string, number> {
  const baseAssignments = kiosks.map((kiosk) => {
    const exact = totalInterested * (demandShareByKiosk.get(kiosk.id) ?? 0);
    const base = Math.floor(exact);
    return {
      kioskId: kiosk.id,
      base,
      fraction: exact - base,
    };
  });

  const assigned = new Map<string, number>(baseAssignments.map((item) => [item.kioskId, item.base]));
  let remainder = totalInterested - baseAssignments.reduce((sum, item) => sum + item.base, 0);

  for (const item of baseAssignments.sort((a, b) => b.fraction - a.fraction)) {
    if (remainder <= 0) break;
    assigned.set(item.kioskId, (assigned.get(item.kioskId) ?? 0) + 1);
    remainder -= 1;
  }

  return assigned;
}

/** Accumulates per-replica scalars without storing replica objects. */
class SimAccumulator {
  margin = new OnlineStat();
  revenue = new OnlineStat();
  cost = new OnlineStat();
  devices = new OnlineStat();
  amortization = new OnlineStat();
  feasibleCount = 0;

  push(r: SimulationReplicaResult, horizonDays: number) {
    this.margin.push(r.totalMargin);
    this.revenue.push(r.totalRevenue);
    this.cost.push(r.totalCost);
    this.devices.push(r.totalDevices);
    this.amortization.push(Number.isFinite(r.amortizationDays) ? r.amortizationDays : horizonDays * 10);
    if (r.feasible) this.feasibleCount++;
  }

  summarize(): SimulationResult["summary"] {
    const s = (stat: OnlineStat) => {
      const c = stat.ci95();
      return { mean: stat.mean, ci95Lower: c.lower, ci95Upper: c.upper };
    };
    return {
      totalMargin: s(this.margin),
      totalRevenue: s(this.revenue),
      totalCost: s(this.cost),
      totalDevices: s(this.devices),
      amortizationDays: s(this.amortization),
      feasibleProbability: this.margin.count > 0 ? this.feasibleCount / this.margin.count : 0,
    };
  }
}

/** Synchronous engine — used in tests and the server route (blocking is acceptable). */
export function runSimulation(input: ScenarioInput, options?: RunOptions): SimulationResult {
  return runSimulationWithProgress(input, undefined, options);
}

export function runSimulationWithProgress(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
  options?: RunOptions,
): SimulationResult {
  const acc = new SimAccumulator();
  const keepReplicas = options?.includeReplicas ?? (input.global.replicas <= 50);
  const replicaResults: SimulationReplicaResult[] = [];

  for (let r = 0; r < input.global.replicas; r++) {
    const gen = simulateReplica(input, r + 1);
    let step = gen.next();
    while (!step.done) {
      onProgress?.({ ...step.value, totalReplicas: input.global.replicas });
      step = gen.next();
    }
    acc.push(step.value, input.global.horizonDays);
    if (keepReplicas) replicaResults.push(step.value);
  }

  return {
    scenario: input.scenario,
    runId: `${input.scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input,
    replicas: replicaResults,
    summary: acc.summarize(),
    warnings: overConfigWarnings(input),
    spatial: buildSpatialSnapshot(input.kiosks.filter((k) => k.active !== false), input.demandZones, input.global.serviceDistanceKm),
  };
}

/**
 * Async engine for the server-side SSE route.
 * Yields to the Node.js event loop between replicas via setImmediate so the
 * stream can flush progress events to the client without blocking I/O.
 */
export async function runSimulationAsync(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SimulationResult> {
  const acc = new SimAccumulator();

  for (let r = 0; r < input.global.replicas; r++) {
    const gen = simulateReplica(input, r + 1);
    let step = gen.next();
    while (!step.done) {
      onProgress?.({ ...step.value, totalReplicas: input.global.replicas });
      step = gen.next();
    }
    acc.push(step.value, input.global.horizonDays);
    // Yield to the event loop so Node can flush SSE chunks to the client.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return {
    scenario: input.scenario,
    runId: `${input.scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input,
    replicas: [],
    summary: acc.summarize(),
    warnings: overConfigWarnings(input),
    spatial: buildSpatialSnapshot(input.kiosks.filter((k) => k.active !== false), input.demandZones, input.global.serviceDistanceKm),
  };
}
