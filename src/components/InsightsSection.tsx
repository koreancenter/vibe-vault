import React, { useState, useMemo, useEffect } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates, 
  AssetAccount,
  DebtItem,
  AssetCategoryType,
  FinancialQueryResult
} from '../types';
import { 
  format, 
  subMonths, 
  addMonths, 
  isSameMonth, 
  isSameYear, 
  parseISO 
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  ShieldCheck,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  Activity,
  Layers,
  Landmark,
  Building,
  Bitcoin,
  Banknote,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  Loader2
} from 'lucide-react';
import { 
  calculateCashflowForecast, 
  detectSubscriptions,
  executeFinancialQuery
} from '../autonomousFinance';
import { 
  getCurrencySymbol, 
  getCategoryKo, 
  convertCurrency, 
  formatCurrency,
  getAssetCategoryKo,
  ASSET_CATEGORY_NAMES_KO 
} from '../utils';
import { getAllAssetAccounts, getAllDebts } from '../db';
import { CategoryDonutChart } from './CategoryDonutChart';
import { MonthlyTrendsChart } from './MonthlyTrendsChart';
import { YearlyTrendsChart } from './YearlyTrendsChart';
import {
  ResponsiveContainer,
  ComposedChart,
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
}

export const InsightsSection: React.FC<InsightsSectionProps> = ({
  transactions,
  currentCurrency,
  fxRates,
  isStealth = false,
  onOpenThemeSettings,
  onNavigateToVault,
  onNavigateToLedger
}) => {
  const isLight = false;
  const currSymbol = getCurrencySymbol(currentCurrency);

  // 1. Period Control State (Defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'all' | 'assets' | 'spending' | 'cashflow'>('all');
  const [trendSubTab, setTrendSubTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Asset accounts & debts state
  const [accounts, setAccounts] = useState<AssetAccount[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Conversational Financial Query ("Ask AI Vault") State
  const [naturalQuery, setNaturalQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<FinancialQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleRunQuery = async (queryText?: string) => {
    const textToRun = (typeof queryText === 'string' ? queryText : naturalQuery).trim();
    if (!textToRun || isQuerying) return;
    setIsQuerying(true);
    setQueryError(null);
    try {
      const res = await executeFinancialQuery(
        textToRun,
        transactions,
        accounts,
        fxRates,
        currentCurrency
      );
      setQueryResult(res);
      setNaturalQuery('');
    } catch (err: any) {
      console.error('Financial query error:', err);
      setQueryError(err.message || '금융 질문을 분석하는 중 오류가 발생했습니다.');
    } finally {
      setIsQuerying(false);
    }
  };

  // Load Asset Accounts and Debts for integrated analysis
  const loadVaultData = async () => {
    try {
      setIsLoadingData(true);
      const [accs, dbs] = await Promise.all([
        getAllAssetAccounts(),
        getAllDebts()
      ]);
      setAccounts(accs || []);
      setDebts(dbs || []);
    } catch (err) {
      console.error('Failed to load asset & debt data for insights:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    loadVaultData();
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
  const { monthIncome, monthExpense, monthNet } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of monthTransactions) {
      const amt = convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);
      if (t.type === 'INCOME') inc += amt;
      else if (t.type === 'EXPENSE') exp += amt;
      else if (t.type === 'SETTLEMENT') inc += amt;
    }
    return {
      monthIncome: inc,
      monthExpense: exp,
      monthNet: inc - exp
    };
  }, [monthTransactions, currentCurrency, fxRates]);

  // Asset calculations
  const { totalAssets, totalLiabilities, netWorth, categoryTotals, liquidAssets } = useMemo(() => {
    let assetsSum = 0;
    let liabilitiesSum = 0;
    let liquid = 0;
    const catMap: Record<AssetCategoryType, number> = {
      BROKERAGE: 0,
      BANK: 0,
      CRYPTO: 0,
      REAL_ESTATE: 0,
      CASH: 0,
      LIABILITY: 0,
    };

    for (const acc of accounts) {
      const converted = convertCurrency(
        acc.currentBalance,
        acc.currency || 'KRW',
        currentCurrency,
        fxRates
      );

      if (acc.assetType === 'LIABILITY') {
        liabilitiesSum += converted;
        catMap.LIABILITY += converted;
      } else {
        assetsSum += converted;
        catMap[acc.assetType] = (catMap[acc.assetType] || 0) + converted;
        if (acc.assetType === 'BANK' || acc.assetType === 'CASH') {
          liquid += converted;
        }
      }
    }

    // Include debts
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
        catMap.LIABILITY += converted;
      }
    }

    return {
      totalAssets: assetsSum,
      totalLiabilities: liabilitiesSum,
      netWorth: assetsSum - liabilitiesSum,
      categoryTotals: catMap,
      liquidAssets: liquid
    };
  }, [accounts, debts, currentCurrency, fxRates]);

  // Integrated Cross-Domain Financial Indicators
  const savingsRate = useMemo(() => {
    if (monthIncome <= 0) return 0;
    return Math.max(0, Math.round((monthNet / monthIncome) * 100));
  }, [monthIncome, monthNet]);

  const burnRateToNetWorth = useMemo(() => {
    if (netWorth <= 0) return 0;
    return ((monthExpense / netWorth) * 100).toFixed(1);
  }, [monthExpense, netWorth]);

  const runwayMonths = useMemo(() => {
    if (monthExpense <= 0) return 999;
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
    let title = '안정적인 자산-소비 균형';
    let summary = '';
    let recommendation = '';

    const numRunway = parseFloat(runwayMonths);
    const numBurn = parseFloat(String(burnRateToNetWorth));

    if (netWorth > 0 && savingsRate >= 40 && numRunway >= 6) {
      status = 'EXCELLENT';
      title = '최상급 재정 건전성 & 자본 축적';
      summary = `순자산 ${currSymbol}${Math.round(netWorth).toLocaleString()} 대비 월간 소비율이 ${numBurn}%로 매우 낮으며, 저축률(${savingsRate}%)이 높아 자본 축적 속도가 탁월합니다.`;
      recommendation = `비상금 완충 여력이 ${numRunway}개월로 충분하므로, 월 잉여현금을 연금저축/ISA 또는 적립식 글로벌 ETF로 운용하여 복리 효과를 극대화하세요.`;
    } else if (netWorth > 0 && monthNet >= 0 && debtRatio < 40) {
      status = 'HEALTHY';
      title = '건전한 현금흐름 유지 중';
      summary = `이번 달 순흑자(${currSymbol}${Math.round(monthNet).toLocaleString()})를 기록하며 순자산이 지속 증가하고 있습니다. 부채 비율 또한 ${debtRatio}%로 안정적입니다.`;
      recommendation = `현재의 저축률(${savingsRate}%)을 유지하면서 정기 고정비(${subscriptions.length}건)를 점검하고 불필요한 구독을 절감하면 자산 증식 속도를 더욱 높일 수 있습니다.`;
    } else if (monthNet < 0 || debtRatio >= 50) {
      status = 'ATTENTION';
      title = '지출 관리 및 유동성 완충 필요';
      summary = `이번 달 지출이 수입을 초과(적자 ${currSymbol}${Math.round(Math.abs(monthNet)).toLocaleString()})하거나 부채 비율(${debtRatio}%)이 다소 높습니다.`;
      recommendation = `현금성 완충 자산(${currSymbol}${Math.round(liquidAssets).toLocaleString()})을 확보하고, 고금리 부채 우선 상환 및 변동성 소비 항목을 우선 조정하십시오.`;
    } else {
      status = 'MODERATE';
      title = '적정 수준의 재정 밸런스';
      summary = `총 자산 대비 지출 흐름이 완만한 균형을 이루고 있습니다.`;
      recommendation = `지속적인 장부 기록과 자산 계좌 동기화를 통해 예측 정확도를 높이세요.`;
    }

    return { status, title, summary, recommendation };
  }, [netWorth, savingsRate, runwayMonths, burnRateToNetWorth, monthNet, debtRatio, subscriptions.length, liquidAssets, currSymbol]);

  const formatMoney = (val: number) => {
    const isNeg = val < 0;
    const absVal = Math.abs(Math.round(val)).toLocaleString();
    return isNeg ? `-${currSymbol}${absVal}` : `${currSymbol}${absVal}`;
  };

  // Asset breakdown items with percentages
  const assetBreakdownList = useMemo(() => {
    const items = [
      { key: 'BANK', name: '예적금 / 입출금', icon: Landmark, color: '#3B82F6', amount: categoryTotals.BANK || 0 },
      { key: 'BROKERAGE', name: '주식 / 투자', icon: TrendingUp, color: '#10B981', amount: categoryTotals.BROKERAGE || 0 },
      { key: 'REAL_ESTATE', name: '부동산', icon: Building, color: '#8B5CF6', amount: categoryTotals.REAL_ESTATE || 0 },
      { key: 'CRYPTO', name: '가상자산', icon: Bitcoin, color: '#F59E0B', amount: categoryTotals.CRYPTO || 0 },
      { key: 'CASH', name: '현금', icon: Banknote, color: '#06B6D4', amount: categoryTotals.CASH || 0 },
    ];
    const totalPositive = totalAssets > 0 ? totalAssets : 1;
    return items.map(item => ({
      ...item,
      percentage: Math.round((item.amount / totalPositive) * 100)
    })).filter(i => i.amount > 0 || totalAssets === 0);
  }, [categoryTotals, totalAssets]);

  return (
    <div className="space-y-4 pb-8 animate-in fade-in duration-200">
      {/* 1. Header & Period Control */}
      <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 ${
        isLight 
          ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]' 
          : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
      }`}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              isLight 
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
            }`}
            aria-label="이전 달"
          >
            <ChevronLeft size={16} />
          </button>

          <span className={`text-sm sm:text-base font-normal px-2 tracking-tight ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            {format(selectedMonth, 'yyyy년 M월')}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              isLight 
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' 
                : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
            }`}
            aria-label="다음 달"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={handleResetToCurrentMonth}
              className={`px-3 py-1 rounded-full text-xs font-light transition-all active:scale-95 ${
                isLight 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              }`}
            >
              이번 달
            </button>
          )}

          <span className={`text-xs font-light hidden sm:inline-block ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            통합 자산·장부 분석
          </span>
        </div>
      </div>

      {/* Ask AI Vault Conversational Query Bar & Briefing Card */}
      <div className="space-y-3">
        {/* Minimalist Glassmorphic Query Input Bar */}
        <div className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
          isLight
            ? 'bg-white/80 backdrop-blur-xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]'
            : 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.3)]'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Sparkles size={16} className={isQuerying ? 'animate-spin' : ''} />
            </div>
            <div className="flex-1 relative">
              <input
                type="text"
                value={naturalQuery}
                onChange={(e) => setNaturalQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRunQuery(naturalQuery);
                  }
                }}
                disabled={isQuerying}
                placeholder="✦ 무엇이든 물어보세요 (예: 9월 달러 환차손익, 식비 총합, 주말 지출)"
                className={`w-full bg-transparent text-xs sm:text-sm font-light outline-none transition-all placeholder:text-slate-500 ${
                  isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-slate-100 placeholder:text-slate-500'
                }`}
              />
            </div>
            {naturalQuery && (
              <button
                type="button"
                onClick={() => setNaturalQuery('')}
                className="p-1 text-slate-400 hover:text-slate-200 text-xs rounded-full"
                aria-label="입력 지우기"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleRunQuery(naturalQuery)}
              disabled={isQuerying || !naturalQuery.trim()}
              className={`p-2 rounded-xl transition-all flex items-center justify-center shrink-0 active:scale-95 ${
                naturalQuery.trim() && !isQuerying
                  ? isLight
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : isLight
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white/[0.04] text-slate-500 cursor-not-allowed'
              }`}
              aria-label="질문 실행"
            >
              {isQuerying ? (
                <Loader2 size={15} className="animate-spin text-indigo-400" />
              ) : (
                <ArrowRight size={15} />
              )}
            </button>
          </div>

          {/* Quick Chip Suggestions */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-white/[0.04] flex-wrap">
            <span className={`text-[11px] font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              추천 질문:
            </span>
            <button
              type="button"
              onClick={() => handleRunQuery('9월 환차익')}
              disabled={isQuerying}
              className={`text-xs font-light px-2.5 py-1 rounded-full transition-all active:scale-95 border ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' 
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-slate-300 hover:text-white'
              }`}
            >
              9월 환차익
            </button>
            <button
              type="button"
              onClick={() => handleRunQuery('식비 분석')}
              disabled={isQuerying}
              className={`text-xs font-light px-2.5 py-1 rounded-full transition-all active:scale-95 border ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' 
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-slate-300 hover:text-white'
              }`}
            >
              식비 분석
            </button>
            <button
              type="button"
              onClick={() => handleRunQuery('주말 지출')}
              disabled={isQuerying}
              className={`text-xs font-light px-2.5 py-1 rounded-full transition-all active:scale-95 border ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700' 
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06] text-slate-300 hover:text-white'
              }`}
            >
              주말 지출
            </button>
          </div>
        </div>

        {/* Query Loading State */}
        {isQuerying && (
          <div className={`p-4 rounded-xl border flex items-center justify-center gap-3 animate-pulse ${
            isLight ? 'bg-white/80 border-slate-200/80 text-slate-600' : 'bg-white/[0.02] border-white/[0.06] text-slate-300'
          }`}>
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="text-xs font-light">
              로컬 장부 및 자산 데이터를 결정론적 수식으로 분석 중입니다...
            </span>
          </div>
        )}

        {/* Error State */}
        {queryError && (
          <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between">
            <span>{queryError}</span>
            <button type="button" onClick={() => setQueryError(null)} className="p-1 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {/* 3. Dismissible AI Briefing Card */}
        {queryResult && !isQuerying && (
          <div className={`p-5 sm:p-6 rounded-2xl border transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${
            isLight
              ? 'bg-white/90 backdrop-blur-xl border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]'
              : 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            {/* Card Header with Question Tag & Dismiss Button */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-normal border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                  <Sparkles size={12} className="text-indigo-400" />
                  <span>AI Vault 브리핑</span>
                </span>
                <span className={`text-xs font-light truncate max-w-[200px] sm:max-w-xs ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  "{queryResult.query}"
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQueryResult(null)}
                className={`p-1.5 rounded-full transition-all active:scale-95 ${
                  isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-white/[0.08] text-slate-400 hover:text-white'
                }`}
                aria-label="브리핑 닫기"
              >
                <X size={16} />
              </button>
            </div>

            {/* Direct Answer */}
            <h4 className={`text-base sm:text-lg font-normal tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              {queryResult.directAnswer}
            </h4>

            {/* Two-Sentence Synthesis Explanation */}
            <p className={`mt-2 text-xs sm:text-sm font-light leading-relaxed ${
              isLight ? 'text-slate-600' : 'text-slate-300'
            }`}>
              {queryResult.summarySentence}
            </p>

            {/* Calculation Breakdown Pills */}
            {queryResult.breakdownPills && queryResult.breakdownPills.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3.5 border-t border-white/[0.04]">
                {queryResult.breakdownPills.map((pill, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col justify-between ${
                      pill.highlight
                        ? isLight
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : isLight
                          ? 'bg-slate-50 border-slate-200/60 text-slate-800'
                          : 'bg-white/[0.02] border-white/[0.04] text-slate-200'
                    }`}
                  >
                    <span className={`text-[11px] font-light ${
                      pill.highlight 
                        ? (isLight ? 'text-emerald-700' : 'text-emerald-400') 
                        : (isLight ? 'text-slate-500' : 'text-slate-400')
                    }`}>
                      {pill.label}
                    </span>
                    <span className={`text-xs sm:text-sm font-normal tabular-nums mt-1 ${
                      pill.highlight
                        ? (isLight ? 'text-emerald-900 font-medium' : 'text-emerald-200')
                        : (isLight ? 'text-slate-900' : 'text-slate-100')
                    }`}>
                      {pill.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Primary Sub-tab Segment Control: Clean, Pill-shaped with gentle active outlines */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`py-1.5 px-3.5 rounded-full text-xs font-light transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === 'all'
              ? isLight
                ? 'bg-slate-900 text-white border border-slate-900'
                : 'bg-white/[0.08] text-white border border-white/20'
              : isLight ? 'text-slate-600 hover:text-slate-950 border border-transparent' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Sparkles size={13} className={activeTab === 'all' ? 'text-indigo-400' : ''} />
          <span>통합 요약</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assets')}
          className={`py-1.5 px-3.5 rounded-full text-xs font-light transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === 'assets'
              ? isLight
                ? 'bg-slate-900 text-white border border-slate-900'
                : 'bg-white/[0.08] text-white border border-white/20'
              : isLight ? 'text-slate-600 hover:text-slate-950 border border-transparent' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <ShieldCheck size={13} className={activeTab === 'assets' ? 'text-blue-400' : ''} />
          <span>자산 포트폴리오</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spending')}
          className={`py-1.5 px-3.5 rounded-full text-xs font-light transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === 'spending'
              ? isLight
                ? 'bg-slate-900 text-white border border-slate-900'
                : 'bg-white/[0.08] text-white border border-white/20'
              : isLight ? 'text-slate-600 hover:text-slate-950 border border-transparent' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <PieChartIcon size={13} className={activeTab === 'spending' ? 'text-emerald-400' : ''} />
          <span>소비·지출</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cashflow')}
          className={`py-1.5 px-3.5 rounded-full text-xs font-light transition-all whitespace-nowrap flex items-center justify-center gap-1.5 ${
            activeTab === 'cashflow'
              ? isLight
                ? 'bg-slate-900 text-white border border-slate-900'
                : 'bg-white/[0.08] text-white border border-white/20'
              : isLight ? 'text-slate-600 hover:text-slate-950 border border-transparent' : 'text-slate-400 hover:text-white border border-transparent'
          }`}
        >
          <Activity size={13} className={activeTab === 'cashflow' ? 'text-sky-400' : ''} />
          <span>현금흐름 & 예측</span>
        </button>
      </div>

      {/* 3. TAB CONTENT */}

      {/* TAB A: 통합 요약 (Unified Integrated Briefing) */}
      {(activeTab === 'all') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start animate-in fade-in duration-150">
          {/* Left Column (lg:col-span-5): CFO Executive Summary & Savings Rate / Runway gauges */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
            {/* Integrated AI CFO Diagnosis Card */}
          <div className={`p-5 sm:p-6 rounded-2xl transition-all border ${
            isLight 
              ? 'bg-white/85 backdrop-blur-xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] text-slate-900' 
              : 'bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
          }`}>
            <div className="flex items-start gap-3.5">
              <div className={`p-2 rounded-xl shrink-0 ${
                integratedDiagnosis.status === 'EXCELLENT'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : integratedDiagnosis.status === 'HEALTHY'
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}>
                <Sparkles size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-light px-2 py-0.5 rounded-full border ${
                    integratedDiagnosis.status === 'EXCELLENT'
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                      : integratedDiagnosis.status === 'HEALTHY'
                      ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                  }`}>
                    {integratedDiagnosis.status === 'EXCELLENT' ? 'EXCELLENT' : integratedDiagnosis.status === 'HEALTHY' ? 'STABLE' : 'ATTENTION'}
                  </span>
                  <h3 className="font-normal text-sm sm:text-base tracking-tight">
                    {integratedDiagnosis.title}
                  </h3>
                </div>
                <p className={`mt-2 text-xs sm:text-sm font-light leading-relaxed ${
                  isLight ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  {integratedDiagnosis.summary}
                </p>
                <div className={`mt-3 pt-3 border-t text-xs font-light flex items-start gap-2.5 ${
                  isLight ? 'border-slate-200/60 text-slate-700' : 'border-white/[0.05] text-slate-300'
                }`}>
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{integratedDiagnosis.recommendation}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Core Integrated KPI Grid (Single Flat Parent Card separated by Hairline Dividers) */}
          <div className={`rounded-2xl border overflow-hidden grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 divide-x transition-all backdrop-blur-2xl ${
            isLight 
              ? 'bg-white/85 border-slate-200/80 divide-slate-200/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)]' 
              : 'bg-white/[0.03] border-white/[0.08] divide-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
          }`}>
            {/* 1. 총 순자산 */}
            <div className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  총 순자산
                </span>
                <ShieldCheck size={14} className="text-blue-400" />
              </div>
              <span className={`text-xl md:text-2xl font-light tracking-tight tabular-nums block ${
                isLight ? 'text-slate-900' : 'text-white'
              } ${isStealth ? 'blur-sm select-none' : ''}`}>
                {formatMoney(netWorth)}
              </span>
              <div className={`mt-1.5 text-[11px] font-light ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <span>총 자산: {formatMoney(totalAssets)}</span>
              </div>
            </div>

            {/* 2. 이번 달 저축률 */}
            <div className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  이번 달 저축률
                </span>
                <TrendingUp size={14} className="text-emerald-400/90" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl md:text-2xl font-light tracking-tight tabular-nums ${
                  savingsRate >= 30 ? (isLight ? 'text-emerald-700' : 'text-emerald-400/90') : savingsRate >= 0 ? (isLight ? 'text-slate-800' : 'text-slate-200') : 'text-rose-400/90'
                }`}>
                  {savingsRate}%
                </span>
                <span className={`text-[11px] font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  ({formatMoney(monthNet)})
                </span>
              </div>
              <div className={`mt-1.5 text-[11px] font-light truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                수입 {formatMoney(monthIncome)} 대비
              </div>
            </div>

            {/* 3. 자산 대비 월 소비율 */}
            <div className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  순자산 대비 소비
                </span>
                <Wallet size={14} className="text-purple-400" />
              </div>
              <span className={`text-xl md:text-2xl font-light tracking-tight tabular-nums block ${
                parseFloat(String(burnRateToNetWorth)) < 3 
                  ? (isLight ? 'text-emerald-700' : 'text-emerald-400/90') 
                  : parseFloat(String(burnRateToNetWorth)) < 7 
                  ? isLight ? 'text-slate-900' : 'text-white' 
                  : 'text-amber-400'
              }`}>
                {burnRateToNetWorth}%
              </span>
              <div className={`mt-1.5 text-[11px] font-light truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                월 지출 {formatMoney(monthExpense)}
              </div>
            </div>

            {/* 4. 비상금 유지력 (Runway) */}
            <div className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  비상 유동성 완충
                </span>
                <Banknote size={14} className="text-teal-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-xl md:text-2xl font-light tracking-tight tabular-nums ${
                  parseFloat(runwayMonths) >= 6 ? (isLight ? 'text-emerald-700' : 'text-emerald-400/90') : parseFloat(runwayMonths) >= 3 ? 'text-amber-400' : 'text-rose-400/90'
                }`}>
                  {parseFloat(runwayMonths) > 99 ? '99+' : runwayMonths}
                </span>
                <span className={`text-xs font-light ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  개월
                </span>
              </div>
              <div className={`mt-1.5 text-[11px] font-light truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                현금/예금 {formatMoney(liquidAssets)}
              </div>
            </div>
          </div>

          {/* Integrated Balance Sheet & Spending Harmony Card */}
          <div className={`p-5 sm:p-6 rounded-2xl transition-all ${
            isLight 
              ? 'bg-white/85 backdrop-blur-xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]' 
              : 'bg-white/[0.025] backdrop-blur-xl border border-white/[0.06] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h3 className={`text-xs font-normal tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  자산 & 소비 구조 밸런스
                </h3>
                <p className={`text-xs font-light mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  보유 자산 배분과 이번 달 소비/저축의 유기적 상관관계
                </p>
              </div>
            </div>

            {/* Visual Balance Bar */}
            <div className="space-y-4 pt-1">
              <div>
                <div className="flex items-center justify-between text-xs font-light mb-1.5">
                  <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>
                    자산 구성비
                  </span>
                  <span className="text-xs text-blue-400">
                    총 {accounts.length}개 계좌
                  </span>
                </div>
                {/* Thin multi-segment stacked progress bar */}
                <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                  {assetBreakdownList.map((item) => (
                    item.percentage > 0 ? (
                      <div
                        key={item.key}
                        style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        title={`${item.name}: ${item.percentage}% (${formatMoney(item.amount)})`}
                        className="h-full transition-all opacity-85"
                      />
                    ) : null
                  ))}
                </div>
                {/* Legend Chips */}
                <div className="flex items-center gap-3.5 flex-wrap mt-2.5">
                  {assetBreakdownList.slice(0, 4).map((item) => (
                    <div key={item.key} className="flex items-center gap-1.5 text-xs font-light">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                      <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>{item.name}</span>
                      <span className={`tabular-nums ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {item.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Cash Flow In vs Out */}
              <div className={`pt-3.5 border-t ${isLight ? 'border-slate-200/60' : 'border-white/[0.04]'}`}>
                <div className="flex items-center justify-between text-xs font-light mb-2">
                  <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>
                    이번 달 수지 대조
                  </span>
                  <span className={`tabular-nums ${monthNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    순수익: {formatMoney(monthNet)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className={`p-3 rounded-xl flex items-center justify-between ${
                    isLight ? 'bg-slate-50 border border-slate-200/60 text-slate-800' : 'bg-white/[0.02] border border-white/[0.04] text-slate-200'
                  }`}>
                    <span className="text-xs font-light flex items-center gap-1 text-slate-400">
                      <ArrowUpRight size={13} className="text-emerald-400" /> 수입
                    </span>
                    <span className={`font-normal tabular-nums text-emerald-400 ${isStealth ? 'blur-sm select-none' : ''}`}>
                      +{formatMoney(monthIncome)}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl flex items-center justify-between ${
                    isLight ? 'bg-slate-50 border border-slate-200/60 text-slate-800' : 'bg-white/[0.02] border border-white/[0.04] text-slate-200'
                  }`}>
                    <span className="text-xs font-light flex items-center gap-1 text-slate-400">
                      <ArrowDownRight size={13} className="text-rose-400" /> 지출
                    </span>
                    <span className={`font-normal tabular-nums text-slate-200 ${isStealth ? 'blur-sm select-none' : ''}`}>
                      -{formatMoney(monthExpense)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className={`flex items-center gap-2 pt-4 mt-4 border-t ${
              isLight ? 'border-slate-200/60' : 'border-white/[0.04]'
            }`}>
              {onNavigateToVault && (
                <button
                  type="button"
                  onClick={onNavigateToVault}
                  className={`flex-1 py-2 px-3.5 rounded-full text-xs font-light transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    isLight 
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]'
                  }`}
                >
                  <ShieldCheck size={14} />
                  <span>자산 금고 상세</span>
                  <ArrowRight size={12} />
                </button>
              )}
              {onNavigateToLedger && (
                <button
                  type="button"
                  onClick={onNavigateToLedger}
                  className={`flex-1 py-2 px-3.5 rounded-full text-xs font-light transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                    isLight 
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]'
                  }`}
                >
                  <Wallet size={14} />
                  <span>일일 장부 보기</span>
                  <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (lg:col-span-7): Category Donut Chart, Monthly Trends, and Cashflow projections */}
        <div className="lg:col-span-7 space-y-4">
            {/* Quick Embedded Donut Chart & Cashflow Summary Side-by-Side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Spending Category Donut */}
            <div className={`p-5 rounded-2xl transition-all ${
              isLight 
                ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]' 
                : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-xs font-normal tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  이번 달 주요 지출처
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('spending')}
                  className={`text-xs font-light ${isLight ? 'text-emerald-700 hover:underline' : 'text-emerald-300 hover:underline'}`}
                >
                  상세보기
                </button>
              </div>
              <CategoryDonutChart
                transactions={monthTransactions.length > 0 ? monthTransactions : transactions}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                currencySymbol={currentCurrency}
                isStealth={isStealth}
                embedded={true}
              />
            </div>

            {/* Predictive Cashflow Curve */}
            <div className={`p-5 rounded-2xl transition-all ${
              isLight 
                ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]' 
                : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-xs font-normal tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                  월말 예상 유동성
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('cashflow')}
                  className={`text-xs font-light ${isLight ? 'text-blue-700 hover:underline' : 'text-blue-400 hover:underline'}`}
                >
                  상세보기
                </button>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecast.dataPoints} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#f1f5f9' : 'rgba(255,255,255,0.03)'} vertical={false} />
                    <XAxis dataKey="day" tickLine={false} stroke={isLight ? '#94a3b8' : '#475569'} fontSize={10} tickFormatter={(v) => `${v}일`} />
                    <YAxis tickLine={false} stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className={`p-2 rounded-xl border text-xs shadow-xl backdrop-blur-2xl ${
                              isLight ? 'bg-white/95 border-slate-200 text-slate-900' : 'bg-[#08090D]/90 border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
                            }`}>
                              <div className="font-normal">{data.day}일 {data.isPast ? '(실적)' : '(예측)'}</div>
                              <div className="text-emerald-400 font-normal tabular-nums">{formatMoney(data.actualBalance ?? data.projectedBalance)}</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="actualBalance" stroke="#34d399" strokeWidth={1.5} fill={isLight ? 'rgba(52, 211, 153, 0.08)' : 'rgba(52, 211, 153, 0.06)'} connectNulls={false} />
                    <Line type="monotone" dataKey="projectedBalance" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Monthly Trends Chart Card */}
          <div className={`p-4 sm:p-5 rounded-2xl transition-all ${
            isLight 
              ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]' 
              : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-xs font-normal tracking-wide ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                일별 지출 추이
              </h3>
              <span className="text-[11px] font-light text-slate-400">
                {format(selectedMonth, 'yyyy년 M월')}
              </span>
            </div>
            <MonthlyTrendsChart
              transactions={monthTransactions.length > 0 ? monthTransactions : transactions}
              currencySymbol={currentCurrency}
              isStealth={isStealth}
              embedded={true}
            />
          </div>
        </div>
      </div>
      )}

      {/* TAB B: 자산 포트폴리오 분석 (Asset Allocation & Portfolio Deep Dive) */}
      {(activeTab === 'assets') && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Asset Net Worth Summary */}
          <div className={`p-5 sm:p-6 rounded-2xl transition-all border ${
            isLight 
              ? 'bg-white/85 backdrop-blur-xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] text-slate-900' 
              : 'bg-white/[0.025] backdrop-blur-xl border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  순자산 포트폴리오 총액
                </span>
                <div className="flex items-baseline mt-1">
                  <span className="text-xl font-light text-slate-400 mr-1">{getCurrencySymbol(currentCurrency)}</span>
                  <h2 className={`text-3xl md:text-4xl font-light tracking-tight tabular-nums ${
                    isLight ? 'text-slate-900' : 'text-white'
                  } ${isStealth ? 'blur-sm select-none' : ''}`}>
                    {Math.round(netWorth).toLocaleString()}
                  </h2>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs font-light block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  부채 비율
                </span>
                <span className={`text-sm sm:text-base font-normal tabular-nums ${debtRatio < 40 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {debtRatio}%
                </span>
              </div>
            </div>

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assetBreakdownList.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.key}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                      isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-white/[0.015] border-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${item.color}15`, color: item.color }}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-normal ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                            {item.name}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-light ${
                            isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'
                          }`}>
                            {item.percentage}%
                          </span>
                        </div>
                        <span className={`text-sm font-normal tabular-nums block mt-0.5 ${
                          isLight ? 'text-slate-900' : 'text-slate-100'
                        } ${isStealth ? 'blur-sm select-none' : ''}`}>
                          {formatMoney(item.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Liabilities / Debts Card */}
              <div className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                isLight ? 'bg-rose-50/50 border-rose-200/60' : 'bg-rose-500/[0.06] border-rose-500/15'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-normal text-rose-400">
                        총 부채 / 대출
                      </span>
                    </div>
                    <span className={`text-sm font-normal tabular-nums block mt-0.5 text-rose-400 ${
                      isStealth ? 'blur-sm select-none' : ''
                    }`}>
                      -{formatMoney(totalLiabilities)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Accounts Breakdown Table */}
          <div className={`p-5 sm:p-6 rounded-2xl transition-all border ${
            isLight 
              ? 'bg-white/80 backdrop-blur-xl border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] text-slate-900' 
              : 'bg-white/[0.02] backdrop-blur-xl border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <h3 className={`text-xs font-normal tracking-wide mb-3.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
              등록 계좌 및 자산 목록 ({accounts.length}개)
            </h3>
            {accounts.length === 0 ? (
              <p className={`text-xs font-light py-4 text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                등록된 자산 계좌가 없습니다. [자산] 탭에서 계좌를 추가해 보세요.
              </p>
            ) : (
              <div className="space-y-2 divide-y divide-white/[0.03]">
                {accounts.map((acc) => (
                  <div 
                    key={acc.id}
                    className="pt-2.5 first:pt-0 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-normal ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          {acc.institution}
                        </span>
                        <span className="text-slate-600 font-light text-xs">·</span>
                        <span className={`text-[10px] font-light ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          {getAssetCategoryKo(acc.assetType)}
                        </span>
                      </div>
                      <span className={`text-xs font-light block mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {acc.accountName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-normal tabular-nums block ${isLight ? 'text-slate-900' : 'text-slate-100'} ${isStealth ? 'blur-sm select-none' : ''}`}>
                        {formatMoney(convertCurrency(acc.currentBalance, acc.currency || 'KRW', currentCurrency, fxRates))}
                      </span>
                      {acc.holdings && acc.holdings.length > 0 && (
                        <span className="text-[10px] font-light text-emerald-400">
                          종목 {acc.holdings.length}개 보유
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB C: 소비·지출 분석 (Spending Category Donut & Trends) */}
      {(activeTab === 'spending') && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Donut Chart Block */}
          <div className={`p-4 sm:p-6 rounded-2xl transition-all ${
            isLight 
              ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]' 
              : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs sm:text-sm font-medium tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                카테고리별 지출 비중
              </h3>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-normal active:scale-95 transition-all border ${
                    isLight 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                  }`}
                >
                  <span>{getCategoryKo(selectedCategory)}</span>
                  <span className="font-light">×</span>
                </button>
              )}
            </div>

            <CategoryDonutChart
              transactions={monthTransactions.length > 0 ? monthTransactions : transactions}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              currencySymbol={currentCurrency}
              isStealth={isStealth}
              embedded={true}
            />
          </div>

          {/* Trend Deep Dive: 일별 추이 vs 연간 월별 비교 */}
          <div className="p-4 sm:p-6 rounded-2xl transition-all bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="inline-flex items-center p-0.5 rounded-full gap-0.5 border bg-white/[0.03] border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTrendSubTab('daily')}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    trendSubTab === 'daily'
                      ? 'bg-white/10 text-white font-medium border border-white/20'
                      : 'text-slate-400 hover:text-white font-normal'
                  }`}
                >
                  일별 추이
                </button>

                <button
                  type="button"
                  onClick={() => setTrendSubTab('monthly')}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    trendSubTab === 'monthly'
                      ? 'bg-white/10 text-white font-medium border border-white/20'
                      : 'text-slate-400 hover:text-white font-normal'
                  }`}
                >
                  월별 비교
                </button>
              </div>

              <span className="text-[11px] font-light text-slate-500">
                {trendSubTab === 'daily' ? '일별 지출 분석' : '연간 12개월 추이'}
              </span>
            </div>

            {trendSubTab === 'daily' ? (
              <MonthlyTrendsChart
                transactions={monthTransactions.length > 0 ? monthTransactions : transactions}
                currencySymbol={currentCurrency}
                isStealth={isStealth}
                embedded={true}
              />
            ) : (
              <YearlyTrendsChart
                transactions={transactions}
                currencySymbol={currentCurrency}
                isStealth={isStealth}
                embedded={true}
              />
            )}
          </div>
        </div>
      )}

      {/* TAB D: 현금흐름 & 예측 (Autonomous CFO Liquidity Trajectory) */}
      {(activeTab === 'cashflow') && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* CFO Advice Hero Banner */}
          <div className={`p-4 sm:p-6 rounded-2xl transition-all ${
            isLight 
              ? 'bg-white/80 backdrop-blur-xl border border-slate-200/80 text-slate-900 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]' 
              : 'bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] text-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]'
          }`}>
            <div className={`p-3.5 rounded-xl flex items-start gap-2.5 mb-4 border ${
              forecast.status === 'HEALTHY'
                ? isLight ? 'bg-emerald-50/70 text-emerald-950 border-emerald-200/60' : 'bg-emerald-500/[0.06] text-emerald-300 border-emerald-500/20'
                : forecast.status === 'MODERATE'
                  ? isLight ? 'bg-amber-50/70 text-amber-950 border-amber-200/60' : 'bg-amber-500/[0.06] text-amber-300 border-amber-500/20'
                  : isLight ? 'bg-rose-50/70 text-rose-950 border-rose-200/60' : 'bg-rose-500/[0.06] text-rose-300 border-rose-500/20'
            }`}>
              <div className="p-1 rounded-lg bg-black/5 dark:bg-white/10 shrink-0 mt-0.5">
                <Sparkles size={15} />
              </div>
              <div className="text-xs">
                <strong className="block font-medium">자율 CFO 현금흐름 진단</strong>
                <p className="mt-0.5 leading-relaxed font-light text-[11px] sm:text-xs opacity-90">
                  {forecast.recommendation}
                </p>
              </div>
            </div>

            {/* 3-Metric KPI Row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 py-1">
              <div className="min-w-0">
                <span className={`text-[10px] sm:text-[11px] font-light block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  현재 순자금
                </span>
                <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate ${
                  forecast.currentBalance >= 0 ? (isLight ? 'text-slate-900' : 'text-slate-100') : 'text-rose-400'
                } ${isStealth ? 'blur-sm select-none' : ''}`}>
                  {formatMoney(forecast.currentBalance)}
                </span>
                <span className={`text-[10px] mt-0.5 block font-light truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  실시간 집계
                </span>
              </div>

              <div className="min-w-0">
                <span className={`text-[10px] sm:text-[11px] font-light block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  월말 예상 잔액
                </span>
                <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate ${
                  forecast.projectedMonthEndBalance >= 0 ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : 'text-rose-400'
                } ${isStealth ? 'blur-sm select-none' : ''}`}>
                  {formatMoney(forecast.projectedMonthEndBalance)}
                </span>
                <span className={`text-[10px] mt-0.5 block font-light truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  잔여 {forecast.daysRemainingInMonth}일 후
                </span>
              </div>

              <div className="min-w-0">
                <span className={`text-[10px] sm:text-[11px] font-light block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  남은 고정비
                </span>
                <span className={`text-sm sm:text-base font-normal tracking-tight tabular-nums mt-0.5 block truncate ${
                  isLight ? 'text-amber-800' : 'text-amber-300'
                } ${isStealth ? 'blur-sm select-none' : ''}`}>
                  {formatMoney(forecast.totalUpcomingSubscriptions)}
                </span>
                <span className={`text-[10px] mt-0.5 block font-light truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  결제 예정액
                </span>
              </div>
            </div>

            {/* Recharts Predictive Liquidity Curve */}
            <div className="pt-4 mt-2">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className={`font-normal ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  월간 누적 현금흐름 궤적
                </span>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span className={`font-light ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>실제 실적</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-0.5 bg-blue-400 border-b border-dashed border-blue-400 inline-block" />
                    <span className={`font-light ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>월말 예측선</span>
                  </span>
                </div>
              </div>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecast.dataPoints} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#f1f5f9' : 'rgba(255,255,255,0.03)'} vertical={false} />
                    <XAxis dataKey="day" tickLine={false} stroke={isLight ? '#94a3b8' : '#475569'} fontSize={10} tickFormatter={(v) => `${v}일`} />
                    <YAxis tickLine={false} stroke={isLight ? '#94a3b8' : '#475569'} fontSize={9} tickFormatter={(v) => `${Math.round(v / 10000)}만`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className={`p-2.5 rounded-xl border text-xs shadow-xl backdrop-blur-2xl ${
                              isLight ? 'bg-white/95 border-slate-200 text-slate-900' : 'bg-[#08090D]/90 border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] text-white'
                            }`}>
                              <div className="font-medium border-b border-black/5 pb-1 mb-1">
                                {data.day}일 {data.isPast ? '(실제 실적)' : data.isToday ? '(오늘)' : '(예측)'}
                              </div>
                              {data.actualBalance !== undefined ? (
                                <div className="text-emerald-400 font-normal tabular-nums">
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
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
                    <Area type="monotone" dataKey="actualBalance" stroke="#34d399" strokeWidth={1.5} fill={isLight ? 'rgba(52, 211, 153, 0.08)' : 'rgba(52, 211, 153, 0.06)'} connectNulls={false} />
                    <Line type="monotone" dataKey="projectedBalance" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
