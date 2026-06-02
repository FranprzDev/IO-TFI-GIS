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
  LAST_RESULT_KEY,
  OPTIMIZATION_KEY,
  OPTIMIZATION_SELECTION_KEY,
  SCENARIO_KEY,
  readOptimizationResult,
  readOptimizationSelection,
  readScenarioDraft,
  saveHistoryEntry,
  saveLastResult,
  saveOptimizationResult,
  saveOptimizationSelection,
  saveScenarioDraft,
} from "@/lib/storage/history";
import type {
  DemandZone,
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
  capacity: number;
  serviceMinA: number;
  serviceMinB: number;
  valueMu: number;
  valueSigma: number;
  operationCost: number;
  acquisitionPrice: number;
  totalDemandMu: number;
  totalDemandSigma: number;
  serviceDistanceKm: number;
  minSites: number;
  maxSites: number;
}

interface BootstrapData {
  kiosks: Array<{ id: string; nombreSucursal: string; calle: string; cadena: string; latitud: number; longitud: number }>;
  localityPoints: Array<{ id: string; nombre: string; departamento: string; latitud: number; longitud: number; poblacion2022: number; densidad: number; source: string }>;
}

type SidebarTab = "simulation" | "optimization" | "settings";

const baseDraft: Draft = {
  horizonDays: 180,
  capacity: 100,
  serviceMinA: 4,
  serviceMinB: 10,
  valueMu: 120,
  valueSigma: 40,
  operationCost: 22,
  acquisitionPrice: 6500,
  totalDemandMu: 110,
  totalDemandSigma: 18,
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
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [optimizationPct, setOptimizationPct] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; action: "run" | "clear" | null }>({ open: false, action: null });
  const [selectedOptimizationIds, setSelectedOptimizationIds] = useState<string[]>([]);
  const { placeKiosk } = useTucumanKioskPlacement(setKiosks, draft.acquisitionPrice);

  // Hydrate persisted values after mount only â€” reading localStorage during
  // render would make the server and client HTML disagree (hydration error).
  // Setting state here on mount is the intended hydration-safe pattern, so the
  // cascading-render lint rule is deliberately suppressed for these two reads.
  useEffect(() => {
    window.localStorage.removeItem(LAST_RESULT_KEY);
    const stored = readScenarioDraft<Draft>();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setDraft((prev) => ({ ...prev, ...stored }));
    const savedOptimization = readOptimizationResult();
    if (savedOptimization) setOptimization(savedOptimization);
    const savedSelection = readOptimizationSelection();
    if (savedSelection.length > 0) setSelectedOptimizationIds(savedSelection);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
          acquisitionPrice: baseDraft.acquisitionPrice,
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
      return optimization.topScenarios.find((item) => item.selectedKioskIds.join(",") === selectedOptimizationIds.join(",")) ?? optimization.best;
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
    return draft.capacity > 0
      && draft.horizonDays > 0
      && draft.serviceMinA < draft.serviceMinB
      && draft.valueSigma > 0
      && draft.totalDemandMu > 0
      && draft.totalDemandSigma > 0
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
        acquisitionPrice: draft.acquisitionPrice,
        active: selected ? selected.has(kiosk.id) : kiosk.active !== false,
      }))
      .filter((kiosk) => kiosk.active !== false);

    return {
      scenario: "A",
      seed: Date.now(),
      conglomerates: [],
      kiosks: scenarioKiosks,
      demandZones,
      global: {
        capacityMaxDevices: draft.capacity,
        horizonDays: draft.horizonDays,
        confidenceLevel: 0.95,
        warmupDays: 0,
        serviceTime: { kind: "uniform", a: draft.serviceMinA, b: draft.serviceMinB },
        deviceValue: { kind: "normal", mu: draft.valueMu, sigma: draft.valueSigma },
        operationCostPerDevice: draft.operationCost,
        totalDailyDemand: { kind: "normal", mu: draft.totalDemandMu, sigma: draft.totalDemandSigma },
        serviceDistanceKm: draft.serviceDistanceKm,
      },
    };
  }

  function buildOptimizationRequest(): OptimizationRequest {
    return {
      seed: Date.now(),
      kiosks: kiosks.map((kiosk) => ({ ...kiosk, acquisitionPrice: draft.acquisitionPrice, active: true })),
      demandZones,
      global: buildInput().global,
      serviceTime: { kind: "uniform", a: draft.serviceMinA, b: draft.serviceMinB },
      deviceValue: { kind: "normal", mu: draft.valueMu, sigma: draft.valueSigma },
      operationCostPerDevice: draft.operationCost,
      minSites: draft.minSites,
      maxSites: optimizableKioskCount,
      scoreWeights: {
        capturedDemand: 0.35,
        coverage: 0.3,
        balance: 0.2,
        cannibalization: 0.15,
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
            saveHistoryEntry(simResult);
            saveLastResult(simResult);
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
    if (action === "clear") {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(SCENARIO_KEY);
      window.localStorage.removeItem(LAST_RESULT_KEY);
      window.localStorage.removeItem(OPTIMIZATION_KEY);
      window.localStorage.removeItem(OPTIMIZATION_SELECTION_KEY);
      setResult(null);
      setOptimization(null);
      setSelectedOptimizationIds([]);
      setDraft(baseDraft);
    }
  }

  const totalWork = Math.max(1, draft.horizonDays);
  const progressPct = Math.min(100, (Math.min(progressDay, draft.horizonDays) / totalWork) * 100);
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
      <ConfirmModal open={modal.open} title="Estas seguro?" onCancel={() => setModal({ open: false, action: null })} onConfirm={confirm} />
      <ResultModal open={showResultModal} result={result} onClose={() => setShowResultModal(false)} />
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[400px_1fr]">
        <aside className="flex h-screen flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <h1 className="text-xl font-bold">Simulador ecoATM</h1>
          <p className="text-sm text-[var(--text-secondary)]">Voronoi + optimizacion heuristica sobre kioskos CSV y manuales.</p>

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
                  Limpiar historial
                </button>
                <div className="rounded border border-[var(--border)] p-3 text-sm">
                  <p>Candidatos: {kiosks.length}</p>
                  <p>Zonas de demanda: {demandZones.length}</p>
                </div>
              </div>
            )}

            {sidebarTab === "optimization" && (
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">Busqueda de la mejor configuracion factible.</p>
                <button
                  type="button"
                  disabled={!valid || isOptimizing || kiosks.length === 0 || demandZones.length === 0}
                  onClick={() => void runOptimization()}
                  className="w-full rounded bg-[var(--accent)] px-3 py-2 font-semibold text-black disabled:opacity-40"
                >
                  Optimizar red
                </button>
                <div className="rounded border border-[var(--border)] p-3 text-sm">
                  <p>Min kioskos: {draft.minSites}</p>
                  <p>Max kioskos: {optimizableKioskCount}</p>
                </div>
              </div>
            )}

            {sidebarTab === "settings" && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">Parametros compartidos por simulacion y optimizacion.</p>
                <section className="space-y-3 rounded border border-[var(--border)] p-3">
                  <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Parametros base</h2>
                  <NumberField label="Horizonte (dias)" value={draft.horizonDays} min={1} max={3650} onChange={(value) => setDraft({ ...draft, horizonDays: value })} />
                  <NumberField label="Capacidad por kiosko" value={draft.capacity} min={1} max={1000} onChange={(value) => setDraft({ ...draft, capacity: value })} />
                  <NumberField label="Precio por kiosko" value={draft.acquisitionPrice} min={0} max={100000} onChange={(value) => setDraft({ ...draft, acquisitionPrice: value })} />
                  <NumberField label="Distancia servicio (km)" value={draft.serviceDistanceKm} min={1} max={100} onChange={(value) => setDraft({ ...draft, serviceDistanceKm: value })} />
                </section>

                <section className="space-y-3 rounded border border-[var(--border)] p-3">
                  <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Distribuciones</h2>
                  <DistributionField
                    title="Tiempo de servicio"
                    distribution="Uniforme"
                    tooltip="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                  >
                    <NumberField label="Tiempo servicio min A" value={draft.serviceMinA} min={0} max={120} onChange={(value) => setDraft({ ...draft, serviceMinA: value })} disabled />
                    <NumberField label="Tiempo servicio min B" value={draft.serviceMinB} min={draft.serviceMinA + 1} max={240} onChange={(value) => setDraft({ ...draft, serviceMinB: value })} disabled />
                  </DistributionField>
                  <DistributionField
                    title="Valor de dispositivo"
                    distribution="Normal"
                    tooltip="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                  >
                    <NumberField label="Valor mu" value={draft.valueMu} min={0} max={1000} onChange={(value) => setDraft({ ...draft, valueMu: value })} disabled />
                    <NumberField label="Valor sigma" value={draft.valueSigma} min={1} max={1000} onChange={(value) => setDraft({ ...draft, valueSigma: value })} disabled />
                  </DistributionField>
                  <DistributionField
                    title="Demanda total"
                    distribution="Normal"
                    tooltip="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
                  >
                    <NumberField label="Demanda total mu" value={draft.totalDemandMu} min={1} max={10000} onChange={(value) => setDraft({ ...draft, totalDemandMu: value })} disabled />
                    <NumberField label="Demanda total sigma" value={draft.totalDemandSigma} min={1} max={10000} onChange={(value) => setDraft({ ...draft, totalDemandSigma: value })} disabled />
                  </DistributionField>
                  <NumberField label="Costo operativo" value={draft.operationCost} min={0} max={1000} onChange={(value) => setDraft({ ...draft, operationCost: value })} />
                </section>

                <section className="space-y-3 rounded border border-[var(--border)] p-3">
                  <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Restricciones</h2>
                  <NumberField label="Min kioskos" value={draft.minSites} min={1} max={20} onChange={(value) => setDraft({ ...draft, minSites: value })} />
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm">
                    <div className="text-[var(--text-secondary)]">Max kioskos efectivos</div>
                    <div className="mt-1 font-semibold">{optimizableKioskCount}</div>
                  </div>
                </section>
              </div>
            )}
          </div>

          <section className="mt-4 text-sm">
            <p>Candidatos: {kiosks.length}</p>
            <p>Zonas de demanda: {demandZones.length}</p>
          </section>

          {optimization && (
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
        </aside>

        <main className="flex min-h-screen flex-col p-4">
          {activeProgress && (
            <div className="mb-4">
              <ProgressCard title={activeProgress.title} value={activeProgress.value}>
                {activeProgress.body}
              </ProgressCard>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <KioskLeafletMap
              kiosks={kiosks}
              demandZones={demandZones}
              voronoiCells={mapVoronoiCells}
              highlightedKioskIds={activeOptimizationScenario?.selectedKioskIds ?? []}
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
          ? "bg-[var(--btn-active)] text-[var(--text-primary)]"
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

function ResultModal({ open, result, onClose }: { open: boolean; result: SimulationResult | null; onClose: () => void }) {
  if (!open || !result || typeof document === "undefined") return null;
  return createPortal((
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-[var(--text-primary)]">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">Resultado simulacion</h3>
          <button type="button" onClick={onClose} className="rounded-md border border-[var(--border)] px-3 py-1 text-sm">
            Cerrar
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <p>Margen: {result.summary.totalMargin.mean.toFixed(2)}</p>
          <p>Ingresos: {result.summary.totalRevenue.mean.toFixed(2)}</p>
          <p>Amortizacion (dias): {result.summary.amortizationDays.mean.toFixed(0)}</p>
          <p>Factible: {result.summary.feasibleProbability >= 1 ? "Si" : "No"}</p>
          <p>Cobertura: {((result.spatial?.coveredDemandPct ?? 0) * 100).toFixed(1)}%</p>
          <p>Distancia ponderada: {(result.spatial?.weightedDistanceKm ?? 0).toFixed(2)} km</p>
          <p>Balance de carga: {(result.spatial?.loadBalanceScore ?? 0).toFixed(3)}</p>
          <p>Canibalizacion: {((result.spatial?.cannibalizationPct ?? 0) * 100).toFixed(1)}%</p>
        </div>
        {result.warnings.length > 0 && (
          <div className="mt-4 rounded border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            {result.warnings[0]}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

