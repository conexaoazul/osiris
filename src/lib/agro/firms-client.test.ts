import { describe, expect, it, vi } from 'vitest';
import { fetchFarmFirmsCsv } from './firms-client';

const query = {
  center: { latitude: -12.9, longitude: -38.5 },
  radiusKm: 10, dayRange: 1, source: 'VIIRS_NOAA20_NRT' as const,
};
const key = 'synthetic_test_key_123456';
describe('NASA FIRMS server transport', () => {
  it('reads a bounded CSV response with redirects disabled', async () => {
    const transport = vi.fn(async (_url: unknown, options: RequestInit) => {
      expect(options.redirect).toBe('error');
      expect(options.cache).toBe('no-store');
      return new Response('latitude,longitude\n-12.9,-38.5\n', {
        headers: { 'content-type': 'text/csv' },
      });
    });
    const result = await fetchFarmFirmsCsv(query, key, transport as unknown as typeof fetch);
    expect(result.fetchedAreas).toBe(1);
    expect(result.csv[0]).toContain('latitude,longitude');
  });
  it('rejects over-limit responses even without content-length', async () => {
    const transport = vi.fn(async () => new Response('x'.repeat(2_000_001)));
    await expect(fetchFarmFirmsCsv(query, key, transport as unknown as typeof fetch))
      .rejects.toThrow('exceeds cap');
  });
  it('fails closed on unsuccessful upstream responses', async () => {
    const transport = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    await expect(fetchFarmFirmsCsv(query, key, transport as unknown as typeof fetch))
      .rejects.toThrow('request failed');
  });
});
