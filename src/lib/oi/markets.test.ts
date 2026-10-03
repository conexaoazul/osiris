import { describe, it, expect } from 'vitest';
import { fetchSeries, isSymbol, oddsLine, parseChart, parseManifold, parsePolymarket, pickOdds, type MarketFind } from './markets';
import type { Fetcher } from './web';

/** A chart reply for `n` days, with a live bar on the last day and a null close in the middle. */
function chart(n: number) {
  const t0 = Date.UTC(2025, 0, 1) / 1000;
  const timestamp = Array.from({ length: n }, (_, i) => t0 + i * 86_400);
  const close: (number | null)[] = timestamp.map((_, i) => 100 + i);
  close[5] = null;
  timestamp.push(timestamp[n - 1] + 3600);
  close.push(999);
  return JSON.stringify({ chart: { result: [{ meta: { symbol: 'SOL-USD', currency: 'usd', shortName: 'Solana USD', gmtoffset: 0 }, timestamp, indicators: { quote: [{ close }], adjclose: [{ adjclose: close }] } }] } });
}

describe('prices', () => {
  it('reads a chart as one close a day, the live bar replacing the day’s earlier one, gaps dropped', () => {
    const s = parseChart(chart(40))!;
    expect(s).toMatchObject({ symbol: 'SOL-USD', name: 'Solana USD', currency: 'USD' });
    expect(s.dates).toHaveLength(39);
    expect(s.dates[0]).toBe('2025-01-01');
    expect(s.closes[s.closes.length - 1]).toBe(999);
    expect(s.closes).not.toContain(105);
    expect(parseChart(chart(10))).toBeNull();
    expect(parseChart('not json')).toBeNull();
  });

  it('asks only for well-formed tickers, and remembers one Yahoo does not know', async () => {
    let calls = 0;
    const api: Fetcher = async () => { calls++; return new Response('{"chart":{"error":{"code":"Not Found"}}}', { status: 404 }); };
    expect(await fetchSeries('NOPE-XYZ', api, new AbortController().signal)).toBeNull();
    expect(await fetchSeries('NOPE-XYZ', api, new AbortController().signal)).toBeNull();
    expect(calls).toBe(1);
    expect(isSymbol('^GSPC')).toBe(true);
    expect(isSymbol('BZ=F')).toBe(true);
    expect(isSymbol('../etc')).toBe(false);
    expect(await fetchSeries('a b', api, new AbortController().signal)).toBeNull();
  });
});

const POLY = JSON.stringify({ events: [
  { slug: 'what-price-will-solana-hit-in-2026', volume: 2127390, endDate: '2027-01-01T05:00:00Z', markets: [
    { question: 'Will Solana reach $200 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["0.095", "0.905"]', volumeNum: 412000, active: true, closed: false, endDate: '2026-12-31T12:00:00Z' },
    { question: 'Will Solana reach $120 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]', active: true, closed: true },
    { question: 'Will Solana reach $140 by December 31, 2026?', outcomes: '["Yes", "No"]', outcomePrices: '["0.515", "0.485"]', volumeNum: 220000, active: true, closed: false },
  ] },
  { slug: 'what-price-will-solana-hit-in-october', volume: 32317, markets: [
    { question: 'Will Solana reach $200 in October?', outcomes: '["Yes", "No"]', outcomePrices: '["0.0055", "0.9945"]', volumeNum: 4000, active: true, closed: false },
  ] },
  { slug: 'bad slug!', markets: [{ question: 'x', outcomes: '["Yes","No"]', outcomePrices: '["0.5","0.5"]' }] },
] });

const MANI = JSON.stringify([
  { question: 'Will SOL hit $200 before 2027?', probability: 0.12, volume: 5400, outcomeType: 'BINARY', isResolved: false, closeTime: Date.UTC(2026, 11, 31), url: 'https://manifold.markets/user/will-sol-hit-200' },
  { question: 'Which coin wins?', outcomeType: 'MULTIPLE_CHOICE', url: 'https://manifold.markets/x' },
  { question: 'Spoofed', probability: 0.5, outcomeType: 'BINARY', url: 'https://evil.example/x' },
]);

describe('prediction markets', () => {
  it('reads Polymarket’s open yes/no markets with their price, volume and page', () => {
    const found = parsePolymarket(POLY);
    expect(found.map(m => m.question)).toEqual(['Will Solana reach $200 by December 31, 2026?', 'Will Solana reach $140 by December 31, 2026?', 'Will Solana reach $200 in October?']);
    expect(found[0]).toEqual({
      platform: 'Polymarket', question: 'Will Solana reach $200 by December 31, 2026?', probability: 0.095, volume: 412000,
      closes: '2026-12-31T12:00:00Z', url: 'https://polymarket.com/event/what-price-will-solana-hit-in-2026',
    });
    expect(parsePolymarket('{}')).toEqual([]);
  });

  it('reads Manifold’s open binary markets on its own site only', () => {
    expect(parseManifold(MANI)).toEqual([{
      platform: 'Manifold', question: 'Will SOL hit $200 before 2027?', probability: 0.12, volume: 5400, closes: '2026-12-31T00:00:00.000Z', url: 'https://manifold.markets/user/will-sol-hit-200',
    }]);
  });

  it('picks the markets that ask the question, the same level and year first', () => {
    const found: MarketFind[] = [...parsePolymarket(POLY), ...parseManifold(MANI)];
    const picked = pickOdds(found, 'Will Solana reach $200 before the end of 2026?', ['solana', 'reach']);
    expect(picked[0].question).toBe('Will Solana reach $200 by December 31, 2026?');
    expect(picked.map(m => m.question)).not.toContain('Will SOL hit $200 before 2027?');
    // About something else entirely: no crowd.
    expect(pickOdds(found, 'Will Israel invade Lebanon by 2028?', ['israel', 'invade', 'lebanon'])).toEqual([]);
  });

  it('says a price as a line to quote', () => {
    expect(oddsLine({ platform: 'Polymarket', question: 'q', probability: 0.095, volume: 2_127_390, closes: '2026-12-31T12:00:00Z' }))
      .toBe('Polymarket traders price YES at 9.5% ($2.1M traded, closes 2026-12-31).');
    expect(oddsLine({ platform: 'Manifold', question: 'q', probability: 0.12, volume: 5400, closes: '' })).toBe('Manifold traders price YES at 12% (5K mana traded).');
  });
});
