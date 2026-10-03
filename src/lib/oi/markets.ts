/**
 * OSIRIS OI: what the markets say about a question.
 *
 * Two kinds of market, both read without a key:
 *   - the price of what the question turns on (a coin, a share, an index, a
 *     commodity, a currency), two years of it day by day, from Yahoo
 *     Finance's chart API, which the platform's own market board reads;
 *   - what prediction markets price the question at: real money (Polymarket)
 *     and play money with a long track record (Manifold) on the outcome.
 *
 * Every reply is read defensively and kept for a while, so a run asks each
 * market once whatever the panel and the API do.
 */
import { hit } from './words';
import type { Series } from './quant';
import type { Odds } from './types';
import type { Fetcher } from './web';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Kept answers, by key, each for `ms`. */
function memo<T>(ms: number, max = 64) {
  const map = new Map<string, { at: number; v: T }>();
  return {
    get(k: string): T | undefined {
      const e = map.get(k);
      return e && Date.now() - e.at < ms ? e.v : undefined;
    },
    set(k: string, v: T) {
      map.set(k, { at: Date.now(), v });
      if (map.size > max) map.delete(map.keys().next().value!);
    },
  };
}

/* ───────────────────────────── Prices ───────────────────────────── */

/** A ticker as Yahoo Finance writes it: letters, digits and ^ = . - only. */
export const isSymbol = (s: string) => /^[A-Za-z0-9^=.-]{1,20}$/.test(s);

/** A chart reply as a daily series: the last close of each day, oldest first. Null when there is too little to use. */
export function parseChart(body: string): Series | null {
  try {
    const r = (JSON.parse(body) as { chart?: { result?: unknown[] } }).chart?.result?.[0] as {
      meta?: Record<string, unknown>; timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[] }[]; adjclose?: { adjclose?: (number | null)[] }[] };
    } | undefined;
    const meta = r?.meta ?? {};
    const ts = r?.timestamp ?? [];
    const close = r?.indicators?.quote?.[0]?.close ?? [];
    const adj = r?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const offset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
    const byDay = new Map<string, { c: number; a: number }>();
    ts.forEach((t, i) => {
      const c = close[i];
      if (typeof c !== 'number' || !(c > 0) || !Number.isFinite(t)) return;
      const a = typeof adj[i] === 'number' && adj[i]! > 0 ? adj[i]! : c;
      // The exchange's own calendar day; a later bar on the same day (the live one) replaces the earlier.
      byDay.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), { c, a });
    });
    const days = [...byDay.keys()].sort();
    if (days.length < 30) return null;
    const symbol = typeof meta.symbol === 'string' ? meta.symbol : '';
    const name = [meta.longName, meta.shortName].find((v): v is string => typeof v === 'string' && v.trim().length > 0) ?? symbol;
    return {
      symbol,
      name: name.trim(),
      currency: typeof meta.currency === 'string' ? meta.currency.toUpperCase() : '',
      dates: days,
      closes: days.map(d => byDay.get(d)!.c),
      adjusted: days.map(d => byDay.get(d)!.a),
    };
  } catch {
    return null;
  }
}

const seriesCache = memo<Series | null>(30 * 60_000);

/** Two years of daily prices for a ticker, or null when Yahoo does not know it. */
export async function fetchSeries(symbol: string, api: Fetcher, signal: AbortSignal): Promise<Series | null> {
  if (!isSymbol(symbol)) return null;
  const key = symbol.toUpperCase();
  const kept = seriesCache.get(key);
  if (kept !== undefined) return kept;
  const res = await api(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&includeAdjustedClose=true`, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  }).catch(() => null);
  if (!res) return null;
  const series = res.ok ? parseChart(await res.text().catch(() => '')) : null;
  // A ticker Yahoo does not know is remembered as such; a failed request is not.
  if (series || res.status === 404) seriesCache.set(key, series);
  return series;
}

/* ───────────────────────────── Prediction markets ───────────────────────────── */

/** A prediction market found for a question, with where to see it. */
export interface MarketFind extends Odds {
  url: string;
}

const NUM = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN);
const arr = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
};

/** Polymarket's search reply: the open yes/no markets in each event it found. */
export function parsePolymarket(body: string): MarketFind[] {
  try {
    const events = (JSON.parse(body) as { events?: unknown[] }).events ?? [];
    return events.flatMap(ev => {
      const e = ev as Record<string, unknown>;
      const slug = typeof e.slug === 'string' && /^[a-z0-9-]+$/i.test(e.slug) ? e.slug : '';
      return (Array.isArray(e.markets) ? e.markets : []).flatMap(mk => {
        const m = mk as Record<string, unknown>;
        const outcomes = arr(m.outcomes).map(String);
        const prices = arr(m.outcomePrices).map(NUM);
        const question = typeof m.question === 'string' ? m.question.trim() : '';
        if (!slug || !question || m.closed === true || m.active === false || outcomes[0] !== 'Yes' || !Number.isFinite(prices[0])) return [];
        const volume = [m.volumeNum, m.volume, e.volume].map(NUM).find(Number.isFinite) ?? 0;
        return [{
          platform: 'Polymarket' as const, question, probability: prices[0], volume,
          closes: typeof m.endDate === 'string' ? m.endDate : typeof e.endDate === 'string' ? e.endDate : '',
          url: `https://polymarket.com/event/${slug}`,
        }];
      });
    });
  } catch {
    return [];
  }
}

