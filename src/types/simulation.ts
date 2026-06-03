export type ScenarioKey = "A" | "B";
export type KioskSource = "csv" | "manual";

export interface UniformDistributionParams { kind: "uniform"; a: number; b: number }

export interface Kiosk {
  id: string;
  nombre: string;
  calle: string;
  lat: number;
  lon: number;
  chain: string;
  source: KioskSource;
  active?: boolean;
  locked?: boolean;
  attractivenessWeight: number;
}

export interface GlobalParams {
  horizonDays: number;
  serviceTime: UniformDistributionParams;
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
  capturedDemand: number;
  coverage: number;
  balance: number;
  cannibalization: number;
}

export interface ScenarioInput {
  scenario: ScenarioKey;
  seed: number;
  kiosks: Kiosk[];
  demandZones: DemandZone[];
  global: GlobalParams;
}

export interface KioskRunMetrics {
  kioskId: string;
  arrivals: number;
  accepted: number;
  devicesCollected: number;
  refurbished: number;
  scrap: number;
  revenue: number;
  cost: number;
  margin: number;
}

export interface SimulationRunResult {
  seed: number;
  kiosks: KioskRunMetrics[];
  totalDevices: number;
  totalRefurbished: number;
  totalScrap: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
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
  parts?: GeoPoint[][];
}

export interface SpatialMetrics {
  weightedDistanceKm: number;
  coveredDemandPct: number;
  capturedDemand: number;
  loadBalanceScore: number;
  cannibalizationPct: number;
  assignments: SpatialAssignment[];
  voronoiCells: VoronoiCell[];
  demandByKiosk?: Record<string, { kioskId: string; assignedDemand: number; effectiveDemand: number; assignmentCount: number }>;
}

export interface SimulationResult {
  scenario: ScenarioKey;
  runId: string;
  timestamp: string;
  input: ScenarioInput;
  summary: {
    totalMargin: KpiSummary;
    totalRevenue: KpiSummary;
    totalCost: KpiSummary;
    totalDevices: KpiSummary;
    totalRefurbished: KpiSummary;
    totalScrap: KpiSummary;
    feasibleProbability: number;
    recommendation: "S1" | "S2";
  };
  kiosks: KioskRunMetrics[];
  spatial?: SpatialMetrics;
}

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  scenario: ScenarioKey;
  seed: number;
  horizonDays: number;
  summary: SimulationResult["summary"];
}

export interface OptimizationRequest {
  seed: number;
  kiosks: Kiosk[];
  demandZones: DemandZone[];
  global: GlobalParams;
  serviceTime: UniformDistributionParams;
  minSites: number;
  maxSites: number;
  scoreWeights: ScoreWeights;
}

export interface OptimizationScenarioSummary {
  selectedKioskIds: string[];
  score: number;
  components: {
    capturedDemand: number;
    coverage: number;
    balance: number;
    cannibalization: number;
  };
  spatial: SpatialMetrics;
}

export interface OptimizationResult {
  runId: string;
  timestamp: string;
  request: OptimizationRequest;
  best: OptimizationScenarioSummary;
  topScenarios: OptimizationScenarioSummary[];
}
