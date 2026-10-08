import { describe, expect, it } from 'vitest';
import { createServerFirmsRequests, isTrustedFirmsUrl } from './firms-request';

const query = {
  center: { latitude: -12.9, longitude: -38.5 },
  radiusKm: 8, dayRange: 1, source: 'VIIRS_NOAA20_NRT' as const,
};

describe('server-side FIRMS request planning', () => {
  it('constructs bounded NASA URLs with correct source', () => {
    const urls = createServerFirmsRequests(query, 'sample_test_MAPKEY_12345');
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/api/area/csv/sample_test_MAPKEY_12345/VIIRS_NOAA20_NRT/');
    expect(isTrustedFirmsUrl(urls[0])).toBe(true);
  });
  it('refuses missing credentials and invalid satellite source', () => {
    expect(() => createServerFirmsRequests(query, '')).toThrow();
    expect(() => createServerFirmsRequests({ ...query, source: 'UNKNOWN' as never }, 'sample_test_MAPKEY_12345')).toThrow();
  });
  it('rejects lookalike and insecure URL hosts', () => {
    expect(isTrustedFirmsUrl('https://firms.modaps.eosdis.nasa.gov.attacker.net/api/area/csv/key/x')).toBe(false);
    expect(isTrustedFirmsUrl('http://firms.modaps.eosdis.nasa.gov/api/area/csv/key/x')).toBe(false);
  });
});