/** Manifold's search reply: its open binary markets. */
export function parseManifold(body: string): MarketFind[] {
  try {
    const list = JSON.parse(body) as unknown[];
    return (Array.isArray(list) ? list : []).flatMap(x => {
      const m = x as Record<string, unknown>;
      const url = typeof m.url === 'string' && /^https:\/\/manifold\.markets\//.test(m.url) ? m.url : '';
      const p = NUM(m.probability);
      if (!url || m.outcomeType !== 'BINARY' || m.isResolved === true || !Number.isFinite(p) || typeof m.question !== 'string') return [];
      const close = NUM(m.closeTime);
      return [{
        platform: 'Manifold' as const, question: m.question.trim(), probability: p, volume: NUM(m.volume) || 0,
        closes: Number.isFinite(close) ? new Date(close).toISOString() : '', url,
      }];
    });
  } catch {
    return [];
  }
}

const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(/,/g, '')));

/**
 * The markets that ask (nearly) the question: those that share its words and
 * its numbers (the level, the year), the closest and most traded first. A
 * market priced at 0 or 1 has already settled and says nothing about what is
 * still open; one with next to no trading is no crowd.
 */
export function pickOdds(found: MarketFind[], question: string, words: string[], max = 3): MarketFind[] {
  const nums = numbersIn(question);
  const seen = new Set<string>();
  return found
    .filter(m => m.probability > 0.002 && m.probability < 0.998 && (m.platform === 'Manifold' ? m.volume >= 100 : m.volume >= 500))
    .map(m => {
      const low = m.question.toLowerCase();
      const shared = words.filter(w => hit(low, w)).length;
      const sameNumbers = [...numbersIn(m.question)].filter(n => nums.has(n)).length;
      return { m, shared, score: shared + 2 * sameNumbers };
    })
    // Most of the question's words, and at least two of them: a market about something else is no crowd.
    .filter(x => x.shared >= Math.min(2, words.length) && x.shared >= words.length / 3)
    .sort((a, b) => b.score - a.score || b.m.volume - a.m.volume)
    .filter(x => { const k = `${x.m.platform}:${x.m.question.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max)
    .map(x => x.m);
}

const oddsCache = memo<MarketFind[]>(15 * 60_000);

/** The open markets either platform finds for a search. */
export async function searchMarkets(q: string, api: Fetcher, signal: AbortSignal): Promise<MarketFind[]> {
  const key = q.toLowerCase().trim();
  if (!key) return [];
  const kept = oddsCache.get(key);
  if (kept) return kept;
  const get = (url: string) => api(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  }).then(r => (r.ok ? r.text() : '')).catch(() => '');
  const [poly, mani] = await Promise.all([
    get(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=10&events_status=active`),
    get(`https://api.manifold.markets/v0/search-markets?term=${encodeURIComponent(q)}&limit=10&filter=open&contractType=BINARY`),
  ]);
  const found = [...parsePolymarket(poly), ...parseManifold(mani)];
  if (found.length) oddsCache.set(key, found);
  return found;
}

/** A market's price as a line the actors and the report can quote. */
export function oddsLine(m: Odds): string {
  const vol = m.volume >= 1e6 ? `${(m.volume / 1e6).toFixed(1)}M` : m.volume >= 1e3 ? `${Math.round(m.volume / 1e3)}K` : `${Math.round(m.volume)}`;
  const traded = m.platform === 'Polymarket' ? `$${vol} traded` : `${vol} mana traded`;
  const closes = m.closes ? `, closes ${m.closes.slice(0, 10)}` : '';
  return `${m.platform} traders price YES at ${Math.round(m.probability * 1000) / 10}% (${traded}${closes}).`;
}
