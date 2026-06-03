import {
  buildSpatialSnapshotFromProjected,
  projectLatLon,
  type ProjectedDemandZone,
  type SpatialSnapshot,
} from "@/lib/spatial/voronoi";
import type {
  Kiosk,
  OptimizationRequest,
  OptimizationResult,
  OptimizationScenarioSummary,
  ScoreWeights,
  SpatialMetrics,
} from "@/types/simulation";

export interface OptimizationProgress {
  stage: "greedy" | "swap" | "finalize";
  completed: number;
  total: number;
  siteCount: number;
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function invertedNormalize(value: number, min: number, max: number): number {
  return 1 - normalize(value, min, max);
}

function evaluateSpatialScenario(
  projectedKiosks: Array<{ kiosk: Kiosk; projected: { x: number; y: number } }>,
  projectedDemandZones: ProjectedDemandZone[],
  selectedIds: Set<string>,
  serviceDistanceKm: number,
  includeCells = false,
): SpatialSnapshot {
  const activeKiosks = projectedKiosks.filter((item) => selectedIds.has(item.kiosk.id) && item.kiosk.active !== false);
  return buildSpatialSnapshotFromProjected(activeKiosks, projectedDemandZones, serviceDistanceKm, { includeCells });
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function scoreSpatialMetrics(
  spatial: SpatialMetrics,
  bounds: {
    weightedDistanceKm: { min: number; max: number };
  },
  scoreWeights: ScoreWeights,
): OptimizationScenarioSummary["components"] & { score: number } {
  const capturedDemand = spatial.coveredDemandPct;
  const coverage = spatial.coveredDemandPct;
  const balance = spatial.loadBalanceScore;
  const cannibalization = 1 - spatial.cannibalizationPct;
  const distanceScore = invertedNormalize(spatial.weightedDistanceKm, bounds.weightedDistanceKm.min, bounds.weightedDistanceKm.max);

  const adjustedCapturedDemand = Math.max(0, Math.min(1, (capturedDemand * 0.7) + (distanceScore * 0.3)));
  const score = (
    adjustedCapturedDemand * scoreWeights.capturedDemand
    + coverage * scoreWeights.coverage
    + balance * scoreWeights.balance
    + cannibalization * scoreWeights.cannibalization
  );

  return {
    capturedDemand: adjustedCapturedDemand,
    coverage,
    balance,
    cannibalization,
    score,
  };
}

async function evaluateForScoreBounds(
  projectedKiosks: Array<{ kiosk: Kiosk; projected: { x: number; y: number } }>,
  projectedDemandZones: ProjectedDemandZone[],
  serviceDistanceKm: number,
): Promise<{
  weightedDistanceKm: { min: number; max: number };
}> {
  const allActive = new Set(projectedKiosks.map((item) => item.kiosk.id));
  const allSpatial = evaluateSpatialScenario(projectedKiosks, projectedDemandZones, allActive, serviceDistanceKm);

  let minDistance = allSpatial.weightedDistanceKm;
  let maxDistance = allSpatial.weightedDistanceKm;

  for (const kiosk of projectedKiosks.slice(0, 3)) {
    const spatial = evaluateSpatialScenario(projectedKiosks, projectedDemandZones, new Set([kiosk.kiosk.id]), serviceDistanceKm);
    minDistance = Math.min(minDistance, spatial.weightedDistanceKm);
    maxDistance = Math.max(maxDistance, spatial.weightedDistanceKm);
    await yieldToEventLoop();
  }

  return {
    weightedDistanceKm: { min: minDistance, max: maxDistance },
  };
}

export async function runOptimization(
  request: OptimizationRequest,
  onProgress?: (progress: OptimizationProgress) => void,
): Promise<OptimizationResult> {
  const effectiveMaxSites = Math.min(request.maxSites, request.kiosks.length);
  const effectiveMinSites = Math.min(request.minSites, effectiveMaxSites);
  const projectedDemandZones: ProjectedDemandZone[] = request.demandZones.map((zone) => ({
    zone,
    projected: projectLatLon(zone.lat, zone.lon),
  }));
  const projectedKiosks = request.kiosks.map((kiosk) => ({
    kiosk,
    projected: projectLatLon(kiosk.lat, kiosk.lon),
  }));
  const spatialCache = new Map<string, SpatialSnapshot>();
  const YIELD_EVERY = 8;
  let evalsSinceYield = 0;
  const maybeYield = async () => {
    if (++evalsSinceYield >= YIELD_EVERY) {
      evalsSinceYield = 0;
      await yieldToEventLoop();
    }
  };

  const getSpatial = (selectedIds: Set<string>): SpatialSnapshot => {
    const key = Array.from(selectedIds).sort().join("|");
    const cached = spatialCache.get(key);
    if (cached) return cached;
    const spatial = evaluateSpatialScenario(
      projectedKiosks,
      projectedDemandZones,
      selectedIds,
      request.global.serviceDistanceKm,
    );
    spatialCache.set(key, spatial);
    return spatial;
  };

  const scoreBounds = await evaluateForScoreBounds(projectedKiosks, projectedDemandZones, request.global.serviceDistanceKm);
  const lockedIds = new Set(request.kiosks.filter((kiosk) => kiosk.locked).map((kiosk) => kiosk.id));
  const coarseCandidates = request.kiosks.filter((kiosk) => kiosk.active !== false);
  const topScenarios: OptimizationScenarioSummary[] = [];

  for (let siteCount = effectiveMinSites; siteCount <= effectiveMaxSites; siteCount++) {
    const selectedIds = new Set(lockedIds);

    while (selectedIds.size < siteCount) {
      let bestCandidate: { kiosk: Kiosk; spatial: SpatialSnapshot; score: number } | null = null;
      const remaining = coarseCandidates.filter((kiosk) => !selectedIds.has(kiosk.id));
      let completed = 0;

      for (const candidate of remaining) {
        completed += 1;
        const trialIds = new Set(selectedIds);
        trialIds.add(candidate.id);
        const spatial = getSpatial(trialIds);
        const scoreResult = scoreSpatialMetrics(spatial, scoreBounds, request.scoreWeights);
        if (!bestCandidate || scoreResult.score > bestCandidate.score) {
          bestCandidate = { kiosk: candidate, spatial, score: scoreResult.score };
        }
        onProgress?.({ stage: "greedy", completed, total: remaining.length, siteCount });
        await maybeYield();
      }

      if (!bestCandidate) break;
      selectedIds.add(bestCandidate.kiosk.id);
      spatialCache.set(Array.from(selectedIds).sort().join("|"), bestCandidate.spatial);
    }

    let improved = true;
    while (improved) {
      improved = false;
      const currentSpatial = getSpatial(selectedIds);
      const currentScore = scoreSpatialMetrics(currentSpatial, scoreBounds, request.scoreWeights).score;
      const selected = coarseCandidates.filter((kiosk) => selectedIds.has(kiosk.id) && !lockedIds.has(kiosk.id));
      const unselected = coarseCandidates.filter((kiosk) => !selectedIds.has(kiosk.id));
      let completed = 0;
      const total = Math.max(1, selected.length * unselected.length);

      for (const selectedKiosk of selected) {
        for (const candidate of unselected) {
          completed += 1;
          const trialIds = new Set(selectedIds);
          trialIds.delete(selectedKiosk.id);
          trialIds.add(candidate.id);
          const spatial = getSpatial(trialIds);
          const trialScore = scoreSpatialMetrics(spatial, scoreBounds, request.scoreWeights).score;
          onProgress?.({ stage: "swap", completed, total, siteCount });
          await maybeYield();
          if (trialScore > currentScore) {
            selectedIds.delete(selectedKiosk.id);
            selectedIds.add(candidate.id);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }

    const spatial = evaluateSpatialScenario(
      projectedKiosks,
      projectedDemandZones,
      selectedIds,
      request.global.serviceDistanceKm,
      true,
    );
    const components = scoreSpatialMetrics(spatial, scoreBounds, request.scoreWeights);
    topScenarios.push({
      selectedKioskIds: Array.from(selectedIds),
      score: components.score,
      components: {
        capturedDemand: components.capturedDemand,
        coverage: components.coverage,
        balance: components.balance,
        cannibalization: components.cannibalization,
      },
      spatial,
    });
    onProgress?.({ stage: "finalize", completed: siteCount - effectiveMinSites + 1, total: effectiveMaxSites - effectiveMinSites + 1, siteCount });
  }

  topScenarios.sort((a, b) => b.score - a.score);
  if (topScenarios.length === 0) {
    throw new Error("No se pudo construir ningun escenario valido con los parametros actuales.");
  }

  return {
    runId: `opt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    request,
    best: topScenarios[0],
    topScenarios: topScenarios.slice(0, 5),
  };
}
