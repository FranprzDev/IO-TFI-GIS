"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { HISTORY_KEY, LAST_RESULT_KEY, SCENARIO_KEY, readHistory, readScenarioDraft, saveHistoryEntry, saveLastResult, saveScenarioDraft } from "@/lib/storage/history";
import type { Conglomerate, Kiosk, ScenarioInput, SimulationResult } from "@/types/simulation";

const KioskLeafletMap = dynamic(() => import("@/components/KioskLeafletMap").then((m) => m.KioskLeafletMap), { ssr: false });

const DEFAULT_CONGLOMERATES: Conglomerate[] = [
  { id: "cg-1", nombre: "Yerba Buena", departamento: "Yerba Buena", dailyDemand: { kind: "normal", mu: 1000, sigma: 200 }, interestPct: 0.04, operationalHours: 12 },
  { id: "cg-2", nombre: "San Miguel", departamento: "Capital", dailyDemand: { kind: "normal", mu: 1400, sigma: 250 }, interestPct: 0.05, operationalHours: 13 },
];

interface Draft {
  horizonDays: number;
  replicas: number;
  capacity: number;
  serviceMinA: number;
  serviceMinB: number;
  valueMu: number;
  valueSigma: number;
  operationCost: number;
  acquisitionPrice: number;
}

const baseDraft: Draft = { horizonDays: 180, replicas: 100, capacity: 100, serviceMinA: 4, serviceMinB: 10, valueMu: 120, valueSigma: 40, operationCost: 22, acquisitionPrice: 6500 };

