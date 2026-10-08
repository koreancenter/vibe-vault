import React, { useMemo } from 'react';
import { Transaction, FxRates, LedgerSpace } from '../types';
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
  activeSpace?: LedgerSpace;
}

export const FinancialSummaryCard: React.FC<FinancialSummaryCardProps> = ({
  transactions,
  currencySymbol = 'KRW',
  fxRates = DEFAULT_FX_RATES,
  isStealth = false,
  theme = 'dark',
  secondaryCurrency,
  isMultiCurrencyMode = false,
  activeSpace,
}) => {
  const isLight = theme === 'light';
  const currSymbol = getCurrencySymbol(currencySymbol);
  const isProjectMode = Boolean(activeSpace && activeSpace.id !== 'default');

  const getAmountInTarget = (t: Transaction) => {
    const fromCurr = t.currency || 'KRW';
    return convertCurrency(t.amount, fromCurr, currencySymbol, fxRates);
  };

  // ---------------------------------------------------------------------------
  // Project / Event Mode Metrics
  // ---------------------------------------------------------------------------
  const projectMetrics = useMemo(() => {
    if (!isProjectMode || !activeSpace) return null;

    const projectExpenses = transactions.filter((t) => t.type === 'EXPENSE');
    const totalSpending = projectExpenses.reduce((acc, t) => acc + getAmountInTarget(t), 0);

    const projectIncome = transactions.filter((t) => t.type === 'INCOME' || (t.type === 'SETTLEMENT' && t.amount > 0));
    const totalIncome = projectIncome.reduce((acc, t) => acc + getAmountInTarget(t), 0);

    const budget = activeSpace.budget;
    const memberCount = activeSpace.memberCount;
    const remainingBudget = budget !== undefined ? budget - totalSpending : undefined;
    const perPersonShare = memberCount && memberCount > 0 ? Math.round(totalSpending / memberCount) : undefined;
    const burnPercent = budget && budget > 0 ? Math.round((totalSpending / budget) * 100) : 0;
    const isOverBudget = budget !== undefined && totalSpending > budget;

    return {
      totalSpending,
      totalIncome,
      budget,
      memberCount,
      remainingBudget,
      perPersonShare,
      burnPercent,
      isOverBudget,
      count: transactions.length,
    };
  }, [isProjectMode, activeSpace, transactions, currencySymbol, fxRates]);

  // ---------------------------------------------------------------------------
  // Standard Daily Ledger Monthly Comparison Metrics
  // ---------------------------------------------------------------------------
  const monthlySummary = useMemo(() => {
    const now = new Date();
    const prevMonthDate = subMonths(now, 1);

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
        status = 'better';
      } else if (diff > 0) {
        status = 'worse';
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

  const heroSpending = isProjectMode ? (projectMetrics?.totalSpending ?? 0) : monthlySummary.currentSpending;

  // Dual Currency Comparison (Primary + Secondary e.g. IDR + KRW)
  const dualCurrency = useMemo(() => {
    return getDualCurrencyComparison(heroSpending, currencySymbol, fxRates, secondaryCurrency);
  }, [heroSpending, currencySymbol, fxRates, secondaryCurrency]);

  // ===========================================================================
  // RENDER: PROJECT / EVENT MODE
  // ===========================================================================
  if (isProjectMode && activeSpace && projectMetrics) {
    const { totalSpending, budget, memberCount, remainingBudget, perPersonShare, burnPercent, isOverBudget, count } = projectMetrics;

    return (
      <section 
        id="financial-summary-card"
        className={`relative transition-all p-5 sm:p-6 rounded-2xl backdrop-blur-xl ${
          isLight 
            ? 'bg-white/85 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
            : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-white'
        }`}
      >
        {/* Top Header: Title & Subtle Status Badge (Zero Icons) */}
        <div className="flex items-center justify-between pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-fluid-heading font-normal tracking-wide ${
                isLight ? 'text-slate-800' : 'text-neutral-200'
              }`}>
                재무 요약
              </h3>
              <span className="text-white/20 font-light text-xs">·</span>
              <span className={`text-fluid-label font-light ${
                isLight ? 'text-slate-500' : 'text-neutral-400'
              }`}>
                프로젝트 정산
              </span>
            </div>
            <p className={`text-fluid-label font-light mt-0.5 ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
              {activeSpace.name}
              {memberCount ? ` · ${memberCount}명 참여` : ''}
              {activeSpace.startDate && activeSpace.endDate ? ` · ${activeSpace.startDate} ~ ${activeSpace.endDate}` : ''}
            </p>
          </div>

          {/* Status Badge: Clean Luxury Typography, No Icons */}
          <div id="financial-status-indicator">
            {budget && budget > 0 ? (
              isOverBudget ? (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border tabular-nums transition-all ${
                  isLight 
                    ? 'bg-rose-50 text-rose-800 border-rose-200' 
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                }`}>
                  <span>예산 초과</span>
                  <span className="text-[11px] opacity-75 ml-1">(+{burnPercent - 100}%)</span>
                </div>
              ) : (
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border tabular-nums transition-all ${
                  isLight 
                    ? 'bg-neutral-100 text-neutral-800 border-neutral-200' 
                    : 'bg-white/[0.04] text-neutral-300 border-white/[0.08]'
                }`}>
                  <span>예산 내 지출</span>
                  <span className="text-[11px] opacity-75 ml-1">({Math.max(0, 100 - burnPercent)}% 잔여)</span>
                </div>
              )
            ) : (
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border ${
                isLight 
                  ? 'bg-neutral-100 text-neutral-700 border-neutral-200' 
                  : 'bg-white/[0.04] text-neutral-400 border-white/[0.08]'
              }`}>
                <span>{count > 0 ? `${count}건 기록` : '내역 없음'}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3-Metrics Grid for Project State */}
        <div className={`grid grid-cols-2 sm:grid-cols-[1fr_1.45fr_1fr] gap-4 pt-3.5 border-t ${
          isLight ? 'border-slate-200/60' : 'border-t border-white/[0.04]'
        }`}>
          {/* Target Budget */}
          <div className="order-2 sm:order-1 col-span-1 flex flex-col justify-between min-w-0">
            <span className={`text-xs font-light truncate ${
              isLight ? 'text-slate-500' : 'text-neutral-400'
            }`}>
              목표 예산
            </span>
            <div className={`mt-1.5 flex items-baseline whitespace-nowrap tabular-nums min-w-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
              <span className="text-base font-light text-neutral-400 mr-1 whitespace-nowrap">{currSymbol}</span>
              <span className={`text-base sm:text-lg md:text-xl font-light tabular-nums whitespace-nowrap ${
                !budget || budget === 0
                  ? 'text-neutral-500'
                  : isLight ? 'text-slate-700' : 'text-neutral-300'
              }`}>
                {budget ? budget.toLocaleString() : '미설정'}
              </span>
            </div>
          </div>

          {/* Hero: Total Spending in Project */}
          <div className="order-1 sm:order-2 col-span-2 sm:col-span-1 flex flex-col justify-between min-w-0">
            <span className={`text-xs font-light truncate ${
              isLight ? 'text-slate-500' : 'text-neutral-400'
            }`}>
              총 지출
            </span>
            <div className="mt-1.5 flex flex-col justify-start min-w-0">
              <div className={`flex items-baseline whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
                <span className="text-fluid-heading font-light text-neutral-400 mr-1.5 whitespace-nowrap">{currSymbol}</span>
                <span className={`text-fluid-hero font-light tracking-tight tabular-nums whitespace-nowrap ${
                  totalSpending === 0 ? 'text-neutral-500' : 'text-white'
                }`}>
                  {totalSpending.toLocaleString()}
                </span>
              </div>

              {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
              {isMultiCurrencyMode && dualCurrency && (
                <div className={`mt-1 ${isStealth ? 'blur-xs select-none' : ''}`}>
                  <span className="text-fluid-label font-light text-neutral-400 tracking-wide whitespace-nowrap tabular-nums">
                    ≈ {dualCurrency.secondaryFormatted} · 환율 {dualCurrency.rateText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Per-Person Share or Remaining Budget */}
          <div className="order-3 sm:order-3 col-span-1 sm:col-span-1 flex flex-col justify-between min-w-0">
            <span className={`text-xs font-light truncate ${
              isLight ? 'text-slate-500' : 'text-neutral-400'
            }`}>
              {memberCount && memberCount > 0 ? '1인당 분담금' : '잔여 예산'}
            </span>
            <div className={`flex flex-wrap items-baseline gap-1 mt-1.5 whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
              {memberCount && memberCount > 0 ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-light text-neutral-400">{currSymbol}</span>
                  <span className={`text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap font-light ${
                    isLight ? 'text-slate-700' : 'text-neutral-200'
                  }`}>
                    {perPersonShare !== undefined ? perPersonShare.toLocaleString() : '0'}
                  </span>
                  <span className="text-xs text-neutral-500 font-light">/인</span>
                </div>
              ) : remainingBudget !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-light text-neutral-400">{currSymbol}</span>
                  <span className={`text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap ${
                    remainingBudget < 0
                      ? isLight ? 'text-rose-700 font-normal' : 'text-rose-400 font-normal'
                      : isLight ? 'text-slate-700 font-light' : 'text-neutral-200 font-light'
                  }`}>
                    {remainingBudget.toLocaleString()}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-neutral-500 font-light">-</span>
              )}
            </div>
          </div>
        </div>

        {/* Quiet Luxury Hairline Budget Progress Bar (If Budget is Set) */}
        {budget && budget > 0 && (
          <div className="mt-3.5 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between text-[11px] text-neutral-400 font-light mb-1.5 tabular-nums">
              <span>예산 소진율 {burnPercent}%</span>
              <span>
                {remainingBudget !== undefined && remainingBudget < 0
                  ? `초과 ${currSymbol} ${Math.abs(remainingBudget).toLocaleString()}`
                  : `잔여 ${currSymbol} ${(remainingBudget || 0).toLocaleString()}`}
              </span>
            </div>
            <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? 'bg-rose-400' : 'bg-white'
                }`}
                style={{ width: `${Math.min(100, burnPercent)}%` }}
              />
            </div>
          </div>
        )}
      </section>
    );
  }

  // ===========================================================================
  // RENDER: STANDARD DAILY LEDGER MODE (월별 지출 비교)
  // ===========================================================================
  const {
    now,
    prevMonthDate,
    currentSpending,
    prevSpending,
    diff,
    status,
    percentChange,
  } = monthlySummary;

  const currentMonthName = format(now, 'M월');
  const prevMonthName = format(prevMonthDate, 'M월');

  return (
    <section 
      id="financial-summary-card"
      className={`relative transition-all p-5 sm:p-6 rounded-2xl backdrop-blur-xl ${
        isLight 
          ? 'bg-white/85 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] text-slate-900' 
          : 'bg-[#121318]/90 backdrop-blur-xl border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-white'
      }`}
    >
      {/* Top Header: Title & Subtle Status Badge */}
      <div className="flex items-center justify-between pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-fluid-heading font-normal tracking-wide ${
              isLight ? 'text-slate-800' : 'text-neutral-200'
            }`}>
              재무 요약
            </h3>
            <span className="text-white/20 font-light text-xs">·</span>
            <span className={`text-fluid-label font-light ${
              isLight ? 'text-slate-500' : 'text-neutral-400'
            }`}>
              월별 지출 비교
            </span>
          </div>
          <p className={`text-fluid-label font-light mt-0.5 ${isLight ? 'text-slate-500' : 'text-neutral-400'}`}>
            {prevMonthName} 대비 {currentMonthName} 지출 변동
          </p>
        </div>

        {/* Quiet Luxury Status Indicator */}
        <div id="financial-status-indicator">
          {diff !== 0 && status === 'better' && (
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border tabular-nums transition-all ${
              isLight 
                ? 'bg-neutral-100 text-neutral-800 border-neutral-200' 
                : 'bg-white/[0.04] text-neutral-300 border-white/[0.08]'
            }`}>
              <span>절약</span>
              <span className="text-[11px] opacity-75 ml-1">(-{percentChange}%)</span>
            </div>
          )}

          {diff !== 0 && status === 'worse' && (
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border tabular-nums transition-all ${
              isLight 
                ? 'bg-rose-50 text-rose-800 border-rose-200' 
                : 'bg-rose-500/10 text-rose-300 border-rose-500/25'
            }`}>
              <span>초과</span>
              <span className="text-[11px] opacity-75 ml-1">(+{percentChange}%)</span>
            </div>
          )}

          {(diff === 0 || status === 'neutral') && (
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-normal border ${
              isLight 
                ? 'bg-slate-100 text-slate-600 border-slate-200' 
                : 'bg-white/[0.04] text-neutral-400 border-white/[0.08]'
            }`}>
              <span>유지</span>
            </div>
          )}
        </div>
      </div>

      {/* Comparison metrics grid */}
      <div className={`grid grid-cols-2 sm:grid-cols-[1fr_1.45fr_1fr] gap-4 pt-3.5 border-t ${
        isLight ? 'border-slate-200/60' : 'border-t border-white/[0.04]'
      }`}>
        {/* Previous Month Spending */}
        <div className="order-2 sm:order-1 col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            isLight ? 'text-slate-500' : 'text-neutral-400'
          }`}>
            지난달 {prevMonthName}
          </span>
          <div className={`mt-1.5 flex items-baseline whitespace-nowrap tabular-nums min-w-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className="text-base font-light text-neutral-400 mr-1 whitespace-nowrap">{currSymbol}</span>
            <span className={`text-base sm:text-lg md:text-xl font-light tabular-nums whitespace-nowrap ${
              prevSpending === 0
                ? 'text-neutral-500'
                : isLight ? 'text-slate-700' : 'text-neutral-300'
            }`}>
              {prevSpending.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Current Month Spending */}
        <div className="order-1 sm:order-2 col-span-2 sm:col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            isLight ? 'text-slate-500' : 'text-neutral-400'
          }`}>
            이번 달 {currentMonthName}
          </span>
          <div className="mt-1.5 flex flex-col justify-start min-w-0">
            <div className={`flex items-baseline whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
              <span className="text-fluid-heading font-light text-neutral-400 mr-1.5 whitespace-nowrap">{currSymbol}</span>
              <span className={`text-fluid-hero font-light tracking-tight tabular-nums whitespace-nowrap ${
                currentSpending === 0 ? 'text-neutral-500' : 'text-white'
              }`}>
                {currentSpending.toLocaleString()}
              </span>
            </div>

            {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
            {isMultiCurrencyMode && dualCurrency && (
              <div className={`mt-1 ${isStealth ? 'blur-xs select-none' : ''}`}>
                <span className="text-fluid-label font-light text-neutral-400 tracking-wide whitespace-nowrap tabular-nums">
                  ≈ {dualCurrency.secondaryFormatted} · 환율 {dualCurrency.rateText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Difference Amount */}
        <div className="order-3 sm:order-3 col-span-1 sm:col-span-1 flex flex-col justify-between min-w-0">
          <span className={`text-xs font-light truncate ${
            diff === 0
              ? (isLight ? 'text-slate-500' : 'text-neutral-400')
              : status === 'better'
              ? (isLight ? 'text-neutral-700' : 'text-neutral-300')
              : (isLight ? 'text-rose-700' : 'text-rose-400/90')
          }`}>
            전월 대비 변동
          </span>
          <div className={`flex flex-wrap items-baseline gap-1 mt-1.5 whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className={`text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap ${
              diff === 0
                ? 'text-neutral-500 font-light'
                : status === 'better'
                ? (isLight ? 'text-neutral-800 font-normal' : 'text-neutral-200 font-normal')
                : (isLight ? 'text-rose-700 font-normal' : 'text-rose-400/90 font-normal')
            }`}>
              {diff > 0 ? '+' : diff < 0 ? '-' : ''}{currSymbol} {Math.abs(diff).toLocaleString()}
            </span>
            {diff !== 0 && percentChange > 0 && (
              <span className={`text-xs font-light tabular-nums whitespace-nowrap ${
                status === 'better' ? (isLight ? 'text-neutral-600' : 'text-neutral-400') : (isLight ? 'text-rose-700' : 'text-rose-400/90')
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
