import { validatePoint, type GeoHotspot } from './proximity';

/** Trusted server-side OSIRIS /api/fires response shape. */
export type OsirisFire = {
  lat?: unknown; lng?: unknown; type?: unknown;
  date?: unknown; time?: unknown; confidence?: unknown;
  frp?: unknown;
};

export type FireFeedResult = {
  hotspots: GeoHotspot[];
  rejected: number;
  sampled: boolean;
};

/** Normalize upstream fire observations. Does not send alerts or claim completeness.
 * OSIRIS /api/fires may sample the global feed. The 24h feed must not be
 * interpreted as an exhaustive representation of a given farm.
 */
export function normalizeFireFeed(
  raw: unknown, source: string, maxRows = 2000,
): FireFeedResult {
  if (typeof source !== 'string' || !/^NASA-FIRMS \((VIIRS|MODIS)\)$/.test(source)) {
    throw new Error('Verified NASA FIRMS provenance is required');
  }
  if (!Array.isArray(raw)) throw new TypeError('Fire observations must be an array');
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) {
    throw new RangeError('Invalid row limit');
  }
  const hotspots: GeoHotspot[] = [];
  let rejected = 0;
  const seen = new Set<string>();
  for (const item of raw.slice(0, maxRows)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { rejected++; continue; }
    const fire = item as OsirisFire;
    if (fire.type !== 'fire') { rejected++; continue; }
    if (typeof fire.lat !== 'number' || typeof fire.lng !== 'number') { rejected++; continue; }
    try {
      const point = validatePoint({ latitude: fire.lat, longitude: fire.lng });
      // OSIRIS rounded geolocation is not a unique event identifier.
      // The key is for UI deduplication only, not operational incident identity.
      const day = typeof fire.date === 'string' ? fire.date : '';
      const clock = typeof fire.time === 'string' ? fire.time : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,4}$/.test(clock)) {
        rejected++; continue;
      }
      const id = [source, day, clock, point.latitude, point.longitude].join(':');
      if (seen.has(id)) continue;
      seen.add(id);
      hotspots.push({
        id, source,
        ...point,
        confidence: typeof fire.confidence === 'string'
          ? fire.confidence.slice(0, 32) : 'unknown',
      });
    } catch { rejected++; }
  }
  return { hotspots, rejected, sampled: raw.length > maxRows };
}
