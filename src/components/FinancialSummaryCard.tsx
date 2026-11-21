import React, { useMemo } from 'react';
import { Transaction, FxRates, LedgerSpace, SubscriptionItem, SupportedCurrency } from '../types';
import { subMonths, isSameMonth, isSameYear, parseISO, format } from 'date-fns';
import { convertCurrency, DEFAULT_FX_RATES, getCurrencySymbol, getDualCurrencyComparison } from '../utils';
import { computeSafeToSpend } from '../finance/cashflowForecast';
import { loadSavedSubscriptions } from '../finance/subscriptionDetector';
import { useI18n } from '../i18n';

interface FinancialSummaryCardProps {
  transactions: Transaction[];
  currencySymbol?: string;
  fxRates?: FxRates;
  isStealth?: boolean;
  theme?: 'light' | 'dark';
  secondaryCurrency?: string;
  isMultiCurrencyMode?: boolean;
  activeSpace?: LedgerSpace;
  subscriptions?: SubscriptionItem[];
  budget?: number;
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
  subscriptions,
  budget,
}) => {
  const { t, language } = useI18n();
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

  // Safe-to-Spend Metric (오늘 사용 가능 금액)
  const safeToSpendData = useMemo(() => {
    const subs = subscriptions ?? loadSavedSubscriptions();
    const targetBudget = budget ?? activeSpace?.budget;
    return computeSafeToSpend(
      transactions,
      subs,
      targetBudget,
      (currencySymbol || 'KRW') as SupportedCurrency,
      fxRates
    );
  }, [transactions, subscriptions, budget, activeSpace?.budget, currencySymbol, fxRates]);

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
        className="relative transition-all p-5 sm:p-6 rounded-2xl backdrop-blur-xl bg-[var(--surface-card)]/90 border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-white"
      >
        {/* Top Header: Title & Subtle Status Badge (Zero Icons) */}
        <div className="flex items-center justify-between pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-fluid-heading font-medium tracking-wide text-white">
                {t('financial_summary')}
              </h2>
              <span className="text-white/30 font-normal text-xs">·</span>
              <span className="text-xs font-normal text-neutral-300">
                {t('project_settlement')}
              </span>
            </div>
            <p className="text-xs font-normal mt-0.5 text-neutral-300">
              {activeSpace.name}
              {memberCount ? ` · ${memberCount}${language === 'ko' ? '명 참여' : language === 'ja' ? '名参加' : ' members'}` : ''}
              {activeSpace.startDate && activeSpace.endDate ? ` · ${activeSpace.startDate} ~ ${activeSpace.endDate}` : ''}
            </p>
          </div>

          {/* Status Badge: Clean Luxury Typography, No Icons */}
          <div id="financial-status-indicator">
            {budget && budget > 0 ? (
              isOverBudget ? (
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums transition-all bg-white/[0.06] border border-white/15 text-neutral-200">
                  <span>{t('status_over')}</span>
                  <span className="text-[10px] opacity-75 ml-1">(+{burnPercent - 100}%)</span>
                </div>
              ) : (
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums transition-all bg-white/[0.06] border border-white/15 text-neutral-200">
                  <span>{t('status_maintained')}</span>
                  <span className="text-[10px] opacity-75 ml-1">({Math.max(0, 100 - burnPercent)}% {language === 'ko' ? '잔여' : language === 'ja' ? '残り' : 'left'})</span>
                </div>
              )
            ) : (
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono border bg-white/[0.06] border-white/15 text-neutral-300">
                <span>{count > 0 ? `${count} items` : t('empty_ledger_title')}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3-Metrics Grid for Project State */}
        <div className="grid grid-cols-2 gap-4 pt-3.5 border-t border-t border-white/[0.06]">
          {/* Hero: Total Spending in Project */}
          <div className="col-span-2 flex flex-col justify-start min-w-0">
            <span className="text-xs font-normal truncate text-neutral-200">
              {t('filter_expense')}
            </span>
            <div className="mt-1.5 flex flex-col justify-start min-w-0">
              <div className={`flex items-baseline whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
                <span className="text-fluid-heading font-normal text-neutral-300 mr-1.5 whitespace-nowrap">{currSymbol}</span>
                <span className="text-fluid-hero font-medium tracking-tight tabular-nums whitespace-nowrap text-white">
                  {totalSpending.toLocaleString()}
                </span>
              </div>

              {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
              {isMultiCurrencyMode && dualCurrency && (
                <div className={`mt-1 ${isStealth ? 'blur-xs select-none' : ''}`}>
                  <span className="text-xs font-normal text-neutral-300 tracking-wide whitespace-nowrap tabular-nums">
                    ≈ {dualCurrency.secondaryFormatted} · FX {dualCurrency.rateText}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Target Budget */}
          <div className="col-span-1 flex flex-col justify-between min-w-0">
            <span className="text-xs font-normal truncate text-neutral-200">
              {t('project_budget')}
            </span>
            <div className={`mt-1.5 flex items-baseline whitespace-nowrap tabular-nums min-w-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
              <span className="text-base font-normal text-neutral-300 mr-1 whitespace-nowrap">{currSymbol}</span>
              <span className="text-base sm:text-lg md:text-xl font-normal tabular-nums whitespace-nowrap text-white">
                {budget ? budget.toLocaleString() : '-'}
              </span>
            </div>
          </div>

          {/* Per-Person Share or Remaining Budget */}
          <div className="col-span-1 flex flex-col justify-between min-w-0">
            <span className="text-xs font-normal truncate text-neutral-200">
              {memberCount && memberCount > 0 ? t('per_person_share') : t('remaining_budget')}
            </span>
            <div className={`flex flex-wrap items-baseline gap-1 mt-1.5 whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
              {memberCount && memberCount > 0 ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-normal text-neutral-300">{currSymbol}</span>
                  <span className="text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap font-medium text-white">
                    {perPersonShare !== undefined ? perPersonShare.toLocaleString() : '0'}
                  </span>
                  <span className="text-xs text-neutral-300 font-normal">/p</span>
                </div>
              ) : remainingBudget !== undefined ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-normal text-neutral-300">{currSymbol}</span>
                  <span className={`text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap font-medium ${
                    remainingBudget < 0
                      ? 'text-amber-400 font-semibold'
                      : 'text-white'
                  }`}>
                    {remainingBudget.toLocaleString()}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-neutral-300 font-normal">-</span>
              )}
            </div>
          </div>
        </div>

        {/* Quiet Luxury Hairline Budget Progress Bar (If Budget is Set) */}
        {budget && budget > 0 && (
          <div className="mt-3.5 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between text-[11px] text-neutral-300 font-normal mb-1.5 tabular-nums">
              <span>{t('burn_percentage')} {burnPercent}%</span>
              <span>
                {remainingBudget !== undefined && remainingBudget < 0
                  ? `${t('status_over')} ${currSymbol} ${Math.abs(remainingBudget).toLocaleString()}`
                  : `${t('remaining_budget')} ${currSymbol} ${(remainingBudget || 0).toLocaleString()}`}
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? 'bg-amber-400' : 'bg-white'
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

  const currentMonthName = format(now, language === 'ko' ? 'M월' : language === 'ja' ? 'M月' : 'MMM');
  const prevMonthName = format(prevMonthDate, language === 'ko' ? 'M월' : language === 'ja' ? 'M月' : 'MMM');

  return (
    <section 
      id="financial-summary-card"
      className="relative transition-all p-5 sm:p-6 rounded-2xl backdrop-blur-xl bg-[var(--surface-card)]/90 border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] text-white"
    >
      {/* Top Header: Title & Subtle Status Badge */}
      <div className="flex items-center justify-between pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-fluid-heading font-medium tracking-wide text-white">
              {t('financial_summary')}
            </h2>
            <span className="text-white/30 font-normal text-xs">·</span>
            <span className="text-xs font-normal text-neutral-300">
              {t('monthly_comparison')}
            </span>
          </div>
          <p className="text-xs font-normal mt-0.5 text-neutral-300">
            {prevMonthName} ➔ {currentMonthName} ({t('vs_previous_month')})
          </p>
        </div>

        {/* Quiet Luxury Status Indicator */}
        <div id="financial-status-indicator">
          {diff !== 0 && status === 'better' && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono border tabular-nums transition-all bg-white/[0.06] border-white/15 text-neutral-200">
              <span>{t('status_saving')}</span>
              <span className="text-[10px] opacity-75 ml-1">(-{percentChange}%)</span>
            </div>
          )}

          {diff !== 0 && status === 'worse' && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono border tabular-nums transition-all bg-white/[0.06] border-white/15 text-neutral-200">
              <span>{t('status_over')}</span>
              <span className="text-[10px] opacity-75 ml-1">(+{percentChange}%)</span>
            </div>
          )}

          {(diff === 0 || status === 'neutral') && (
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono border bg-white/[0.06] border-white/15 text-neutral-300">
              <span>{t('status_maintained')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Comparison metrics grid */}
      <div className="grid grid-cols-2 gap-4 pt-3.5 border-t border-t border-white/[0.06]">
        {/* Current Month Spending (Top hero row) */}
        <div className="col-span-2 flex flex-col justify-start min-w-0">
          <span className="text-xs font-normal truncate text-neutral-200">
            {t('this_month')} ({currentMonthName})
          </span>
          <div className="mt-1.5 flex flex-col justify-start min-w-0">
            <div className={`flex items-baseline whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
              <span className="text-fluid-heading font-normal text-neutral-300 mr-1.5 whitespace-nowrap">{currSymbol}</span>
              <span className="text-fluid-hero font-medium tracking-tight tabular-nums whitespace-nowrap text-white">
                {currentSpending.toLocaleString()}
              </span>
            </div>

            {/* Native Dual-Currency Comparison Sub-line (Multi-currency mode only) */}
            {isMultiCurrencyMode && dualCurrency && (
              <div className={`mt-1 ${isStealth ? 'blur-xs select-none' : ''}`}>
                <span className="text-xs font-normal text-neutral-300 tracking-wide whitespace-nowrap tabular-nums">
                  ≈ {dualCurrency.secondaryFormatted} · FX {dualCurrency.rateText}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Previous Month Spending (Bottom left column) */}
        <div className="col-span-1 flex flex-col justify-between min-w-0">
          <span className="text-xs font-normal truncate text-neutral-200">
            {t('last_month')} ({prevMonthName})
          </span>
          <div className={`mt-1.5 flex items-baseline whitespace-nowrap tabular-nums min-w-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className="text-base font-normal text-neutral-300 mr-1 whitespace-nowrap">{currSymbol}</span>
            <span className="text-base sm:text-lg md:text-xl font-normal tabular-nums whitespace-nowrap text-neutral-200">
              {prevSpending.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Difference Amount (Bottom right column) */}
        <div className="col-span-1 flex flex-col justify-between min-w-0">
          <span className="text-xs font-normal truncate text-neutral-200">
            {t('vs_previous_month')}
          </span>
          <div className={`flex flex-wrap items-baseline gap-1 mt-1.5 whitespace-nowrap tabular-nums ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className={`text-sm md:text-base tracking-tight tabular-nums whitespace-nowrap font-medium ${
              diff === 0
                ? 'text-neutral-200'
                : status === 'better'
                ? 'text-sky-400'
                : 'text-amber-400 font-semibold'
            }`}>
              {diff > 0 ? '+' : diff < 0 ? '-' : ''}{currSymbol} {Math.abs(diff).toLocaleString()}
            </span>
            {diff !== 0 && percentChange > 0 && (
              <span className="text-xs font-normal tabular-nums whitespace-nowrap text-neutral-300">
                ({diff < 0 ? '▼' : '▲'}{percentChange}%)
              </span>
            )}
          </div>
        </div>

        {/* Safe-to-Spend Today Metric (오늘 권장 지출 한도 · Safe-to-Spend) */}
        <div className="col-span-2 pt-3.5 mt-1 border-t border-white/[0.06] flex items-center justify-between min-w-0">
          <div className="flex flex-col justify-start min-w-0 pr-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-normal text-neutral-200">
                오늘 권장 지출 한도
              </span>
              <span className="text-white/20 text-[10px]">·</span>
              <span className="text-[11px] font-mono text-neutral-400">
                Safe-to-Spend
              </span>
            </div>
            <span className="text-[11px] font-light text-neutral-400 mt-0.5 tabular-nums truncate">
              {safeToSpendData.targetPool > 0
                ? `남은 ${safeToSpendData.remainingDays}일 기준 가용액 (월풀 ${currSymbol}${safeToSpendData.targetPool.toLocaleString()})`
                : `남은 ${safeToSpendData.remainingDays}일 기준 일일 지출 페이스`}
            </span>
          </div>

          <div className={`flex items-baseline whitespace-nowrap tabular-nums text-right shrink-0 ${isStealth ? 'blur-xs select-none' : ''}`}>
            <span className="text-xs font-normal text-neutral-400 mr-1 whitespace-nowrap">{currSymbol}</span>
            <span className="text-base sm:text-lg font-medium font-mono tracking-tight tabular-nums text-white">
              {safeToSpendData.safeToSpendToday.toLocaleString()}
            </span>
            <span className="text-[11px] font-normal text-neutral-400 ml-1">/일</span>
          </div>
        </div>
      </div>
    </section>
  );
};
