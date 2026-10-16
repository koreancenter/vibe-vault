import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FX_RATES,
  FRANKFURTER_QUOTES,
  getCachedFxRates,
  isSupportedFxCurrency,
  isFxRatesPayload,
  parseFrankfurterRates,
  type FxRateCache,
} from '../src/fxRates';
import { assertCloudScanSource } from '../src/scanValidation';
import { convertCurrency } from '../src/utils';

const makeFrankfurterPayload = (date: string) => FRANKFURTER_QUOTES.map((quote) => ({
  base: 'KRW',
  quote,
  date,
  rate: quote === 'USD' ? 0.00075 : 0.01,
}));

describe('Phase 3 financial output safeguards', () => {
  it('shares the supported currency list with validation consumers', () => {
    expect(isSupportedFxCurrency('usd')).toBe(true);
    expect(isSupportedFxCurrency('KRW')).toBe(true);
    expect(isSupportedFxCurrency('XYZ')).toBe(false);
  });

  it('parses dated KRW-base rates and rejects incomplete or invalid provider data', () => {
    const rates = parseFrankfurterRates(
      makeFrankfurterPayload('2026-10-15'),
      Date.parse('2026-10-15T12:00:00Z'),
    );
    expect(rates.base).toBe('KRW');
    expect(rates.rates.USD).toBe(0.00075);
    expect(rates.source).toBe('frankfurter');
    expect(rates.updatedAt).toBe('2026-10-15');
    expect(rates.stale).toBe(false);
    expect(isFxRatesPayload(rates)).toBe(true);

    expect(() => parseFrankfurterRates([])).toThrow(/omitted supported rates/);
    const invalid = makeFrankfurterPayload('2026-10-15');
    invalid[0].rate = 0;
    expect(() => parseFrankfurterRates(invalid)).toThrow(/omitted supported rates/);
  });

  it('marks old provider data stale and identifies estimated rates as estimated', () => {
    const oldRates = parseFrankfurterRates(
      makeFrankfurterPayload('2026-10-10'),
      Date.parse('2026-10-15T12:00:00Z'),
    );
    expect(oldRates.stale).toBe(true);
    expect(DEFAULT_FX_RATES.source).toBe('estimated');
    expect(DEFAULT_FX_RATES.updatedAt).toBeUndefined();
  });

  it('serves stale rates after refresh failure and explicit estimates when no live rates exist', async () => {
    const now = 10_000_000;
    const liveRates = parseFrankfurterRates(
      makeFrankfurterPayload('2026-10-15'),
      Date.parse('2026-10-15T12:00:00Z'),
    );
    const staleCache: FxRateCache = {
      value: liveRates,
      fetchedAt: now - 7 * 60 * 60 * 1000,
    };
    const staleResult = await getCachedFxRates(staleCache, now, async () => {
      throw new Error('offline');
    });
    expect(staleResult.refreshFailed).toBe(true);
    expect(staleResult.rates.source).toBe('frankfurter');
    expect(staleResult.rates.stale).toBe(true);

    const unavailable = await getCachedFxRates({}, now, async () => {
      throw new Error('offline');
    });
    expect(unavailable.refreshFailed).toBe(true);
    expect(unavailable.rates.source).toBe('estimated');
  });

  it('converts KRW-base rates in the correct direction and rejects missing currency rates', () => {
    expect(convertCurrency(2, 'USD', 'KRW', {
      ...DEFAULT_FX_RATES,
      rates: { KRW: 1, USD: 0.00075 },
    })).toBe(2667);
    expect(convertCurrency(1333, 'KRW', 'USD', {
      ...DEFAULT_FX_RATES,
      rates: { KRW: 1, USD: 0.00075 },
    })).toBe(1);
    expect(() => convertCurrency(100, 'XYZ', 'KRW', DEFAULT_FX_RATES))
      .toThrow(/Exchange rate unavailable for XYZ/);
  });

  it('rejects image scan results that are not real cloud scans', () => {
    expect(() => assertCloudScanSource('gemini', 'scan unavailable')).not.toThrow();
    expect(() => assertCloudScanSource('local', 'scan unavailable'))
      .toThrow('scan unavailable');
    expect(() => assertCloudScanSource(undefined, 'scan unavailable'))
      .toThrow('scan unavailable');
  });
});
