"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useTucumanKioskPlacement } from "@/hooks/useTucumanKioskPlacement";
import {
  HISTORY_KEY,
  OPTIMIZATION_KEY,
  OPTIMIZATION_SELECTION_KEY,
  SCENARIO_KEY,
  readHistory,
  readOptimizationResult,
  readOptimizationSelection,
  readScenarioDraft,
  saveHistoryEntry,
  saveOptimizationResult,
  saveOptimizationSelection,
  saveScenarioDraft,
} from "@/lib/storage/history";
import type {
  DemandZone,
  HistoryEntry,
  Kiosk,
  OptimizationRequest,
  OptimizationResult,
  OptimizationScenarioSummary,
  ScenarioInput,
  SimulationResult,
  VoronoiCell,
} from "@/types/simulation";

const KioskLeafletMap = dynamic(() => import("@/components/KioskLeafletMap").then((m) => m.KioskLeafletMap), { ssr: false });

interface Draft {
  horizonDays: number;
  serviceMinA: number;
  serviceMinB: number;
  serviceDistanceKm: number;
  minSites: number;
  maxSites: number;
}

interface BootstrapData {
  kiosks: Array<{ id: string; nombreSucursal: string; calle: string; cadena: string; latitud: number; longitud: number }>;
  localityPoints: Array<{ id: string; nombre: string; departamento: string; latitud: number; longitud: number; poblacion2022: number; densidad: number; source: string }>;
}

type SidebarTab = "simulation" | "optimization" | "settings" | "history";

const baseDraft: Draft = {
  horizonDays: 365,
  serviceMinA: 4,
  serviceMinB: 10,
  serviceDistanceKm: 10,
  minSites: 3,
  maxSites: 6,
};

function toDemandWeight(population2022: number, density: number) {
  const densityBoost = Math.min(1.25, 1 + Math.min(1, density / 5000) * 0.25);
  return Math.max(1, population2022 * densityBoost);
}

