import { useState, useEffect, useCallback } from 'react';
import { 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { isSupportedFxCurrency, SUPPORTED_FX_CURRENCIES } from '../fxRates';
import {
  getUserActiveCurrencies, 
  saveUserActiveCurrencies
} from '../utils';

export const ISO_4217_CODES: Set<string> = new Set(SUPPORTED_FX_CURRENCIES);

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
    const upper = currentCurrency?.toUpperCase();
    if (upper && !list.includes(upper)) {
      return [upper, ...list];
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

  // Keep active currencies in sync with storage changes
  useEffect(() => {
    const handleStorage = () => {
      const list = getUserActiveCurrencies();
      setActiveCurrencies(list);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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

    if (!isSupportedFxCurrency(code)) {
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
      let fetchedRate = fxRates.rates[code];

      if (!fetchedRate) {
        const res = await fetch(`/api/fx-rates/${code}`);
        if (!res.ok) {
          throw new Error(`해당 통화의 환율을 가져올 수 없습니다 (${code}, HTTP ${res.status}).`);
        }
        const data = await res.json();
        if (
          data?.code !== code
          || typeof data.rate !== 'number'
          || !Number.isFinite(data.rate)
          || data.rate <= 0
          || !data.rates
          || data.rates.KRW !== 1
          || data.rates[code] !== data.rate
          || !['frankfurter', 'estimated'].includes(data.source)
          || typeof data.stale !== 'boolean'
        ) {
          throw new Error(`해당 통화의 환율 응답이 올바르지 않습니다 (${code}).`);
        }
        fetchedRate = data.rate;

        // Notify parent of updated rates table
        if (onFxRatesUpdated) {
          onFxRatesUpdated({
            ...fxRates,
            rates: data.rates,
            source: data.source,
            updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : fxRates.updatedAt,
            stale: data.stale,
            fetchedAt: new Date().toISOString(),
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
