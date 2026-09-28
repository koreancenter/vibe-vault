import { useState, useEffect, useCallback } from 'react';
import { 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { 
  DEFAULT_FX_RATES, 
  getUserActiveCurrencies, 
  saveUserActiveCurrencies,
  KNOWN_CURRENCY_NAMES
} from '../utils';

// Standard ISO 4217 Currency Codes Set for Validation
export const ISO_4217_CODES: Set<string> = new Set([
  'KRW', 'USD', 'IDR', 'JPY', 'EUR', 'GBP', 'CNY', 'CAD', 'AUD', 'SGD',
  'HKD', 'THB', 'VND', 'CHF', 'TWD', 'PHP', 'INR', 'MYR', 'NZD', 'BRL',
  'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'ZAR', 'AED', 'SAR', 'CZK',
  'HUF', 'ILS', 'CLP', 'COP', 'EGP', 'KWD', 'QAR', 'RUB', 'BGN', 'RON'
]);

export interface UseUserCurrenciesReturn {
  activeCurrencies: string[];
  addCurrency: (rawCode: string) => Promise<{ success: boolean; error?: string }>;
  removeCurrency: (code: string) => void;
  isLoadingRate: boolean;
  activeError: string | null;
  clearError: () => void;
}

export function useUserCurrencies(
  currentCurrency: SupportedCurrency,
  fxRates: FxRates,
  onFxRatesUpdated?: (rates: FxRates) => void
): UseUserCurrenciesReturn {
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(() => {
    const list = getUserActiveCurrencies();
    // Ensure currently selected currency is always in the active list
    if (currentCurrency && !list.includes(currentCurrency.toUpperCase())) {
      const merged = [currentCurrency.toUpperCase(), ...list];
      saveUserActiveCurrencies(merged);
      return merged;
    }
    return list;
  });

  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Sync when currentCurrency prop changes
  useEffect(() => {
    if (currentCurrency) {
      const upper = currentCurrency.toUpperCase();
      setActiveCurrencies(prev => {
        if (!prev.includes(upper)) {
          const updated = [...prev, upper];
          saveUserActiveCurrencies(updated);
          return updated;
        }
        return prev;
      });
    }
  }, [currentCurrency]);

  const clearError = useCallback(() => {
    setActiveError(null);
  }, []);

  const addCurrency = useCallback(async (rawCode: string): Promise<{ success: boolean; error?: string }> => {
    setActiveError(null);
    const code = rawCode.trim().toUpperCase();

    if (!code) {
      const err = '통화 코드를 입력해주세요 (예: IDR, JPY, EUR).';
      setActiveError(err);
      return { success: false, error: err };
    }

    if (!/^[A-Z]{3}$/.test(code)) {
      const err = '유효한 3자리 ISO 통화 코드를 입력해주세요 (예: USD, IDR).';
      setActiveError(err);
      return { success: false, error: err };
    }

    if (!ISO_4217_CODES.has(code) && !KNOWN_CURRENCY_NAMES[code]) {
      const err = `지원되지 않는 ISO 4217 통화 코드입니다: ${code}`;
      setActiveError(err);
      return { success: false, error: err };
    }

    if (activeCurrencies.includes(code)) {
      const err = `이미 활성 통화 목록에 추가되어 있습니다: ${code}`;
      setActiveError(err);
      return { success: false, error: err };
    }

    setIsLoadingRate(true);
    try {
      // Fetch latest FX rate for this currency from server or fallback
      let fetchedRate = fxRates.rates[code];

      if (!fetchedRate) {
        try {
          const res = await fetch(`/api/fx-rates/${code}`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.rate === 'number') {
              fetchedRate = data.rate;
            }
          }
        } catch (fetchErr) {
          console.warn(`Could not fetch online rate for ${code}, using fallback:`, fetchErr);
        }

        // Check fallback known rates
        if (!fetchedRate && KNOWN_CURRENCY_NAMES[code]?.fallbackRateToKrw) {
          const krwPerUnit = KNOWN_CURRENCY_NAMES[code].fallbackRateToKrw || 1;
          fetchedRate = 1 / krwPerUnit;
        }

        if (!fetchedRate) {
          fetchedRate = DEFAULT_FX_RATES.rates[code] || 0.001;
        }

        // Notify parent of updated rates table
        if (onFxRatesUpdated) {
          onFxRatesUpdated({
            ...fxRates,
            rates: {
              ...fxRates.rates,
              [code]: fetchedRate
            },
            updatedAt: new Date().toISOString()
          });
        }
      }

      const updated = [...activeCurrencies, code];
      setActiveCurrencies(updated);
      saveUserActiveCurrencies(updated);
      return { success: true };
    } catch (err: any) {
      const msg = err.message || '환율 정보를 가져오는데 실패했습니다.';
      setActiveError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoadingRate(false);
    }
  }, [activeCurrencies, fxRates, onFxRatesUpdated]);

  const removeCurrency = useCallback((codeToRemove: string) => {
    const upper = codeToRemove.toUpperCase();
    // Cannot remove currently selected base display currency
    if (upper === currentCurrency.toUpperCase()) {
      setActiveError('현재 기본 기준 통화는 목록에서 제거할 수 없습니다.');
      return;
    }

    // Retain at least 1 currency
    if (activeCurrencies.length <= 1) {
      setActiveError('최소 1개 이상의 통화가 유지되어야 합니다.');
      return;
    }

    setActiveError(null);
    const updated = activeCurrencies.filter(c => c !== upper);
    setActiveCurrencies(updated);
    saveUserActiveCurrencies(updated);
  }, [activeCurrencies, currentCurrency]);

  return {
    activeCurrencies,
    addCurrency,
    removeCurrency,
    isLoadingRate,
    activeError,
    clearError,
  };
}
