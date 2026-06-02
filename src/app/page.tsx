"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useTucumanKioskPlacement } from "@/hooks/useTucumanKioskPlacement";
import { HISTORY_KEY, LAST_RESULT_KEY, SCENARIO_KEY, readHistory, readScenarioDraft, saveHistoryEntry, saveLastResult, saveScenarioDraft } from "@/lib/storage/history";
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
  budgetCap: number;
}

interface BootstrapData {
  kiosks: Array<{ id: string; nombreSucursal: string; calle: string; cadena: string; latitud: number; longitud: number }>;
  localityPoints: Array<{ id: string; nombre: string; departamento: string; latitud: number; longitud: number; poblacion2022: number; densidad: number; source: string }>;
}

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
  budgetCap: 0,
};

function toDemandWeight(population2022: number, density: number) {
  const densityBoost = Math.min(1.25, 1 + Math.min(1, density / 5000) * 0.25);
  return Math.max(1, population2022 * densityBoost);
}

export default function Home() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [demandZones, setDemandZones] = useState<DemandZone[]>([]);
  const [draft, setDraft] = useState<Draft>(baseDraft);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [optimizationPct, setOptimizationPct] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; action: "run" | "clear" | "optimize" | null }>({ open: false, action: null });
  const [selectedOptimizationIds, setSelectedOptimizationIds] = useState<string[]>([]);
  const { placeKiosk } = useTucumanKioskPlacement(setKiosks, draft.acquisitionPrice);

  // Hydrate persisted values after mount only — reading localStorage during
  // render would make the server and client HTML disagree (hydration error).
  // Setting state here on mount is the intended hydration-safe pattern, so the
  // cascading-render lint rule is deliberately suppressed for these two reads.
  useEffect(() => {
    window.localStorage.removeItem(LAST_RESULT_KEY);
    const stored = readScenarioDraft<Draft>();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setDraft((prev) => ({ ...prev, ...stored }));
    setHistoryCount(readHistory().length);
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
  const mapVoronoiCells: VoronoiCell[] = useMemo(() => {
    if (optimization?.best?.simulation.spatial && selectedOptimizationIds.length > 0) {
      const scenario = optimization.topScenarios.find((item) => item.selectedKioskIds.join(",") === selectedOptimizationIds.join(","));
      return scenario?.simulation.spatial?.voronoiCells ?? optimization.best.simulation.spatial.voronoiCells;
    }
    return result?.spatial?.voronoiCells ?? optimization?.best.simulation.spatial?.voronoiCells ?? [];
  }, [optimization, result, selectedOptimizationIds]);

  const valid = useMemo(() => {
    return draft.capacity > 0
      && draft.horizonDays > 0
      && draft.serviceMinA < draft.serviceMinB
      && draft.valueSigma > 0
      && draft.totalDemandMu > 0
      && draft.totalDemandSigma > 0
      && draft.serviceDistanceKm > 0
      && draft.minSites > 0
      && draft.maxSites >= draft.minSites;
  }, [draft]);

  const onMapClick = (lat: number, lon: number) => {
    const placed = placeKiosk(lat, lon);
    if (!placed) {
      toast.error("No puedes poner un kiosco afuera de Tucumán", {
        description: "Cada marcador es un kiosco y debe quedar dentro de los límites de la provincia.",
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
      maxSites: draft.maxSites,
      budgetCap: draft.budgetCap > 0 ? draft.budgetCap : null,
      scoreWeights: {
        margin: 0.3,
        capturedDemand: 0.2,
        coverage: 0.2,
        balance: 0.15,
        cannibalization: 0.15,
      },
    };
  }

  function applyOptimizedScenario(summary: OptimizationScenarioSummary) {
    const selected = new Set(summary.selectedKioskIds);
    setSelectedOptimizationIds(summary.selectedKioskIds);
    setKiosks((prev) => prev.map((kiosk) => ({ ...kiosk, active: selected.has(kiosk.id) })));
    setResult(summary.simulation);
    setShowResultModal(true);
  }

  async function runSimulation() {
    const input = buildInput();
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
            setHistoryCount(readHistory().length);
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
            applyOptimizedScenario(optimizationResult.best);
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
      window.localStorage.removeItem(LAST_RESULT_KEY);
      setHistoryCount(0);
      setResult(null);
      setOptimization(null);
      setSelectedOptimizationIds([]);
      setDraft(baseDraft);
    }
  }

  const totalWork = Math.max(1, draft.horizonDays);
  const progressPct = Math.min(100, (Math.min(progressDay, draft.horizonDays) / totalWork) * 100);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ConfirmModal open={modal.open} title="Estas seguro?" onCancel={() => setModal({ open: false, action: null })} onConfirm={confirm} />
      <ResultModal open={showResultModal} result={result} onClose={() => setShowResultModal(false)} />
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[400px_1fr]">
        <aside className="border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <h1 className="text-xl font-bold">Simulador ecoATM</h1>
          <p className="text-sm text-[var(--text-secondary)]">Voronoi + optimizacion heuristica sobre kioskos CSV y manuales.</p>

          <section className="mt-4 space-y-3">
            <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Simulacion</h2>
            <NumberField label="Horizonte (dias)" value={draft.horizonDays} min={1} max={3650} onChange={(value) => setDraft({ ...draft, horizonDays: value })} />
            <NumberField label="Capacidad por kiosko" value={draft.capacity} min={1} max={1000} onChange={(value) => setDraft({ ...draft, capacity: value })} />
            <NumberField label="Precio por kiosko" value={draft.acquisitionPrice} min={0} max={100000} onChange={(value) => setDraft({ ...draft, acquisitionPrice: value })} />
            <NumberField label="Distancia servicio (km)" value={draft.serviceDistanceKm} min={1} max={100} onChange={(value) => setDraft({ ...draft, serviceDistanceKm: value })} />
          </section>

          <section className="mt-4 space-y-3">
            <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Optimizacion</h2>
            <NumberField label="Min kioskos" value={draft.minSites} min={1} max={20} onChange={(value) => setDraft({ ...draft, minSites: value })} />
            <NumberField label="Max kioskos" value={draft.maxSites} min={draft.minSites} max={20} onChange={(value) => setDraft({ ...draft, maxSites: value })} />
            <NumberField label="Budget cap" value={draft.budgetCap} min={0} max={10000000} onChange={(value) => setDraft({ ...draft, budgetCap: value })} />
            <p className="text-xs text-[var(--text-secondary)]">Score balanceado: margen 30%, demanda capturada 20%, cobertura 20%, balance 15%, canibalizacion 15%.</p>
          </section>

          <section className="mt-4 space-y-2">
            <button type="button" disabled={!valid || isRunning || activeKiosks.length === 0} onClick={() => setModal({ open: true, action: "run" })} className="w-full rounded bg-[var(--btn-primary)] px-3 py-2 font-semibold text-black disabled:opacity-40">
              Ejecutar simulacion
            </button>
            <button type="button" disabled={!valid || isOptimizing || kiosks.length === 0 || demandZones.length === 0} onClick={() => setModal({ open: true, action: "optimize" })} className="w-full rounded bg-[var(--accent)] px-3 py-2 font-semibold text-black disabled:opacity-40">
              Optimizar red
            </button>
            <button type="button" onClick={() => setModal({ open: true, action: "clear" })} className="w-full rounded border border-[var(--border)] px-3 py-2">
              Limpiar historial
            </button>
          </section>

          <section className="mt-4 text-sm">
            <p>Candidatos: {kiosks.length}</p>
            <p>Activos: {activeKiosks.length}</p>
            <p>Zonas de demanda: {demandZones.length}</p>
            <p>Historial: {historyCount}</p>
            <p>Umbral operativo: {Math.floor(draft.capacity * 0.85)} dispositivos</p>
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
                    <span>#{index + 1} - {scenario.selectedKioskIds.length} kioskos</span>
                    <span>{scenario.score.toFixed(3)}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    Margen {scenario.simulation.summary.totalMargin.mean.toFixed(0)} | Cobertura {(((scenario.simulation.spatial?.coveredDemandPct ?? 0) * 100)).toFixed(1)}%
                  </div>
                </button>
              ))}
            </section>
          )}
        </aside>

        <main className="flex min-h-screen flex-col p-4">
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <ProgressCard
              title="Simulacion"
              subtitle={isRunning ? "Ejecutando simulacion..." : "Listo para ejecutar"}
              value={`${progressPct.toFixed(1)}%`}
            >
              Dia {Math.min(progressDay, draft.horizonDays)} / {draft.horizonDays}
              <ProgressBar pct={progressPct} />
            </ProgressCard>
            <ProgressCard
              title="Optimizacion"
              subtitle={isOptimizing ? "Buscando mejor configuracion..." : "Sin optimizacion en curso"}
              value={`${optimizationPct.toFixed(0)}%`}
            >
              Mejor escenario actual: {optimization?.best.selectedKioskIds.length ?? 0} kioskos
              <ProgressBar pct={optimizationPct} />
            </ProgressCard>
          </div>

          <div className="min-h-0 flex-1">
            <KioskLeafletMap
              kiosks={kiosks}
              demandZones={demandZones}
              voronoiCells={mapVoronoiCells}
              highlightedKioskIds={selectedOptimizationIds}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1"
        required
      />
    </label>
  );
}

function ProgressCard({
  title,
  subtitle,
  value,
  children,
}: {
  title: string;
  subtitle: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{title}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="text-xs text-[var(--text-secondary)]">{subtitle}</div>
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
  if (!open || !result) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
  );
}
