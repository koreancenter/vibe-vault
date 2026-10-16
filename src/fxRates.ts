import type { FxRates } from './types';

export const FRANKFURTER_QUOTES = [
  'USD', 'EUR', 'JPY', 'GBP', 'IDR', 'CNY', 'CAD', 'AUD', 'SGD',
  'HKD', 'THB', 'VND', 'CHF', 'TWD', 'PHP', 'INR',
] as const;
export const SUPPORTED_FX_CURRENCIES = ['KRW', ...FRANKFURTER_QUOTES] as const;

export function isSupportedFxCurrency(code: string): boolean {
  return (SUPPORTED_FX_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}

export const DEFAULT_FX_RATES: FxRates = {
  base: 'KRW',
  rates: {
    KRW: 1,
    USD: 0.00075,
    EUR: 0.00069,
    JPY: 0.113,
    GBP: 0.00058,
    IDR: 11.63,
    CNY: 0.0054,
    CAD: 0.00102,
    AUD: 0.00115,
    SGD: 0.00101,
    HKD: 0.00585,
    THB: 0.026,
    VND: 18.6,
    CHF: 0.00066,
    TWD: 0.024,
    PHP: 0.043,
    INR: 0.063,
  },
  source: 'estimated',
  stale: false,
};

const RATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 60 * 1000;
const MAX_RATE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface FxRateCache {
  value?: FxRates;
  fetchedAt?: number;
  lastAttemptAt?: number;
}

interface FrankfurterRate {
  base: string;
  quote: string;
  date: string;
  rate: number;
}

export function parseFrankfurterRates(
  payload: unknown,
  now = Date.now(),
): FxRates {
  if (!Array.isArray(payload)) {
    throw new Error('Frankfurter returned an invalid rates response.');
  }

  const rates: Record<string, number> = { KRW: 1 };
  let latestDate: string | undefined;

  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<FrankfurterRate>;
    if (
      item.base !== 'KRW'
      || typeof item.quote !== 'string'
      || !FRANKFURTER_QUOTES.includes(item.quote as typeof FRANKFURTER_QUOTES[number])
      || typeof item.rate !== 'number'
      || !Number.isFinite(item.rate)
      || item.rate <= 0
      || typeof item.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
    ) {
      continue;
    }

    rates[item.quote] = item.rate;
    latestDate = !latestDate || item.date < latestDate ? item.date : latestDate;
  }

  const missingQuotes = FRANKFURTER_QUOTES.filter((quote) => rates[quote] === undefined);
  if (missingQuotes.length > 0 || !latestDate) {
    throw new Error(`Frankfurter omitted supported rates: ${missingQuotes.join(', ') || 'all'}.`);
  }

  return {
    base: 'KRW',
    rates,
    source: 'frankfurter',
    updatedAt: latestDate,
    fetchedAt: new Date(now).toISOString(),
    stale: now - Date.parse(`${latestDate}T23:59:59Z`) > MAX_RATE_AGE_MS,
  };
}

export async function fetchFrankfurterRates(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<FxRates> {
  const quotes = FRANKFURTER_QUOTES.join(',');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetcher(
      `https://api.frankfurter.dev/v2/rates?base=KRW&quotes=${quotes}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(`Frankfurter request failed with HTTP ${response.status}.`);
    }
    return parseFrankfurterRates(await response.json(), now);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCachedFxRates(
  cache: FxRateCache,
  now = Date.now(),
  fetchRates: (now: number) => Promise<FxRates> = (timestamp) => fetchFrankfurterRates(fetch, timestamp),
): Promise<{ rates: FxRates; refreshFailed: boolean }> {
  if (cache.value && cache.fetchedAt !== undefined && now - cache.fetchedAt < RATE_CACHE_TTL_MS) {
    return { rates: cache.value, refreshFailed: false };
  }

  if (
    cache.lastAttemptAt !== undefined
    && now - cache.lastAttemptAt < RETRY_COOLDOWN_MS
  ) {
    return {
      rates: cache.value ? { ...cache.value, stale: true } : DEFAULT_FX_RATES,
      refreshFailed: false,
    };
  }

  cache.lastAttemptAt = now;
  try {
    const rates = await fetchRates(now);
    cache.value = rates;
    cache.fetchedAt = now;
    return { rates, refreshFailed: false };
  } catch {
    return {
      rates: cache.value ? { ...cache.value, stale: true } : DEFAULT_FX_RATES,
      refreshFailed: true,
    };
  }
}

export function isFxRatesPayload(value: unknown): value is FxRates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<FxRates>;
  return data.base === 'KRW'
    && data.source !== undefined
    && (data.source === 'frankfurter' || data.source === 'estimated')
    && typeof data.stale === 'boolean'
    && !!data.rates
    && typeof data.rates === 'object'
    && data.rates.KRW === 1
    && Object.values(data.rates).every((rate) => (
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0
    ))
    && (data.source === 'estimated' || typeof data.updatedAt === 'string');
}
