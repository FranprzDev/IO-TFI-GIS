"use client";

import { MapContainer, Marker, Rectangle, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { TUCUMAN_BOUNDS, TUCUMAN_CENTER } from "@/lib/geo/tucuman";
import type { Kiosk } from "@/types/simulation";

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
  onMapClick,
  className,
}: {
  kiosks: Kiosk[];
  onMapClick: (lat: number, lon: number) => void;
  className?: string;
}) {
  return (
    <MapContainer
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
      <Rectangle
        bounds={TUCUMAN_BOUNDS}
        pathOptions={{ color: "#dc2626", weight: 2, fillColor: "#dc2626", fillOpacity: 0.04 }}
        interactive={false}
      />
      <ClickHandler onMapClick={onMapClick} />
      {kiosks.map((k) => (
        <Marker key={k.id} position={[k.lat, k.lon]} icon={icon}>
          <Tooltip direction="top" offset={[0, -20]} opacity={1}>
            <div className="text-xs">
              <div className="font-semibold">{k.nombre}</div>
              <div>{k.calle || "Sin calle"}</div>
              <div>Lat: {k.lat.toFixed(6)}</div>
              <div>Lon: {k.lon.toFixed(6)}</div>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
