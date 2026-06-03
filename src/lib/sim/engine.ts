import { MCM } from "./mcm";
import { createNormalSampler, sampleBinomial, samplePoisson, sampleUniform } from "./distributions";
import { buildSpatialSnapshot, type SpatialSnapshot } from "@/lib/spatial/voronoi";
import type { Kiosk, KioskRunMetrics, ScenarioInput, SimulationRunResult, SimulationResult } from "../../types/simulation";

export interface ProgressInfo {
  day: number;
  totalDays: number;
}

const KIOSK_ACQUISITION_COST_ARS = 28_000_000;

const KIOSK_MAINTENANCE_COST_ARS_PER_30D = 600_000;
const MAINTENANCE_PERIOD_DAYS = 30;

const ARRIVALS_LAMBDA_PER_HOUR = 5;

const OPERATING_HOURS_PER_DAY = 13;

const OFFER_ACCEPTANCE_P = 0.70;
const REFURBISH_RATE = 0.75;
const REFURBISHED_VALUE_MU = 250_000;
const REFURBISHED_VALUE_SIGMA = 100_000;
const REFURBISHED_PROFIT = 0.30;
const SCRAP_VALUE_MU = 15_000;
const SCRAP_VALUE_SIGMA = 10_000;
const SCRAP_PROFIT = 0.10;

interface RunOptions {

  includeSpatialCells?: boolean;
}

function prepareSharedState(input: ScenarioInput, includeCells: boolean) {
  const activeKiosks = input.kiosks.filter((k) => k.active !== false);
  const spatial = buildSpatialSnapshot(activeKiosks, input.demandZones, input.global.serviceDistanceKm, { includeCells });
  return { activeKiosks, spatial };
}

function* simulateRun(
  input: ScenarioInput,
  activeKiosks: Kiosk[],
): Generator<{ day: number; totalDays: number }, SimulationRunResult, void> {
  const seed = input.seed;
  const mcm = new MCM(seed);
  const sampleNormal = createNormalSampler();

  const acc = new Map<string, { arrivals: number; accepted: number; refurbished: number; scrap: number; revenue: number; service: number; }>();
  for (const kiosk of activeKiosks) {
    acc.set(kiosk.id, { arrivals: 0, accepted: 0, refurbished: 0, scrap: 0, revenue: 0, service: 0 });
  }

  for (let day = 1; day <= input.global.horizonDays; day++) {
    for (const kiosk of activeKiosks) {
      const a = acc.get(kiosk.id)!;

      for (let hour = 0; hour < OPERATING_HOURS_PER_DAY; hour++) {
        const arrivals = samplePoisson(mcm, ARRIVALS_LAMBDA_PER_HOUR);
        a.arrivals += arrivals;

        for (let j = 0; j < arrivals; j++) {
          a.service += sampleUniform(mcm, input.global.serviceTime.a, input.global.serviceTime.b);
        }

        const accepted = sampleBinomial(mcm, arrivals, OFFER_ACCEPTANCE_P);
        a.accepted += accepted;

        const refurbished = sampleBinomial(mcm, accepted, REFURBISH_RATE);
        const scrap = accepted - refurbished;
        a.refurbished += refurbished;
        a.scrap += scrap;

        for (let j = 0; j < refurbished; j++) {
          const value = Math.max(0, sampleNormal(mcm, REFURBISHED_VALUE_MU, REFURBISHED_VALUE_SIGMA));
          a.revenue += value * REFURBISHED_PROFIT;
        }
        for (let j = 0; j < scrap; j++) {
          const value = Math.max(0, sampleNormal(mcm, SCRAP_VALUE_MU, SCRAP_VALUE_SIGMA));
          a.revenue += value * SCRAP_PROFIT;
        }
      }
    }
    yield { day, totalDays: input.global.horizonDays };
  }

  const maintenancePerKiosk = KIOSK_MAINTENANCE_COST_ARS_PER_30D * (input.global.horizonDays / MAINTENANCE_PERIOD_DAYS);
  const fixedCostPerKiosk = KIOSK_ACQUISITION_COST_ARS + maintenancePerKiosk;

  const kiosks: KioskRunMetrics[] = activeKiosks.map((k) => {
    const v = acc.get(k.id)!;
    return {
      kioskId: k.id,
      arrivals: v.arrivals,
      accepted: v.accepted,
      devicesCollected: v.accepted,
      refurbished: v.refurbished,
      scrap: v.scrap,
      revenue: v.revenue,
      cost: fixedCostPerKiosk,
      margin: v.revenue - fixedCostPerKiosk,
      avgServiceMinutes: v.arrivals > 0 ? v.service / v.arrivals : 0,
    };
  });

  const totalDevices = kiosks.reduce((s, k) => s + k.devicesCollected, 0);
  const totalRefurbished = kiosks.reduce((s, k) => s + k.refurbished, 0);
  const totalScrap = kiosks.reduce((s, k) => s + k.scrap, 0);
  const totalRevenue = kiosks.reduce((s, k) => s + k.revenue, 0);
  const totalCost = kiosks.reduce((s, k) => s + k.cost, 0);
  const totalMargin = totalRevenue - totalCost;

  const totalInvestment = totalCost;
  const feasible = totalRevenue > totalInvestment;
  const amortizationDays = totalMargin > 0
    ? Math.max(1, Math.round((activeKiosks.length * KIOSK_ACQUISITION_COST_ARS / totalMargin) * input.global.horizonDays))
    : Number.POSITIVE_INFINITY;

  return { seed, kiosks, totalDevices, totalRefurbished, totalScrap, totalRevenue, totalCost, totalMargin, amortizationDays, feasible };
}

