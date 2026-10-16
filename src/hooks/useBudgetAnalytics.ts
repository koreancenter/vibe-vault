import { useMemo, useCallback } from 'react';
import { 
  Transaction, 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { convertCurrency } from '../utils';
import { 
  parseISO, 
  isSameMonth, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDate 
} from 'date-fns';

export interface CategoryExpenseBreakdown {
  category: string;
  total: number;
  count: number;
  percentage: number;
}

export interface DailySpendingPoint {
  day: number;
  dateKey: string;
  amount: number;
  count: number;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  net: number;
}

export interface MonthOverMonthMetrics {
  currentMonthExpense: number;
  previousMonthExpense: number;
  diffAmount: number;
  percentageChange: number;
  status: 'better' | 'worse' | 'neutral';
}

export interface UseBudgetAnalyticsOptions {
  transactions: Transaction[];
  currentCurrency: SupportedCurrency;
  fxRates: FxRates;
}

export interface UseBudgetAnalyticsReturn {
  // Converted current-month metrics
  currentMonthTransactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  isSurplus: boolean;
  savingsRate: number;

  // Multi-iteration aggregated chart data models
  categoryBreakdown: CategoryExpenseBreakdown[];
  dailySpendingTrends: DailySpendingPoint[];
  highestSpendingDay: { day: number; amount: number } | null;
  activeSpendingDaysCount: number;
  yearlyMonthlyTrends: MonthlyTrendPoint[];
  monthOverMonth: MonthOverMonthMetrics;

  // Currency normalization helper
  getAmountInSelectedCurrency: (t: Transaction) => number;
}

/**
 * Custom Hook: useBudgetAnalytics
 * Architectural Domain: Financial Aggregation & Chart Data Modeling
 * 
 * Centralizes all category-wise aggregations, currency conversions, monthly budget
 * runway totals, and historical chart data modeling with strict memoization.
 */
export function useBudgetAnalytics({
  transactions,
  currentCurrency,
  fxRates,
}: UseBudgetAnalyticsOptions): UseBudgetAnalyticsReturn {
  /**
   * Normalize an individual transaction's amount into the currently selected dashboard currency
   */
  const getAmountInSelectedCurrency = useCallback(
    (t: Transaction): number => {
      const fromCurr = t.currency || 'KRW';
      return convertCurrency(t.amount, fromCurr, currentCurrency, fxRates);
    },
    [currentCurrency, fxRates]
  );

  /**
   * Transactions strictly within the current calendar month
   */
  const currentMonthTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      try {
        return isSameMonth(parseISO(t.date), now);
      } catch {
        return false;
      }
    });
  }, [transactions]);

  /**
   * High-level financial totals for the current month
   */
  const { totalIncome, totalExpense, netBalance, isSurplus, savingsRate } = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of currentMonthTransactions) {
      if (t.isInternalTransfer) continue;
      const converted = getAmountInSelectedCurrency(t);
      if (t.type === 'INCOME' || t.type === 'SETTLEMENT') {
        income += converted;
      } else if (t.type === 'EXPENSE') {
        expense += converted;
      }
    }

    const net = income - expense;
    const rate = income > 0 ? Math.max(0, (net / income) * 100) : 0;

    return {
      totalIncome: income,
      totalExpense: expense,
      netBalance: net,
      isSurplus: net >= 0,
      savingsRate: Math.round(rate * 10) / 10
    };
  }, [currentMonthTransactions, getAmountInSelectedCurrency]);

  /**
   * Category breakdown of current month expenses (for CategoryDonutChart)
   */
  const categoryBreakdown = useMemo((): CategoryExpenseBreakdown[] => {
    const expenses = currentMonthTransactions.filter(t => t.type === 'EXPENSE' && !t.isInternalTransfer);
    const categoryTotals: Record<string, { total: number; count: number }> = {};
    let sum = 0;

    for (const t of expenses) {
      const cat = t.category || 'Uncategorized';
      const amt = getAmountInSelectedCurrency(t);
      if (!categoryTotals[cat]) {
        categoryTotals[cat] = { total: 0, count: 0 };
      }
      categoryTotals[cat].total += amt;
      categoryTotals[cat].count += 1;
      sum += amt;
    }

    return Object.entries(categoryTotals)
      .map(([category, info]) => ({
        category,
        total: info.total,
        count: info.count,
        percentage: sum > 0 ? Math.round((info.total / sum) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.total - a.total);
  }, [currentMonthTransactions, getAmountInSelectedCurrency]);

  /**
   * Group current month expenses by day (for MonthlyTrendsChart)
   */
  const { dailySpendingTrends, highestSpendingDay, activeSpendingDaysCount } = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const daysInInterval = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const dayMap: Record<number, { amount: number; count: number }> = {};
    for (let d = 1; d <= daysInInterval.length; d++) {
      dayMap[d] = { amount: 0, count: 0 };
    }

    for (const t of currentMonthTransactions) {
      if (t.type !== 'EXPENSE' || t.isInternalTransfer) continue;
      try {
        const d = getDate(parseISO(t.date));
        if (dayMap[d]) {
          dayMap[d].amount += getAmountInSelectedCurrency(t);
          dayMap[d].count += 1;
        }
      } catch {
        // Skip malformed ISO strings
      }
    }

    let highest: { day: number; amount: number } | null = null;
    let activeDays = 0;

    const points: DailySpendingPoint[] = Object.entries(dayMap).map(([dayStr, data]) => {
      const day = Number(dayStr);
      if (data.amount > 0) activeDays++;
      if (!highest || data.amount > highest.amount) {
        highest = { day, amount: data.amount };
      }
      return {
        day,
        dateKey: `${now.getFullYear()}-${now.getMonth() + 1}-${day}`,
        amount: data.amount,
        count: data.count
      };
    });

    return {
      dailySpendingTrends: points,
      highestSpendingDay: highest && highest.amount > 0 ? highest : null,
      activeSpendingDaysCount: activeDays
    };
  }, [currentMonthTransactions, getAmountInSelectedCurrency]);

  /**
   * Group expenses & income across past 6 months (for YearlyTrendsChart)
   */
  const yearlyMonthlyTrends = useMemo((): MonthlyTrendPoint[] => {
    const now = new Date();
    const months: Date[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(subMonths(now, i));
    }

    return months.map(m => {
      const mYear = m.getFullYear();
      const mMonth = m.getMonth();
      const label = `${mMonth + 1}월`;
      const key = `${mYear}-${String(mMonth + 1).padStart(2, '0')}`;

      let income = 0;
      let expense = 0;

      for (const t of transactions) {
        if (t.isInternalTransfer) continue;
        try {
          const tDate = parseISO(t.date);
          if (tDate.getFullYear() === mYear && tDate.getMonth() === mMonth) {
            const converted = getAmountInSelectedCurrency(t);
            if (t.type === 'INCOME' || t.type === 'SETTLEMENT') {
              income += converted;
            } else if (t.type === 'EXPENSE') {
              expense += converted;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      return {
        monthKey: key,
        monthLabel: label,
        income,
        expense,
        net: income - expense
      };
    });
  }, [transactions, getAmountInSelectedCurrency]);

  /**
   * Month-over-month comparison metrics
   */
  const monthOverMonth = useMemo((): MonthOverMonthMetrics => {
    const now = new Date();
    const prevMonthDate = subMonths(now, 1);

    let prevExpense = 0;
    for (const t of transactions) {
      if (t.type !== 'EXPENSE' || t.isInternalTransfer) continue;
      try {
        if (isSameMonth(parseISO(t.date), prevMonthDate)) {
          prevExpense += getAmountInSelectedCurrency(t);
        }
      } catch {
        // ignore
      }
    }

    const diff = totalExpense - prevExpense;
    let pct = 0;
    if (prevExpense > 0) {
      pct = Math.round((diff / prevExpense) * 100);
    }

    let status: 'better' | 'worse' | 'neutral' = 'neutral';
    if (diff < 0) {
      status = 'better'; // Spent less than previous month
    } else if (diff > 0) {
      status = 'worse';  // Spent more than previous month
    }

    return {
      currentMonthExpense: totalExpense,
      previousMonthExpense: prevExpense,
      diffAmount: Math.abs(diff),
      percentageChange: Math.abs(pct),
      status
    };
  }, [transactions, totalExpense, getAmountInSelectedCurrency]);

  return {
    currentMonthTransactions,
    totalIncome,
    totalExpense,
    netBalance,
    isSurplus,
    savingsRate,
    categoryBreakdown,
    dailySpendingTrends,
    highestSpendingDay,
    activeSpendingDaysCount,
    yearlyMonthlyTrends,
    monthOverMonth,
    getAmountInSelectedCurrency
  };
}
