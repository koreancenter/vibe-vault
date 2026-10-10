import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates, 
  AssetAccount, 
  DebtItem, 
  FinancialQueryResult 
} from '../types';
import { 
  format, 
  subMonths, 
  addMonths, 
  isSameMonth, 
  isSameYear, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDate, 
  isSameDay 
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  TrendingUp, 
  ShieldCheck, 
  Wallet, 
  Banknote, 
  X
} from 'lucide-react';
import { 
  calculateCashflowForecast, 
  detectSubscriptions 
} from '../autonomousFinance';
import { 
  getCurrencySymbol, 
  getCategoryKo, 
  convertCurrency 
} from '../utils';
import { getAllAssetAccounts, getAllDebts } from '../db';
import { LUXURY_CATEGORY_COLORS } from './CategoryDonutChart';

import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

export interface InsightsSectionProps {
  transactions: Transaction[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  isStealth?: boolean;
  theme?: string;
  onOpenThemeSettings?: () => void;
  onNavigateToVault?: () => void;
  onNavigateToLedger?: () => void;
  queryResult?: FinancialQueryResult | null;
  onDismissQueryResult?: () => void;
}

export const InsightsSection: React.FC<InsightsSectionProps> = ({
  transactions,
  currentCurrency,
  fxRates,
  isStealth = false,
  queryResult: externalQueryResult,
  onDismissQueryResult,
}) => {
  const currSymbol = getCurrencySymbol(currentCurrency);
  const briefingCardRef = useRef<HTMLDivElement | null>(null);

  // Transient AI Executive Briefing State
  const [internalQueryResult, setInternalQueryResult] = useState<FinancialQueryResult | null>(
    externalQueryResult ?? null
  );

  useEffect(() => {
    setInternalQueryResult(externalQueryResult ?? null);
  }, [externalQueryResult]);

  const queryResult = internalQueryResult;
  const setQueryResult = (res: FinancialQueryResult | null) => {
    setInternalQueryResult(res);
    if (!res && onDismissQueryResult) {
      onDismissQueryResult();
    }
  };

  // 1. Period Control State (Defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Contextual Chart Auto-Focus: Synchronize selectedMonth & selectedCategory on queryResult change
  useEffect(() => {
    if (!queryResult) return;

    // 1. Synchronize Month Selector (selectedMonth)
    let targetYear = queryResult.parameters?.year;
    let targetMonth = queryResult.parameters?.month;

    if (!targetMonth && queryResult.parameters?.dateRange) {
      const parts = queryResult.parameters.dateRange.split('-');
      if (parts.length === 2) {
        targetYear = parseInt(parts[0], 10);
        targetMonth = parseInt(parts[1], 10);
      }
    }

    if (!targetMonth && queryResult.query) {
      const monthMatch = queryResult.query.match(/(?:(\d{4})년\s*)?(\d{1,2})월/);
      if (monthMatch) {
        if (monthMatch[1]) targetYear = parseInt(monthMatch[1], 10);
        targetMonth = parseInt(monthMatch[2], 10);
      } else if (/지난달|지난\s*달/i.test(queryResult.query)) {
        const now = new Date();
        targetMonth = now.getMonth() === 0 ? 12 : now.getMonth();
        targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      }
    }

    if (targetMonth !== undefined && targetMonth >= 1 && targetMonth <= 12) {
      setSelectedMonth(prev => {
        const y = targetYear || prev.getFullYear();
        return new Date(y, targetMonth - 1, 1);
      });
    }

    // 2. Synchronize active category highlight
    let targetCategory = queryResult.parameters?.category;
    if (!targetCategory && queryResult.query) {
      const q = queryResult.query;
      if (/식비|카페|커피|외식|음식|배달|점심|저녁|마트|장보기|food/i.test(q)) {
        targetCategory = 'Food';
      } else if (/교통|지하철|버스|택시|주유|주차|transport/i.test(q)) {
        targetCategory = 'Transport';
      } else if (/생활|쇼핑|다이소|쿠팡|올리브영|편의점|living/i.test(q)) {
        targetCategory = 'Living';
      } else if (/고정비|월세|관리비|통신비|보험|공과금|fixed/i.test(q)) {
        targetCategory = 'Fixed';
      } else if (/의료|병원|약국|헬스|운동|health/i.test(q)) {
        targetCategory = 'Health';
      } else if (/여가|문화|영화|여행|숙박|leisure/i.test(q)) {
        targetCategory = 'Leisure';
      }
    }

    if (targetCategory) {
      setSelectedCategory(targetCategory);
    }
  }, [queryResult]);

  // Asset accounts & debts state
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);