function overConfigWarnings(): string[] {
  return [];
}

function buildSummary(run: SimulationRunResult, horizonDays: number): SimulationResult["summary"] {
  const point = (value: number) => ({ mean: value, ci95Lower: value, ci95Upper: value });
  const amortization = Number.isFinite(run.amortizationDays) ? run.amortizationDays : horizonDays * 10;
  return {
    totalMargin: point(run.totalMargin),
    totalRevenue: point(run.totalRevenue),
    totalCost: point(run.totalCost),
    totalDevices: point(run.totalDevices),
    totalRefurbished: point(run.totalRefurbished),
    totalScrap: point(run.totalScrap),
    amortizationDays: point(amortization),
    feasibleProbability: run.feasible ? 1 : 0,
    recommendation: run.feasible ? "S1" : "S2",
  };
}

function buildResult(input: ScenarioInput, run: SimulationRunResult, spatial: SpatialSnapshot): SimulationResult {
  return {
    scenario: input.scenario,
    runId: `${input.scenario}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input,
    summary: buildSummary(run, input.global.horizonDays),
    kiosks: run.kiosks,
    warnings: overConfigWarnings(),
    spatial,
  };
}

export function runSimulation(input: ScenarioInput, options?: RunOptions): SimulationResult {
  return runSimulationWithProgress(input, undefined, options);
}

export function runSimulationWithProgress(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
  options?: RunOptions,
): SimulationResult {
  const { activeKiosks, spatial } = prepareSharedState(input, options?.includeSpatialCells ?? true);

  const gen = simulateRun(input, activeKiosks);
  let step = gen.next();
  while (!step.done) {
    onProgress?.(step.value);
    step = gen.next();
  }

  return buildResult(input, step.value, spatial);
}

export async function runSimulationAsync(
  input: ScenarioInput,
  onProgress?: (info: ProgressInfo) => void,
): Promise<SimulationResult> {
  const { activeKiosks, spatial } = prepareSharedState(input, true);

  const gen = simulateRun(input, activeKiosks);
  let step = gen.next();
  while (!step.done) {
    onProgress?.(step.value);
    step = gen.next();

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return buildResult(input, step.value, spatial);
}
