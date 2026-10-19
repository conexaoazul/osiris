import { NextResponse } from 'next/server';
import {
  STAC_ORIGIN, DEMO_AREAS, isDemoAreaId, buildSatelliteSearch, normalizeSatelliteScenes,
} from '@/lib/agro/stac-scenes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public read-only preview. No arbitrary coordinates, URLs, secrets, tiles,
 * calls to Odoo, commands, notifications or persisted customer information.
 */
export async function GET(request: Request) {
  const farmId = new URL(request.url).searchParams.get('farm') ?? '';
  if (!isDemoAreaId(farmId)) {
    return NextResponse.json({ error: 'Selecione uma área demonstrativa válida.' }, { status: 400 });
  }

  const search = buildSatelliteSearch(farmId);
  try {
    const response = await fetch(`${STAC_ORIGIN}/search`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json, application/json' },
      body: JSON.stringify(search),
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 1800 },
    });
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
    const bytes = Number(response.headers.get('content-length') ?? '0');
    if (bytes > 2_000_000) throw new Error('Catalog response too large');
    const rawText = await response.text();
    if (rawText.length > 2_000_000) throw new Error('Catalog response too large');
    const scenes = normalizeSatelliteScenes(JSON.parse(rawText));
    return NextResponse.json({
      area: DEMO_AREAS[farmId].label,
      source: 'Element 84 Earth Search / ESA Sentinel-2 L2A (STAC)',
      searchedAt: new Date().toISOString(),
      timeWindow: search.datetime,
      coverage: 'Metadados de cenas que intersectam a área; não é medição de árvore, biomassa nem alerta.',
      scenes,
    }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900' } });
  } catch {
    return NextResponse.json({
      error: 'Catálogo de satélite temporariamente indisponível. A simulação permanece acessível.',
      source: 'Element 84 Earth Search',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
