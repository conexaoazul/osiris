import { createServerFirmsRequests, isTrustedFirmsUrl, type FirmsQuery } from './firms-request';

export type FirmsCsvResult = { csv: string[]; fetchedAreas: number };
const MAX_BYTES = 2_000_000;

/** Server-only. Caller must authorize the tenant and selected farm before calling. */
export async function fetchFarmFirmsCsv(
  query: FirmsQuery,
  key: string,
  transport: typeof fetch = fetch,
): Promise<FirmsCsvResult> {
  const urls = createServerFirmsRequests(query, key);
  const csv: string[] = [];
  for (const url of urls) {
    if (!isTrustedFirmsUrl(url)) throw new Error('Disallowed NASA FIRMS URL');
    const response = await transport(url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'text/csv' },
    });
    if (!response.ok) throw new Error('NASA FIRMS request failed');
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BYTES) throw new Error('NASA FIRMS response exceeds cap');
    if (!response.body) throw new Error('NASA FIRMS returned an empty body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('NASA FIRMS response exceeds cap');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const combined = new Uint8Array(bytes);
    let index = 0;
    for (const chunk of chunks) { combined.set(chunk, index); index += chunk.byteLength; }
    csv.push(new TextDecoder('utf-8', { fatal: true }).decode(combined));
  }
  return { csv, fetchedAreas: urls.length };
}
