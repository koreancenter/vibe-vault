import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { Transaction } from '../types';
import { 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  format, 
  parseISO, 
  isSameDay, 
  isSameMonth, 
  getDate 
} from 'date-fns';
import { BarChart3, TrendingUp, Calendar, ChevronDown, ChevronUp } from 'lucide-react';

// Permanent Quiet Luxury Dark Palette Constants
const LUXURY_CHART_COLORS = {
  regularBar: 'rgba(52, 211, 153, 0.45)', // Refined Muted Sage
  peakBar: '#fb7185',                     // Refined Rose Coral
  todayBar: '#34d399',                    // Primary Muted Sage Accent
  selectedBar: '#6ee7b7',                 // Highlighted Sage
  emptyBar: '#1E293B',
};

interface MonthlyTrendsChartProps {
  transactions: Transaction[];
  currencySymbol?: string;
  isStealth?: boolean;
  embedded?: boolean;
}

export const MonthlyTrendsChart: React.FC<MonthlyTrendsChartProps> = ({
  transactions,
  currencySymbol = 'KRW',
  isStealth = false,
  embedded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedDay, setSelectedDay] = useState<{ day: number; amount: number; count: number } | null>(null);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const todayDate = getDate(now);

  // Group current month's EXPENSE transactions by day
  const { chartData, totalMonthSpending, highestSpendingDay, activeSpendingDaysCount } = useMemo(() => {
    // Filter only current month expenses
    const currentMonthExpenses = transactions.filter(
      (t) => t.type === 'EXPENSE' && isSameMonth(parseISO(t.date), now)
    );

    let maxDaySpend = 0;
    let peakDay = 0;
    let totalSpend = 0;
    let activeDays = 0;

    const data = daysInMonth.map((dayDate) => {
      const dayNumber = getDate(dayDate);
      const dayTransactions = currentMonthExpenses.filter((t) =>
        isSameDay(parseISO(t.date), dayDate)
      );

      const dayTotal = dayTransactions.reduce((sum, t) => sum + t.amount, 0);
      totalSpend += dayTotal;

      if (dayTotal > 0) activeDays += 1;
      if (dayTotal > maxDaySpend) {
        maxDaySpend = dayTotal;
        peakDay = dayNumber;
      }

      return {
        day: dayNumber,
        dateLabel: format(dayDate, 'MMM d'),
        shortLabel: `${dayNumber}`,
        amount: dayTotal,
        count: dayTransactions.length,
        isToday: dayNumber === todayDate,
      };
    });

    return {
      chartData: data,
      totalMonthSpending: totalSpend,
      highestSpendingDay: { day: peakDay, amount: maxDaySpend },
      activeSpendingDaysCount: activeDays,
    };
  }, [transactions, now]);

  const dailyAverage = activeSpendingDaysCount > 0 
    ? Math.round(totalMonthSpending / activeSpendingDaysCount) 
    : 0;

  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#0E1524]/95 border border-white/10 rounded-2xl p-3 shadow-2xl text-xs backdrop-blur-xl pointer-events-none z-50">
          <div className="flex items-center justify-between gap-3 text-[#94A3B8] pb-1 border-b border-white/10">
            <span className="font-semibold text-white">{data.dateLabel}</span>
            {data.isToday && (
              <span className="px-2 py-0.5 bg-emerald-400/20 text-emerald-300 text-[10px] rounded-full font-bold">
                오늘
              </span>
            )}
          </div>
          <div className="pt-1.5 flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#94A3B8]">지출 금액:</span>
              <span className={`font-bold text-white ${isStealth ? 'blur-xs select-none' : ''}`}>
                ₩{data.amount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] text-[#94A3B8]/70">
              <span>건수:</span>
              <span>{data.count}건</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={embedded ? "" : "bg-white/[0.03] border border-white/[0.06] rounded-3xl p-4 shadow-xl backdrop-blur-xl transition-all"}>
      {/* Header with Title & Quick Stat Badges (hide when embedded in segmented wrapper) */}
      {!embedded && (
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center text-emerald-400 shrink-0">
              <BarChart3 size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-white truncate">
                일별 지출 추이
              </span>
              <span className="text-[11px] text-[#94A3B8]">
                {format(now, 'yyyy년 M월')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-[#94A3B8] hover:text-white active:scale-95 transition-all"
              aria-label={isExpanded ? '접기' : '펼치기'}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      )}

      {(isExpanded || embedded) && (
        <div className="pt-1.5 space-y-2.5 animate-in fade-in duration-150">
          {/* Micro Stats Bar: Clean Flat Minimalist Row */}
          <div className="flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2 py-1 px-0.5 text-xs text-slate-200">
            <div className="flex items-center justify-between xs:justify-start gap-2">
              <span className="flex items-center gap-1.5 text-[#94A3B8]">
                <TrendingUp size={13} className="text-emerald-400" /> 일 평균
              </span>
              <span className={`font-bold text-white ${isStealth ? 'blur-xs select-none' : ''}`}>
                ₩{dailyAverage.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between xs:justify-end gap-2">
              <span className="flex items-center gap-1.5 shrink-0 text-[#94A3B8]">
                <Calendar size={13} className="text-rose-400" /> 최대 지출
              </span>
              <span className={`font-bold text-rose-400 shrink-0 whitespace-nowrap ${isStealth ? 'blur-xs select-none' : ''}`}>
                {highestSpendingDay.amount > 0 ? (
                  `${highestSpendingDay.day}일 · ₩${highestSpendingDay.amount.toLocaleString()}`
                ) : (
                  '없음'
                )}
              </span>
            </div>
          </div>

          {/* Recharts Bar Chart View */}
          <div className="w-full h-28 sm:h-32 relative pt-0.5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 8, left: -20, bottom: 4 }}
                onClick={(e: any) => {
                  if (e && e.activePayload && e.activePayload.length) {
                    const p = e.activePayload[0].payload;
                    setSelectedDay({ day: p.day, amount: p.amount, count: p.count });
                  }
                }}
              >
                <XAxis
                  dataKey="shortLabel"
                  stroke="#94A3B8"
                  fontSize={9}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  interval={4} // show tick roughly every 5 days for neat mobile spacing
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => {
                    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                    if (val >= 1000) return `${Math.round(val / 1000)}k`;
                    return `${val}`;
                  }}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)', radius: 4 }}
                />
                <Bar 
                  dataKey="amount" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={14}
                >
                  {chartData.map((entry, index) => {
                    const isPeak = entry.amount > 0 && entry.amount === highestSpendingDay.amount;
                    const isSelected = selectedDay?.day === entry.day;

                    let fill = LUXURY_CHART_COLORS.emptyBar;
                    if (entry.amount > 0) {
                      fill = isPeak ? LUXURY_CHART_COLORS.peakBar : entry.isToday ? LUXURY_CHART_COLORS.todayBar : LUXURY_CHART_COLORS.regularBar;
                    }
                    if (isSelected) {
                      fill = LUXURY_CHART_COLORS.selectedBar;
                    }

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={fill}
                        className="transition-colors cursor-pointer hover:opacity-80"
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Legend & Inspector Footer */}
          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t text-[#94A3B8] border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LUXURY_CHART_COLORS.regularBar }} /> 
                <span className="text-slate-300">일반</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LUXURY_CHART_COLORS.peakBar }} /> 
                <span className="text-slate-300">최고 지출</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: LUXURY_CHART_COLORS.todayBar }} /> 
                <span className="text-slate-300">오늘</span>
              </span>
            </div>

            {selectedDay ? (
              <span className="font-medium truncate text-white">
                {selectedDay.day}일: {currencySymbol}{selectedDay.amount.toLocaleString()} ({selectedDay.count}건)
              </span>
            ) : (
              <span className="text-[10px] text-[#94A3B8]/70">막대를 터치하면 일별 상세 확인</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
