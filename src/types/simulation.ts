export type ScenarioKey = "A" | "B";

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
  conglomerateId: string;
  lat: number;
  lon: number;
  chain: string;
  acquisitionPrice: number;
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
}

export interface ScenarioInput {
  scenario: ScenarioKey;
  seed: number;
  conglomerates: Conglomerate[];
  kiosks: Kiosk[];
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

export interface SimulationResult {
  scenario: ScenarioKey;
  runId: string;
  timestamp: string;
  input: ScenarioInput;
  replicas: SimulationReplicaResult[];
  summary: {
    totalMargin: KpiSummary;
    totalRevenue: KpiSummary;
    totalCost: KpiSummary;
    totalDevices: KpiSummary;
    amortizationDays: KpiSummary;
    feasibleProbability: number;
  };
  warnings: string[];
}

export interface HistoryEntry {
  runId: string;
  timestamp: string;
  scenario: ScenarioKey;
  seed: number;
  summary: SimulationResult["summary"];
  warnings: string[];
}
