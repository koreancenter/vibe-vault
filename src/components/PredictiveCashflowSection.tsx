import React, { useMemo } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates,
  SubscriptionItem
} from '../types';
import { 
  calculateCashflowForecast, 
  detectSubscriptions 
} from '../autonomousFinance';
import { getCurrencySymbol } from '../utils';
import { 
  TrendingDown, 
  TrendingUp, 
  Calendar, 
  ArrowUpRight,
  Sparkles,
  Zap
} from 'lucide-react';
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

interface PredictiveCashflowSectionProps {
  transactions: Transaction[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
  isStealth?: boolean;
  theme?: 'dark' | 'light';
}

export const PredictiveCashflowSection: React.FC<PredictiveCashflowSectionProps> = ({
  transactions,
  currentCurrency,
  fxRates,
  isStealth = false,
  theme = 'dark'
}) => {
  const isLight = theme === 'light';
  const currSymbol = getCurrencySymbol(currentCurrency);

  const formatMoney = (val: number) => {
    const isNeg = val < 0;
    const absVal = Math.abs(val).toLocaleString();
    return isNeg ? `-${currSymbol}${absVal}` : `${currSymbol}${absVal}`;
  };

  // Subscriptions & Forecast calculation
  const subscriptions = useMemo(() => {
    return detectSubscriptions(transactions, currentCurrency, fxRates);
  }, [transactions, currentCurrency, fxRates]);

  const forecast = useMemo(() => {
    return calculateCashflowForecast(transactions, subscriptions, currentCurrency, fxRates);
  }, [transactions, subscriptions, currentCurrency, fxRates]);

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Top Main Forecast Section: Flat Minimalist Surface without nested card boxes or dividing lines */}
      <div className={`p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl transition-all ${
        isLight 
          ? 'bg-slate-50/70 text-slate-900' 
          : 'bg-white/[0.02] text-white'
      }`}>
        <div className="pb-3">
          <h3 className={`text-xs sm:text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
            예측 현금흐름
          </h3>
        </div>

        {/* 3-Metric KPI Row: Clean Flat Surface (No divide-x lines) */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="min-w-0">
            <span className={`text-[10px] sm:text-[11px] font-medium block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              현재 순자금
            </span>
            <span className={`text-sm sm:text-base font-black tracking-tight mt-0.5 block truncate ${
              forecast.currentBalance >= 0 
                ? isLight ? 'text-emerald-700' : 'text-[#00F5A0]' 
                : 'text-rose-500'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(forecast.currentBalance)}
            </span>
            <span className={`text-[10px] mt-0.5 block font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              이번 달 수입 - 지출
            </span>
          </div>

          <div className="min-w-0">
            <span className={`text-[10px] sm:text-[11px] font-medium block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              월말 예상
            </span>
            <span className={`text-sm sm:text-base font-black tracking-tight mt-0.5 block truncate ${
              forecast.projectedMonthEndBalance >= 0 
                ? isLight ? 'text-slate-900' : 'text-white' 
                : 'text-rose-500'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(forecast.projectedMonthEndBalance)}
            </span>
            <span className={`text-[10px] mt-0.5 block font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              잔여 {forecast.daysRemainingInMonth}일 후
            </span>
          </div>

          <div className="min-w-0">
            <span className={`text-[10px] sm:text-[11px] font-medium block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              남은 고정비
            </span>
            <span className={`text-sm sm:text-base font-black tracking-tight mt-0.5 block truncate ${
              isLight ? 'text-amber-800' : 'text-amber-300'
            } ${isStealth ? 'blur-sm select-none' : ''}`}>
              {formatMoney(forecast.totalUpcomingSubscriptions)}
            </span>
            <span className={`text-[10px] mt-0.5 block font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              결제 예정액
            </span>
          </div>
        </div>

        {/* Recharts Predictive Liquidity Curve (No thick border-t line) */}
        <div className="pt-3 mt-1">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              월간 누적 현금흐름 궤적
            </span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>실제 실적</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-0.5 bg-blue-400 border-b border-dashed border-blue-400 inline-block" />
                <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>월말 예측선</span>
              </span>
            </div>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecast.dataPoints} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke={isLight ? '#f1f5f9' : 'rgba(255,255,255,0.03)'} 
                  vertical={false} 
                />
                <XAxis 
                  dataKey="day" 
                  tickLine={false}
                  stroke={isLight ? '#94a3b8' : '#475569'}
                  fontSize={10}
                  tickFormatter={(v) => `${v}일`}
                />
                <YAxis 
                  tickLine={false}
                  stroke={isLight ? '#94a3b8' : '#475569'}
                  fontSize={9}
                  tickFormatter={(v) => `${Math.round(v / 10000)}만`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className={`p-2.5 rounded-xl border text-xs shadow-xl backdrop-blur-md ${
                          isLight ? 'bg-white/95 border-slate-200 text-slate-900' : 'bg-slate-900/95 border-white/10 text-white'
                        }`}>
                          <div className="font-bold border-b border-black/5 pb-1 mb-1">
                            {data.day}일 {data.isPast ? '(실제 실적)' : data.isToday ? '(오늘)' : '(예측)'}
                          </div>
                          {data.actualBalance !== undefined ? (
                            <div className="text-emerald-500 font-semibold">
                              실제 누적: {formatMoney(data.actualBalance)}
                            </div>
                          ) : (
                            <div className="text-blue-400 font-semibold">
                              예상 누적: {formatMoney(data.projectedBalance)}
                            </div>
                          )}
                          {data.upcomingSubscriptionSum > 0 && (
                            <div className="text-amber-400 text-[10px] mt-0.5">
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
                <Area 
                  type="monotone" 
                  dataKey="actualBalance" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fill={isLight ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 245, 160, 0.08)'} 
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="projectedBalance" 
                  stroke="#38bdf8" 
                  strokeWidth={1.5} 
                  strokeDasharray="4 4" 
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Autonomous CFO Recommendation: Clean Flat Banner without box border */}
        <div className={`mt-3 p-3 rounded-2xl flex items-start gap-2.5 ${
          forecast.status === 'HEALTHY'
            ? isLight ? 'bg-emerald-500/10 text-emerald-900' : 'bg-emerald-950/30 text-emerald-300'
            : forecast.status === 'MODERATE'
              ? isLight ? 'bg-amber-500/10 text-amber-900' : 'bg-amber-950/30 text-amber-300'
              : isLight ? 'bg-rose-500/10 text-rose-900' : 'bg-rose-950/30 text-rose-300'
        }`}>
          <div className="p-1 rounded-lg bg-black/5 dark:bg-white/10 shrink-0 mt-0.5">
            <Sparkles size={14} />
          </div>
          <div className="text-xs">
            <strong className="block font-bold">자율 CFO 재정 어드바이스</strong>
            <p className="mt-0.5 leading-relaxed opacity-90">
              {forecast.recommendation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
