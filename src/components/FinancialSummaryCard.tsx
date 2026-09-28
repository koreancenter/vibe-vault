import React, { useMemo } from 'react';
import { Transaction, FxRates } from '../types';
import { subMonths, isSameMonth, isSameYear, parseISO, format } from 'date-fns';
import { convertCurrency, DEFAULT_FX_RATES, getCurrencySymbol, getDualCurrencyComparison } from '../utils';

interface FinancialSummaryCardProps {
  transactions: Transaction[];
  currencySymbol?: string;
  fxRates?: FxRates;
  isStealth?: boolean;
  theme?: 'light' | 'dark';
  secondaryCurrency?: string;
  isMultiCurrencyMode?: boolean;
}

export const FinancialSummaryCard: React.FC<FinancialSummaryCardProps> = ({
  transactions,
  currencySymbol = 'KRW',
  fxRates = DEFAULT_FX_RATES,
  isStealth = false,
  theme = 'dark',
  secondaryCurrency,
  isMultiCurrencyMode = false,
}) => {
  const isLight = theme === 'light';
  const currSymbol = getCurrencySymbol(currencySymbol);

  const summary = useMemo(() => {
    const now = new Date();
    const prevMonthDate = subMonths(now, 1);

    const getAmountInTarget = (t: Transaction) => {
      const fromCurr = t.currency || 'KRW';
      return convertCurrency(t.amount, fromCurr, currencySymbol, fxRates);
    };

    // Current month expenses
    const currentMonthExpenses = transactions.filter((t) => {
      try {
        const d = parseISO(t.date);
        return t.type === 'EXPENSE' && isSameMonth(d, now) && isSameYear(d, now);
      } catch {
        return false;
      }
    });
    const currentSpending = currentMonthExpenses.reduce((acc, t) => acc + getAmountInTarget(t), 0);

    // Previous month expenses
    const prevMonthExpenses = transactions.filter((t) => {
      try {
        const d = parseISO(t.date);
        return t.type === 'EXPENSE' && isSameMonth(d, prevMonthDate) && isSameYear(d, prevMonthDate);
      } catch {
        return false;
      }
    });
    const prevSpending = prevMonthExpenses.reduce((acc, t) => acc + getAmountInTarget(t), 0);

    const diff = currentSpending - prevSpending;

    let status: 'better' | 'worse' | 'neutral' = 'neutral';
    let percentChange = 0;

    if (prevSpending === 0 && currentSpending === 0) {
      status = 'neutral';
      percentChange = 0;
    } else if (prevSpending === 0) {
      status = 'worse';
      percentChange = 100;
    } else {
      percentChange = Math.round((Math.abs(diff) / prevSpending) * 100);
      if (diff < 0) {
        status = 'better'; // Spent less than previous month
      } else if (diff > 0) {
        status = 'worse'; // Spent more than previous month
      } else {
        status = 'neutral';
      }
    }

    return {
      now,
      prevMonthDate,
      currentSpending,
      prevSpending,
      diff,
      status,
      percentChange,
      currentCount: currentMonthExpenses.length,
      prevCount: prevMonthExpenses.length,
    };
  }, [transactions, currencySymbol, fxRates]);

  const {
    now,
    prevMonthDate,
    currentSpending,
    prevSpending,
    diff,
    status,
    percentChange,
  } = summary;

  const currentMonthName = format(now, 'M월');
  const prevMonthName = format(prevMonthDate, 'M월');

  // Dual Currency Comparison (Primary + Secondary e.g. IDR + KRW)
  const dualCurrency = useMemo(() => {
    return getDualCurrencyComparison(currentSpending, currencySymbol, fxRates, secondaryCurrency);
  }, [currentSpending, currencySymbol, fxRates, secondaryCurrency]);

  // Dynamic Font Scaling:
  // If formatted value > 12 characters: reduce size to text-xl md:text-2xl font-light tracking-tight
  // If formatted value <= 12 characters: retain text-2xl md:text-3xl font-light tracking-tight
  const formattedHeroAmount = `${currSymbol} ${currentSpending.toLocaleString()}`;
  const isLongAmount = formattedHeroAmount.length > 12;
  const heroFontSizeClass = isLongAmount
    ? 'text-xl md:text-2xl font-light tracking-tight'
    : 'text-2xl md:text-3xl font-light tracking-tight';

  return (
    <section 
      id="financial-summary-card"
      className={`relative transition-all p-5 sm:p-6 rounded-2xl backdrop-blur-2xl ${
        isLight 
          ? 'bg-white/85 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
          : 'bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
      }`}
    >
      {/* Top Header: Title & Subtle Status Badge */}
      <div className="flex items-center justify-between pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-xs font-normal tracking-wide ${
              isLight ? 'text-slate-800' : 'text-slate-200'
            }`}>
              재무 요약
            </h3>
            <span className="text-white/20 font-light text-xs">·</span>
            <span className={`text-xs font-light ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              월별 지출 비교
            </span>
          </div>
          <p className={`text-xs font-light mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {prevMonthName} 대비 {currentMonthName} 지출 변동
          </p>
        </div>

        {/* Quiet Luxury Status Indicator */}
        <div id="financial-status-indicator">
          {status === 'better' && (
            <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-medium border tabular-nums transition-all ${
              isLight 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}>
              <span>절약</span>
              <span className="text-[11px] opacity-75">(-{percentChange}%)</span>
            </div>
          )}

          {status === 'worse' && (
            <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-medium border tabular-nums transition-all ${
              isLight 
                ? 'bg-rose-50 text-rose-800 border-rose-200' 
                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            }`}>
              <span>초과</span>
              <span className="text-[11px] opacity-75">(+{percentChange}%)</span>
            </div>
          )}

          {status === 'neutral' && (
            <div className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-normal border ${
              isLight 
                ? 'bg-slate-100 text-slate-600 border-slate-200' 
                : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
            }`}>
              <span>유지</span>
            </div>
          )}
        </div>
      </div>

      {/* Re-balanced comparison metrics grid:
          On mobile: "이번 달" takes the top full width (col-span-2) so high-denomination amounts never wrap.
          On desktop: sm:grid-cols-[1fr_1.45fr_1fr] gives "이번 달" ample 1.45fr horizontal space. */}
      <div className={`grid grid-cols-2 sm:grid-cols-[1fr_1.45fr_1fr] gap-4 pt-3.5 border-t ${
        isLight ? 'border-slate-200/60' : 'border-t border-white/[0.05]'
      }`}>
        {/* Previous Month Spending */}
        <div className="order-2 sm:order-1 col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            지난달 ({prevMonthName})
          </span>
          <div className={`mt-1.5 flex items-baseline whitespace-nowrap tabular-nums min-w-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className="text-base font-light text-slate-500 mr-1 whitespace-nowrap">{currSymbol}</span>
            <span className={`text-base sm:text-lg md:text-xl font-light tabular-nums whitespace-nowrap ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {prevSpending.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Current Month Spending (Hero Number with ample horizontal space & dual-currency comparison) */}
        <div className="order-1 sm:order-2 col-span-2 sm:col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            이번 달 ({currentMonthName})
          </span>
          <div className="mt-1.5 flex flex-col justify-start min-w-0">
            <div className={`flex items-baseline whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
              <span className="text-lg md:text-xl font-light text-slate-400 mr-1 whitespace-nowrap">{currSymbol}</span>
              <span className={`${heroFontSizeClass} whitespace-nowrap tabular-nums ${
                status === 'better'
                  ? isLight ? 'text-emerald-700' : 'text-emerald-400 font-medium drop-shadow-[0_0_8px_rgba(52,211,153,0.25)]'
                  : status === 'worse'
                  ? isLight ? 'text-rose-700' : 'text-rose-400/90'
                  : isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {currentSpending.toLocaleString()}
              </span>
            </div>

            {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
            {isMultiCurrencyMode && dualCurrency && (
              <div className={`mt-1 ${isStealth ? 'blur-xs select-none' : ''}`}>
                <span className="text-xs text-slate-400 font-light whitespace-nowrap tabular-nums">
                  ≈ {dualCurrency.secondaryFormatted} · 환율 {dualCurrency.rateText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Difference Amount */}
        <div className="order-3 sm:order-3 col-span-1 sm:col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            status === 'better'
              ? isLight ? 'text-emerald-700' : 'text-emerald-400 font-medium drop-shadow-[0_0_8px_rgba(52,211,153,0.25)]'
              : status === 'worse'
              ? isLight ? 'text-rose-700' : 'text-rose-400/90'
              : isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            전월 대비 변동
          </span>
          <div className={`flex flex-wrap items-baseline gap-1 mt-1.5 whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className={`text-sm md:text-base font-medium tracking-tight tabular-nums whitespace-nowrap ${
              status === 'better'
                ? isLight ? 'text-emerald-700' : 'text-emerald-400 font-medium drop-shadow-[0_0_8px_rgba(52,211,153,0.25)]'
                : status === 'worse'
                ? isLight ? 'text-rose-700' : 'text-rose-400/90'
                : isLight ? 'text-slate-800' : 'text-white'
            }`}>
              {diff > 0 ? '+' : diff < 0 ? '-' : ''}{currSymbol} {Math.abs(diff).toLocaleString()}
            </span>
            {percentChange > 0 && (
              <span className={`text-xs font-light tabular-nums whitespace-nowrap ${
                status === 'better' ? (isLight ? 'text-emerald-700' : 'text-emerald-400 font-medium drop-shadow-[0_0_8px_rgba(52,211,153,0.25)]') : (isLight ? 'text-rose-700' : 'text-rose-400/90')
              }`}>
                ({diff < 0 ? '▼' : '▲'}{percentChange}%)
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
