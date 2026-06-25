"use client";

import { useEffect, useState } from "react";
import { GISMap } from "@/components/KioskLeafletMap";

interface Shape {
  points: Array<{ lat: number; lon: number }>;
  color?: string;
}

interface Well {
  lat: number;
  lon: number;
  id: string;
}

// Coordenadas de Delfín Gallo (aproximadas)
const DELFIN_GALLO_BOUNDS: Shape = {
  points: [
    { lat: -26.3, lon: -65.2 },
    { lat: -26.35, lon: -65.2 },
    { lat: -26.35, lon: -65.15 },
    { lat: -26.3, lon: -65.15 },
  ],
  color: "#8B5CF6",
};

export default function Home() {
  const [shapes, setShapes] = useState<Shape[]>([DELFIN_GALLO_BOUNDS]);
  const [wells, setWells] = useState<Well[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [wellMode, setWellMode] = useState(false);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") {
        setDrawingMode((prev) => !prev);
        setWellMode(false);
      } else if (e.key.toLowerCase() === "p") {
        setWellMode((prev) => !prev);
        setDrawingMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  const handleMapClick = (lat: number, lon: number) => {
    if (drawingMode) {
      setShapes((prev) => {
        const lastShape = prev[prev.length - 1];
        if (lastShape && (!lastShape.points || lastShape.points.length < 20)) {
          return [
            ...prev.slice(0, -1),
            { ...lastShape, points: [...(lastShape.points || []), { lat, lon }] },
          ];
        }
        return [...prev, { points: [{ lat, lon }], color: generateColor() }];
      });
    } else if (wellMode) {
      setWells((prev) => [
        ...prev,
        { lat, lon, id: `well-${Date.now()}` },
      ]);
    }
  };

  const generateColor = () => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const clearShapes = () => setShapes([]);
  const clearWells = () => setWells([]);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <div>
          <h1 className="text-xl font-bold">GIS Map - Dibujar Formas y Pozos</h1>
          <div className="mt-1 flex gap-4 text-xs">
            <p className="text-[var(--text-secondary)]">
              <kbd className="rounded bg-[var(--btn-secondary)] px-2 py-0.5">M</kbd> Formas
              {drawingMode && <span className="ml-2 animate-pulse text-emerald-400">● Activo</span>}
            </p>
            <p className="text-[var(--text-secondary)]">
              <kbd className="rounded bg-[var(--btn-secondary)] px-2 py-0.5">P</kbd> Pozos
              {wellMode && <span className="ml-2 animate-pulse text-emerald-400">● Activo</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="text-sm text-[var(--text-secondary)]">
            Formas: {shapes.length} | Pozos: {wells.length}
          </span>
          <button
            onClick={clearShapes}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--btn-secondary)]"
          >
            Limpiar formas
          </button>
          <button
            onClick={clearWells}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--btn-secondary)]"
          >
            Limpiar pozos
          </button>
        </div>
      </div>
      <GISMap shapes={shapes} wells={wells} onMapClick={handleMapClick} className="flex-1" />
    </div>
  );
}
