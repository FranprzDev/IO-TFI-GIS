import type { HistoryEntry, OptimizationResult, SimulationResult } from "@/types/simulation";

export const HISTORY_KEY = "ecoatm_sim_history_v1";
export const SCENARIO_KEY = "ecoatm_sim_scenario_main_v1";
export const LAST_RESULT_KEY = "ecoatm_sim_last_result_main_v1";
export const OPTIMIZATION_KEY = "ecoatm_sim_optimization_main_v1";
export const OPTIMIZATION_SELECTION_KEY = "ecoatm_sim_optimization_selection_main_v1";

export function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(result: SimulationResult): void {
  if (typeof window === "undefined") return;
  const current = readHistory();
  const entry: HistoryEntry = {
    runId: result.runId,
    timestamp: result.timestamp,
    scenario: result.scenario,
    seed: result.input.seed,
    summary: result.summary,
    warnings: result.warnings,
  };
  const next = [entry, ...current].slice(0, 100);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    const reduced = next.slice(0, 20);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(reduced));
  }
}

export function saveScenarioDraft<T>(draft: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SCENARIO_KEY, JSON.stringify(draft));
}

export function readScenarioDraft<T>(): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SCENARIO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveLastResult(result: SimulationResult): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
}

export function readLastResult(): SimulationResult | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SimulationResult;
  } catch {
    return null;
  }
}

export function saveOptimizationResult(result: OptimizationResult): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPTIMIZATION_KEY, JSON.stringify(result));
}

export function readOptimizationResult(): OptimizationResult | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(OPTIMIZATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OptimizationResult;
  } catch {
    return null;
  }
}

export function saveOptimizationSelection(selectedKioskIds: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPTIMIZATION_SELECTION_KEY, JSON.stringify(selectedKioskIds));
}

export function readOptimizationSelection(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(OPTIMIZATION_SELECTION_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
