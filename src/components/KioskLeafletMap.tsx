"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { TUCUMAN_BOUNDS, TUCUMAN_CENTER, TUCUMAN_GEOJSON } from "@/lib/geo/tucuman";

interface Shape {
  points: Array<{ lat: number; lon: number }>;
  color?: string;
}

export function GISMap({
  shapes = [],
  onMapClick,
  className,
}: {
  shapes?: Shape[];
  onMapClick?: (lat: number, lon: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: TUCUMAN_CENTER,
      zoom: 8,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      maxBounds: TUCUMAN_BOUNDS,
      maxBoundsViscosity: 0.7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.fitBounds(L.geoJSON(TUCUMAN_GEOJSON).getBounds(), { padding: [24, 24] });

    if (onMapClick) {
      const handleClick = (event: L.LeafletMouseEvent) => onMapClick(event.latlng.lat, event.latlng.lng);
      map.on("click", handleClick);
      return () => {
        map.off("click", handleClick);
        map.remove();
        mapRef.current = null;
        overlayRef.current = null;
      };
    }

    queueMicrotask(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, [onMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    L.geoJSON(TUCUMAN_GEOJSON, {
      style: {
        color: "#7C3AED",
        weight: 1.75,
        fillColor: "#A7F3D0",
        fillOpacity: 0.09,
      },
      interactive: false,
    }).addTo(overlay);

    shapes.forEach((shape, index) => {
      const color = shape.color || "#3B82F6";
      if (shape.points.length < 3) return;

      L.polygon(
        shape.points.map((point) => [point.lat, point.lon] as [number, number]),
        {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.2,
        },
      ).addTo(overlay);
    });
  }, [shapes]);

  return <div ref={containerRef} className={className ?? "h-screen w-full rounded-xl border border-[var(--border)]"} />;
}
