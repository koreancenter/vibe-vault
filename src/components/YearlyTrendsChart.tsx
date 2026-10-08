import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid
} from 'recharts';
import { Transaction } from '../types';
import { 
  subMonths, 
  format, 
  parseISO, 
  isSameMonth, 
  isSameYear 
} from 'date-fns';

// Permanent Quiet Luxury Dark Palette Constants
const LUXURY_YEARLY_COLORS = {
  income: '#38bdf8',  // Refined Muted Sage Emerald
  expense: '#fb7185', // Refined Rose Coral
};

interface YearlyTrendsChartProps {
  transactions: Transaction[];
  currencySymbol?: string;
  isStealth?: boolean;
  embedded?: boolean;
}

export const YearlyTrendsChart: React.FC<YearlyTrendsChartProps> = ({
  transactions,
  currencySymbol = 'KRW',
  isStealth = false,
  embedded = false,
}) => {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const currSymbol = currencySymbol === 'KRW' ? '₩' : currencySymbol === 'USD' ? '$' : `${currencySymbol} `;

  // Generate trailing 12 months data
  const { 
    chartData, 
    total12mIncome, 
    total12mExpense, 
    net12mSavings, 
    avgMonthlyIncome, 
    avgMonthlyExpense,
    savingsRate 
  } = useMemo(() => {
    const now = new Date();
    const monthsList: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      monthsList.push(subMonths(now, i));
    }

    let sumIncome = 0;
    let sumExpense = 0;
    let activeMonthsCount = 0;

    const data = monthsList.map((mDate) => {
      const monthKey = format(mDate, 'yyyy-MM');
      const monthLabel = format(mDate, 'M월');
      const yearMonthLabel = format(mDate, 'yyyy.MM');
      const fullLabel = format(mDate, 'yyyy년 M월');
      const isCurrent = isSameMonth(now, mDate) && isSameYear(now, mDate);

      // Filter transactions for this specific month
      const monthTxs = transactions.filter((t) => {
        try {
          const d = parseISO(t.date);
          return isSameMonth(d, mDate) && isSameYear(d, mDate);
        } catch {
          return false;
        }
      });

      const income = monthTxs
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);

      const expense = monthTxs
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);

      const net = income - expense;

      if (income > 0 || expense > 0) {
        activeMonthsCount += 1;
      }
      sumIncome += income;
      sumExpense += expense;

      return {
        monthKey,
        label: monthLabel,
        yearMonthLabel,
        fullLabel,
        income,
        expense,
        net,
        isCurrent,
        count: monthTxs.length,
      };
    });

    const activeDivider = activeMonthsCount > 0 ? activeMonthsCount : 1;
    const avgInc = Math.round(sumIncome / activeDivider);
    const avgExp = Math.round(sumExpense / activeDivider);
    const netSave = sumIncome - sumExpense;
    const sRate = sumIncome > 0 ? Math.round((netSave / sumIncome) * 100) : 0;

    return {
      chartData: data,
      total12mIncome: sumIncome,
      total12mExpense: sumExpense,
      net12mSavings: netSave,
      avgMonthlyIncome: avgInc,
      avgMonthlyExpense: avgExp,
      savingsRate: Math.max(0, sRate),
    };
  }, [transactions]);

  // Selected month detail
  const selectedMonthData = useMemo(() => {
    if (!selectedMonthKey) return null;
    return chartData.find((d) => d.monthKey === selectedMonthKey) || null;
  }, [chartData, selectedMonthKey]);

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#0E1524]/95 border border-white/10 rounded-2xl p-3 shadow-2xl text-xs backdrop-blur-xl pointer-events-none z-50">
          <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-white/10">
            <span className="font-bold text-white">{data.fullLabel}</span>
            {data.isCurrent && (
              <span className="px-1.5 py-0.5 bg-sky-400/20 text-sky-300 text-[10px] rounded-full font-bold">
                이번 달
              </span>
            )}
          </div>
          <div className="pt-2 space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#94A3B8] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" /> 수입
              </span>
              <span className={`font-bold text-sky-400 ${isStealth ? 'blur-xs select-none' : ''}`}>
                +{currSymbol}{data.income.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#94A3B8] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> 지출
              </span>
              <span className={`font-bold text-rose-400 ${isStealth ? 'blur-xs select-none' : ''}`}>
                -{currSymbol}{data.expense.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/10 font-bold">
              <span className="text-white">순수익</span>
              <span className={`${data.net >= 0 ? 'text-sky-400' : 'text-rose-400'} ${isStealth ? 'blur-xs select-none' : ''}`}>
                {data.net >= 0 ? '+' : ''}{currSymbol}{data.net.toLocaleString()}
              </span>
            </div>
            <div className="text-[10px] flex items-center justify-between pt-0.5 text-[#94A3B8]/70">
              <span>총 거래 건수</span>
              <span>{data.count}건</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={embedded ? "space-y-3" : "p-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] shadow-xl backdrop-blur-xl transition-all"}>
      {/* 12-Month Micro Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Total Income */}
        <div className="p-2.5 rounded-2xl border border-sky-500/20 bg-sky-950/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-sky-400">
              최근 1년 수입
            </span>
          </div>
          <span className={`text-sm font-extrabold text-sky-400 ${
            isStealth ? 'blur-xs select-none' : ''
          }`}>
            +{currSymbol}{total12mIncome.toLocaleString()}
          </span>
          <span className="text-[10px] mt-0.5 text-[#94A3B8]">
            월평균 {currSymbol}{avgMonthlyIncome.toLocaleString()}
          </span>
        </div>

        {/* Total Expense */}
        <div className="p-2.5 rounded-2xl border border-rose-500/20 bg-rose-950/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-rose-400">
              최근 1년 지출
            </span>
          </div>
          <span className={`text-sm font-extrabold text-rose-400 ${isStealth ? 'blur-xs select-none' : ''}`}>
            -{currSymbol}{total12mExpense.toLocaleString()}
          </span>
          <span className="text-[10px] mt-0.5 text-[#94A3B8]">
            월평균 {currSymbol}{avgMonthlyExpense.toLocaleString()}
          </span>
        </div>

        {/* Net Savings */}
        <div className="p-2.5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-[#94A3B8]">
              순저축
            </span>
          </div>
          <span className={`text-sm font-extrabold ${
            net12mSavings >= 0 ? 'text-indigo-400' : 'text-rose-400'
          } ${isStealth ? 'blur-xs select-none' : ''}`}>
            {net12mSavings >= 0 ? '+' : ''}{currSymbol}{net12mSavings.toLocaleString()}
          </span>
          <span className="text-[10px] mt-0.5 text-[#94A3B8]">
            저축률 {savingsRate}%
          </span>
        </div>

        {/* Trend Verdict */}
        <div className="p-2.5 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-indigo-300">
              집계 기간
            </span>
          </div>
          <span className="text-xs font-bold text-white">
            최근 12개월
          </span>
          <span className="text-[10px] mt-0.5 text-[#94A3B8]">
            {chartData[0]?.yearMonthLabel} ~ {chartData[11]?.yearMonthLabel}
          </span>
        </div>
      </div>

      {/* Bar Chart: Income vs. Expense */}
      <div className="p-3 rounded-2xl border border-white/[0.06] bg-white/[0.01]">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">
              월별 수입 vs 지출 비교
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded border bg-white/10 text-slate-300 border-white/10">
              최근 12개월
            </span>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LUXURY_YEARLY_COLORS.income }} />
              <span className="text-[11px] font-medium text-slate-300">수입</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LUXURY_YEARLY_COLORS.expense }} />
              <span className="text-[11px] font-medium text-slate-300">지출</span>
            </div>
          </div>
        </div>

        {/* Responsive Bar Chart */}
        <div className="w-full h-44 relative pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 6, left: -22, bottom: 0 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload.length) {
                  const p = e.activePayload[0].payload;
                  setSelectedMonthKey(selectedMonthKey === p.monthKey ? null : p.monthKey);
                }
              }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                vertical={false} 
                stroke="rgba(255,255,255,0.06)" 
              />
              <XAxis
                dataKey="label"
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                stroke="#94A3B8"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => {
                  if (val >= 10000000) return `${(val / 10000000).toFixed(0)}천만`;
                  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}백만`;
                  if (val >= 10000) return `${Math.round(val / 10000)}만`;
                  if (val >= 1000) return `${Math.round(val / 1000)}k`;
                  return `${val}`;
                }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)', radius: 6 }}
              />
              {/* Income Bar */}
              <Bar 
                dataKey="income" 
                name="수입" 
                fill={LUXURY_YEARLY_COLORS.income} 
                radius={[4, 4, 0, 0]} 
                maxBarSize={12} 
              />
              {/* Expense Bar */}
              <Bar 
                dataKey="expense" 
                name="지출" 
                fill={LUXURY_YEARLY_COLORS.expense} 
                radius={[4, 4, 0, 0]} 
                maxBarSize={12} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Selected Month Inspector / Hint */}
        <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-[#94A3B8]">
          {selectedMonthData ? (
            <div className="flex items-center gap-3 flex-wrap animate-in fade-in duration-150">
              <span className="font-bold text-white">
                📌 {selectedMonthData.fullLabel}:
              </span>
              <span className="text-sky-400 font-semibold">
                수입 +{currSymbol}{selectedMonthData.income.toLocaleString()}
              </span>
              <span className="text-rose-400 font-semibold">
                지출 -{currSymbol}{selectedMonthData.expense.toLocaleString()}
              </span>
              <span className={`font-bold ${
                selectedMonthData.net >= 0 ? 'text-sky-400' : 'text-rose-400'
              }`}>
                순수익 {selectedMonthData.net >= 0 ? '+' : ''}{currSymbol}{selectedMonthData.net.toLocaleString()}
              </span>
              <span className="opacity-75">({selectedMonthData.count}건)</span>
            </div>
          ) : (
            <span className="text-[10px] opacity-70">
              💡 막대를 클릭하면 해당 월의 수입, 지출, 순수익 상세 내역을 바로 확인할 수 있습니다.
            </span>
          )}

          {selectedMonthData && (
            <button
              type="button"
              onClick={() => setSelectedMonthKey(null)}
              className="text-[10px] font-bold text-slate-400 hover:text-white ml-2 transition-colors"
            >
              선택 해제
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default YearlyTrendsChart;
