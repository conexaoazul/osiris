import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = (farm: string) =>
  new Request(`http://localhost/api/agro/satellite?farm=${encodeURIComponent(farm)}`);

const feature = {
  type: 'Feature',
  id: 'S2A_DEMO_VALID_20261015',
  properties: { datetime: '2026-10-15T12:34:56Z', 'eo:cloud_cover': 8.3 },
};

describe('GET /api/agro/satellite', () => {
  it('rejects arbitrary AOI values without contacting the provider', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    for (const farm of ['', '__proto__', '../secret', 'real-farm', 'https://evil.example']) {
      const res = await GET(request(farm));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('queries an allowlisted provider using only the fixed AOI and returns provenance', async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [feature] }), {
        status: 200,
        headers: { 'Content-Type': 'application/geo+json' },
      }),
    );
    vi.stubGlobal('fetch', upstream);
    const res = await GET(request('ba'));
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.scenes).toHaveLength(1);
    expect(payload.scenes[0].cloudCover).toBe(8.3);
    expect(payload.source).toMatch(/Sentinel-2/);
    expect(payload.coverage).toMatch(/não é medição/);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, opts] = upstream.mock.calls[0];
    expect(url).toBe('https://earth-search.aws.element84.com/v1/search');
    expect(opts.method).toBe('POST');
    expect(opts.redirect).toBe('error');
    const body = JSON.parse(opts.body);
    expect(body.bbox).toEqual([-38.54, -12.94, -38.46, -12.86]);
    expect(body.collections).toEqual(['sentinel-2-c1-l2a']);
    expect(body.query).toEqual({ 'eo:cloud_cover': { lt: 35 } });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('fails closed for HTTP errors, transport exceptions and malformed JSON', async () => {
    const bad = [
      new Response('rate limited', { status: 429 }),
      new Error('simulated timeout'),
      new Response('not-json', { status: 200 }),
      new Response('{}', { status: 200 }),
    ];
    for (const response of bad) {
      const upstream = vi.fn();
      if (response instanceof Error) upstream.mockRejectedValue(response);
      else upstream.mockResolvedValue(response);
      vi.stubGlobal('fetch', upstream);
      const result = await GET(request('rs'));
      expect(result.status).toBe(503);
      expect(JSON.stringify(await result.json())).not.toMatch(/simulated timeout|rate limited/);
      expect(result.headers.get('cache-control')).toContain('no-store');
    }
  });

  it('rejects oversized server responses', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('{"features":[]}', {
      status: 200,
      headers: { 'content-length': '2000001' },
    }));
    vi.stubGlobal('fetch', upstream);
    const res = await GET(request('rs'));
    expect(res.status).toBe(503);
  });
});
