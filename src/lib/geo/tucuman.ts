export type LatLngTuple = [number, number];

export const TUCUMAN_BOUNDS: [LatLngTuple, LatLngTuple] = [
  [-28.0034, -66.1623],
  [-26.0735, -64.4783],
];

export const TUCUMAN_CENTER: LatLngTuple = [
  (TUCUMAN_BOUNDS[0][0] + TUCUMAN_BOUNDS[1][0]) / 2,
  (TUCUMAN_BOUNDS[0][1] + TUCUMAN_BOUNDS[1][1]) / 2,
];

export function isWithinTucumanBounds(lat: number, lon: number) {
  return lat >= TUCUMAN_BOUNDS[0][0] && lat <= TUCUMAN_BOUNDS[1][0] && lon >= TUCUMAN_BOUNDS[0][1] && lon <= TUCUMAN_BOUNDS[1][1];
}
