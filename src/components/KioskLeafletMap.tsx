"use client";

import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { TUCUMAN_BOUNDS, TUCUMAN_CENTER, TUCUMAN_GEOJSON } from "@/lib/geo/tucuman";
import type { DemandZone, Kiosk, VoronoiCell } from "@/types/simulation";

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export function KioskLeafletMap({
  kiosks,
  demandZones,
  voronoiCells,
  highlightedKioskIds,
  onMapClick,
  className,
}: {
  kiosks: Kiosk[];
  demandZones?: DemandZone[];
  voronoiCells?: VoronoiCell[];
  highlightedKioskIds?: string[];
  onMapClick: (lat: number, lon: number) => void;
  className?: string;
}) {
  const highlighted = new Set(highlightedKioskIds ?? []);
  const [isMounted, setIsMounted] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsMounted(true);
      setMapKey((currentKey) => currentKey + 1);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!isMounted) {
    return <div className={className ?? "h-[520px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]"} />;
  }

  return (
    <MapContainer
      key={mapKey}
      center={TUCUMAN_CENTER}
      zoom={8}
      scrollWheelZoom
      className={className ?? "h-[520px] w-full rounded-xl border border-[var(--border)]"}
      maxBounds={TUCUMAN_BOUNDS}
      maxBoundsViscosity={0.7}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        data={TUCUMAN_GEOJSON}
        style={{ color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.04 }}
        interactive={false}
      />
      {voronoiCells?.map((cell) => (
        cell.points.length >= 3 ? (
          <Polygon
            key={`cell-${cell.kioskId}`}
            positions={cell.points.map((point) => [point.lat, point.lon] as [number, number])}
            pathOptions={{
              color: highlighted.size === 0 || highlighted.has(cell.kioskId) ? "#00E699" : "#4B5563",
              weight: highlighted.has(cell.kioskId) ? 3 : 1.5,
              fillColor: highlighted.size === 0 || highlighted.has(cell.kioskId) ? "#00E699" : "#1F293D",
              fillOpacity: highlighted.has(cell.kioskId) ? 0.18 : 0.08,
            }}
          />
        ) : null
      ))}
      {demandZones?.map((zone) => (
        <CircleMarker
          key={zone.id}
          center={[zone.lat, zone.lon]}
          radius={3}
          pathOptions={{ color: "#93C5FD", fillColor: "#93C5FD", fillOpacity: 0.7, weight: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1}>
            <div className="text-xs">
              <div className="font-semibold">{zone.nombre}</div>
              <div>{zone.departamento}</div>
              <div>Poblacion: {zone.population2022.toLocaleString("es-AR")}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
      <ClickHandler onMapClick={onMapClick} />
      {kiosks.map((k) => (
        <Marker key={k.id} position={[k.lat, k.lon]} icon={icon} opacity={k.active === false ? 0.35 : 1}>
          <Tooltip direction="top" offset={[0, -20]} opacity={1}>
            <div className="text-xs">
              <div className="font-semibold">{k.nombre}</div>
              <div>{k.calle || "Sin calle"}</div>
              <div>Fuente: {k.source === "manual" ? "Manual" : "CSV"}</div>
              <div>Estado: {k.active === false ? "Inactivo" : "Activo"}</div>
              <div>Lat: {k.lat.toFixed(6)}</div>
              <div>Lon: {k.lon.toFixed(6)}</div>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
