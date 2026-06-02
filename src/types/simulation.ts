export type ScenarioKey = "A" | "B";
export type KioskSource = "csv" | "manual";

export interface UniformDistributionParams { kind: "uniform"; a: number; b: number }
export interface NormalDistributionParams { kind: "normal"; mu: number; sigma: number }
export interface PoissonDistributionParams { kind: "poisson"; lambda: number }
export type DistributionParams = UniformDistributionParams | NormalDistributionParams | PoissonDistributionParams;

export interface Conglomerate {
  id: string;
  nombre: string;
  departamento: string;
  dailyDemand: NormalDistributionParams;
  interestPct: number;
  operationalHours: number;
}

export interface Kiosk {
  id: string;
  nombre: string;
  calle: string;
  lat: number;
  lon: number;
  chain: string;
  acquisitionPrice: number;
  source: KioskSource;
  active?: boolean;
  locked?: boolean;
  attractivenessWeight: number;
}

export interface GlobalParams {
  capacityMaxDevices: number;
  horizonDays: number;
  replicas: number;
  confidenceLevel: number;
  warmupDays: number;
  serviceTime: UniformDistributionParams;
  deviceValue: NormalDistributionParams;
  operationCostPerDevice: number;
  totalDailyDemand: NormalDistributionParams;
  serviceDistanceKm: number;
}

export interface DemandZone {
  id: string;
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
  population2022: number;
  density: number;
  demandWeight: number;
}

export interface ScoreWeights {
  margin: number;
  capturedDemand: number;
  coverage: number;
  balance: number;
  cannibalization: number;
}

export interface ScenarioInput {
  scenario: ScenarioKey;
  seed: number;
  conglomerates: Conglomerate[];
  kiosks: Kiosk[];
  demandZones: DemandZone[];
  global: GlobalParams;
}

export interface KioskRunMetrics {
  kioskId: string;
  devicesCollected: number;
  revenue: number;
  cost: number;
  margin: number;
  utilization: number;
  avgServiceMinutes: number;
  collectionsTriggered: number;
}

export interface SimulationReplicaResult {
  replica: number;
  seed: number;
  kiosks: KioskRunMetrics[];
  totalDevices: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  amortizationDays: number;
  feasible: boolean;
}

export interface KpiSummary {
  mean: number;
  ci95Lower: number;
  ci95Upper: number;
}

export interface SpatialAssignment {
  demandZoneId: string;
  kioskId: string;
  distanceKm: number;
  demandWeight: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface VoronoiCell {
  kioskId: string;
  points: GeoPoint[];
}

export interface SpatialMetrics {
  weightedDistanceKm: number;
  coveredDemandPct: number;
  capturedDemand: number;
  loadBalanceScore: number;
  cannibalizationPct: number;
  incrementalDemandPct: number;
  assignments: SpatialAssignment[];
  voronoiCells: VoronoiCell[];
}

export interface SimulationResult {
  scenario: ScenarioKey;
  runId: string;
  timestamp: string;
  input: ScenarioInput;
  replicas?: SimulationReplicaResult[];
  summary: {
    totalMargin: KpiSummary;
    totalRevenue: KpiSummary;
    totalCost: KpiSummary;
    totalDevices: KpiSummary;
    amortizationDays: KpiSummary;
    feasibleProbability: number;
  };
  warnings: string[];
  spatial?: SpatialMetrics;
}

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  scenario: ScenarioKey;
  seed: number;
  summary: SimulationResult["summary"];
  warnings: string[];
}

export interface CandidateEvaluation {
  kioskId: string;
  nombre: string;
  source: KioskSource;
  chain: string;
  scoreContribution: number;
  assignedDemand: number;
}

export interface OptimizationRequest {
  seed: number;
  kiosks: Kiosk[];
  demandZones: DemandZone[];
  global: GlobalParams;
  serviceTime: UniformDistributionParams;
  deviceValue: NormalDistributionParams;
  operationCostPerDevice: number;
  minSites: number;
  maxSites: number;
  budgetCap: number | null;
  scoreWeights: ScoreWeights;
}

export interface OptimizationScenarioSummary {
  selectedKioskIds: string[];
  score: number;
  components: {
    margin: number;
    capturedDemand: number;
    coverage: number;
    balance: number;
    cannibalization: number;
  };
  simulation: SimulationResult;
  candidateEvaluations: CandidateEvaluation[];
}

export interface OptimizationResult {
  runId: string;
  timestamp: string;
  request: OptimizationRequest;
  best: OptimizationScenarioSummary;
  topScenarios: OptimizationScenarioSummary[];
}
