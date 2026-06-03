import { LcgRng } from "./rng";
import { createNormalSampler, samplePoisson, sampleUniform } from "./distributions";
import { buildSpatialSnapshot, type SpatialSnapshot } from "@/lib/spatial/voronoi";
import type { Kiosk, KioskRunMetrics, ScenarioInput, SimulationRunResult, SimulationResult } from "../../types/simulation";

export interface ProgressInfo {
  day: number;
  totalDays: number;
}

/**
 * Fixed costs, in ARS. The whole financial model is denominated in pesos.
 * USD↔ARS reference rate ≈ 1400 (from acquisition: USD 20.000 ≈ ARS 28.000.000).
 */
/** One-off cost of adding a kiosk at a location: USD 20.000 ≈ ARS 28.000.000. Fixed, not configurable. */
const KIOSK_ACQUISITION_COST_ARS = 28_000_000;
/** Recurring cost of keeping a kiosk active: USD 400 ≈ ARS 600.000 per 30 days. Fixed, not configurable. */
const KIOSK_MAINTENANCE_COST_ARS_PER_30D = 600_000;
const MAINTENANCE_PERIOD_DAYS = 30;

/**
 * User arrivals per kiosk follow a Poisson process. Each kiosk receives, on
 * average, this many users per operating hour, independent of every other kiosk
 * (no conglomerate / spatial-demand sharing). Fixed modelling assumptions.
 */
const ARRIVALS_LAMBDA_PER_HOUR = 5;
/** Operating window: 9:00–22:00 = 13 hours. After that the day is over. */
const OPERATING_HOURS_PER_DAY = 13;

/**
 * Revenue model (fixed assumptions from the verbal model, all in ARS).
 *
 * A user who completes the appraisal receives an offer and accepts it with
 * probability OFFER_ACCEPTANCE_P (Binomial). Only accepted offers yield a
 * collected device. Each delivered device is either refurbishable or scrap, and
 * the company's income (ganancia) is a fixed percentage of the device's value.
 */
const OFFER_ACCEPTANCE_P = 0.70;
const REFURBISH_RATE = 0.75; // 75% refurbishable, 25% scrap
const REFURBISHED_VALUE_MU = 250_000;
const REFURBISHED_VALUE_SIGMA = 100_000;
const REFURBISHED_PROFIT = 0.30;
const SCRAP_VALUE_MU = 15_000;
const SCRAP_VALUE_SIGMA = 10_000;
const SCRAP_PROFIT = 0.10;

interface RunOptions {
  /** Build Voronoi cell polygons in the result's spatial snapshot (map only). */
  includeSpatialCells?: boolean;
}

/**
 * The spatial snapshot depends only on geometry (kiosks, zones, service
 * distance) — never on the RNG — so it is built once per simulation instead of
 * rebuilding the full Voronoi/Delaunay diagram repeatedly. It feeds the map and
 * the optimizer scoring; arrivals no longer depend on it.
 */
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
  const rng = new LcgRng(seed);
  const sampleNormal = createNormalSampler();

  const acc = new Map<string, { arrivals: number; accepted: number; refurbished: number; scrap: number; revenue: number; service: number; }>();
  for (const kiosk of activeKiosks) {
    acc.set(kiosk.id, { arrivals: 0, accepted: 0, refurbished: 0, scrap: 0, revenue: 0, service: 0 });
  }

  for (let day = 1; day <= input.global.horizonDays; day++) {
    for (const kiosk of activeKiosks) {
      const a = acc.get(kiosk.id)!;

      // Poisson arrivals per operating hour (9:00–22:00), independent per kiosk.
      for (let hour = 0; hour < OPERATING_HOURS_PER_DAY; hour++) {
        const arrivals = samplePoisson(rng, ARRIVALS_LAMBDA_PER_HOUR);
        for (let j = 0; j < arrivals; j++) {
          // Every arrival completes the appraisal (service time) and gets an offer.
          a.arrivals += 1;
          a.service += sampleUniform(rng, input.global.serviceTime.a, input.global.serviceTime.b);

          // Offer acceptance ~ Bernoulli(p). Rejecters leave without delivering.
          if (rng.nextU01() >= OFFER_ACCEPTANCE_P) continue;
          a.accepted += 1;

          // Delivered device: refurbishable (75%) or scrap (25%); income = value * profit%.
          if (rng.nextU01() < REFURBISH_RATE) {
            a.refurbished += 1;
            const value = Math.max(0, sampleNormal(rng, REFURBISHED_VALUE_MU, REFURBISHED_VALUE_SIGMA));
            a.revenue += value * REFURBISHED_PROFIT;
          } else {
            a.scrap += 1;
            const value = Math.max(0, sampleNormal(rng, SCRAP_VALUE_MU, SCRAP_VALUE_SIGMA));
            a.revenue += value * SCRAP_PROFIT;
          }
        }
      }
    }
    yield { day, totalDays: input.global.horizonDays };
  }

  // Acquisition is a one-off; maintenance accrues every 30 days over the horizon.
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
  // Investment = total fixed cost (acquisition + maintenance). S1 invest iff income > investment.
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

/** Builds the result summary from a single simulation run. */
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

/** Synchronous engine — used in tests and the optimizer (blocking is acceptable). */
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

/**
 * Async engine for the server-side SSE route.
 * Yields to the Node.js event loop periodically via setImmediate so the
 * stream can flush progress events to the client without blocking I/O.
 */
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
    // Yield to the event loop so Node can flush SSE chunks to the client.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return buildResult(input, step.value, spatial);
}
