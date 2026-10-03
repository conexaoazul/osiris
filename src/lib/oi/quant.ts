/**
 * OSIRIS OI: what a market price's own history says, before any actor moves.
 *
 * For a question that turns on a price (a coin, a share, an index, a
 * commodity, a currency), the outside view is the market itself: where the
 * price is and how far it habitually moves. This turns a daily price history
 * into that view with no model's opinion in it: the instrument's own daily
 * moves, demeaned so a past rally or slide is not assumed to repeat, are
 * resampled into thousands of paths to the horizon, and the paths say how
 * often the price touches or ends beyond a level, and where it ends.
 *
 * The same resampling gives each simulated world its own course for the
 * price, spread across what can happen (one world drawn from the low end,
 * one from the middle, one from the high end), so the worlds the actors play
 * in differ the way markets do. The actors' events then push a world's price
 * further, and a world settles a price question only when its price gets
 * there.
 *
 * Pure and deterministic: the same history always gives the same paths.
 */
import type { Measure, Quant } from './types';

/** A daily price history, oldest first. */
export interface Series {
  symbol: string;
  name: string;
  currency: string;
  /** YYYY-MM-DD, one per trading day. */
  dates: string[];
  /** The quoted closing price. */
  closes: number[];
  /** Closes adjusted for splits and dividends, where the market has them: what returns are read from. */
  adjusted?: number[];
}

