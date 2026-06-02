import { runSimulation } from "@/lib/sim/engine";
import type {
  CandidateEvaluation,
  Kiosk,
  OptimizationRequest,
  OptimizationResult,
  OptimizationScenarioSummary,
  ScenarioInput,
  ScoreWeights,
  SimulationResult,
} from "@/types/simulation";

export interface OptimizationProgress {
  stage: "greedy" | "swap" | "finalize";
  completed: number;
  total: number;
  siteCount: number;
}

function withSelectedKiosks(kiosks: Kiosk[], selectedIds: Set<string>): Kiosk[] {
  return kiosks.map((kiosk) => ({ ...kiosk, active: selectedIds.has(kiosk.id) }));
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function invertedNormalize(value: number, min: number, max: number): number {
  return 1 - normalize(value, min, max);
}

function buildScenarioInput(request: OptimizationRequest, selectedIds: Set<string>, replicasOverride?: number): ScenarioInput {
  return {
    scenario: "A",
    seed: request.seed,
    conglomerates: [],
    kiosks: withSelectedKiosks(request.kiosks, selectedIds).filter((kiosk) => kiosk.active !== false),
    demandZones: request.demandZones,
    global: {
      ...request.global,
      replicas: replicasOverride ?? request.global.replicas,
      serviceTime: request.serviceTime,
      deviceValue: request.deviceValue,
      operationCostPerDevice: request.operationCostPerDevice,
    },
  };
}

function evaluateScenario(request: OptimizationRequest, selectedIds: Set<string>, replicasOverride?: number): SimulationResult {
  return runSimulation(buildScenarioInput(request, selectedIds, replicasOverride));
}

function scoreScenario(
  result: SimulationResult,
  bounds: {
    margin: { min: number; max: number };
    weightedDistanceKm: { min: number; max: number };
  },
  scoreWeights: ScoreWeights,
): OptimizationScenarioSummary["components"] & { score: number } {
  const spatial = result.spatial!;
  const margin = normalize(result.summary.totalMargin.mean, bounds.margin.min, bounds.margin.max);
  const capturedDemand = spatial.coveredDemandPct;
  const coverage = spatial.coveredDemandPct;
  const balance = spatial.loadBalanceScore;
  const cannibalization = 1 - spatial.cannibalizationPct;
  const distanceScore = invertedNormalize(spatial.weightedDistanceKm, bounds.weightedDistanceKm.min, bounds.weightedDistanceKm.max);

  const adjustedCapturedDemand = Math.max(0, Math.min(1, (capturedDemand * 0.6) + (distanceScore * 0.4)));
  const score = (
    margin * scoreWeights.margin
    + adjustedCapturedDemand * scoreWeights.capturedDemand
    + coverage * scoreWeights.coverage
    + balance * scoreWeights.balance
    + cannibalization * scoreWeights.cannibalization
  );

  return {
    margin,
    capturedDemand: adjustedCapturedDemand,
    coverage,
    balance,
    cannibalization,
    score,
  };
}

function buildCandidateEvaluations(result: SimulationResult, kiosks: Kiosk[]): CandidateEvaluation[] {
  const spatial = result.spatial!;
  const demandByKiosk = spatial.demandByKiosk ?? {};
  return kiosks
    .filter((kiosk) => kiosk.active !== false)
    .map((kiosk) => ({
      kioskId: kiosk.id,
      nombre: kiosk.nombre,
      source: kiosk.source,
      chain: kiosk.chain,
      scoreContribution: demandByKiosk[kiosk.id]?.effectiveDemand ?? 0,
      assignedDemand: demandByKiosk[kiosk.id]?.assignedDemand ?? 0,
    }))
    .sort((a, b) => b.assignedDemand - a.assignedDemand);
}

function evaluateForScoreBounds(request: OptimizationRequest): {
  margin: { min: number; max: number };
  weightedDistanceKm: { min: number; max: number };
} {
  const allActive = new Set(request.kiosks.map((kiosk) => kiosk.id));
  const allResult = evaluateScenario(request, allActive, Math.min(request.global.replicas, 12));

  let minMargin = allResult.summary.totalMargin.mean;
  let maxMargin = allResult.summary.totalMargin.mean;
  let minDistance = allResult.spatial?.weightedDistanceKm ?? 0;
  let maxDistance = allResult.spatial?.weightedDistanceKm ?? 0;

  for (const kiosk of request.kiosks.slice(0, 3)) {
    const result = evaluateScenario(request, new Set([kiosk.id]), Math.min(request.global.replicas, 12));
    minMargin = Math.min(minMargin, result.summary.totalMargin.mean);
    maxMargin = Math.max(maxMargin, result.summary.totalMargin.mean);
    minDistance = Math.min(minDistance, result.spatial?.weightedDistanceKm ?? 0);
    maxDistance = Math.max(maxDistance, result.spatial?.weightedDistanceKm ?? 0);
  }

  return {
    margin: { min: minMargin, max: maxMargin },
    weightedDistanceKm: { min: minDistance, max: maxDistance },
  };
}

function canAddCandidate(request: OptimizationRequest, selectedIds: Set<string>, candidate: Kiosk): boolean {
  if (request.budgetCap == null) return true;
  const currentBudget = request.kiosks
    .filter((kiosk) => selectedIds.has(kiosk.id))
    .reduce((sum, kiosk) => sum + kiosk.acquisitionPrice, 0);
  return currentBudget + candidate.acquisitionPrice <= request.budgetCap;
}

export function runOptimization(
  request: OptimizationRequest,
  onProgress?: (progress: OptimizationProgress) => void,
): OptimizationResult {
  const scoreBounds = evaluateForScoreBounds(request);
  const lockedIds = new Set(request.kiosks.filter((kiosk) => kiosk.locked).map((kiosk) => kiosk.id));
  const baseReplicas = Math.min(request.global.replicas, 20);
  const coarseCandidates = request.kiosks.filter((kiosk) => kiosk.active !== false);
  const topScenarios: OptimizationScenarioSummary[] = [];

  for (let siteCount = request.minSites; siteCount <= request.maxSites; siteCount++) {
    const selectedIds = new Set(lockedIds);

    while (selectedIds.size < siteCount) {
      let bestCandidate: { kiosk: Kiosk; result: SimulationResult; score: number } | null = null;
      const remaining = coarseCandidates.filter((kiosk) => !selectedIds.has(kiosk.id));
      let completed = 0;

      for (const candidate of remaining) {
        completed += 1;
        if (!canAddCandidate(request, selectedIds, candidate)) continue;
        const trialIds = new Set(selectedIds);
        trialIds.add(candidate.id);
        const result = evaluateScenario(request, trialIds, baseReplicas);
        const scoreResult = scoreScenario(result, scoreBounds, request.scoreWeights);
        if (!bestCandidate || scoreResult.score > bestCandidate.score) {
          bestCandidate = { kiosk: candidate, result, score: scoreResult.score };
        }
        onProgress?.({ stage: "greedy", completed, total: remaining.length, siteCount });
      }

      if (!bestCandidate) break;
      selectedIds.add(bestCandidate.kiosk.id);
    }

    let improved = true;
    while (improved) {
      improved = false;
      const currentResult = evaluateScenario(request, selectedIds, baseReplicas);
      const currentScore = scoreScenario(currentResult, scoreBounds, request.scoreWeights).score;
      const selected = coarseCandidates.filter((kiosk) => selectedIds.has(kiosk.id) && !lockedIds.has(kiosk.id));
      const unselected = coarseCandidates.filter((kiosk) => !selectedIds.has(kiosk.id));
      let completed = 0;
      const total = Math.max(1, selected.length * unselected.length);

      for (const selectedKiosk of selected) {
        for (const candidate of unselected) {
          completed += 1;
          if (!canAddCandidate(request, new Set([...selectedIds].filter((id) => id !== selectedKiosk.id)), candidate)) continue;
          const trialIds = new Set(selectedIds);
          trialIds.delete(selectedKiosk.id);
          trialIds.add(candidate.id);
          const result = evaluateScenario(request, trialIds, baseReplicas);
          const trialScore = scoreScenario(result, scoreBounds, request.scoreWeights).score;
          onProgress?.({ stage: "swap", completed, total, siteCount });
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

    const finalResult = evaluateScenario(request, selectedIds);
    const components = scoreScenario(finalResult, scoreBounds, request.scoreWeights);
    topScenarios.push({
      selectedKioskIds: Array.from(selectedIds),
      score: components.score,
      components: {
        margin: components.margin,
        capturedDemand: components.capturedDemand,
        coverage: components.coverage,
        balance: components.balance,
        cannibalization: components.cannibalization,
      },
      simulation: finalResult,
      candidateEvaluations: buildCandidateEvaluations(finalResult, finalResult.input.kiosks),
    });
    onProgress?.({ stage: "finalize", completed: siteCount - request.minSites + 1, total: request.maxSites - request.minSites + 1, siteCount });
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
