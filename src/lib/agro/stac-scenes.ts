/**
 * Read-only demonstration of real Sentinel-2 catalog metadata.
 *
 * Fixed, NON-CUSTOMER bounding boxes prevent an anonymous demo from becoming
 * an expensive arbitrary-location STAC proxy. No biomass/tree-height claims.
 */
export const STAC_COLLECTION = 'sentinel-2-c1-l2a' as const;
export const STAC_ORIGIN = 'https://earth-search.aws.element84.com/v1' as const;

export const DEMO_AREAS = {
  ba: { label: 'Área demonstrativa — Bahia', bbox: [-38.54, -12.94, -38.46, -12.86] },
  rs: { label: 'Área demonstrativa — Rio Grande do Sul', bbox: [-51.19, -29.79, -51.11, -29.71] },
} as const;

export type DemoAreaId = keyof typeof DEMO_AREAS;
export type SatelliteScene = {
  id: string;
  date: string;
  cloudCover: number | null;
  stacItemUrl: string;
  stacBrowserUrl: string;
};

export function isDemoAreaId(value: string): value is DemoAreaId {
  return Object.prototype.hasOwnProperty.call(DEMO_AREAS, value);
}

export function buildSatelliteSearch(areaId: DemoAreaId, now: Date = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid reference date');
  const start = new Date(now.getTime() - 180 * 86400 * 1000);
  return {
    collections: [STAC_COLLECTION],
    bbox: [...DEMO_AREAS[areaId].bbox],
    datetime: `${start.toISOString()}/${now.toISOString()}`,
    // Filter scenes with large cloud cover before the 18-item cap.
    // Cloud fraction is scene-wide and is NOT a field-level measurement.
    query: { 'eo:cloud_cover': { lt: 35 } },
    limit: 18,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSatelliteScenes(payload: unknown, maxScenes = 6): SatelliteScene[] {
  if (!isObject(payload) || !Array.isArray(payload.features)) {
    throw new TypeError('Invalid STAC FeatureCollection');
  }
  if (!Number.isInteger(maxScenes) || maxScenes < 1 || maxScenes > 18) {
    throw new RangeError('Invalid scene limit');
  }

  const output: SatelliteScene[] = [];
  const seen = new Set<string>();
  for (const item of payload.features.slice(0, 18)) {
    if (!isObject(item) || !isObject(item.properties)) continue;
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_.-]{8,180}$/.test(item.id)) continue;
    if (seen.has(item.id)) continue;

    const date = item.properties.datetime;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) continue;
    const cloud = item.properties['eo:cloud_cover'];
    const cloudCover = typeof cloud === 'number' && Number.isFinite(cloud) && cloud >= 0 && cloud <= 100
      ? Math.round(cloud * 10) / 10 : null;
    const path = `/collections/${STAC_COLLECTION}/items/${encodeURIComponent(item.id)}`;
    output.push({
      id: item.id,
      date,
      cloudCover,
      stacItemUrl: `${STAC_ORIGIN}${path}`,
      stacBrowserUrl: `https://radiantearth.github.io/stac-browser/#/external/earth-search.aws.element84.com/v1${path}`,
    });
    seen.add(item.id);
  }
  output.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return output.slice(0, maxScenes);
}
