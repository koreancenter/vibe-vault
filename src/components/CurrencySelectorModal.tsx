import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Coins, 
  Check, 
  Loader2, 
  AlertCircle, 
  ArrowRight,
  TrendingUp 
} from 'lucide-react';
import { SupportedCurrency, FxRates } from '../types';
import { 
  DEFAULT_FX_RATES, 
  getCurrencySymbol, 
  KNOWN_CURRENCY_NAMES 
} from '../utils';
import { useUserCurrencies } from '../hooks/useUserCurrencies';

interface CurrencySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCurrency: SupportedCurrency;
  onSelectCurrency: (code: SupportedCurrency) => void;
  fxRates?: FxRates;
  onFxRatesUpdated?: (rates: FxRates) => void;
  theme?: string;
}

/**
 * CurrencySelectorModal (통화 관리 / Active Currencies Popover)
 * Quiet Luxury Aesthetic:
 * - Slim glassmorphic card: `bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4`
 * - Dynamic active currency list with tap-to-switch horizontal pill chips
 * - Direct inline ISO 4217 currency input with live validation and FX rate fetch
 * - Muted sharp typography, no bulky country card lists or giant flag emojis
 */
export const CurrencySelectorModal: React.FC<CurrencySelectorModalProps> = ({
  isOpen,
  onClose,
  currentCurrency,
  onSelectCurrency,
  fxRates = DEFAULT_FX_RATES,
  onFxRatesUpdated,
}) => {
  const [newCurrencyInput, setNewCurrencyInput] = useState('');
  const {
    activeCurrencies,
    addCurrency,
    removeCurrency,
    isLoadingRate,
    activeError,
    clearError
  } = useUserCurrencies(currentCurrency, fxRates, onFxRatesUpdated);

  if (!isOpen) return null;

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrencyInput.trim() || isLoadingRate) return;
    const res = await addCurrency(newCurrencyInput);
    if (res.success) {
      setNewCurrencyInput('');
    }
  };

  /**
   * Helper to format approximate KRW value per 1 foreign unit:
   * e.g., "USD (₩1,333)", "IDR (₩0.086)", "EUR (₩1,450)"
   */
  const getExchangePreview = (code: string) => {
    const upper = code.toUpperCase();
    if (upper === 'KRW') return null;

    const rate = fxRates.rates[upper];
    if (rate && rate > 0) {
      const krwPerUnit = 1 / rate;
      if (krwPerUnit < 1) {
        // e.g. IDR, VND (₩0.086)
        return `₩${krwPerUnit.toFixed(3)}`;
      }
      return `₩${Math.round(krwPerUnit).toLocaleString()}`;
    }

    // Known fallback approximate
    if (KNOWN_CURRENCY_NAMES[upper]?.fallbackRateToKrw) {
      const fb = KNOWN_CURRENCY_NAMES[upper].fallbackRateToKrw!;
      return fb < 1 ? `₩${fb}` : `₩${Math.round(fb).toLocaleString()}`;
    }

    return null;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl text-slate-100 transition-all select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Slim, clean luxury header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Coins size={14} />
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
                통화 관리
                <span className="text-[10px] font-mono font-normal text-slate-400 uppercase">
                  Active Currencies
                </span>
              </h3>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Section 1: Active Currency Chips */}
        <div className="py-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">내 통화 바로가기</span>
            <span className="text-[10px] text-slate-500 font-mono">
              기준: {currentCurrency} ({getCurrencySymbol(currentCurrency)})
            </span>
          </div>

          {/* Chips container */}
          <div className="flex flex-wrap gap-1.5 pt-0.5 min-h-[38px] items-center">
            {activeCurrencies.map((code) => {
              const isBase = code.toUpperCase() === currentCurrency.toUpperCase();
              const symbol = getCurrencySymbol(code);
              const preview = getExchangePreview(code);

              return (
                <div
                  key={code}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                    isBase
                      ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300 shadow-xs'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-300'
                  }`}
                >
                  {/* Select button */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCurrency(code as SupportedCurrency);
                    }}
                    className="flex items-center gap-1 hover:text-white focus:outline-hidden"
                    title={KNOWN_CURRENCY_NAMES[code]?.nameKo || `${code} 통화로 전환`}
                  >
                    {isBase && <Check size={11} className="text-emerald-400 shrink-0 stroke-[2.5]" />}
                    <span className="font-semibold tracking-wider">{code}</span>
                    {preview && (
                      <span className="text-[10px] text-slate-400/90 tracking-tight font-sans">
                        ({preview})
                      </span>
                    )}
                  </button>

                  {/* Remove button (disabled for primary/base currency) */}
                  {!isBase && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCurrency(code);
                      }}
                      className="ml-0.5 text-slate-400 hover:text-rose-400 transition-colors p-0.5 -mr-1 rounded focus:outline-hidden"
                      title={`${code} 통화 제거`}
                      aria-label={`${code} 통화 제거`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Inline Add New Currency Form */}
        <form onSubmit={handleAddCurrency} className="pt-2 pb-1 border-t border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">새 통화 추가</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">ISO 4217</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={newCurrencyInput}
                onChange={(e) => {
                  setNewCurrencyInput(e.target.value.toUpperCase());
                  if (activeError) clearError();
                }}
                maxLength={4}
                placeholder="통화 코드 (예: IDR, JPY, EUR)..."
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-500 placeholder:font-sans focus:outline-hidden focus:border-emerald-400/50 focus:bg-white/[0.07] transition-all"
              />
              {newCurrencyInput && KNOWN_CURRENCY_NAMES[newCurrencyInput.trim().toUpperCase()] && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-sans pointer-events-none truncate max-w-[85px]">
                  {KNOWN_CURRENCY_NAMES[newCurrencyInput.trim().toUpperCase()].nameKo}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoadingRate || !newCurrencyInput.trim()}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-400/20 border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/30 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold transition-all shrink-0"
            >
              {isLoadingRate ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} strokeWidth={2.5} />
              )}
              <span>추가</span>
            </button>
          </div>

          {/* Inline Error Notice */}
          {activeError && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-400 pt-0.5 animate-in fade-in duration-100">
              <AlertCircle size={12} className="shrink-0" />
              <span className="leading-tight">{activeError}</span>
            </div>
          )}
        </form>

        {/* Footer: Quiet Luxury FX sync notice & contextual tip */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>원화 기준 자동 환율 환산</span>
          </div>
          <span className="font-mono text-[9px] text-slate-500">
            {new Date(fxRates.updatedAt || Date.now()).toLocaleDateString('ko-KR')}
          </span>
        </div>
      </div>
    </div>
  );
};
