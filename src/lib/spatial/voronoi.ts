import proj4 from "proj4";
import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";
import { TUCUMAN_POLYGONS } from "@/lib/geo/tucuman";
import type { DemandZone, GeoPoint, Kiosk, SpatialAssignment, SpatialMetrics, VoronoiCell } from "@/types/simulation";

const WGS84 = "EPSG:4326";
const UTM_20S = "EPSG:32720";

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectedKiosk {
  kiosk: Kiosk;
  projected: ProjectedPoint;
}

export interface KioskDemandSummary {
  kioskId: string;
  assignedDemand: number;
  effectiveDemand: number;
  assignmentCount: number;
}

export interface ProjectedDemandZone {
  zone: DemandZone;
  projected: ProjectedPoint;
}

export interface SpatialSnapshot extends SpatialMetrics {
  demandByKiosk: Record<string, KioskDemandSummary>;
}

type LonLatPoint = [number, number];
type Ring = LonLatPoint[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

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

let cachedProjectedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

/**
 * Voronoi bounding box in projected (UTM) meters, derived ONCE from the real
 * province polygon plus a margin and cached for every later build (the optimizer
 * builds many snapshots). d3-delaunay clips every cell to this box, so it must
 * fully enclose Tucuman — otherwise the province area outside the box is left
 * without a cell (an undivided strip). Projecting all polygon vertices (not just
 * two lat/lon corners) and adding a margin guarantees the cells overflow the
 * border and, once clipped to the province, cover it completely.
 */
function getProjectedBounds() {
  if (cachedProjectedBounds) return cachedProjectedBounds;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of TUCUMAN_POLYGONS) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        const { x, y } = projectLatLon(lat, lon);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const margin = Math.max(maxX - minX, maxY - minY) * 0.05;
  cachedProjectedBounds = {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };
  return cachedProjectedBounds;
}

function toDemandWeight(zone: DemandZone): number {
  return Math.max(1, zone.demandWeight);
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  if (firstLon === lastLon && firstLat === lastLat) return ring;
  return [...ring, ring[0]];
}

function toPolygonClippingMultiPolygon(ring: Ring): MultiPolygon {
  return [[closeRing(ring)]];
}

function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    area += (xj + xi) * (yj - yi);
  }
  return Math.abs(area) / 2;
}

function clipVoronoiCell(cellRing: Ring): MultiPolygon {
  try {
    return polygonClipping.intersection(toPolygonClippingMultiPolygon(cellRing), TUCUMAN_POLYGONS as MultiPolygon);
  } catch {
    return [];
  }
}

function polygonToGeoPoints(polygon: Polygon): GeoPoint[] {
  const outerRing = polygon[0] ?? [];
  return outerRing
    .map(([lon, lat]) => ({ lat, lon }))
    .filter((point, index, points) => {
      if (index !== points.length - 1) return true;
      const first = points[0];
      return !first || first.lat !== point.lat || first.lon !== point.lon;
    });
}

export interface SnapshotOptions {

  includeCells?: boolean;
}

