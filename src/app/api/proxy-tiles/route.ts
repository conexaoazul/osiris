import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Only allow HTTPS CARTO basemap hosts on the default port. A generic
    // cartocdn.com proxy can be abused for unrelated upstream requests.
    const targetUrl = new URL(url);
    const host = targetUrl.hostname.toLowerCase();
    if (
      targetUrl.protocol !== 'https:' ||
      targetUrl.port ||
      targetUrl.username ||
      targetUrl.password ||
      (host !== 'basemaps.cartocdn.com' && !host.endsWith('.basemaps.cartocdn.com'))
    ) {
      return NextResponse.json({ error: 'Forbidden domain' }, { status: 403 });
    }
    // These tiles do not use query parameters; removing them avoids
    // unbounded variants in the long-lived fetch cache.
    targetUrl.search = '';
    targetUrl.hash = '';

    const response = await fetch(targetUrl.toString(), { signal: AbortSignal.timeout(15000),
      headers: {
        'Accept': '*/*',
        'User-Agent': 'Osiris-Tile-Proxy/1.0',
      },
      // Using Next.js fetch cache options to heavily cache tiles locally
      next: {
        revalidate: 31536000, // Cache for 1 year
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch tile' }, { status: response.status });
    }

    const data = await response.arrayBuffer();
    
    // Forward the content-type from the upstream response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Tile proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