export default function Home() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [demandZones, setDemandZones] = useState<DemandZone[]>([]);
  const [draft, setDraft] = useState<Draft>(baseDraft);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("simulation");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyCompareIds, setHistoryCompareIds] = useState<string[]>([]);
  const [showHistoryCompareModal, setShowHistoryCompareModal] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [optimizationPct, setOptimizationPct] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; action: "run" | "optimize" | "clear" | "clearHistory" | null }>({ open: false, action: null });
  const [selectedOptimizationIds, setSelectedOptimizationIds] = useState<string[]>([]);
  const { placeKiosk } = useTucumanKioskPlacement(setKiosks);

  useEffect(() => {
    const stored = readScenarioDraft<Draft>();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setDraft((prev) => ({ ...prev, ...stored }));
    setHistoryEntries(readHistory());
    const savedOptimization = readOptimizationResult();
    if (savedOptimization) setOptimization(savedOptimization);
    const savedSelection = readOptimizationSelection();
    if (savedSelection.length > 0) setSelectedOptimizationIds(savedSelection);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persistSimulationResult = (simResult: SimulationResult) => {
    const alreadySaved = readHistory().some((entry) => entry.runId === simResult.runId);
    if (!alreadySaved) {
      saveHistoryEntry(simResult);
    }
    setHistoryEntries(readHistory());
  };

  const fmtMoney = (value: number) => new Intl.NumberFormat("es-AR").format(Math.round(value));

  const toggleHistoryCompare = (runId: string) => {
    setHistoryCompareIds((current) => {
      if (current.includes(runId)) return current.filter((id) => id !== runId);
      if (current.length >= 2) return [current[1], runId];
      return [...current, runId];
    });
  };

  const openHistoryCompareModal = () => {
    if (historyCompareIds.length === 2) {
      setShowHistoryCompareModal(true);
    }
  };

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((data: BootstrapData) => {
        setKiosks((data.kiosks ?? []).map((k) => ({
          id: k.id,
          nombre: k.nombreSucursal,
          calle: k.calle || "",
          chain: k.cadena || "Gobierno",
          lat: k.latitud,
          lon: k.longitud,
          source: "csv",
          active: true,
          attractivenessWeight: 1,
        })));

        setDemandZones((data.localityPoints ?? []).map((loc) => ({
          id: loc.id,
          nombre: loc.nombre,
          departamento: loc.departamento,
          lat: loc.latitud,
          lon: loc.longitud,
          population2022: loc.poblacion2022,
          density: loc.densidad,
          demandWeight: toDemandWeight(loc.poblacion2022, loc.densidad),
        })));
      })
      .catch(() => setErrors(["No se pudieron cargar los datasets base."]));
  }, []);

  useEffect(() => {
    saveScenarioDraft(draft);
  }, [draft]);

  const activeKiosks = useMemo(() => kiosks.filter((kiosk) => kiosk.active !== false), [kiosks]);
  const optimizableKioskCount = kiosks.length;
  const activeOptimizationScenario = useMemo(() => {
    if (!optimization) return null;
    if (selectedOptimizationIds.length > 0) {
      // Match by set (order-insensitive) so a selection restored/persisted in a
      // different order still resolves to its scenario instead of silently
      // falling back to `best` (which would show a different kiosk count).
      const key = (ids: string[]) => [...ids].sort().join(",");
      const selectedKey = key(selectedOptimizationIds);
      return optimization.topScenarios.find((item) => key(item.selectedKioskIds) === selectedKey) ?? optimization.best;
    }
    return optimization.best;
  }, [optimization, selectedOptimizationIds]);
  const mapVoronoiCells: VoronoiCell[] = useMemo(() => {
    if (activeOptimizationScenario?.spatial) {
      if (sidebarTab === "optimization") {
        return activeOptimizationScenario.spatial.voronoiCells;
      }
      if (sidebarTab === "simulation" && selectedOptimizationIds.length > 0 && !result) {
        return activeOptimizationScenario.spatial.voronoiCells;
      }
    }
    return result?.spatial?.voronoiCells ?? optimization?.best.spatial.voronoiCells ?? [];
  }, [activeOptimizationScenario, optimization, result, selectedOptimizationIds, sidebarTab]);

  const valid = useMemo(() => {
    return draft.horizonDays > 0
      && draft.serviceMinA < draft.serviceMinB
      && draft.serviceDistanceKm > 0
      && draft.minSites > 0
      && optimizableKioskCount >= draft.minSites;
  }, [draft, optimizableKioskCount]);

  const onMapClick = (lat: number, lon: number) => {
    const placed = placeKiosk(lat, lon);
    if (!placed) {
      toast.error("No puedes poner un kiosco afuera de Tucuman", {
        description: "Cada marcador es un kiosco y debe quedar dentro de los limites de la provincia.",
      });
    }
  };

  function buildInput(selectedIds?: string[]): ScenarioInput {
    const selected = selectedIds ? new Set(selectedIds) : null;
    const scenarioKiosks = kiosks
      .map((kiosk) => ({
        ...kiosk,
        active: selected ? selected.has(kiosk.id) : kiosk.active !== false,
      }))
      .filter((kiosk) => kiosk.active !== false);

    return {
      scenario: "A",
      seed: Date.now(),
      kiosks: scenarioKiosks,
      demandZones,
      global: {
        horizonDays: draft.horizonDays,
        serviceTime: { kind: "uniform", a: draft.serviceMinA, b: draft.serviceMinB },
        serviceDistanceKm: draft.serviceDistanceKm,
      },
    };
  }

  function buildOptimizationRequest(): OptimizationRequest {
    return {
      seed: Date.now(),
      kiosks: kiosks.map((kiosk) => ({ ...kiosk, active: true })),
      demandZones,
      global: buildInput().global,
      serviceTime: { kind: "uniform", a: draft.serviceMinA, b: draft.serviceMinB },
      minSites: draft.minSites,
      maxSites: optimizableKioskCount,
      scoreWeights: {
        capturedDemand: 0.2,
        coverage: 0.2,
        balance: 0.35,
        cannibalization: 0.25,
      },
    };
  }

  function applyOptimizedScenario(summary: OptimizationScenarioSummary) {
    setSelectedOptimizationIds(summary.selectedKioskIds);
    saveOptimizationSelection(summary.selectedKioskIds);
  }

  async function runSimulation() {
    const input = buildInput(selectedOptimizationIds.length > 0 ? selectedOptimizationIds : undefined);
    setIsRunning(true);
    setProgressDay(0);
    setErrors([]);
    setShowResultModal(false);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ errors: ["Error de red"] }));
        setErrors((err.errors ?? ["Error desconocido"]).map((e: { field?: string; message?: string } | string) =>
          typeof e === "string" ? e : `${e.field}: ${e.message}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const eventLine = chunk.match(/^event: (\w+)/m);
          const dataLine = chunk.match(/^data: (.+)/m);
          if (!eventLine || !dataLine) continue;

          const event = eventLine[1];
          const data = JSON.parse(dataLine[1]);

          if (event === "progress") {
            setProgressDay(data.day as number);
          } else if (event === "result" && data.ok) {
            const simResult = data.result as SimulationResult;
            persistSimulationResult(simResult);
            setResult(simResult);
            setProgressDay(input.global.horizonDays);
            setShowResultModal(true);
          } else if (event === "error") {
            setErrors([data.message as string]);
          }
        }
      }
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setTimeout(() => setIsRunning(false), 250);
    }
  }

  async function runOptimization() {
    const request = buildOptimizationRequest();
    setIsOptimizing(true);
    setOptimizationPct(0);
    setErrors([]);

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ message: "Error de red" }));
        setErrors([err.message ?? "No se pudo ejecutar la optimizacion."]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          const eventLine = chunk.match(/^event: (\w+)/m);
          const dataLine = chunk.match(/^data: (.+)/m);
          if (!eventLine || !dataLine) continue;

          const event = eventLine[1];
          const data = JSON.parse(dataLine[1]);

          if (event === "progress") {
            setOptimizationPct(data.pct as number);
          } else if (event === "result" && data.ok) {
            const optimizationResult = data.result as OptimizationResult;
            setOptimization(optimizationResult);
            saveOptimizationResult(optimizationResult);
            setSelectedOptimizationIds([]);
            saveOptimizationSelection([]);
            setOptimizationPct(100);
          } else if (event === "error") {
            setErrors([data.message as string]);
          }
        }
      }
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setTimeout(() => setIsOptimizing(false), 250);
    }
  }

  function confirm() {
    const action = modal.action;
    setModal({ open: false, action: null });
    if (action === "run") void runSimulation();
    if (action === "optimize") void runOptimization();
    if (action === "clear") {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(SCENARIO_KEY);
      window.localStorage.removeItem(OPTIMIZATION_KEY);
      window.localStorage.removeItem(OPTIMIZATION_SELECTION_KEY);
      setResult(null);
      setOptimization(null);
      setSelectedOptimizationIds([]);
      setHistoryEntries([]);
      setHistoryCompareIds([]);
      setShowHistoryCompareModal(false);
      setDraft(baseDraft);
    }
    if (action === "clearHistory") {
      window.localStorage.removeItem(HISTORY_KEY);
      setHistoryEntries([]);
      setHistoryCompareIds([]);
      setShowHistoryCompareModal(false);
    }
  }

  const totalWork = Math.max(1, draft.horizonDays);
  const progressPct = Math.min(100, (Math.min(progressDay, draft.horizonDays) / totalWork) * 100);
  const modalTitle = modal.action === "optimize"
    ? "¿Estás seguro de optimizar la red?"
    : modal.action === "run"
      ? "¿Estás seguro de ejecutar la simulación?"
      : modal.action === "clearHistory"
        ? "¿Estás seguro de limpiar el historial?"
      : "¿Estás seguro?";
  const activeProgress = isOptimizing
    ? {
        title: "Optimizacion",
        value: `${optimizationPct.toFixed(0)}%`,
        body: <ProgressBar pct={optimizationPct} />,
      }
    : isRunning
      ? {
          title: "Simulacion",
          value: `${progressPct.toFixed(1)}%`,
          body: (
            <>
              Dia {Math.min(progressDay, draft.horizonDays)} / {draft.horizonDays}
              <ProgressBar pct={progressPct} />
            </>
          ),
      }
      : null;
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ConfirmModal open={modal.open} title={modalTitle} onCancel={() => setModal({ open: false, action: null })} onConfirm={confirm} />
      <ResultModal open={showResultModal} result={result} onClose={() => setShowResultModal(false)} />
      <HistoryCompareModal
        open={showHistoryCompareModal}
        left={historyEntries.find((entry) => entry.runId === historyCompareIds[0]) ?? null}
        right={historyEntries.find((entry) => entry.runId === historyCompareIds[1]) ?? null}
        onClose={() => setShowHistoryCompareModal(false)}
      />
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[400px_1fr]">
        <aside className="flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <h1 className="text-xl font-bold">Simulador ecoATM</h1>

          <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1">
            <div className="grid grid-cols-3 gap-1">
              <TabButton active={sidebarTab === "optimization"} onClick={() => setSidebarTab("optimization")}>
                Optimizacion
              </TabButton>
              <TabButton active={sidebarTab === "simulation"} onClick={() => setSidebarTab("simulation")}>
                Simulacion
              </TabButton>
              <TabButton active={sidebarTab === "settings"} onClick={() => setSidebarTab("settings")} icon={<GearIcon />}>
                Configuracion
              </TabButton>
            </div>
          </section>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
            {sidebarTab === "simulation" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Corridas directas del escenario cargado.</p>
                {selectedOptimizationIds.length > 0 && (
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm">
                    <p className="font-medium">Propuesta importada</p>
                    <p className="mt-1 text-[var(--text-secondary)]">{selectedOptimizationIds.length} zonas seleccionadas desde optimización.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOptimizationIds([]);
                        saveOptimizationSelection([]);
                      }}
                      className="mt-2 rounded border border-[var(--border)] px-3 py-1 text-xs"
                    >
                      Quitar propuesta
                    </button>
                  </div>
                )}
                <button type="button" disabled={!valid || isRunning || activeKiosks.length === 0} onClick={() => setModal({ open: true, action: "run" })} className="w-full rounded bg-[var(--btn-primary)] px-3 py-2 font-semibold text-black disabled:opacity-40">
                  Ejecutar simulacion
                </button>
                <button type="button" onClick={() => setModal({ open: true, action: "clear" })} className="w-full rounded border border-[var(--border)] px-3 py-2">
                  Reiniciar datos
                </button>
              </div>
            )}

            {sidebarTab === "optimization" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Busqueda de la mejor configuracion factible.</p>
                <button
                  type="button"
                  disabled={!valid || isOptimizing || kiosks.length === 0 || demandZones.length === 0}
                  onClick={() => setModal({ open: true, action: "optimize" })}
                  className="w-full rounded bg-[var(--accent)] px-3 py-2 font-semibold text-black disabled:opacity-40"
                >
                  Optimizar red
                </button>
                <div className="rounded border border-[var(--border)] p-3 text-sm">
                  <NumberField label="Min kioskos" value={draft.minSites} min={1} max={optimizableKioskCount} onChange={(value) => setDraft({ ...draft, minSites: Math.min(value, optimizableKioskCount) })} />
                  <div className="mt-3 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                    <div className="text-[var(--text-secondary)]">Max kioskos</div>
                    <div className="mt-1 font-semibold">{optimizableKioskCount}</div>
                  </div>
                </div>
              </div>
            )}

            {sidebarTab === "settings" && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">Parametros compartidos por simulacion y optimizacion.</p>
                <section className="space-y-3 rounded border border-[var(--border)] p-3">
                  <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Parametros base</h2>
                  <NumberField label="Horizonte (dias)" value={draft.horizonDays} min={1} max={3650} onChange={(value) => setDraft({ ...draft, horizonDays: value })} />
                  <NumberField label="Distancia servicio (km)" value={draft.serviceDistanceKm} min={1} max={100} onChange={(value) => setDraft({ ...draft, serviceDistanceKm: value })} />
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                    <div className="text-[var(--text-secondary)]">Costos por kiosko (fijos, en ARS)</div>
                    <div className="mt-1 font-semibold">Adquisición: $28.000.000 por kiosko <span className="font-normal text-[var(--text-secondary)]">(≈ USD 20.000)</span></div>
                    <div className="font-semibold">Mantenimiento: $4.200.000 cada 30 días <span className="font-normal text-[var(--text-secondary)]">(≈ USD 3.000)</span></div>
                  </div>
                </section>

                <section className="space-y-3 rounded border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Distribuciones</h2>
                    <span className="text-xs text-[var(--text-secondary)]">Solo lectura</span>
                  </div>
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    Estas distribuciones forman parte del motor de simulación y no se pueden cambiar desde la interfaz.
                  </div>
                  <DistributionField
                    title="Tiempo de servicio"
                    distribution="Uniforme"
                    tooltip="Distribucion uniforme fija usada por el motor."
                  >
                    <NumberField label="Tiempo servicio min A" value={draft.serviceMinA} min={0} max={120} onChange={(value) => setDraft({ ...draft, serviceMinA: value })} disabled />
                    <NumberField label="Tiempo servicio min B" value={draft.serviceMinB} min={draft.serviceMinA + 1} max={240} onChange={(value) => setDraft({ ...draft, serviceMinB: value })} disabled />
                  </DistributionField>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                      <div className="text-[var(--text-secondary)]">Llegada de usuarios</div>
                      <div className="mt-1 font-semibold">Poisson, λ = 2 usuarios/hora por kiosko</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Horario operativo 9:00–22:00 (13 h/día). Parámetro fijo.</div>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                      <div className="text-[var(--text-secondary)]">Aceptación de oferta</div>
                      <div className="mt-1 font-semibold">Binomial, p = 60%</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Sobre los arribos de cada kiosko. Parámetro fijo.</div>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                      <div className="text-[var(--text-secondary)]">Reacondicionados</div>
                      <div className="mt-1 font-semibold">60% de los aceptados, Normal N($120.000, $40.000)</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Ganancia asociada: 15% sobre el valor del equipo.</div>
                    </div>
                    <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                      <div className="text-[var(--text-secondary)]">Chatarra</div>
                      <div className="mt-1 font-semibold">40% de los aceptados, Normal N($10.000, $3.000)</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">Ganancia asociada: 30% sobre el valor del equipo.</div>
                    </div>
                  </div>
                </section>

              </div>
            )}

            {sidebarTab === "history" && (
              <div className="space-y-3">
                {historyEntries.length === 0 ? (
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-secondary)]">
                    No hay resultados guardados todavia.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="sticky top-0 z-20 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm shadow-md shadow-black/10">
                      <div className="font-medium">Opciones</div>
                      <section className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setModal({ open: true, action: "clearHistory" })}
                          className="rounded border border-[var(--border)] px-3 py-1 text-xs"
                          disabled={historyEntries.length === 0}
                        >
                          Limpiar historial
                        </button>
                        <button
                          type="button"
                          onClick={openHistoryCompareModal}
                          className="rounded border border-[var(--border)] px-3 py-1 text-xs"
                          disabled={historyCompareIds.length !== 2}
                        >
                          Comparar selecciones
                        </button>
                      </section>
                    </div>

                    <div className="space-y-2">
                      {historyEntries.map((entry) => {
                        const selected = historyCompareIds.includes(entry.runId);
                        return (
                          <div
                            key={entry.runId}
                            className={`rounded border p-3 text-sm ${
                              selected ? "border-[var(--accent)] bg-[var(--btn-secondary)]" : "border-[var(--border)] bg-[var(--bg-primary)]"
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleHistoryCompare(entry.runId)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleHistoryCompare(entry.runId);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">
                                  Periodo {entry.horizonDays} dias - {new Date(entry.timestamp).toLocaleString("es-AR")}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                  Recomendacion: {entry.summary.recommendation} | Margen: {fmtMoney(entry.summary.totalMargin.mean)}
                                </div>
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                  Ingreso: {fmtMoney(entry.summary.totalRevenue.mean)} | Costo: {fmtMoney(entry.summary.totalCost.mean)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}
              </div>
            )}

          </div>

          {sidebarTab === "optimization" && optimization && (
            <section className="mt-4 space-y-2 rounded border border-[var(--border)] p-3 text-sm">
              <h2 className="font-semibold">Top escenarios</h2>
              {optimization.topScenarios.map((scenario, index) => (
                <button
                  key={`${scenario.selectedKioskIds.join("-")}-${index}`}
                  type="button"
                  onClick={() => applyOptimizedScenario(scenario)}
                  className={`w-full rounded border px-3 py-2 text-left ${selectedOptimizationIds.join(",") === scenario.selectedKioskIds.join(",") ? "border-[var(--accent)] bg-[var(--btn-secondary)]" : "border-[var(--border)]"}`}
                >
                  <div className="flex items-center justify-between">
                    <span>#{index + 1} - {scenario.selectedKioskIds.length} kioscos</span>
                    <span>{scenario.score.toFixed(3)}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Cobertura {((scenario.spatial.coveredDemandPct * 100)).toFixed(1)}% | Distancia {(scenario.spatial.weightedDistanceKm).toFixed(2)} km
                  </div>
                </button>
              ))}
            </section>
          )}

          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => setSidebarTab("history")}
              className={`flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-sm transition-colors ${
                sidebarTab === "history"
                  ? "border-[var(--accent)] bg-[var(--btn-secondary)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--btn-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <GearIcon />
              <span>Historial</span>
            </button>
          </div>
        </aside>

        <main className="flex min-h-screen flex-col p-4">
          <div className="relative min-h-0 flex-1">
            {activeProgress && (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-[1200] flex justify-center px-3">
                <div className="pointer-events-auto w-full max-w-md shadow-xl">
                  <ProgressCard title={activeProgress.title} value={activeProgress.value}>
                    {activeProgress.body}
                  </ProgressCard>
                </div>
              </div>
            )}

            <KioskLeafletMap
              kiosks={kiosks}
              demandZones={demandZones}
              voronoiCells={mapVoronoiCells}
              highlightedKioskIds={selectedOptimizationIds.length > 0 ? selectedOptimizationIds : (activeOptimizationScenario?.selectedKioskIds ?? [])}
              focusHighlightedOnly={sidebarTab === "optimization" || selectedOptimizationIds.length > 0}
              highlightColor="#22C55E"
              onMapClick={onMapClick}
              className="h-full w-full rounded-xl border border-[var(--border)]"
            />
          </div>

          {errors.length > 0 && (
            <ErrorPanel messages={errors} />
          )}
        </main>
      </div>
    </div>
  );
}

function HistoryCompareModal({
  open,
  left,
  right,
  onClose,
}: {
  open: boolean;
  left: HistoryEntry | null;
  right: HistoryEntry | null;
  onClose: () => void;
}) {
  if (!open || !left || !right || typeof document === "undefined") return null;

  const fmtMoney = (value: number) => new Intl.NumberFormat("es-AR").format(Math.round(value));
  const marginClass = (value: number) => (value < 0 ? "text-red-500" : value > 0 ? "text-emerald-500" : "");
  const leftHorizon = Number.isFinite(left.horizonDays) ? left.horizonDays : null;
  const rightHorizon = Number.isFinite(right.horizonDays) ? right.horizonDays : null;
  const moneyCell = (label: string, value: number) => (
    <span className={label === "Margen" ? marginClass(value) : undefined}>${fmtMoney(value)}</span>
  );
  const diffCell = (value: number, monetary = false) => <span>{monetary ? `$${fmtMoney(value)}` : fmtMoney(value)}</span>;
  const rows: Array<{ label: string; a: ReactNode; b: ReactNode; diff: ReactNode }> = [
    {
      label: "Recomendacion",
      a: left.summary.recommendation,
      b: right.summary.recommendation,
      diff: "No aplica",
    },
    {
      label: "Ingreso economico total",
      a: moneyCell("Ingreso economico total", left.summary.totalRevenue.mean),
      b: moneyCell("Ingreso economico total", right.summary.totalRevenue.mean),
      diff: diffCell(left.summary.totalRevenue.mean - right.summary.totalRevenue.mean, true),
    },
    {
      label: "Costo de inversion total",
      a: moneyCell("Costo de inversion total", left.summary.totalCost.mean),
      b: moneyCell("Costo de inversion total", right.summary.totalCost.mean),
      diff: diffCell(left.summary.totalCost.mean - right.summary.totalCost.mean, true),
    },
    {
      label: "Margen",
      a: moneyCell("Margen", left.summary.totalMargin.mean),
      b: moneyCell("Margen", right.summary.totalMargin.mean),
      diff: diffCell(left.summary.totalMargin.mean - right.summary.totalMargin.mean, true),
    },
    {
      label: "Dispositivos recolectados",
      a: fmtMoney(left.summary.totalDevices.mean),
      b: fmtMoney(right.summary.totalDevices.mean),
      diff: diffCell(left.summary.totalDevices.mean - right.summary.totalDevices.mean),
    },
    {
      label: "Reacondicionados",
      a: fmtMoney(left.summary.totalRefurbished.mean),
      b: fmtMoney(right.summary.totalRefurbished.mean),
      diff: diffCell(left.summary.totalRefurbished.mean - right.summary.totalRefurbished.mean),
    },
    {
      label: "Chatarra",
      a: fmtMoney(left.summary.totalScrap.mean),
      b: fmtMoney(right.summary.totalScrap.mean),
      diff: diffCell(left.summary.totalScrap.mean - right.summary.totalScrap.mean),
    },
    {
      label: "Periodo utilizado",
      a: leftHorizon !== null ? `${leftHorizon} dias` : "desconocido",
      b: rightHorizon !== null ? `${rightHorizon} dias` : "desconocido",
      diff: leftHorizon !== null && rightHorizon !== null
        ? `${leftHorizon - rightHorizon} dias`
        : "desconocido",
    },
  ];

  return createPortal((
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-[var(--text-primary)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Comparacion de recomendaciones</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Vista lado a lado basada en el resumen guardado en historial.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-3 py-1 text-sm">
            Cerrar
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-4">
            <div className="text-xs text-[var(--text-secondary)]">Corrida A</div>
            <div className="mt-1 font-medium">
              {left.scenario} - {new Date(left.timestamp).toLocaleString("es-AR")}
            </div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              {left.summary.recommendation} | <span className={marginClass(left.summary.totalMargin.mean)}>Margen {fmtMoney(left.summary.totalMargin.mean)}</span>
            </div>
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              Periodo utilizado: {leftHorizon !== null ? `${leftHorizon} dias` : "desconocido"}
            </div>
          </div>
          <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-4">
            <div className="text-xs text-[var(--text-secondary)]">Corrida B</div>
            <div className="mt-1 font-medium">
              {right.scenario} - {new Date(right.timestamp).toLocaleString("es-AR")}
            </div>
            <div className="mt-1 text-sm text-[var(--text-secondary)]">
              {right.summary.recommendation} | <span className={marginClass(right.summary.totalMargin.mean)}>Margen {fmtMoney(right.summary.totalMargin.mean)}</span>
            </div>
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              Periodo utilizado: {rightHorizon !== null ? `${rightHorizon} dias` : "desconocido"}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[var(--text-secondary)]">
              <tr>
                <th className="py-2 pr-3">Metrica</th>
                <th className="py-2 pr-3 text-right">A</th>
                <th className="py-2 pr-3 text-right">B</th>
                <th className="py-2 pr-3 text-right">Diferencia (A-B)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3 text-right">{row.a}</td>
                  <td className="py-2 pr-3 text-right">{row.b}</td>
                  <td className="py-2 pr-3 text-right">{row.diff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ), document.body);
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`block text-sm ${disabled ? "opacity-70" : ""}`}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60"
        required
      />
    </label>
  );
}

function DistributionField({
  title,
  distribution,
  tooltip,
  children,
}: {
  title: string;
  distribution: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span
          title={tooltip}
          className="inline-flex cursor-help items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--btn-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {distribution}
          <span aria-hidden="true" className="text-[10px]">
            i
          </span>
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
          : "text-[var(--text-secondary)] hover:bg-[var(--btn-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.25 1 1.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

function ProgressCard({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{title}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-3 w-full overflow-hidden rounded bg-[var(--btn-secondary)]">
      <div className="h-full bg-[var(--accent)] transition-all duration-100" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ErrorPanel({ messages }: { messages: string[] }) {
  return (
    <div className="mt-4 rounded border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
      {messages.map((message) => <div key={message}>{message}</div>)}
    </div>
  );
}

function ResultModal({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: SimulationResult | null;
  onClose: () => void;
}) {
  if (!open || !result || typeof document === "undefined") return null;
  const ars = (n: number) => `$${new Intl.NumberFormat("es-AR").format(Math.round(n))}`;
  const num = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const s = result.summary;
  const invest = s.recommendation === "S1";
  const kioskName = (id: string) => result.input.kiosks.find((k) => k.id === id)?.nombre ?? id;
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-[var(--text-primary)]">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">Resultado simulacion</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-3 py-1 text-sm">
            Cerrar
          </button>
        </div>

        <div className={`mt-4 rounded-lg border p-3 ${invest ? "border-emerald-400/50 bg-emerald-400/10" : "border-red-400/50 bg-red-400/10"}`}>
          <div className="text-sm text-[var(--text-secondary)]">Recomendacion de inversion</div>
          <div className="mt-1 text-lg font-bold">
            {s.recommendation} — {invest ? "Se recomienda invertir" : "No se recomienda invertir"}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            Ganancia {ars(s.totalRevenue.mean)} {invest ? ">" : "≤"} inversion {ars(s.totalCost.mean)}
          </div>
        </div>

        <h4 className="mt-4 text-sm font-semibold text-[var(--text-secondary)]">Totales de la red</h4>
        <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
          <p>Ingreso economico total: {ars(s.totalRevenue.mean)}</p>
          <p>Costo de inversion total: {ars(s.totalCost.mean)}</p>
          <p className={s.totalMargin.mean < 0 ? "text-red-500" : s.totalMargin.mean > 0 ? "text-emerald-500" : ""}>
            Margen: {ars(s.totalMargin.mean)}
          </p>
          <p>Dispositivos recolectados: {num(s.totalDevices.mean)}</p>
          <p>Reacondicionados / Chatarra: {num(s.totalRefurbished.mean)} / {num(s.totalScrap.mean)}</p>
          <p>Cobertura de demanda: {((result.spatial?.coveredDemandPct ?? 0) * 100).toFixed(1)}%</p>
          <p>Dias simulados: {result.input.global.horizonDays}</p>
          <p>Distancia ponderada: {(result.spatial?.weightedDistanceKm ?? 0).toFixed(2)} km</p>
        </div>

        <h4 className="mt-4 text-sm font-semibold text-[var(--text-secondary)]">Por kiosko</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[var(--text-secondary)]">
              <tr>
                <th className="py-1 pr-2">Kiosko</th>
                <th className="py-1 pr-2 text-right">Arribos</th>
                <th className="py-1 pr-2 text-right">Aceptaron</th>
                <th className="py-1 pr-2 text-right">Refurbished</th>
                <th className="py-1 pr-2 text-right">Chatarra</th>
              </tr>
            </thead>
            <tbody>
              {result.kiosks.map((k) => (
                <tr key={k.kioskId} className="border-t border-[var(--border)]">
                  <td className="py-1 pr-2">{kioskName(k.kioskId)}</td>
                  <td className="py-1 pr-2 text-right">{num(k.arrivals)}</td>
                  <td className="py-1 pr-2 text-right">{num(k.accepted)}</td>
                  <td className="py-1 pr-2 text-right">
                    {num(k.refurbished)} ({pct(k.accepted > 0 ? k.refurbished / k.accepted : 0)})
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {num(k.scrap)} ({pct(k.accepted > 0 ? k.scrap / k.accepted : 0)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  ), document.body);
}
