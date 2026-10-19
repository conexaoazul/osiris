import { describe, expect, it } from 'vitest';
import {
  buildSatelliteSearch, isDemoAreaId, normalizeSatelliteScenes, STAC_COLLECTION,
} from './stac-scenes';

describe('Blue Agro STAC metadata (read-only)', () => {
  it('rejects arbitrary locations and encodes two fixed, illustrative AOIs', () => {
    expect(isDemoAreaId('ba')).toBe(true);
    expect(isDemoAreaId('rs')).toBe(true);
    expect(isDemoAreaId('../../secrets')).toBe(false);
    expect(isDemoAreaId('__proto__')).toBe(false);
    const q = buildSatelliteSearch('ba', new Date('2026-10-19T12:00:00Z'));
    expect(q.collections).toEqual([STAC_COLLECTION]);
    expect(q.bbox).toEqual([-38.54, -12.94, -38.46, -12.86]);
    expect(q.limit).toBe(18);
    expect(q.datetime).toContain('2026-10-19T12:00:00.000Z');
  });

  it('normalizes catalog metadata but never trusts arbitrary upstream URLs', () => {
    const scenes = normalizeSatelliteScenes({ features: [
      { id: 'S2B_VALID_OLD', properties: { datetime: '2026-10-01T12:00:00Z', 'eo:cloud_cover': 14.95 },
        links: [{ rel: 'self', href: 'https://evil.example/redirect' }] },
      { id: 'S2B_VALID_NEW', properties: { datetime: '2026-10-18T12:00:00Z', 'eo:cloud_cover': 120 } },
      { id: 'S2B_VALID_OLD', properties: { datetime: '2026-10-01T12:00:00Z' } },
      { id: '../../invalid', properties: { datetime: '2026-10-17T12:00:00Z' } },
      { id: 'S2B_NO_DATE', properties: { datetime: 'wrong' } },
    ] });
    expect(scenes).toHaveLength(2);
    expect(scenes.map(x => x.id)).toEqual(['S2B_VALID_NEW', 'S2B_VALID_OLD']);
    expect(scenes[0].cloudCover).toBeNull();
    expect(scenes[1].cloudCover).toBe(15);
    expect(scenes[1].stacItemUrl).toBe('https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_VALID_OLD');
    expect(scenes[1].stacItemUrl).not.toContain('evil.example');
  });

  it('fails closed on malformed collections or invalid bounds', () => {
    expect(() => normalizeSatelliteScenes({})).toThrow(TypeError);
    expect(() => normalizeSatelliteScenes({ features: [] }, 0)).toThrow(RangeError);
    expect(() => buildSatelliteSearch('rs', new Date(NaN))).toThrow(RangeError);
  });
});
