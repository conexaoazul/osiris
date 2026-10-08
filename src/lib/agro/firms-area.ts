import { validatePoint, type GeoPoint } from './proximity';

/** Area API planning only: never exposes MAP_KEY in the browser. */
export type FirmsBounds = { west: number; south: number; east: number; north: number };
export const FIRMS_SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'MODIS_NRT'] as const;
export type FirmsSource = typeof FIRMS_SOURCES[number];

export function farmBoundingBoxes(center: GeoPoint, radiusKm: number): FirmsBounds[] {
  validatePoint(center);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100) {
    throw new RangeError('Farm radius must be within (0, 100] km');
  }
  const latitudeDelta = radiusKm / 111.195;
  const south = Math.max(-90, center.latitude - latitudeDelta);
  const north = Math.min(90, center.latitude + latitudeDelta);
  const longitudeDelta = radiusKm / (111.195 * Math.max(0.001, Math.cos(Math.max(Math.abs(south), Math.abs(north)) * Math.PI / 180)));
  if (longitudeDelta >= 180) return [{ west: -180, south, east: 180, north }];
  const west = center.longitude - longitudeDelta;
  const east = center.longitude + longitudeDelta;
  if (west < -180) return [
    { west: west + 360, south, east: 180, north },
    { west: -180, south, east, north },
  ];
  if (east > 180) return [
    { west, south, east: 180, north },
    { west: -180, south, east: east - 360, north },
  ];
  return [{ west, south, east, north }];
}

export function formatFirmsArea(box: FirmsBounds): string {
  if (![box.west, box.south, box.east, box.north].every(Number.isFinite) ||
      box.west < -180 || box.east > 180 || box.south < -90 || box.north > 90 ||
      box.west >= box.east || box.south >= box.north) {
    throw new RangeError('Invalid FIRMS bounding box');
  }
  return [box.west, box.south, box.east, box.north].map(n => n.toFixed(5)).join(',');
}

export function firmsAreaPath(source: FirmsSource, bounds: FirmsBounds, dayRange: number): string {
  if (!FIRMS_SOURCES.includes(source) || !Number.isInteger(dayRange) || dayRange < 1 || dayRange > 5) {
    throw new RangeError('Invalid FIRMS source or day range');
  }
  return [source, formatFirmsArea(bounds), String(dayRange)].join('/');
}