export function buildSpatialSnapshotFromProjected(
  projectedKiosksInput: ProjectedKiosk[],
  projectedDemandZones: ProjectedDemandZone[],
  serviceDistanceKm: number,
  options: SnapshotOptions = {},
): SpatialSnapshot {
  const includeCells = options.includeCells ?? true;
  const activeKiosks = projectedKiosksInput.filter((item) => item.kiosk.active !== false);
  if (activeKiosks.length === 0 || projectedDemandZones.length === 0) {
    return {
      weightedDistanceKm: 0,
      coveredDemandPct: 0,
      capturedDemand: 0,
      loadBalanceScore: 0,
      cannibalizationPct: 0,
      assignments: [],
      voronoiCells: [],
      demandByKiosk: {},
    };
  }

  const projectedKiosks = activeKiosks;

  const delaunay = Delaunay.from(projectedKiosks, (d) => d.projected.x, (d) => d.projected.y);
  const bounds = getProjectedBounds();

  const voronoi = includeCells
    ? delaunay.voronoi([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY])
    : null;

  const assignments: SpatialAssignment[] = [];
  const demandByKiosk = new Map<string, KioskDemandSummary>();
  let totalWeight = 0;
  let coveredWeight = 0;
  let weightedDistanceKm = 0;
  let contestedWeight = 0;
  let contestedDenominator = 0;

  const densities = projectedDemandZones.map(({ zone }) => Math.max(0, zone.density));
  const minDensity = densities.length > 0 ? Math.min(...densities) : 0;
  const maxDensity = densities.length > 0 ? Math.max(...densities) : 0;

  for (const { zone } of projectedDemandZones) {
    totalWeight += toDemandWeight(zone);
  }

  for (const { zone, projected } of projectedDemandZones) {
    const nearestIndex = delaunay.find(projected.x, projected.y);
    const nearest = projectedKiosks[nearestIndex];
    const distanceKm = haversineKm({ lat: zone.lat, lon: zone.lon }, { lat: nearest.kiosk.lat, lon: nearest.kiosk.lon });
    const weight = toDemandWeight(zone);
    const densityWeight = 0.75 + (normalize(zone.density, minDensity, maxDensity) * 0.75);
    const contestedWeightContribution = weight * densityWeight;

    let secondNearestDistanceKm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < projectedKiosks.length; i++) {
      if (i === nearestIndex) continue;
      const k = projectedKiosks[i].kiosk;
      const d = haversineKm({ lat: zone.lat, lon: zone.lon }, { lat: k.lat, lon: k.lon });
      if (d < secondNearestDistanceKm) secondNearestDistanceKm = d;
    }

    assignments.push({
      demandZoneId: zone.id,
      kioskId: nearest.kiosk.id,
      distanceKm,
      demandWeight: weight,
    });

    weightedDistanceKm += distanceKm * weight;
    if (distanceKm <= serviceDistanceKm) coveredWeight += weight;
    contestedDenominator += contestedWeightContribution;
    if (secondNearestDistanceKm <= distanceKm * 1.35 || (secondNearestDistanceKm - distanceKm) <= 1.5) {
      contestedWeight += contestedWeightContribution;
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

  const kioskDemandList = activeKiosks.map((k) => demandByKiosk.get(k.kiosk.id)?.effectiveDemand ?? 0);
  const meanDemand = kioskDemandList.reduce((sum, value) => sum + value, 0) / Math.max(1, kioskDemandList.length);
  const demandVariance = kioskDemandList.reduce((sum, value) => sum + (value - meanDemand) ** 2, 0) / Math.max(1, kioskDemandList.length);
  const demandStdDev = Math.sqrt(demandVariance);
  const loadBalanceScore = meanDemand > 0 ? Math.max(0, 1 - (demandStdDev / meanDemand)) : 0;

  const voronoiCells: VoronoiCell[] = voronoi
    ? activeKiosks.map((kiosk, index) => {
        const polygon = voronoi.cellPolygon(index) ?? [];
        const rawRing = polygon
          .filter((point): point is [number, number] => Array.isArray(point) && point.length === 2)
          .map(([x, y]) => {
            const { lat, lon } = unprojectPoint({ x, y });
            return [lon, lat] as LonLatPoint;
          });
        const clipped = clipVoronoiCell(rawRing);
        const parts = clipped
          .map((polygonPart) => polygonToGeoPoints(polygonPart))
          .filter((part) => part.length >= 3)
          .sort((a, b) => ringArea(b.map(({ lon, lat }) => [lon, lat])) - ringArea(a.map(({ lon, lat }) => [lon, lat])));
        return {
          kioskId: kiosk.kiosk.id,
          points: parts[0] ?? rawRing.map(([lon, lat]) => ({ lat, lon })),
          parts,
        };
      })
    : [];

  return {
    weightedDistanceKm: totalWeight > 0 ? weightedDistanceKm / totalWeight : 0,
    coveredDemandPct: totalWeight > 0 ? coveredWeight / totalWeight : 0,
    capturedDemand: totalWeight,
    loadBalanceScore,
    cannibalizationPct: contestedDenominator > 0 ? contestedWeight / contestedDenominator : 0,
    assignments,
    voronoiCells,
    demandByKiosk: Object.fromEntries(Array.from(demandByKiosk.entries())),
  };
}

export function buildSpatialSnapshot(
  kiosks: Kiosk[],
  demandZones: DemandZone[],
  serviceDistanceKm: number,
  options: SnapshotOptions = {},
): SpatialSnapshot {
  const projectedKiosks = kiosks.map((kiosk) => ({
    kiosk,
    projected: projectLatLon(kiosk.lat, kiosk.lon),
  }));
  const projectedDemandZones = demandZones.map((zone) => ({
    zone,
    projected: projectLatLon(zone.lat, zone.lon),
  }));
  return buildSpatialSnapshotFromProjected(projectedKiosks, projectedDemandZones, serviceDistanceKm, options);
}
