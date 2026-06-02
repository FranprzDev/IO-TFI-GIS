import { LcgRng } from "./rng";
import { createNormalSampler, sampleUniform } from "./distributions";
import { buildSpatialSnapshot, type SpatialSnapshot } from "@/lib/spatial/voronoi";
import type { Kiosk, KioskRunMetrics, ScenarioInput, SimulationRunResult, SimulationResult } from "../../types/simulation";

export interface ProgressInfo {
  day: number;
  totalDays: number;
}

interface RunOptions {
  /** Build Voronoi cell polygons in the result's spatial snapshot (map only). */
  includeSpatialCells?: boolean;
}

/**
 * The spatial snapshot and demand shares depend only on geometry (kiosks,
 * zones, service distance) — never on the RNG — so they are built once per
 * simulation, instead of rebuilding the full Voronoi/Delaunay diagram repeatedly.
 */
function prepareSharedState(input: ScenarioInput, includeCells: boolean) {
  const activeKiosks = input.kiosks.filter((k) => k.active !== false);
  const spatial = buildSpatialSnapshot(activeKiosks, input.demandZones, input.global.serviceDistanceKm, { includeCells });
  const totalDemandWeight = Object.values(spatial.demandByKiosk).reduce((sum, item) => sum + item.effectiveDemand, 0);
  const demandShareByKiosk = new Map(
    activeKiosks.map((kiosk) => {
      const assignedDemand = spatial.demandByKiosk[kiosk.id]?.effectiveDemand ?? 0;
      const share = totalDemandWeight > 0 ? assignedDemand / totalDemandWeight : 0;
      return [kiosk.id, share];
    }),
  );
  return { activeKiosks, spatial, demandShareByKiosk };
}

function* simulateRun(
  input: ScenarioInput,
  activeKiosks: Kiosk[],
  demandShareByKiosk: Map<string, number>,
): Generator<{ day: number; totalDays: number }, SimulationRunResult, void> {
  const seed = input.seed;
  const rng = new LcgRng(seed);
  const sampleNormal = createNormalSampler();

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
    yield { day, totalDays: input.global.horizonDays };
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

  return { seed, kiosks, totalDevices, totalRevenue, totalCost, totalMargin, amortizationDays, feasible };
}

function overConfigWarnings(input: ScenarioInput, spatial: SpatialSnapshot): string[] {
  const warnings: string[] = [];
  const activeKiosks = input.kiosks.filter((k) => k.active !== false);
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

/** Builds the result summary from a single simulation run. */
function buildSummary(run: SimulationRunResult, horizonDays: number): SimulationResult["summary"] {
  const point = (value: number) => ({ mean: value, ci95Lower: value, ci95Upper: value });
  const amortization = Number.isFinite(run.amortizationDays) ? run.amortizationDays : horizonDays * 10;
  return {
    totalMargin: point(run.totalMargin),
    totalRevenue: point(run.totalRevenue),
    totalCost: point(run.totalCost),
    totalDevices: point(run.totalDevices),
    amortizationDays: point(amortization),
    feasibleProbability: run.feasible ? 1 : 0,
  };
}

function buildResult(input: ScenarioInput, run: SimulationRunResult, spatial: SpatialSnapshot): SimulationResult {
  return {
    scenario: input.scenario,
    runId: `${input.scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input,
    summary: buildSummary(run, input.global.horizonDays),
    warnings: overConfigWarnings(input, spatial),
    spatial,
  };
}

/** Synchronous engine — used in tests and the optimizer (blocking is acceptable). */
export function runSimulation(input: ScenarioInput, options?: RunOptions): SimulationResult {
  return runSimulationWithProgress(input, undefined, options);
}

export function runSimulationWithProgress(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
  options?: RunOptions,
): SimulationResult {
  const { activeKiosks, spatial, demandShareByKiosk } = prepareSharedState(input, options?.includeSpatialCells ?? true);

  const gen = simulateRun(input, activeKiosks, demandShareByKiosk);
  let step = gen.next();
  while (!step.done) {
    onProgress?.(step.value);
    step = gen.next();
  }

  return buildResult(input, step.value, spatial);
}

/**
 * Async engine for the server-side SSE route.
 * Yields to the Node.js event loop periodically via setImmediate so the
 * stream can flush progress events to the client without blocking I/O.
 */
export async function runSimulationAsync(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SimulationResult> {
  const { activeKiosks, spatial, demandShareByKiosk } = prepareSharedState(input, true);

  const gen = simulateRun(input, activeKiosks, demandShareByKiosk);
  let step = gen.next();
  while (!step.done) {
    onProgress?.(step.value);
    step = gen.next();
    // Yield to the event loop so Node can flush SSE chunks to the client.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return buildResult(input, step.value, spatial);
}
