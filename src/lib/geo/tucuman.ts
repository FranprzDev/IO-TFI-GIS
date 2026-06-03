import tucumanGeoJson from "./tucuman.json";

export type LatLngTuple = [number, number];
type LonLat = [number, number];
type PolygonCoordinates = LonLat[][];
type MultiPolygonCoordinates = PolygonCoordinates[];

type TucumanGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates };

type TucumanGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry: TucumanGeometry;
  }>;
};

export const TUCUMAN_GEOJSON = tucumanGeoJson as unknown as TucumanGeoJson;

export type PolygonRing = Array<[number, number]>;
export type PolygonGeometry = PolygonRing[];
export type MultiPolygonGeometry = PolygonGeometry[];

function getAllRings() {
  return TUCUMAN_GEOJSON.features.flatMap((feature) =>
    feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat(),
  );
}

export const TUCUMAN_POLYGONS: MultiPolygonGeometry = TUCUMAN_GEOJSON.features.flatMap((feature) =>
  feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates,
);

const allPoints = getAllRings().flat();

const south = Math.min(...allPoints.map(([, lat]) => lat));
const north = Math.max(...allPoints.map(([, lat]) => lat));
const west = Math.min(...allPoints.map(([lon]) => lon));
const east = Math.max(...allPoints.map(([lon]) => lon));

export const TUCUMAN_BOUNDS: [LatLngTuple, LatLngTuple] = [
  [south, west],
  [north, east],
];

export const TUCUMAN_CENTER: LatLngTuple = [
  (south + north) / 2,
  (west + east) / 2,
];

function pointInRing(lat: number, lon: number, ring: LonLat[]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(lat: number, lon: number, polygon: PolygonCoordinates) {
  if (polygon.length === 0) return false;
  if (!pointInRing(lat, lon, polygon[0])) return false;

  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(lat, lon, polygon[i])) return false;
  }

  return true;
}

function pointInGeometry(lat: number, lon: number, geometry: TucumanGeometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(lat, lon, geometry.coordinates);
  }

  return geometry.coordinates.some((polygon) => pointInPolygon(lat, lon, polygon));
}

export function isWithinTucumanBounds(lat: number, lon: number) {
  return TUCUMAN_GEOJSON.features.some((feature) => pointInGeometry(lat, lon, feature.geometry));
}
