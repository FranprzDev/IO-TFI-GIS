import type { HistoryEntry, SimulationResult } from "@/types/simulation";

export const HISTORY_KEY = "ecoatm_sim_history_v1";
export const SCENARIO_A_KEY = "ecoatm_sim_scenario_A_v1";
export const SCENARIO_B_KEY = "ecoatm_sim_scenario_B_v1";
export const LAST_RESULT_A_KEY = "ecoatm_sim_last_result_A_v1";
export const LAST_RESULT_B_KEY = "ecoatm_sim_last_result_B_v1";

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

export function saveScenarioDraft<T>(scenario: "A" | "B", draft: T): void {
  if (typeof window === "undefined") return;
  const key = scenario === "A" ? SCENARIO_A_KEY : SCENARIO_B_KEY;
  window.localStorage.setItem(key, JSON.stringify(draft));
}

export function readScenarioDraft<T>(scenario: "A" | "B"): T | null {
  if (typeof window === "undefined") return null;
  const key = scenario === "A" ? SCENARIO_A_KEY : SCENARIO_B_KEY;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveLastResult(scenario: "A" | "B", result: SimulationResult): void {
  if (typeof window === "undefined") return;
  const key = scenario === "A" ? LAST_RESULT_A_KEY : LAST_RESULT_B_KEY;
  window.localStorage.setItem(key, JSON.stringify(result));
}

export function readLastResult(scenario: "A" | "B"): SimulationResult | null {
  if (typeof window === "undefined") return null;
  const key = scenario === "A" ? LAST_RESULT_A_KEY : LAST_RESULT_B_KEY;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SimulationResult;
  } catch {
    return null;
  }
}