  // Load Asset Accounts and Debts for integrated analysis
  useEffect(() => {
    let isMounted = true;
    const loadVaultData = async () => {
      try {
        const [accs, dbs] = await Promise.all([
          getAllAssetAccounts(),
          getAllDebts()
        ]);
        if (isMounted) {
          setAccounts(accs || []);
          setDebts(dbs || []);
        }
      } catch (err) {
        console.error('Failed to load asset & debt data for insights:', err);
      }
    };
    loadVaultData();
    return () => {
      isMounted = false;
    };
  }, []);

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return isSameMonth(selectedMonth, now) && isSameYear(selectedMonth, now);
  }, [selectedMonth]);

  const handlePrevMonth = () => setSelectedMonth((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setSelectedMonth((prev) => addMonths(prev, 1));
  const handleResetToCurrentMonth = () => setSelectedMonth(new Date());

  // Filter transactions for the selected month
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      try {
        const d = parseISO(t.date);
        return isSameMonth(d, selectedMonth) && isSameYear(d, selectedMonth);
      } catch {
        return false;
      }
    });
  }, [transactions, selectedMonth]);

  // Monthly income & expense calculations
  const { monthIncome, monthExpense, monthNet, monthExpenseCount } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let expCount = 0;
    for (const t of monthTransactions) {
      const amt = convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);
      if (t.type === 'INCOME' || t.type === 'SETTLEMENT') {
        inc += amt;
      } else if (t.type === 'EXPENSE') {
        exp += amt;
        expCount += 1;
      }
    }
    return {
      monthIncome: inc,
      monthExpense: exp,
      monthNet: inc - exp,
      monthExpenseCount: expCount
    };
  }, [monthTransactions, currentCurrency, fxRates]);

  // Asset calculations
  const { totalAssets, totalLiabilities, netWorth, liquidAssets } = useMemo(() => {
    let assetsSum = 0;
    let liabilitiesSum = 0;
    let liquid = 0;

    for (const acc of accounts) {
      const converted = convertCurrency(
        acc.currentBalance,
        acc.currency || 'KRW',
        currentCurrency,
        fxRates
      );

      if (acc.assetType === 'LIABILITY') {
        liabilitiesSum += converted;
      } else {
        assetsSum += converted;
        if (acc.assetType === 'BANK' || acc.assetType === 'CASH') {
          liquid += converted;
        }
      }
    }

    for (const d of debts) {
      if (!d.isActive) continue;
      const converted = convertCurrency(
        d.remainingPrincipal,
        d.currency || 'KRW',
        currentCurrency,
        fxRates
      );
      if (d.type === 'LOAN_RECEIVABLE') {
        assetsSum += converted;
      } else {
        liabilitiesSum += converted;
      }
    }

    return {
      totalAssets: assetsSum,
      totalLiabilities: liabilitiesSum,
      netWorth: assetsSum - liabilitiesSum,
      liquidAssets: liquid
    };
  }, [accounts, debts, currentCurrency, fxRates]);

  // Integrated Financial Indicators
  const savingsRate = useMemo(() => {
    if (monthIncome <= 0) return 0;
    return Math.max(0, Math.round((monthNet / monthIncome) * 100));
  }, [monthIncome, monthNet]);

  const burnRateToNetWorth = useMemo(() => {
    if (netWorth <= 0) return '0.0';
    return ((monthExpense / netWorth) * 100).toFixed(1);
  }, [monthExpense, netWorth]);

  const runwayMonths = useMemo(() => {
    if (monthExpense <= 0) return '99.0';
    return (liquidAssets / monthExpense).toFixed(1);
  }, [liquidAssets, monthExpense]);

  const debtRatio = useMemo(() => {
    if (totalAssets <= 0) return 0;
    return Math.round((totalLiabilities / totalAssets) * 100);
  }, [totalLiabilities, totalAssets]);

  // Cashflow Forecast & Subscriptions
  const subscriptions = useMemo(() => {
    return detectSubscriptions(transactions, currentCurrency, fxRates);
  }, [transactions, currentCurrency, fxRates]);

  const forecast = useMemo(() => {
    return calculateCashflowForecast(transactions, subscriptions, currentCurrency, fxRates);
  }, [transactions, subscriptions, currentCurrency, fxRates]);

  // AI Integrated Financial Diagnosis
  const integratedDiagnosis = useMemo(() => {
    let status: 'EXCELLENT' | 'HEALTHY' | 'MODERATE' | 'ATTENTION' = 'HEALTHY';
    let statusLabel = '안정';
    let title = '안정적인 자산-소비 균형';
    let summary = '';
    let recommendation = '';

    const numRunway = parseFloat(runwayMonths);
    const numBurn = parseFloat(String(burnRateToNetWorth));

    if (netWorth > 0 && savingsRate >= 40 && numRunway >= 6) {
      status = 'EXCELLENT';
      statusLabel = '최상';
      title = '최상급 재정 건전성 & 자본 축적';
      summary = `순자산 ${currSymbol}${Math.round(netWorth).toLocaleString()} 대비 월간 소비율이 ${numBurn}%로 매우 낮으며, 저축률(${savingsRate}%)이 높아 자본 축적 속도가 탁월합니다.`;
      recommendation = `비상금 완충 여력이 ${numRunway}개월로 충분하므로, 월 잉여현금을 연금저축/ISA 또는 적립식 글로벌 ETF로 운용하여 복리 효과를 극대화하세요.`;
    } else if (netWorth > 0 && monthNet >= 0 && debtRatio < 40) {
      status = 'HEALTHY';
      statusLabel = '안정';
      title = '건전한 현금흐름 유지 중';
      summary = `이번 달 순흑자(${currSymbol}${Math.round(monthNet).toLocaleString()})를 기록하며 순자산이 지속 증가하고 있습니다. 부채 비율 또한 ${debtRatio}%로 안정적입니다.`;
      recommendation = `현재의 저축률(${savingsRate}%)을 유지하면서 정기 고정비(${subscriptions.length}건)를 점검하고 불필요한 지출을 최적화하세요.`;
    } else if (monthNet < 0 || debtRatio >= 50) {
      status = 'ATTENTION';
      statusLabel = '주의 필요';
      title = '지출 관리 및 유동성 완충 필요';
      summary = `이번 달 지출이 수입을 초과(적자 ${currSymbol}${Math.round(Math.abs(monthNet)).toLocaleString()})하거나 부채 비율(${debtRatio}%)이 다소 높습니다.`;
      recommendation = `현금성 완충 자산(${currSymbol}${Math.round(liquidAssets).toLocaleString()})을 확보하고, 고금리 부채 우선 상환 및 변동성 소비 항목을 우선 조정하십시오.`;
    } else {
      status = 'MODERATE';
      statusLabel = '적정';
      title = '적정 수준의 재정 밸런스';
      summary = `총 자산 대비 지출 흐름이 완만한 균형을 이루고 있습니다.`;
      recommendation = `지속적인 장부 기록과 자산 계좌 동기화를 통해 예측 정확도를 높이세요.`;
    }

    return { status, statusLabel, title, summary, recommendation };
  }, [netWorth, savingsRate, runwayMonths, burnRateToNetWorth, monthNet, debtRatio, subscriptions.length, liquidAssets, currSymbol]);

  const formatMoney = (val: number) => {
    const isNeg = val < 0;
    const absVal = Math.abs(Math.round(val)).toLocaleString();
    return isNeg ? `-${currSymbol}${absVal}` : `${currSymbol}${absVal}`;
  };

  // 4. Spending Category Breakdown Data
  const categoryBreakdownList = useMemo(() => {
    const expenses = monthTransactions.filter((t) => t.type === 'EXPENSE');
    const catMap: Record<string, { total: number; count: number }> = {};
    let totalExpenseSum = 0;

    for (const t of expenses) {
      const cat = t.category || 'Uncategorized';
      const converted = convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);
      if (!catMap[cat]) {
        catMap[cat] = { total: 0, count: 0 };
      }
      catMap[cat].total += converted;
      catMap[cat].count += 1;
      totalExpenseSum += converted;
    }

    const totalPos = totalExpenseSum > 0 ? totalExpenseSum : 1;
    return Object.entries(catMap)
      .map(([category, info]) => ({
        category,
        name: getCategoryKo(category),
        amount: info.total,
        count: info.count,
        percentage: Math.round((info.total / totalPos) * 100),
        color: LUXURY_CATEGORY_COLORS[category] || LUXURY_CATEGORY_COLORS['Uncategorized'] || '#94a3b8'
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthTransactions, currentCurrency, fxRates]);

  // 5. Daily Spending Trend Data for Selected Month
  const { dailySpendingChartData, dailyAverage, highestSpendingDay, hasDailyData } = useMemo(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const now = new Date();

    const currentMonthExpenses = monthTransactions.filter((t) => {
      if (t.type !== 'EXPENSE') return false;
      if (selectedCategory) {
        return t.category === selectedCategory || (selectedCategory === 'Food' && /식비|식당|카페|커피|마트|배민/i.test(t.description || ''));
      }
      return true;
    });

    let maxDaySpend = 0;
    let peakDay = 0;
    let totalSpend = 0;
    let activeDays = 0;

    const data = daysInMonth.map((dayDate) => {
      const dayNumber = getDate(dayDate);
      const dayTransactions = currentMonthExpenses.filter((t) => {
        try {
          return isSameDay(parseISO(t.date), dayDate);
        } catch {
          return false;
        }
      });

      const dayTotal = dayTransactions.reduce((sum, t) => {
        return sum + convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);
      }, 0);

      totalSpend += dayTotal;
      if (dayTotal > 0) activeDays += 1;
      if (dayTotal > maxDaySpend) {
        maxDaySpend = dayTotal;
        peakDay = dayNumber;
      }

      return {
        day: dayNumber,
        dateLabel: format(dayDate, 'M월 d일'),
        shortLabel: `${dayNumber}`,
        amount: Math.round(dayTotal),
        count: dayTransactions.length,
        isToday: isSameMonth(selectedMonth, now) && isSameYear(selectedMonth, now) && dayNumber === getDate(now)
      };
    });

    return {
      dailySpendingChartData: data,
      dailyAverage: activeDays > 0 ? Math.round(totalSpend / activeDays) : 0,
      highestSpendingDay: { day: peakDay, amount: maxDaySpend },
      hasDailyData: currentMonthExpenses.length > 0 && totalSpend > 0
    };
  }, [selectedMonth, monthTransactions, currentCurrency, fxRates, selectedCategory]);

  // Auto-scroll to Dismissible AI Briefing Card when active query result exists
  useEffect(() => {
    if (queryResult && briefingCardRef.current) {
      briefingCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [queryResult]);

  return (
    <div className="w-full flex flex-col gap-4 pb-24 px-4 pt-2 animate-in fade-in duration-200">
      {/* 1. Month Navigator (< 2026년 10월 >) - Clean Centered Layout without box-in-box card */}
      <div className="w-full relative flex items-center justify-center py-2 text-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95 cursor-pointer"
            aria-label="이전 달"
          >
            <ChevronLeft size={18} />
          </button>

          <span className="text-base sm:text-lg font-medium px-2 tracking-tight text-white tabular-nums select-none">
            {format(selectedMonth, 'yyyy년 M월')}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-slate-400 hover:text-white hover:bg-white/[0.06] active:scale-95 cursor-pointer"
            aria-label="다음 달"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {!isCurrentMonth && (
          <button
            type="button"
            onClick={handleResetToCurrentMonth}
            className="absolute right-0 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full text-xs font-normal transition-all active:scale-95 bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 cursor-pointer"
          >
            이번 달
          </button>
        )}
      </div>

      {/* Conditionally Rendered Transient AI Briefing Card */}
      {queryResult && (
        <div 
          ref={briefingCardRef}
          className="w-full p-4 rounded-2xl bg-[#121318] border border-white/[0.08] shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
              <Sparkles className="w-3.5 h-3.5"/>
              <span>AI 재정 브리핑</span>
              <span className="text-neutral-500 font-light">· "{queryResult.query}"</span>
            </div>
            <button 
              onClick={() => setQueryResult(null)} 
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="브리핑 닫기"
            >
              <X className="w-3.5 h-3.5"/>
            </button>
          </div>

          <div className="text-sm font-medium text-white leading-snug">
            {queryResult.directAnswer}
          </div>

          <p className="text-xs text-neutral-400 font-light leading-relaxed">
            {queryResult.summarySentence}
          </p>

          {/* Metric Breakdown Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {queryResult.breakdownPills.map((pill, i) => (
              <div key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] tabular-nums">
                <span className="text-neutral-400 mr-1.5">{pill.label}</span>
                <span className="text-white font-medium">{pill.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. 4-Metric KPI Strip: Vertically stacked sections to prevent overlap and text clipping */}
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0E1015]/95 backdrop-blur-2xl overflow-hidden flex flex-col divide-y divide-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        {/* 1. 총 순자산 */}
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-blue-400 shrink-0" />
              <span className="text-xs font-light text-slate-300">총 순자산</span>
            </div>
            <span className="mt-1 text-[11px] font-light text-slate-400">
              총 자산 <span className={isStealth ? 'blur-xs select-none' : ''}>{formatMoney(totalAssets)}</span>
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-xl sm:text-2xl font-light tracking-tight tabular-nums block text-white ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(netWorth)}
            </span>
          </div>
        </div>

        {/* 2. 이번 달 저축률 */}
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={15} className="text-sky-400 shrink-0" />
              <span className="text-xs font-light text-slate-300">이번 달 저축률</span>
            </div>
            <div className="mt-1 text-[11px] font-light text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>수입 <span className={isStealth ? 'blur-xs select-none' : ''}>{formatMoney(monthIncome)}</span> 대비</span>
              <span className="opacity-30">·</span>
              <span>{monthNet >= 0 ? '순흑자' : '순적자'} <span className={isStealth ? 'blur-xs select-none' : ''}>{formatMoney(Math.abs(monthNet))}</span></span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-xl sm:text-2xl font-light tracking-tight tabular-nums block ${
              savingsRate >= 30 ? 'text-sky-400' : savingsRate >= 0 ? 'text-slate-200' : 'text-rose-400'
            }`}>
              {savingsRate}%
            </span>
          </div>
        </div>

        {/* 3. 순자산 대비 소비 */}
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <Wallet size={15} className="text-purple-400 shrink-0" />
              <span className="text-xs font-light text-slate-300">순자산 대비 소비</span>
            </div>
            <span className="mt-1 text-[11px] font-light text-slate-400">
              월 지출 <span className={isStealth ? 'blur-xs select-none' : ''}>{formatMoney(monthExpense)}</span>
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className={`text-xl sm:text-2xl font-light tracking-tight tabular-nums block ${
              parseFloat(String(burnRateToNetWorth)) < 3 
                ? 'text-sky-400' 
                : parseFloat(String(burnRateToNetWorth)) < 7 
                ? 'text-white' 
                : 'text-amber-400'
            }`}>
              {burnRateToNetWorth}%
            </span>
          </div>
        </div>

        {/* 4. 비상 유동성 완충 */}
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <Banknote size={15} className="text-sky-300 shrink-0" />
              <span className="text-xs font-light text-slate-300">비상 유동성 완충</span>
            </div>
            <span className="mt-1 text-[11px] font-light text-slate-400">
              현금·예금 <span className={isStealth ? 'blur-xs select-none' : ''}>{formatMoney(liquidAssets)}</span>
            </span>
          </div>
          <div className="text-right shrink-0">
            {monthExpense === 0 ? (
              <span className={`text-xl sm:text-2xl font-light tracking-tight ${
                liquidAssets > 0 ? 'text-sky-400' : 'text-neutral-400'
              }`}>
                {liquidAssets > 0 ? '충분' : '-'}
              </span>
            ) : (
              <div className="flex items-baseline justify-end gap-1">
                <span className={`text-xl sm:text-2xl font-light tracking-tight tabular-nums ${
                  parseFloat(runwayMonths) >= 6 ? 'text-sky-400' : parseFloat(runwayMonths) >= 3 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {parseFloat(runwayMonths) > 99 ? '99+' : runwayMonths}
                </span>
                <span className="text-xs font-light text-slate-400">
                  개월
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. AI Executive Diagnosis Card (Quiet Luxury Obsidian #0E1015, subtle dividers) */}
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0E1015]/95 backdrop-blur-2xl p-5 sm:p-6 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="space-y-3">
          {/* Unboxed typographic status */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-semibold ${
              integratedDiagnosis.status === 'EXCELLENT'
                ? 'text-sky-400'
                : integratedDiagnosis.status === 'HEALTHY'
                ? 'text-blue-400'
                : integratedDiagnosis.status === 'MODERATE'
                ? 'text-slate-300'
                : 'text-rose-400'
            }`}>
              {integratedDiagnosis.statusLabel}
            </span>
            <span className="opacity-30">·</span>
            <span className="font-light text-slate-400">
              AI 총괄 재정 진단
            </span>
            <span className="opacity-30">·</span>
            <span className="font-light text-slate-400 tabular-nums">
              {format(selectedMonth, 'yyyy년 M월')}
            </span>
          </div>

          {/* Executive Diagnosis Title */}
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white">
            {integratedDiagnosis.title}
          </h2>

          {/* Executive Summary */}
          <p className="text-xs sm:text-sm font-light leading-relaxed text-slate-300">
            {integratedDiagnosis.summary}
          </p>

          {/* Quiet Recommendation Footer with subtle hairline divider */}
          {integratedDiagnosis.recommendation && (
            <div className="pt-3.5 border-t border-white/[0.06] text-xs font-light leading-relaxed flex flex-col gap-1.5">
              <span className="font-medium text-sky-400 text-xs tracking-tight">
                실행 가이드
              </span>
              <p className="text-slate-300 text-xs sm:text-sm font-light leading-relaxed">
                {integratedDiagnosis.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. Spending Category Breakdown (Full-width clean horizontal bars) */}
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0E1015]/95 backdrop-blur-2xl p-5 sm:p-6 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white">
              카테고리별 지출 분석
            </h2>
            <p className="text-xs font-light text-slate-400 mt-0.5">
              {format(selectedMonth, 'yyyy년 M월')} 총 지출: <span className="font-medium text-slate-200 tabular-nums">{formatMoney(monthExpense)}</span>
              {monthExpenseCount > 0 && <span className="text-slate-400 ml-1">({monthExpenseCount}건)</span>}
            </p>
          </div>
          {selectedCategory && (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="text-xs font-normal px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 transition-all cursor-pointer"
            >
              {getCategoryKo(selectedCategory)} 해제 ×
            </button>
          )}
        </div>

        {/* Horizontal Category Ratio Bars with zero-data fallback */}
        <div className="space-y-3">
          {categoryBreakdownList.length === 0 ? (
            <div className="py-8 text-center text-xs font-light text-slate-500 flex flex-col items-center justify-center gap-1">
              <span className="text-slate-400 font-normal">이 달의 지출 내역이 없습니다</span>
              <span>선택된 기간에 기록된 지출 거래가 존재하지 않습니다.</span>
            </div>
          ) : (
            categoryBreakdownList.map((item) => {
              const isSelected = selectedCategory === item.category;
              return (
                <div
                  key={item.category}
                  onClick={() => setSelectedCategory(isSelected ? null : item.category)}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                    isSelected ? 'bg-sky-500/10 border border-sky-500/30 shadow-[0_0_12px_rgba(56,189,248,0.12)]' : 'border border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-medium ${isSelected ? 'text-sky-300' : 'text-slate-200'}`}>{item.name}</span>
                      <span className="text-[11px] font-light text-slate-400">({item.count}건)</span>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className={`font-normal ${isSelected ? 'text-sky-200' : 'text-slate-200'} ${isStealth ? 'blur-sm select-none' : ''}`}>
                        {formatMoney(item.amount)}
                      </span>
                      <span className="text-xs font-medium text-slate-400 min-w-[32px] text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  {/* Flat hairline horizontal ratio bar */}
                  <div className="w-full h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.max(item.percentage, 2)}%`, 
                        backgroundColor: item.color 
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. Daily Spending Trend Chart (Full width, h-52, smooth Recharts curve with zero-data fallback & min-height 200px) */}
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0E1015]/95 backdrop-blur-2xl p-5 sm:p-6 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
              <span>일별 지출 추이</span>
              {selectedCategory && (
                <span className="text-[11px] font-normal text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                  {getCategoryKo(selectedCategory)} 포커스
                </span>
              )}
            </h2>
            <p className="text-xs font-light text-slate-400 mt-0.5">
              {format(selectedMonth, 'yyyy년 M월')} · {selectedCategory ? `${getCategoryKo(selectedCategory)} ` : ''}일평균 <span className="text-slate-200 tabular-nums">{formatMoney(dailyAverage)}</span>
            </p>
          </div>
          {highestSpendingDay.amount > 0 && (
            <div className="text-xs font-light text-slate-400">
              최고 지출일: <span className="text-rose-400 font-medium tabular-nums">{highestSpendingDay.day}일 ({formatMoney(highestSpendingDay.amount)})</span>
            </div>
          )}
        </div>

        {!hasDailyData ? (
          <div className="w-full h-52 min-h-[200px] flex flex-col items-center justify-center text-center text-slate-400 text-xs font-light space-y-1">
            <span className="text-slate-300 font-normal">일별 지출 데이터 없음</span>
            <span>선택하신 기간 동안 발생한 지출 내역이 없습니다.</span>
          </div>
        ) : (
          <div className="w-full h-52 min-h-[200px] pt-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <AreaChart
                data={dailySpendingChartData}
                margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dailySpendingCurveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickFormatter={(v) => `${v}일`}
                  interval={Math.max(1, Math.floor(dailySpendingChartData.length / 8))}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                    if (v >= 10000) return `${Math.round(v / 10000)}만`;
                    return `${v}`;
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl border border-white/[0.08] bg-[#090A0D]/95 text-xs shadow-xl backdrop-blur-2xl text-white">
                          <div className="font-medium text-slate-300 border-b border-white/[0.06] pb-1 mb-1">
                            {data.dateLabel} {data.isToday ? '(오늘)' : ''}
                          </div>
                          <div className="flex items-center justify-between gap-3 text-sky-400 font-medium tabular-nums">
                            <span>지출:</span>
                            <span className={isStealth ? 'blur-xs select-none' : ''}>
                              {formatMoney(data.amount)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            결제 건수: {data.count}건
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {dailyAverage > 0 && (
                  <ReferenceLine 
                    y={dailyAverage} 
                    stroke="#94a3b8" 
                    strokeDasharray="3 3" 
                    strokeOpacity={0.4} 
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fill="url(#dailySpendingCurveGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 6. Predictive Cashflow & Runway Chart (Full width, h-52, area curve with zero-data fallback & min-height 200px) */}
      <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0E1015]/95 backdrop-blur-2xl p-5 sm:p-6 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-white">
              월간 현금흐름 궤적 & 유동성 예측
            </h2>
            <p className="text-xs font-light text-slate-400 mt-0.5">
              자율 지출 궤적 분석 및 월말 잔액 시뮬레이션
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-0.5 bg-sky-400 inline-block" />
              <span>실제 실적</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-sky-400 border-b border-dashed border-sky-400 inline-block" />
              <span>월말 예측선</span>
            </span>
          </div>
        </div>

        {/* 3-Metric KPI Row */}
        <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/[0.04]">
          <div>
            <span className="text-[11px] font-light text-slate-400 block truncate">
              현재 누적
            </span>
            <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate ${
              forecast.currentBalance >= 0 ? 'text-white' : 'text-rose-400'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(forecast.currentBalance)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-light text-slate-400 block truncate">
              월말 예상 잔액
            </span>
            <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate ${
              forecast.projectedMonthEndBalance >= 0 ? 'text-sky-400' : 'text-rose-400'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(forecast.projectedMonthEndBalance)}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-light text-slate-400 block truncate">
              예정 고정비
            </span>
            <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate text-amber-300 ${
              isStealth ? 'blur-sm select-none' : ''
            }`}>
              {formatMoney(forecast.totalUpcomingSubscriptions)}
            </span>
          </div>
        </div>

        {/* Area Chart with fallback */}
        {!forecast.dataPoints || forecast.dataPoints.length === 0 ? (
          <div className="w-full h-52 min-h-[200px] flex flex-col items-center justify-center text-center text-slate-500 text-xs font-light space-y-1">
            <span className="text-slate-400 font-normal">예측 데이터 없음</span>
            <span>현금흐름 궤적을 예측할 수 있는 거래 데이터가 아직 충분하지 않습니다.</span>
          </div>
        ) : (
          <div className="w-full h-52 min-h-[200px] pt-3">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <ComposedChart 
                data={forecast.dataPoints} 
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="forecastActualAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis 
                  dataKey="day" 
                  tickLine={false} 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickFormatter={(v) => `${v}일`} 
                />
                <YAxis 
                  tickLine={false} 
                  stroke="#64748b" 
                  fontSize={9} 
                  tickFormatter={(v) => `${Math.round(v / 10000)}만`} 
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl border border-white/[0.08] bg-[#08090D]/95 text-xs shadow-xl backdrop-blur-2xl text-white">
                          <div className="font-medium border-b border-white/[0.06] pb-1 mb-1">
                            {data.day}일 {data.isPast ? '(실제 실적)' : data.isToday ? '(오늘)' : '(예측)'}
                          </div>
                          {data.actualBalance !== undefined ? (
                            <div className="text-sky-400 font-normal tabular-nums">
                              실제 누적: {formatMoney(data.actualBalance)}
                            </div>
                          ) : (
                            <div className="text-blue-400 font-normal tabular-nums">
                              예상 누적: {formatMoney(data.projectedBalance)}
                            </div>
                          )}
                          {data.upcomingSubscriptionSum > 0 && (
                            <div className="text-amber-400 text-[10px] mt-0.5 font-light tabular-nums">
                              고정비 결제: {formatMoney(data.upcomingSubscriptionSum)}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" opacity={0.3} />
                <Area 
                  type="monotone" 
                  dataKey="actualBalance" 
                  stroke="#38bdf8" 
                  strokeWidth={2} 
                  fill="url(#forecastActualAreaGrad)" 
                  connectNulls={false} 
                />
                <Line 
                  type="monotone" 
                  dataKey="projectedBalance" 
                  stroke="#38bdf8" 
                  strokeWidth={2} 
                  strokeDasharray="4 4" 
                  dot={false} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightsSection;