export interface SeriesStats {
  price: number;
  asOf: string;
  /** The past year's highest and lowest close, and when. */
  high: number;
  highOn: string;
  low: number;
  lowOn: string;
  /** Change over 30, 90 and 365 calendar days, as a fraction; null where the history is shorter. */
  change30: number | null;
  change90: number | null;
  change365: number | null;
  /** Annualised volatility of daily log returns. */
  vol: number;
  /** Trading days a year: about 252 for a share, 365 for a coin. */
  perYear: number;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Daily log returns, read from the adjusted closes where there are any. */
export function logReturns(s: Series): number[] {
  const px = s.adjusted?.length === s.closes.length ? s.adjusted : s.closes;
  const out: number[] = [];
  for (let i = 1; i < px.length; i++) {
    const r = Math.log(px[i] / px[i - 1]);
    if (Number.isFinite(r)) out.push(r);
  }
  return out;
}

/** The returns with their average taken out: the shape of the moves, without assuming the trend goes on. */
export function demean(returns: number[]): number[] {
  if (!returns.length) return [];
  const mean = returns.reduce((t, r) => t + r, 0) / returns.length;
  return returns.map(r => r - mean);
}

const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((t, x) => t + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Where the price is and how it has moved. Null for a history too short to say (under 30 days). */
export function seriesStats(s: Series): SeriesStats | null {
  const n = s.closes.length;
  if (n < 30 || s.dates.length !== n) return null;
  const asOf = s.dates[n - 1];
  const price = s.closes[n - 1];
  const span = Math.max(1, daysBetween(s.dates[0], asOf));
  const perYear = Math.round(((n - 1) / span) * 365);
  const yearAgo = Date.parse(asOf) - 365 * DAY;
  let high = -Infinity, low = Infinity, highOn = asOf, lowOn = asOf;
  for (let i = 0; i < n; i++) {
    if (Date.parse(s.dates[i]) < yearAgo) continue;
    if (s.closes[i] > high) { high = s.closes[i]; highOn = s.dates[i]; }
    if (s.closes[i] < low) { low = s.closes[i]; lowOn = s.dates[i]; }
  }
  const back = (days: number): number | null => {
    const t = Date.parse(asOf) - days * DAY;
    if (Date.parse(s.dates[0]) > t + 3 * DAY) return null;
    // The last close on or before the day.
    let i = n - 1;
    while (i > 0 && Date.parse(s.dates[i]) > t) i--;
    return price / s.closes[i] - 1;
  };
  return {
    price, asOf, high, highOn, low, lowOn,
    change30: back(30), change90: back(90), change365: back(365),
    vol: std(logReturns(s)) * Math.sqrt(perYear),
    perYear,
  };
}

/** A small, fast, seeded generator (mulberry32): the same seed, the same draws. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from text, so an instrument always resamples the same way. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Trading days in a stretch of calendar days, for an instrument that trades `perYear` days a year. */
export const tradingDays = (calendarDays: number, perYear: number) => Math.max(1, Math.round((Math.max(0, calendarDays) * perYear) / 365));

export interface Paths {
  /** Each path's last, highest and lowest price, as a multiple of where it started. */
  final: Float64Array;
  max: Float64Array;
  min: Float64Array;
}

/** `count` paths of `steps` days, each day one of the history's own moves drawn at random. */
export function resample(returns: number[], steps: number, count: number, seed: number): Paths {
  const final = new Float64Array(count), max = new Float64Array(count), min = new Float64Array(count);
  const draw = rng(seed);
  const n = returns.length;
  for (let p = 0; p < count; p++) {
    let x = 0, hi = 0, lo = 0;
    for (let d = 0; d < steps && n; d++) {
      x += returns[Math.floor(draw() * n)];
      if (x > hi) hi = x;
      if (x < lo) lo = x;
    }
    final[p] = Math.exp(x);
    max[p] = Math.exp(hi);
    min[p] = Math.exp(lo);
  }
  return { final, max, min };
}

const quantile = (sorted: Float64Array | number[], q: number) => {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** Whether a path that started at `price` met the measure's level: touched it, or ended beyond it. */
function met(m: Measure, price: number, p: Paths, i: number): boolean {
  const level = m.threshold!;
  if (m.direction === 'below') return price * (m.touch ? p.min[i] : p.final[i]) <= level;
  return price * (m.touch ? p.max[i] : p.final[i]) >= level;
}

/** The chance a price at `price` meets the measure's level within `steps` trading days, by resampling. */
export function chanceOf(m: Measure, price: number, returns: number[], steps: number, seed: number, count = 2000): number {
  if (m.threshold === undefined) return NaN;
  const already = m.direction === 'below' ? price <= m.threshold : price >= m.threshold;
  if (already && m.touch) return 1;
  const p = resample(returns, steps, count, seed);
  let hits = 0;
  for (let i = 0; i < count; i++) if (met(m, price, p, i)) hits++;
  return hits / count;
}

const PATHS = 4000;

const money = (n: number, currency: string) => {
  const d = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return `${currency === 'USD' ? '$' : ''}${n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: n >= 1000 ? 0 : Math.min(d, 2) })}${currency && currency !== 'USD' ? ` ${currency}` : ''}`;
};

/**
 * The statistical baseline for a question about a price: from today to the
 * horizon, how often the resampled paths meet the measure's level (a yes/no
 * question about a level), and where the price ends (its 10th, 50th and 90th
 * percentile). Null when the history is too short or the horizon has passed.
 */
export function baseline(s: Series, m: Measure, today: string, horizon: string): Quant | null {
  const stats = seriesStats(s);
  const days = daysBetween(today, horizon);
  if (!stats || !(days > 0)) return null;
  const returns = demean(logReturns(s));
  const steps = tradingDays(days, stats.perYear);
  const p = resample(returns, steps, PATHS, seedOf(`${s.symbol}:${horizon}`));
  const ends = Float64Array.from(p.final).sort();
  let probability: number | undefined;
  if (m.threshold !== undefined) {
    let hits = 0;
    for (let i = 0; i < PATHS; i++) if (met(m, stats.price, p, i)) hits++;
    probability = hits / PATHS;
  }
  const years = Math.max(1, Math.round(daysBetween(s.dates[0], stats.asOf) / 365));
  const level = m.threshold !== undefined
    ? ` ${m.touch ? (m.direction === 'below' ? 'fall to' : 'reach') : (m.direction === 'below' ? 'end below' : 'end above')} ${money(m.threshold, s.currency)}`
    : '';
  return {
    symbol: s.symbol,
    name: s.name,
    currency: s.currency,
    price: stats.price,
    asOf: stats.asOf,
    vol: stats.vol,
    days,
    ...(probability !== undefined ? { probability } : {}),
    p10: stats.price * quantile(ends, 0.1),
    p50: stats.price * quantile(ends, 0.5),
    p90: stats.price * quantile(ends, 0.9),
    method: `${PATHS.toLocaleString('en-US')} paths to ${horizon}, each day one of ${s.symbol}'s own daily moves from the past ${years === 1 ? 'year' : `${years} years`} drawn at random (volatility ${Math.round(stats.vol * 100)}% a year, average trend removed)${probability !== undefined ? `: ${Math.round(probability * 1000) / 10}% of them${level}` : ''}.`,
  };
}

/** One period of a world's price course, as multiples of the price the world started at. */
export interface CourseStep { close: number; high: number; low: number }

/**
 * A price course for each world, period by period, before any event pushes
 * it: drawn from many resampled paths and spread evenly across them by where
 * they end, so a handful of worlds still spans what can happen. The first
 * world, which follows the likeliest course, takes the middle of the range;
 * the others alternate below and above it.
 */
export function worldCourses(returns: number[], stepsPerPeriod: number[], worlds: number, seed: number, pool = 300): CourseStep[][] {
  const draw = rng(seed);
  const n = returns.length;
  const candidates: CourseStep[][] = [];
  for (let c = 0; c < pool; c++) {
    let x = 0;
    const course: CourseStep[] = [];
    for (const steps of stepsPerPeriod) {
      let hi = x, lo = x;
      for (let d = 0; d < steps && n; d++) {
        x += returns[Math.floor(draw() * n)];
        if (x > hi) hi = x;
        if (x < lo) lo = x;
      }
      course.push({ close: Math.exp(x), high: Math.exp(hi), low: Math.exp(lo) });
    }
    candidates.push(course);
  }
  const last = (c: CourseStep[]) => c[c.length - 1]?.close ?? 1;
  candidates.sort((a, b) => last(a) - last(b));
  // Evenly spaced through the range, then dealt out from the middle: nearest the median first, the lower of a tie first.
  const qs = Array.from({ length: worlds }, (_, w) => (w + 0.5) / worlds)
    .sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5) || a - b);
  return qs.map(q => candidates[Math.min(pool - 1, Math.floor(q * pool))]);
}

/** A price as the prompts and the panel say it: "$119.57", "4,512", "1.0842 EUR". */
export const priceText = money;
