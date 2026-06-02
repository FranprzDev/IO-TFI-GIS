import proj4 from "proj4";
import { Delaunay } from "d3-delaunay";
import type { DemandZone, GeoPoint, Kiosk, SpatialAssignment, SpatialMetrics, VoronoiCell } from "@/types/simulation";

const WGS84 = "EPSG:4326";
const UTM_20S = "EPSG:32720";
const TUCUMAN_BOUNDS = {
  south: -28.2,
  west: -66.2,
  north: -25.8,
  east: -64.8,
};

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface KioskDemandSummary {
  kioskId: string;
  assignedDemand: number;
  effectiveDemand: number;
  assignmentCount: number;
}

export interface SpatialSnapshot extends SpatialMetrics {
  demandByKiosk: Record<string, KioskDemandSummary>;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sa = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(sa));
}

export function projectLatLon(lat: number, lon: number): ProjectedPoint {
  const [x, y] = proj4(WGS84, UTM_20S, [lon, lat]);
  return { x, y };
}

export function unprojectPoint(point: ProjectedPoint): GeoPoint {
  const [lon, lat] = proj4(UTM_20S, WGS84, [point.x, point.y]);
  return { lat, lon };
}

function getProjectedBounds() {
  const sw = projectLatLon(TUCUMAN_BOUNDS.south, TUCUMAN_BOUNDS.west);
  const ne = projectLatLon(TUCUMAN_BOUNDS.north, TUCUMAN_BOUNDS.east);
  return {
    minX: Math.min(sw.x, ne.x),
    minY: Math.min(sw.y, ne.y),
    maxX: Math.max(sw.x, ne.x),
    maxY: Math.max(sw.y, ne.y),
  };
}

function toDemandWeight(zone: DemandZone): number {
  return Math.max(1, zone.demandWeight);
}

export function buildSpatialSnapshot(
  kiosks: Kiosk[],
  demandZones: DemandZone[],
  serviceDistanceKm: number,
): SpatialSnapshot {
  const activeKiosks = kiosks.filter((k) => k.active !== false);
  if (activeKiosks.length === 0 || demandZones.length === 0) {
    return {
      weightedDistanceKm: 0,
      coveredDemandPct: 0,
      capturedDemand: 0,
      loadBalanceScore: 0,
      cannibalizationPct: 0,
      incrementalDemandPct: 0,
      assignments: [],
      voronoiCells: [],
      demandByKiosk: {},
    };
  }

  const projectedKiosks = activeKiosks.map((k) => ({
    kiosk: k,
    projected: projectLatLon(k.lat, k.lon),
  }));

  const projectedDemandZones = demandZones.map((zone) => ({
    zone,
    projected: projectLatLon(zone.lat, zone.lon),
  }));

  const delaunay = Delaunay.from(projectedKiosks, (d) => d.projected.x, (d) => d.projected.y);
  const bounds = getProjectedBounds();
  const voronoi = delaunay.voronoi([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]);

  const assignments: SpatialAssignment[] = [];
  const demandByKiosk = new Map<string, KioskDemandSummary>();
  let totalWeight = 0;
  let coveredWeight = 0;
  let weightedDistanceKm = 0;
  let contestedWeight = 0;

  for (const { zone } of projectedDemandZones) {
    totalWeight += toDemandWeight(zone);
  }

  for (const { zone, projected } of projectedDemandZones) {
    const nearestIndex = delaunay.find(projected.x, projected.y);
    const nearest = projectedKiosks[nearestIndex];
    const distanceKm = haversineKm({ lat: zone.lat, lon: zone.lon }, { lat: nearest.kiosk.lat, lon: nearest.kiosk.lon });
    const weight = toDemandWeight(zone);
    const secondNearestDistanceKm = projectedKiosks
      .filter((_, index) => index !== nearestIndex)
      .map(({ kiosk }) => haversineKm({ lat: zone.lat, lon: zone.lon }, { lat: kiosk.lat, lon: kiosk.lon }))
      .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;

    assignments.push({
      demandZoneId: zone.id,
      kioskId: nearest.kiosk.id,
      distanceKm,
      demandWeight: weight,
    });

    weightedDistanceKm += distanceKm * weight;
    if (distanceKm <= serviceDistanceKm) coveredWeight += weight;
    if (secondNearestDistanceKm <= distanceKm * 1.35 || (secondNearestDistanceKm - distanceKm) <= 1.5) {
      contestedWeight += weight;
    }

    const current = demandByKiosk.get(nearest.kiosk.id) ?? {
      kioskId: nearest.kiosk.id,
      assignedDemand: 0,
      effectiveDemand: 0,
      assignmentCount: 0,
    };
    current.assignedDemand += weight;
    current.effectiveDemand += weight * nearest.kiosk.attractivenessWeight;
    current.assignmentCount += 1;
    demandByKiosk.set(nearest.kiosk.id, current);
  }

  const kioskDemandList = activeKiosks.map((k) => demandByKiosk.get(k.id)?.effectiveDemand ?? 0);
  const meanDemand = kioskDemandList.reduce((sum, value) => sum + value, 0) / Math.max(1, kioskDemandList.length);
  const demandVariance = kioskDemandList.reduce((sum, value) => sum + (value - meanDemand) ** 2, 0) / Math.max(1, kioskDemandList.length);
  const demandStdDev = Math.sqrt(demandVariance);
  const loadBalanceScore = meanDemand > 0 ? Math.max(0, 1 - (demandStdDev / meanDemand)) : 0;

  const voronoiCells: VoronoiCell[] = activeKiosks.map((kiosk, index) => {
    const polygon = voronoi.cellPolygon(index) ?? [];
    const points = polygon
      .filter((point): point is [number, number] => Array.isArray(point) && point.length === 2)
      .map(([x, y]) => unprojectPoint({ x, y }));
    return { kioskId: kiosk.id, points };
  });

  return {
    weightedDistanceKm: totalWeight > 0 ? weightedDistanceKm / totalWeight : 0,
    coveredDemandPct: totalWeight > 0 ? coveredWeight / totalWeight : 0,
    capturedDemand: totalWeight,
    loadBalanceScore,
    cannibalizationPct: totalWeight > 0 ? contestedWeight / totalWeight : 0,
    incrementalDemandPct: totalWeight > 0 ? 1 - (contestedWeight / totalWeight) : 0,
    assignments,
    voronoiCells,
    demandByKiosk: Object.fromEntries(Array.from(demandByKiosk.entries())),
  };
}
