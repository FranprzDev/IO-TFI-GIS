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
  if (!Number.isInteger(g.capacityMaxDevices) || g.capacityMaxDevices <= 0) errors.push({ field: "global.capacityMaxDevices", message: "Capacidad debe ser entero > 0" });
  if (!Number.isInteger(g.horizonDays) || g.horizonDays <= 0) errors.push({ field: "global.horizonDays", message: "Horizonte debe ser entero > 0" });
  if (!Number.isInteger(g.replicas) || g.replicas <= 0) errors.push({ field: "global.replicas", message: "Replicas debe ser entero > 0" });
  if (!finite(g.confidenceLevel) || g.confidenceLevel <= 0 || g.confidenceLevel >= 1) errors.push({ field: "global.confidenceLevel", message: "Nivel de confianza debe estar entre 0 y 1" });
  if (!Number.isInteger(g.warmupDays) || g.warmupDays < 0) errors.push({ field: "global.warmupDays", message: "Warm-up debe ser entero >= 0" });
  if (!finite(g.operationCostPerDevice) || g.operationCostPerDevice < 0) errors.push({ field: "global.operationCostPerDevice", message: "Costo por dispositivo debe ser >= 0" });

  if (!finite(g.serviceTime.a) || !finite(g.serviceTime.b) || g.serviceTime.a >= g.serviceTime.b) errors.push({ field: "global.serviceTime", message: "Uniforme servicio requiere a < b" });
  if (!finite(g.deviceValue.mu) || !finite(g.deviceValue.sigma) || g.deviceValue.sigma <= 0) errors.push({ field: "global.deviceValue", message: "Normal valor requiere sigma > 0" });

  if (input.conglomerates.length === 0) errors.push({ field: "conglomerates", message: "Debe existir al menos un conglomerado" });
  if (input.kiosks.length === 0) errors.push({ field: "kiosks", message: "Debe existir al menos un kiosko" });

  for (const c of input.conglomerates) {
    if (!c.id) errors.push({ field: `conglomerate.${c.nombre}.id`, message: "ID requerido" });
    if (!finite(c.dailyDemand.mu)) errors.push({ field: `conglomerate.${c.id}.mu`, message: "Mu invalido" });
    if (!finite(c.dailyDemand.sigma) || c.dailyDemand.sigma <= 0) errors.push({ field: `conglomerate.${c.id}.sigma`, message: "Sigma debe ser > 0" });
    if (!finite(c.interestPct) || c.interestPct < 0 || c.interestPct > 1) errors.push({ field: `conglomerate.${c.id}.interestPct`, message: "Porcentaje interes entre 0 y 1" });
    if (!finite(c.operationalHours) || c.operationalHours <= 0 || c.operationalHours > 24) errors.push({ field: `conglomerate.${c.id}.operationalHours`, message: "Horario operativo invalido" });
  }

  for (const k of input.kiosks) {
    if (!k.id) errors.push({ field: `kiosk.${k.nombre}.id`, message: "ID requerido" });
    if (!finite(k.lat) || k.lat < -90 || k.lat > 90) errors.push({ field: `kiosk.${k.id}.lat`, message: "Latitud invalida" });
    if (!finite(k.lon) || k.lon < -180 || k.lon > 180) errors.push({ field: `kiosk.${k.id}.lon`, message: "Longitud invalida" });
    if (finite(k.lat) && finite(k.lon) && !isWithinTucumanBounds(k.lat, k.lon)) errors.push({ field: `kiosk.${k.id}.location`, message: "Kiosko fuera de Tucuman" });
    if (!finite(k.acquisitionPrice) || k.acquisitionPrice < 0) errors.push({ field: `kiosk.${k.id}.acquisitionPrice`, message: "Precio invalido" });
  }

  return errors;
}
