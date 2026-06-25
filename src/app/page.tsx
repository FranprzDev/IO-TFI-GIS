"use client";

import { useCallback, useEffect, useState } from "react";
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

// Coordenadas de Delfín Gallo, Tucumán
const DELFIN_GALLO_BOUNDS: Shape = {
  points: [
    { lat: -26.3400, lon: -65.2700 },
    { lat: -26.3350, lon: -65.2650 },
    { lat: -26.3320, lon: -65.2680 },
    { lat: -26.3380, lon: -65.2720 },
  ],
  color: "#8B5CF6",
};

export default function Home() {
  const [shapes, setShapes] = useState<Shape[]>([DELFIN_GALLO_BOUNDS]);
  const [wells, setWells] = useState<Well[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [wellMode, setWellMode] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setDrawingMode((prev) => {
          if (prev && currentShape && currentShape.points.length > 0) {
            // Guardar la forma actual al desactivar
            setShapes((s) => [...s, currentShape]);
            setCurrentShape(null);
          } else if (!prev) {
            // Crear nueva forma vacía al activar
            setCurrentShape({ points: [], color: generateColor() });
          }
          setWellMode(false);
          return !prev;
        });
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setWellMode((prev) => !prev);
        setDrawingMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentShape]);

  const generateColor = useCallback(() => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
    return colors[Math.floor(Math.random() * colors.length)];
  }, []);

  const handleMapClick = useCallback((lat: number, lon: number) => {
    if (drawingMode && currentShape) {
      if (currentShape.points.length < 20) {
        setCurrentShape({
          ...currentShape,
          points: [...currentShape.points, { lat, lon }],
        });
      }
    } else if (wellMode) {
      setWells((prev) => [
        ...prev,
        { lat, lon, id: `well-${Date.now()}` },
      ]);
    }
  }, [drawingMode, wellMode, currentShape]);

  const clearShapes = useCallback(() => {
    setShapes([DELFIN_GALLO_BOUNDS]);
  }, []);

  const clearWells = useCallback(() => {
    setWells([]);
  }, []);

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
      <GISMap
        shapes={currentShape ? [...shapes, currentShape] : shapes}
        wells={wells}
        onMapClick={handleMapClick}
        className="flex-1"
      />
    </div>
  );
}