export default function Home() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [conglomerates] = useState<Conglomerate[]>(DEFAULT_CONGLOMERATES);
  const [draft, setDraft] = useState<Draft>(baseDraft);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [progressReplica, setProgressReplica] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; action: "run" | "clear" | null }>({ open: false, action: null });

  useEffect(() => {
    const savedDraft = readScenarioDraft<Draft>();
    if (savedDraft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(savedDraft);
    }
    // Purge any legacy result that may contain the full replicas array (pre-fix).
    // We no longer restore the last result on mount — it only makes sense after a fresh run.
    window.localStorage.removeItem(LAST_RESULT_KEY);
    setHistoryCount(readHistory().length);
  }, []);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((data) => {
        const all = (data.kiosks ?? []).map((k: { nombreSucursal: string; calle: string; cadena: string; latitud: number; longitud: number }, idx: number): Kiosk => ({
          id: `csv-${idx + 1}`,
          nombre: k.nombreSucursal,
          calle: k.calle || "",
          chain: k.cadena || "Gobierno",
          conglomerateId: idx % 2 === 0 ? "cg-1" : "cg-2",
          lat: k.latitud,
          lon: k.longitud,
          acquisitionPrice: draft.acquisitionPrice,
        }));
        setKiosks(all);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    saveScenarioDraft(draft);
  }, [draft]);

  const valid = useMemo(() => {
    return draft.capacity > 0 && draft.horizonDays > 0 && draft.replicas > 0 && draft.serviceMinA < draft.serviceMinB && draft.valueSigma > 0;
  }, [draft]);

  const onMapClick = useCallback((lat: number, lon: number) => {
    const newKiosk: Kiosk = {
      id: `k-${Date.now()}`,
      nombre: `Kiosko manual ${kiosks.length + 1}`,
      calle: "Punto manual",
      chain: "Gobierno",
      conglomerateId: kiosks.length % 2 === 0 ? "cg-1" : "cg-2",
      lat,
      lon,
      acquisitionPrice: draft.acquisitionPrice,
    };
    setKiosks((prev) => [...prev, newKiosk]);
  }, [kiosks.length, draft.acquisitionPrice]);

  const buildInput = (): ScenarioInput => ({
    scenario: "A",
    seed: Date.now(),
    conglomerates,
    kiosks: kiosks.map((k) => ({ ...k, acquisitionPrice: draft.acquisitionPrice })),
    global: {
      capacityMaxDevices: draft.capacity,
      horizonDays: draft.horizonDays,
      replicas: draft.replicas,
      confidenceLevel: 0.95,
      warmupDays: 0,
      serviceTime: { kind: "uniform", a: draft.serviceMinA, b: draft.serviceMinB },
      deviceValue: { kind: "normal", mu: draft.valueMu, sigma: draft.valueSigma },
      operationCostPerDevice: draft.operationCost,
    },
  });

  const runSimulation = async () => {
    const input = buildInput();
    setIsRunning(true);
    setProgressDay(0);
    setProgressReplica(0);
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
          typeof e === "string" ? e : `${e.field}: ${e.message}`
        ));
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
            setProgressReplica(data.replica as number);
            setProgressDay(data.day as number);
          } else if (event === "result" && data.ok) {
            const simResult = data.result as SimulationResult;
            saveHistoryEntry(simResult);
            saveLastResult(simResult);
            setHistoryCount(readHistory().length);
            setResult(simResult);
            setProgressReplica(input.global.replicas);
            setProgressDay(input.global.horizonDays);
            setShowResultModal(true);
          } else if (event === "error") {
            setErrors([data.message as string]);
          }
        }
      }
    } catch (err) {
      setErrors([String(err)]);
    } finally {
      setTimeout(() => setIsRunning(false), 250);
    }
  };

  const confirm = () => {
    const action = modal.action;
    console.log(`[sim] confirm() accion=${action}`);
    setModal({ open: false, action: null });
    if (action === "run") void runSimulation();
    if (action === "clear") {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(SCENARIO_KEY);
      window.localStorage.removeItem(LAST_RESULT_KEY);
      setHistoryCount(0);
      setResult(null);
      setDraft(baseDraft);
    }
  };

  const totalWork = Math.max(1, draft.replicas * draft.horizonDays);
  const completedWork = Math.max(
    0,
    Math.min(totalWork, Math.max(0, progressReplica - 1) * Math.max(1, draft.horizonDays) + Math.min(progressDay, draft.horizonDays)),
  );
  const progressPct = Math.min(100, (completedWork / totalWork) * 100);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ConfirmModal open={modal.open} title="Estas seguro?" onCancel={() => setModal({ open: false, action: null })} onConfirm={confirm} />
      <ResultModal open={showResultModal} result={result} onClose={() => setShowResultModal(false)} />
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[360px_1fr]">
        <aside className="border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <h1 className="text-xl font-bold">Simulador ecoATM</h1>
          <p className="text-sm text-[var(--text-secondary)]">Tucuman - kioscos integrados desde CSV.</p>

          <section className="mt-4 space-y-3">
            <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Config</h2>
            <label className="block text-sm">Horizonte (dias)
              <input type="number" min={1} max={3650} value={draft.horizonDays} onChange={(e) => setDraft({ ...draft, horizonDays: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Replicas
              <input type="number" min={1} max={2000} value={draft.replicas} onChange={(e) => setDraft({ ...draft, replicas: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Capacidad global por kiosko
              <input type="number" min={1} max={1000} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Precio por kiosko
              <input type="number" min={0} step={1} value={draft.acquisitionPrice} onChange={(e) => setDraft({ ...draft, acquisitionPrice: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
          </section>

          <section className="mt-4 space-y-2">
            <button type="button" disabled={!valid || isRunning} onClick={() => setModal({ open: true, action: "run" })} className="w-full rounded bg-[var(--btn-primary)] px-3 py-2 font-semibold text-black disabled:opacity-40">Ejecutar simulacion</button>
            <button type="button" onClick={() => setModal({ open: true, action: "clear" })} className="w-full rounded border border-[var(--border)] px-3 py-2">Limpiar historial</button>
          </section>

          <section className="mt-4 text-sm">
            <p>Kioskos (CSV + manuales): {kiosks.length}</p>
            <p>Historial: {historyCount}</p>
            <p>Umbral operativo: {Math.floor(draft.capacity * 0.85)} dispositivos</p>
          </section>
        </aside>

        <main className="flex min-h-screen flex-col p-4">
          <div className="mb-4 rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Progreso de simulacion (dias reales)</span>
              <span className="font-mono text-[var(--text-primary)]">
                Dia {Math.min(progressDay, draft.horizonDays)} / {draft.horizonDays} | Replica {Math.min(progressReplica, draft.replicas)} / {draft.replicas} | {progressPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded bg-[var(--btn-secondary)]">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-100"
                style={{
                  width: `${progressPct}%`,
                }}
              />
            </div>
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              {isRunning ? "Ejecutando simulacion..." : "Listo para ejecutar"}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <KioskLeafletMap kiosks={kiosks} onMapClick={onMapClick} className="h-full w-full rounded-xl border border-[var(--border)]" />
          </div>

          {errors.length > 0 && (
            <div className="mt-4 rounded border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
              {errors.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
        </main>
      </div>
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
        <div className="mt-4 space-y-2 text-sm">
          <p>Margen promedio: {result.summary.totalMargin.mean.toFixed(2)}</p>
          <p>IC95 margen: [{result.summary.totalMargin.ci95Lower.toFixed(2)}, {result.summary.totalMargin.ci95Upper.toFixed(2)}]</p>
          <p>Amortizacion promedio (dias): {result.summary.amortizationDays.mean.toFixed(0)}</p>
          <p>Prob. factible: {(result.summary.feasibleProbability * 100).toFixed(1)}%</p>
          {result.warnings.length > 0 && <p className="text-amber-300">{result.warnings[0]}</p>}
        </div>
      </div>
    </div>
  );
}
