"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { TUCUMAN_BOUNDS, TUCUMAN_CENTER, TUCUMAN_GEOJSON } from "@/lib/geo/tucuman";
import type { DemandZone, Kiosk, VoronoiCell } from "@/types/simulation";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const cellPalette = [
  "#9CA3AF",
  "#6B7280",
  "#94A3B8",
  "#64748B",
  "#A1A1AA",
  "#71717A",
  "#8B949E",
  "#737373",
  "#9AA0A6",
  "#7C8794",
  "#8A8A8A",
  "#5F6B7A",
];

export function KioskLeafletMap({
  kiosks,
  demandZones,
  voronoiCells,
  highlightedKioskIds,
  focusHighlightedOnly = false,
  highlightColor = "#22C55E",
  onMapClick,
  className,
}: {
  kiosks: Kiosk[];
  demandZones?: DemandZone[];
  voronoiCells?: VoronoiCell[];
  highlightedKioskIds?: string[];
  focusHighlightedOnly?: boolean;
  highlightColor?: string;
  onMapClick: (lat: number, lon: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: TUCUMAN_CENTER,
      zoom: 8,
      scrollWheelZoom: true,
      maxBounds: TUCUMAN_BOUNDS,
      maxBoundsViscosity: 0.7,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.fitBounds(L.geoJSON(TUCUMAN_GEOJSON).getBounds(), { padding: [24, 24] });

    const handleClick = (event: L.LeafletMouseEvent) => onMapClickRef.current(event.latlng.lat, event.latlng.lng);
    map.on("click", handleClick);

    // Leaflet needs a size recalculation once the container is mounted.
    queueMicrotask(() => map.invalidateSize());

    return () => {
      map.off("click", handleClick);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    const highlighted = new Set(highlightedKioskIds ?? []);
    const shouldFocusHighlighted = focusHighlightedOnly && highlighted.size > 0;

    L.geoJSON(TUCUMAN_GEOJSON, {
      style: {
        color: "#7C3AED",
        weight: 1.75,
        fillColor: "#A7F3D0",
        fillOpacity: 0.09,
      },
      interactive: false,
    }).addTo(overlay);

    voronoiCells?.forEach((cell, index) => {
      if (shouldFocusHighlighted && !highlighted.has(cell.kioskId)) return;
      const cellParts = cell.parts?.length ? cell.parts : [cell.points];
      const baseColor = cellPalette[index % cellPalette.length];
      const isHighlighted = highlighted.size === 0 || highlighted.has(cell.kioskId);
      const cellColor = shouldFocusHighlighted ? highlightColor : baseColor;

      for (const part of cellParts) {
        if (part.length < 3) continue;

        L.polygon(
          part.map((point) => [point.lat, point.lon] as [number, number]),
          {
            color: isHighlighted ? cellColor : "#64748B",
            weight: isHighlighted ? 2.75 : 1.25,
            fillColor: isHighlighted ? cellColor : "#CBD5E1",
            fillOpacity: isHighlighted ? 0.22 : 0.08,
          },
        ).addTo(overlay);
      }
    });

    if (!shouldFocusHighlighted) {
      for (const zone of demandZones ?? []) {
      const marker = L.circleMarker([zone.lat, zone.lon], {
        radius: 3,
        color: "#93C5FD",
        fillColor: "#93C5FD",
        fillOpacity: 0.7,
        weight: 1,
      });

      marker.bindTooltip(
        `<div class="text-xs">
          <div class="font-semibold">${zone.nombre}</div>
          <div>${zone.departamento}</div>
          <div>Poblacion: ${zone.population2022.toLocaleString("es-AR")}</div>
        </div>`,
        { direction: "top", offset: [0, -6], opacity: 1, sticky: true },
      );

      marker.addTo(overlay);
    }
    }

    for (const kiosk of kiosks) {
      const isHighlighted = highlighted.size === 0 || highlighted.has(kiosk.id);
      if (shouldFocusHighlighted && !isHighlighted) continue;

      if (shouldFocusHighlighted && isHighlighted) {
        const marker = L.circleMarker([kiosk.lat, kiosk.lon], {
          radius: 8,
          color: highlightColor,
          fillColor: highlightColor,
          fillOpacity: 0.92,
          weight: 2,
        });

        marker.bindTooltip(
          `<div class="text-xs">
            <div class="font-semibold">${kiosk.nombre}</div>
            <div>${kiosk.calle || "Sin calle"}</div>
            <div>Fuente: ${kiosk.source === "manual" ? "Manual" : "CSV"}</div>
            <div>Estado: ${kiosk.active === false ? "Inactivo" : "Activo"}</div>
            <div>Lat: ${kiosk.lat.toFixed(6)}</div>
            <div>Lon: ${kiosk.lon.toFixed(6)}</div>
          </div>`,
          { direction: "top", offset: [0, -12], opacity: 1, sticky: true },
        );

        marker.addTo(overlay);
        continue;
      }

      const marker = L.marker([kiosk.lat, kiosk.lon], {
        icon,
        opacity: kiosk.active === false ? 0.35 : 1,
      });

      marker.bindTooltip(
        `<div class="text-xs">
          <div class="font-semibold">${kiosk.nombre}</div>
          <div>${kiosk.calle || "Sin calle"}</div>
          <div>Fuente: ${kiosk.source === "manual" ? "Manual" : "CSV"}</div>
          <div>Estado: ${kiosk.active === false ? "Inactivo" : "Activo"}</div>
          <div>Lat: ${kiosk.lat.toFixed(6)}</div>
          <div>Lon: ${kiosk.lon.toFixed(6)}</div>
        </div>`,
        { direction: "top", offset: [0, -20], opacity: 1, sticky: true },
      );

      marker.addTo(overlay);
    }
  }, [demandZones, focusHighlightedOnly, highlightColor, highlightedKioskIds, kiosks, voronoiCells]);

  return <div ref={containerRef} className={className ?? "h-[520px] w-full rounded-xl border border-[var(--border)]"} />;
}
