import type { ScenarioInput } from "../../types/simulation";
import { isWithinTucumanBounds } from "@/lib/geo/tucuman";

export interface ValidationError {
  field: string;
  message: string;
}

const finite = (n: number) => Number.isFinite(n) && !Number.isNaN(n);

export function validateScenario(input: ScenarioInput): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!["A", "B"].includes(input.scenario)) errors.push({ field: "scenario", message: "Escenario debe ser A o B" });
  if (!Number.isInteger(input.seed) || input.seed <= 0) errors.push({ field: "seed", message: "Seed debe ser entero positivo" });

  const g = input.global;
  if (!Number.isInteger(g.horizonDays) || g.horizonDays <= 0) errors.push({ field: "global.horizonDays", message: "Horizonte debe ser entero > 0" });
  if (!finite(g.serviceDistanceKm) || g.serviceDistanceKm <= 0) errors.push({ field: "global.serviceDistanceKm", message: "Distancia de servicio debe ser > 0" });

  if (!finite(g.serviceTime.a) || !finite(g.serviceTime.b) || g.serviceTime.a >= g.serviceTime.b) errors.push({ field: "global.serviceTime", message: "Uniforme servicio requiere a < b" });

  if (input.kiosks.length === 0) errors.push({ field: "kiosks", message: "Debe existir al menos un kiosko" });
  if (input.demandZones.length === 0) errors.push({ field: "demandZones", message: "Debe existir al menos una zona de demanda" });

  for (const k of input.kiosks) {
    if (!k.id) errors.push({ field: `kiosk.${k.nombre}.id`, message: "ID requerido" });
    if (!finite(k.lat) || k.lat < -90 || k.lat > 90) errors.push({ field: `kiosk.${k.id}.lat`, message: "Latitud invalida" });
    if (!finite(k.lon) || k.lon < -180 || k.lon > 180) errors.push({ field: `kiosk.${k.id}.lon`, message: "Longitud invalida" });
    if (finite(k.lat) && finite(k.lon) && !isWithinTucumanBounds(k.lat, k.lon)) errors.push({ field: `kiosk.${k.id}.location`, message: "Kiosko fuera de Tucuman" });
    if (!finite(k.attractivenessWeight) || k.attractivenessWeight <= 0) errors.push({ field: `kiosk.${k.id}.attractivenessWeight`, message: "Atractivo debe ser > 0" });
  }

  for (const zone of input.demandZones) {
    if (!zone.id) errors.push({ field: `demandZone.${zone.nombre}.id`, message: "ID requerido" });
    if (!finite(zone.lat) || zone.lat < -90 || zone.lat > 90) errors.push({ field: `demandZone.${zone.id}.lat`, message: "Latitud invalida" });
    if (!finite(zone.lon) || zone.lon < -180 || zone.lon > 180) errors.push({ field: `demandZone.${zone.id}.lon`, message: "Longitud invalida" });
    if (finite(zone.lat) && finite(zone.lon) && !isWithinTucumanBounds(zone.lat, zone.lon)) errors.push({ field: `demandZone.${zone.id}.location`, message: "Zona fuera de Tucuman" });
    if (!finite(zone.population2022) || zone.population2022 < 0) errors.push({ field: `demandZone.${zone.id}.population2022`, message: "Poblacion invalida" });
    if (!finite(zone.demandWeight) || zone.demandWeight <= 0) errors.push({ field: `demandZone.${zone.id}.demandWeight`, message: "Peso de demanda debe ser > 0" });
  }

  return errors;
}
