import React, { useMemo } from 'react';
import { AssetAccount, AssetCategoryType, FxRates, SupportedCurrency } from '../../types';
import { convertCurrency, formatCurrency } from '../../utils';
import { useI18n } from '../../i18n';

export interface PortfolioAllocationRow {
  type: AssetCategoryType;
  label: string;
  amount: number;
  percentage: number;
  barColor: string;
  dotColor: string;
}

export interface VaultAllocationChartProps {
  portfolioRows: PortfolioAllocationRow[];
  accounts: AssetAccount[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  isLight: boolean;
  stealthMode: boolean;
}

interface CurrencyExposureRow {
  currency: SupportedCurrency;
  nativeAmount: number;
  convertedAmount: number;
  sharePercent: number;
}

const CURRENCY_BAR_COLORS: Record<string, string> = {
  KRW: 'bg-sky-400',
  USD: 'bg-emerald-400',
  JPY: 'bg-amber-400',
  EUR: 'bg-indigo-400',
  GBP: 'bg-purple-400',
  CNY: 'bg-teal-400',
};

export const VaultAllocationChart: React.FC<VaultAllocationChartProps> = React.memo(({
  portfolioRows,
  accounts,
  currentCurrency,
  fxRates,
  isLight,
  stealthMode,
}) => {
  const { t, language } = useI18n();
  const isKo = language === 'ko';

  // Compute currency exposure breakdown across positive asset balances
  const currencyExposure = useMemo<CurrencyExposureRow[]>(() => {
    const totalsByCurrency = new Map<SupportedCurrency, { native: number; converted: number }>();

    for (const acc of accounts) {
      if (acc.assetType === 'LIABILITY' || acc.currentBalance <= 0) continue;
      const curr = (acc.currency || 'KRW') as SupportedCurrency;
      const converted = convertCurrency(acc.currentBalance, curr, currentCurrency, fxRates);
      const prev = totalsByCurrency.get(curr) || { native: 0, converted: 0 };
      totalsByCurrency.set(curr, {
        native: prev.native + acc.currentBalance,
        converted: prev.converted + Math.max(0, converted),
      });
    }

    if (totalsByCurrency.size <= 1) return [];

    const totalConverted = Array.from(totalsByCurrency.values()).reduce(
      (sum, entry) => sum + entry.converted,
      0
    );
    if (totalConverted <= 0) return [];

    return Array.from(totalsByCurrency.entries())
      .map(([currency, { native, converted }]) => ({
        currency,
        nativeAmount: native,
        convertedAmount: converted,
        sharePercent: (converted / totalConverted) * 100,
      }))
      .sort((a, b) => b.convertedAmount - a.convertedAmount);
  }, [accounts, currentCurrency, fxRates]);

  return (
    <div
      className={`p-5 rounded-2xl border backdrop-blur-xl transition-all ${
        isLight
          ? 'bg-white/85 border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900'
          : 'bg-[var(--surface-card)]/90 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}
    >
      <div className="flex items-center justify-between mb-3.5">
        <h2 className={`text-sm font-medium tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {t('portfolio_ratio')}
        </h2>
        <span className={`text-xs font-normal ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
          {t('accounts_count', { count: accounts.length })}
        </span>
      </div>

      <div className="space-y-3 px-1 py-1">
        {portfolioRows.map((item) => (
          <div key={item.type} className="group">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isLight ? 'text-slate-800' : 'text-neutral-200'}`}>
                {item.label}
              </span>
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-xs tabular-nums font-mono font-medium ${
                    isLight ? 'text-slate-900' : 'text-white'
                  } ${stealthMode && item.amount > 0 ? 'blur-xs' : ''}`}
                >
                  {formatCurrency(item.amount, currentCurrency)}
                </span>
                <span
                  className={`text-xs font-mono w-10 text-right font-medium ${
                    isLight ? 'text-slate-700' : 'text-neutral-300'
                  }`}
                >
                  {item.percentage > 0 ? `${item.percentage.toFixed(0)}%` : '0%'}
                </span>
              </div>
            </div>
            <div
              className={`w-full h-1.5 rounded-full overflow-hidden mt-1.5 ${
                isLight ? 'bg-slate-200/80' : 'bg-white/[0.08]'
              }`}
            >
              <div
                style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                className={`h-full ${item.barColor} rounded-full transition-all duration-500`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Multi-Currency Exposure Breakdown (shown when holding assets in 2+ currencies) */}
      {currencyExposure.length > 1 && (
        <div className="mt-4 pt-3.5 border-t border-white/[0.06] px-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-neutral-300'}`}>
              {isKo ? '통화별 자산 노출' : 'Currency Exposure'}
            </span>
            <span className={`text-[11px] tabular-nums ${isLight ? 'text-slate-600' : 'text-neutral-400'}`}>
              {currencyExposure.length} {isKo ? '개 통화' : 'currencies'}
            </span>
          </div>

          <div
            className={`w-full h-1.5 rounded-full overflow-hidden flex ${
              isLight ? 'bg-slate-200/80' : 'bg-white/[0.08]'
            }`}
          >
            {currencyExposure.map((row) => (
              <div
                key={row.currency}
                style={{ width: `${Math.max(2, row.sharePercent)}%` }}
                className={`h-full ${CURRENCY_BAR_COLORS[row.currency] || 'bg-neutral-400'} transition-all duration-500`}
                title={`${row.currency}: ${row.sharePercent.toFixed(1)}%`}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {currencyExposure.map((row) => (
              <div key={row.currency} className="flex items-center justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      CURRENCY_BAR_COLORS[row.currency] || 'bg-neutral-400'
                    }`}
                  />
                  <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-neutral-200'}`}>
                    {row.currency}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
                  <span
                    className={`${isLight ? 'text-slate-700' : 'text-neutral-300'} ${
                      stealthMode ? 'blur-xs select-none' : ''
                    }`}
                  >
                    {formatCurrency(Math.round(row.nativeAmount), row.currency)}
                  </span>
                  <span className={isLight ? 'text-slate-500' : 'text-neutral-400'}>
                    {row.sharePercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

VaultAllocationChart.displayName = 'VaultAllocationChart';
