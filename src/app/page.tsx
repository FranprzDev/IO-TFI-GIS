"use client";

import { useState } from "react";
import { GISMap } from "@/components/KioskLeafletMap";

interface Shape {
  points: Array<{ lat: number; lon: number }>;
  color?: string;
}

export default function Home() {
  const [shapes, setShapes] = useState<Shape[]>([]);

  const handleMapClick = (lat: number, lon: number) => {
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
  };

  const generateColor = () => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const clearShapes = () => setShapes([]);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h1 className="text-xl font-bold">GIS Map - Dibujar Formas</h1>
        <div className="flex gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Formas: {shapes.length}</span>
          <button
            onClick={clearShapes}
            className="rounded border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--btn-secondary)]"
          >
            Limpiar
          </button>
        </div>
      </div>
      <GISMap shapes={shapes} onMapClick={handleMapClick} className="flex-1" />
    </div>
  );
}
