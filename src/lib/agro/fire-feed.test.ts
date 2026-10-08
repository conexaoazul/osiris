import { describe, expect, it } from 'vitest';
import { normalizeFireFeed } from './fire-feed';

const SOURCE = 'NASA-FIRMS (VIIRS)';
const VALID = { lat: -12.9, lng: -38.5, type: 'fire', date: '2026-10-08', time: '0135', confidence: 'nominal' };

describe('OSIRIS fire feed boundary', () => {
  it('accepts validated FIRMS fire only', () => {
    const result = normalizeFireFeed([VALID], SOURCE);
    expect(result.hotspots).toHaveLength(1);
    expect(result.hotspots[0].latitude).toBe(-12.9);
  });
  it('rejects volcanic and invalid positions', () => {
    const result = normalizeFireFeed([{ ...VALID, type: 'volcano' }, { ...VALID, lat: NaN }, { ...VALID, lng: 181 }], SOURCE);
    expect(result.hotspots).toHaveLength(0);
    expect(result.rejected).toBe(3);
  });
  it('deduplicates identical coordinates and observation timestamps', () => {
    expect(normalizeFireFeed([VALID, { ...VALID }], SOURCE).hotspots).toHaveLength(1);
  });
  it('requires reliable source metadata', () => {
    expect(() => normalizeFireFeed([VALID], 'Unknown')).toThrow();
    expect(() => normalizeFireFeed([VALID], 'NASA-EONET')).toThrow();
  });
  it('refuses observations without day and time', () => {
    expect(normalizeFireFeed([{ ...VALID, date: '' }], SOURCE).rejected).toBe(1);
  });
  it('reports truncation instead of silently pretending completeness', () => {
    const result = normalizeFireFeed([VALID, { ...VALID, lat: -13 }], SOURCE, 1);
    expect(result.sampled).toBe(true);
    expect(result.hotspots).toHaveLength(1);
  });
});
