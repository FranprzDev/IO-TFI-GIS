"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { HISTORY_KEY, readHistory, saveHistoryEntry } from "@/lib/storage/history";
import type { Conglomerate, Kiosk, ScenarioInput, ScenarioKey, SimulationResult } from "@/types/simulation";

const DEFAULT_CONGLOMERATES: Conglomerate[] = [
  { id: "cg-1", nombre: "Yerba Buena", departamento: "Yerba Buena", dailyDemand: { kind: "normal", mu: 1000, sigma: 200 }, interestPct: 0.04, operationalHours: 12 },
  { id: "cg-2", nombre: "San Miguel", departamento: "Capital", dailyDemand: { kind: "normal", mu: 1400, sigma: 250 }, interestPct: 0.05, operationalHours: 13 },
];

const TUCUMAN_BOUNDS = { latMin: -28, latMax: -26, lonMin: -66, lonMax: -65 };

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
  const [draftA, setDraftA] = useState<Draft>(baseDraft);
  const [draftB, setDraftB] = useState<Draft>({ ...baseDraft, acquisitionPrice: 7000, operationCost: 25 });
  const [resultA, setResultA] = useState<SimulationResult | null>(null);
  const [resultB, setResultB] = useState<SimulationResult | null>(null);
  const [historyCount, setHistoryCount] = useState(() => readHistory().length);
  const [errors, setErrors] = useState<string[]>([]);
  const [modal, setModal] = useState<{ open: boolean; action: "runA" | "runB" | "compare" | "clear" | null }>({ open: false, action: null });

  useEffect(() => {
    fetch("/api/bootstrap").then((r) => r.json()).then((data) => {
      const first = (data.kiosks ?? []).slice(0, 6).map((k: { nombreSucursal: string; cadena: string; latitud: number; longitud: number }, idx: number): Kiosk => ({
        id: `seed-${idx + 1}`,
        nombre: k.nombreSucursal,
        chain: k.cadena || "Gobierno",
        conglomerateId: idx % 2 === 0 ? "cg-1" : "cg-2",
        lat: k.latitud,
        lon: k.longitud,
        acquisitionPrice: baseDraft.acquisitionPrice,
      }));
      setKiosks(first);
    }).catch(() => undefined);

  }, []);

  const valid = useMemo(() => {
    const d = draftA;
    return d.capacity > 0 && d.horizonDays > 0 && d.replicas > 0 && d.serviceMinA < d.serviceMinB && d.valueSigma > 0;
  }, [draftA]);

  const mapClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    const lat = TUCUMAN_BOUNDS.latMax - y * (TUCUMAN_BOUNDS.latMax - TUCUMAN_BOUNDS.latMin);
    const lon = TUCUMAN_BOUNDS.lonMin + x * (TUCUMAN_BOUNDS.lonMax - TUCUMAN_BOUNDS.lonMin);

    const newKiosk: Kiosk = {
      id: `k-${Date.now()}`,
      nombre: `Kiosko ${kiosks.length + 1}`,
      chain: "Gobierno",
      conglomerateId: kiosks.length % 2 === 0 ? "cg-1" : "cg-2",
      lat,
      lon,
      acquisitionPrice: draftA.acquisitionPrice,
    };

    setKiosks((prev) => [...prev, newKiosk]);
  };

  const buildInput = (scenario: ScenarioKey, d: Draft): ScenarioInput => ({
    scenario,
    seed: Date.now(),
    conglomerates,
    kiosks: kiosks.map((k) => ({ ...k, acquisitionPrice: d.acquisitionPrice })),
    global: {
      capacityMaxDevices: d.capacity,
      horizonDays: d.horizonDays,
      replicas: d.replicas,
      confidenceLevel: 0.95,
      warmupDays: 0,
      serviceTime: { kind: "uniform", a: d.serviceMinA, b: d.serviceMinB },
      deviceValue: { kind: "normal", mu: d.valueMu, sigma: d.valueSigma },
      operationCostPerDevice: d.operationCost,
    },
  });

  const runScenario = async (scenario: ScenarioKey) => {
    const input = buildInput(scenario, scenario === "A" ? draftA : draftB);
    const res = await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const data = await res.json();
    if (!res.ok) {
      setErrors((data.errors ?? []).map((e: { field: string; message: string }) => `${e.field}: ${e.message}`));
      return;
    }
    setErrors([]);
    const result = data.result as SimulationResult;
    saveHistoryEntry(result);
    setHistoryCount(readHistory().length);
    if (scenario === "A") setResultA(result);
    else setResultB(result);
  };

  const compare = () => {
    if (!resultA || !resultB) {
      setErrors(["Primero ejecuta ambos escenarios A y B."]);
      return;
    }
    setErrors([]);
  };

  const winner = useMemo(() => {
    if (!resultA || !resultB) return null;
    return resultA.summary.totalMargin.mean >= resultB.summary.totalMargin.mean ? "A" : "B";
  }, [resultA, resultB]);

  const confirm = () => {
    const action = modal.action;
    setModal({ open: false, action: null });
    if (action === "runA") void runScenario("A");
    if (action === "runB") void runScenario("B");
    if (action === "compare") compare();
    if (action === "clear") {
      window.localStorage.removeItem(HISTORY_KEY);
      setHistoryCount(0);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <ConfirmModal open={modal.open} title="Estas seguro?" onCancel={() => setModal({ open: false, action: null })} onConfirm={confirm} />
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[360px_1fr]">
        <aside className="border-r border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <h1 className="text-xl font-bold">Simulador ecoATM</h1>
          <p className="text-sm text-[var(--text-secondary)]">Escenarios A vs B con historial local.</p>

          <section className="mt-4 space-y-3">
            <h2 className="rounded bg-[var(--btn-active)] px-2 py-1 text-sm">Config</h2>
            <label className="block text-sm">Horizonte (dias)
              <input type="number" min={1} max={3650} value={draftA.horizonDays} onChange={(e) => setDraftA({ ...draftA, horizonDays: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Replicas
              <input type="number" min={1} max={2000} value={draftA.replicas} onChange={(e) => setDraftA({ ...draftA, replicas: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Capacidad global por kiosko
              <input type="number" min={1} max={1000} value={draftA.capacity} onChange={(e) => setDraftA({ ...draftA, capacity: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Precio kiosko (A)
              <input type="number" min={0} step={1} value={draftA.acquisitionPrice} onChange={(e) => setDraftA({ ...draftA, acquisitionPrice: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
            <label className="block text-sm">Precio kiosko (B)
              <input type="number" min={0} step={1} value={draftB.acquisitionPrice} onChange={(e) => setDraftB({ ...draftB, acquisitionPrice: Number(e.target.value) })} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1" required />
            </label>
          </section>

          <section className="mt-4 space-y-2">
            <button type="button" disabled={!valid} onClick={() => setModal({ open: true, action: "runA" })} className="w-full rounded bg-[var(--btn-primary)] px-3 py-2 font-semibold text-black disabled:opacity-40">Ejecutar Simulacion A</button>
            <button type="button" disabled={!valid} onClick={() => setModal({ open: true, action: "runB" })} className="w-full rounded bg-[var(--btn-secondary)] px-3 py-2">Ejecutar Simulacion B</button>
            <button type="button" onClick={() => setModal({ open: true, action: "compare" })} className="w-full rounded bg-[var(--btn-secondary)] px-3 py-2">Comparar</button>
            <button type="button" onClick={() => setModal({ open: true, action: "clear" })} className="w-full rounded border border-[var(--border)] px-3 py-2">Limpiar Historial</button>
          </section>

          <section className="mt-4 text-sm">
            <p>Kioskos: {kiosks.length}</p>
            <p>Historial: {historyCount}</p>
            <p>Umbral operativo: {Math.floor(draftA.capacity * 0.85)} dispositivos</p>
          </section>
        </aside>

        <main className="p-4">
          <div className="mb-4 rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">Click en el mapa para crear kiosko con lat/long.</div>
          <div onClick={mapClick} className="relative h-[420px] w-full cursor-crosshair overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900">
            {kiosks.map((k) => {
              const x = ((k.lon - TUCUMAN_BOUNDS.lonMin) / (TUCUMAN_BOUNDS.lonMax - TUCUMAN_BOUNDS.lonMin)) * 100;
              const y = ((TUCUMAN_BOUNDS.latMax - k.lat) / (TUCUMAN_BOUNDS.latMax - TUCUMAN_BOUNDS.latMin)) * 100;
              return <div key={k.id} title={`${k.nombre} (${k.lat.toFixed(4)}, ${k.lon.toFixed(4)})`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-[var(--accent)]" style={{ left: `${x}%`, top: `${y}%` }} />;
            })}
          </div>

          {errors.length > 0 && (
            <div className="mt-4 rounded border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-200">
              {errors.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ResultCard title="Escenario A" result={resultA} />
            <ResultCard title="Escenario B" result={resultB} />
          </div>

          {winner && (
            <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              Escenario mas rentable segun margen promedio: <strong>{winner}</strong>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ResultCard({ title, result }: { title: string; result: SimulationResult | null }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h3 className="font-semibold">{title}</h3>
      {!result && <p className="mt-2 text-sm text-[var(--text-secondary)]">Sin corrida todavia.</p>}
      {result && (
        <div className="mt-2 space-y-1 text-sm">
          <p>Margen promedio: {result.summary.totalMargin.mean.toFixed(2)}</p>
          <p>IC95 margen: [{result.summary.totalMargin.ci95Lower.toFixed(2)}, {result.summary.totalMargin.ci95Upper.toFixed(2)}]</p>
          <p>Amortizacion promedio (dias): {result.summary.amortizationDays.mean.toFixed(0)}</p>
          <p>Prob. factible: {(result.summary.feasibleProbability * 100).toFixed(1)}%</p>
          {result.warnings.length > 0 && <p className="text-amber-300">{result.warnings[0]}</p>}
        </div>
      )}
    </div>
  );
}
