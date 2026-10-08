/** Deterministic geospatial primitives used by the Blue Agro OSIRIS adapter. */
export type GeoPoint = { latitude: number; longitude: number };
export type GeoHotspot = GeoPoint & { id: string; source: string; confidence?: string };
const EARTH_RADIUS_KM = 6371.0088;
export function validatePoint(point: GeoPoint): GeoPoint {
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new RangeError('Invalid geographic coordinates');
  }
  return { latitude, longitude };
}
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  validatePoint(a);
  validatePoint(b);
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function nearbyHotspots(
  farm: GeoPoint, hotspots: readonly GeoHotspot[], radiusKm: number,
): Array<GeoHotspot & { distanceKm: number }> {
  validatePoint(farm);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500) {
    throw new RangeError('Radius must be in (0, 500] km');
  }
  return hotspots.flatMap((hotspot) => {
    const distance = distanceKm(farm, hotspot);
    return distance <= radiusKm ? [{ ...hotspot, distanceKm: Math.round(distance * 100) / 100 }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}
