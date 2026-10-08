import { farmBoundingBoxes, firmsAreaPath, FIRMS_SOURCES, type FirmsSource } from './firms-area';
import type { GeoPoint } from './proximity';

const NASA_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';
export interface FirmsQuery {
  center: GeoPoint;
  radiusKm: number;
  dayRange: number;
  source: FirmsSource;
}

/** Build scoped NASA URLs on the server only. Never return URLs containing MAP_KEY to browsers or logs. */
export function createServerFirmsRequests(query: FirmsQuery, mapKey: string): string[] {
  if (!mapKey || !/^[a-zA-Z0-9_-]{10,128}$/.test(mapKey)) {
    throw new Error('A server-only NASA FIRMS MAP_KEY is required');
  }
  if (!FIRMS_SOURCES.includes(query.source)) {
    throw new RangeError('Unrecognized satellite source');
  }
  return farmBoundingBoxes(query.center, query.radiusKm).map(box => {
    const suffix = firmsAreaPath(query.source, box, query.dayRange);
    return `${NASA_ORIGIN}/api/area/csv/${encodeURIComponent(mapKey)}/${suffix}`;
  });
}

/** Reject unexpected redirect targets before requests are made.
 * Network callers must disable redirects and enforce their own timeout and response-size cap.
 */
export function isTrustedFirmsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'firms.modaps.eosdis.nasa.gov' &&
      u.port === '' && u.pathname.startsWith('/api/area/csv/') && u.username === '' && u.password === '';
  } catch {
    return false;
  }
}
