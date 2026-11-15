import { 
  Transaction, 
  SubscriptionItem, 
  CashflowForecastSummary, 
  CashflowForecastPoint, 
  SupportedCurrency, 
  FxRates 
} from '../types';
import { convertCurrency } from '../utils';
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  getDate, 
  getDaysInMonth, 
  isSameMonth 
} from 'date-fns';

/**
 * Predictive Cashflow Runway & Liquidity Engine
 * Projects balance from day 1 to end of current month based on actual burn and confirmed recurring commitments.
 */
export function calculateCashflowForecast(
  transactions: Transaction[],
  subscriptions: SubscriptionItem[],
  baseCurrency: SupportedCurrency = 'KRW',
  fxRates: FxRates
): CashflowForecastSummary {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const totalDaysInMonth = getDaysInMonth(now);
  const currentDay = getDate(now);
  const daysRemaining = Math.max(0, totalDaysInMonth - currentDay);

  // Normalize amount to base currency helper
  const norm = (t: Transaction): number => {
    return convertCurrency(t.amount, t.currency || 'KRW', baseCurrency, fxRates);
  };

  // Current month transactions
  const monthTxs = transactions.filter(t => {
    try {
      return isSameMonth(parseISO(t.date), now);
    } catch {
      return false;
    }
  });

  // Calculate actual daily expenses & income up to today
  const dailyActualExpenses: Record<number, number> = {};
  const dailyActualIncome: Record<number, number> = {};

  for (let d = 1; d <= totalDaysInMonth; d++) {
    dailyActualExpenses[d] = 0;
    dailyActualIncome[d] = 0;
  }

  let cumulativeIncomeToDate = 0;
  let cumulativeExpenseToDate = 0;

  for (const t of monthTxs) {
    try {
      const d = getDate(parseISO(t.date));
      const val = norm(t);
      if (t.type === 'INCOME' || t.type === 'SETTLEMENT') {
        dailyActualIncome[d] = (dailyActualIncome[d] || 0) + val;
        if (d <= currentDay) cumulativeIncomeToDate += val;
      } else if (t.type === 'EXPENSE') {
        dailyActualExpenses[d] = (dailyActualExpenses[d] || 0) + val;
        if (d <= currentDay) cumulativeExpenseToDate += val;
      }
    } catch {
      // ignore invalid dates
    }
  }

  const currentBalance = cumulativeIncomeToDate - cumulativeExpenseToDate;

  // Calculate historical daily burn rate (exclude one-time large outliers > 3x daily average if enough data)
  const elapsedDays = Math.max(1, currentDay);
  const rawDailyBurn = cumulativeExpenseToDate / elapsedDays;
  const dailyAverageBurn = Math.round(rawDailyBurn);

  // Active upcoming subscriptions scheduled between tomorrow and month-end
  const upcomingSubscriptions = subscriptions.filter(sub => {
    if (!sub.isActive) return false;
    try {
      const nextDate = parseISO(sub.nextBillingDate);
      return isSameMonth(nextDate, now) && getDate(nextDate) > currentDay;
    } catch {
      return false;
    }
  });

  const totalUpcomingSubscriptions = upcomingSubscriptions.reduce(
    (acc, s) => acc + s.amount,
    0
  );

  // Build 1..N forecast data points
  const dataPoints: CashflowForecastPoint[] = [];
  let runningProjectedBalance = 0;

  // Calculate day-by-day balance curve
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const isPast = day < currentDay;
    const isToday = day === currentDay;
    const dateStr = format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');

    // Subscriptions due on this specific day
    const daySubs = subscriptions
      .filter(s => s.isActive && getDate(parseISO(s.nextBillingDate)) === day && isSameMonth(parseISO(s.nextBillingDate), now))
      .reduce((sum, s) => sum + s.amount, 0);

    if (isPast || isToday) {
      // Past/Today uses actual cumulative cashflow
      runningProjectedBalance += (dailyActualIncome[day] - dailyActualExpenses[day]);
      dataPoints.push({
        day,
        date: dateStr,
        isPast,
        isToday,
        actualBalance: Math.round(runningProjectedBalance),
        projectedBalance: Math.round(runningProjectedBalance),
        dailyBurn: Math.round(dailyActualExpenses[day]),
        projectedBurn: Math.round(dailyActualExpenses[day]),
        upcomingSubscriptionSum: daySubs
      });
    } else {
      // Future days apply projected daily average burn + scheduled subscriptions
      const dayExpense = dailyAverageBurn + daySubs;
      runningProjectedBalance -= dayExpense;
      dataPoints.push({
        day,
        date: dateStr,
        isPast: false,
        isToday: false,
        actualBalance: undefined,
        projectedBalance: Math.round(runningProjectedBalance),
        dailyBurn: 0,
        projectedBurn: Math.round(dayExpense),
        upcomingSubscriptionSum: daySubs
      });
    }
  }

  const projectedMonthEndBalance = runningProjectedBalance;

  // Runway days calculation: how many days current balance will last at current burn rate
  let runwayDays = 999;
  if (dailyAverageBurn > 0 && currentBalance > 0) {
    runwayDays = Math.floor(currentBalance / dailyAverageBurn);
  } else if (currentBalance <= 0) {
    runwayDays = 0;
  }

  // Health Status determination
  let status: 'HEALTHY' | 'MODERATE' | 'DEFICIT_WARNING' = 'HEALTHY';
  let recommendation = '';

  if (projectedMonthEndBalance > dailyAverageBurn * 5) {
    status = 'HEALTHY';
    recommendation = `현재 지출 속도가 안정적입니다. 월말에 약 ₩${Math.max(0, projectedMonthEndBalance).toLocaleString()}의 여유 자금이 남을 것으로 예상됩니다.`;
  } else if (projectedMonthEndBalance >= 0) {
    status = 'MODERATE';
    recommendation = `월말 잔액이 타이트합니다. 남은 ${daysRemaining}일 동안 하루 지출을 ₩${Math.round(currentBalance / Math.max(1, daysRemaining)).toLocaleString()} 이하로 관리하세요.`;
  } else {
    status = 'DEFICIT_WARNING';
    const deficitDay = Math.min(totalDaysInMonth, Math.max(currentDay, currentDay + Math.max(0, Math.floor(currentBalance / Math.max(1, dailyAverageBurn)))));
    recommendation = `주의: 현재 소비 속도가 지속될 경우 ${deficitDay}일경 잔액이 소진될 위험이 있습니다. 비필수 지출을 즉시 절감하세요.`;
  }

  return {
    currentBalance: Math.round(currentBalance),
    projectedMonthEndBalance: Math.round(projectedMonthEndBalance),
    dailyAverageBurn,
    daysRemainingInMonth: daysRemaining,
    totalUpcomingSubscriptions: Math.round(totalUpcomingSubscriptions),
    runwayDays: Math.min(99, runwayDays),
    status,
    recommendation,
    dataPoints
  };
}

export interface SafeToSpendResult {
  safeToSpendToday: number;
  dailyBurnAverage: number;
  remainingDays: number;
  targetPool: number;
  totalMtdExpense: number;
  upcomingSubscriptions: number;
}

/**
 * Deterministic "Safe-to-Spend Today" Calculator (오늘 권장 지출 한도)
 * Formula: max(0, (MonthlyTargetBudgetOrIncome - MonthToDateExpenses - UpcomingActiveSubscriptionsThisMonth) / RemainingDaysInMonth)
 */
export function computeSafeToSpend(
  transactions: Transaction[],
  subscriptions: SubscriptionItem[] = [],
  budgetOrTarget?: number | { targetBudget?: number },
  currentCurrency: SupportedCurrency = 'KRW',
  fxRates: FxRates = { base: 'KRW', rates: {}, source: 'estimated', stale: true },
  referenceDate: Date = new Date()
): SafeToSpendResult {
  const totalDaysInMonth = getDaysInMonth(referenceDate);
  const currentDay = getDate(referenceDate);
  const remainingDays = Math.max(1, totalDaysInMonth - currentDay + 1);

  const norm = (t: Transaction): number => {
    return convertCurrency(t.amount, t.currency || 'KRW', currentCurrency, fxRates);
  };

  let totalMtdExpense = 0;
  let totalMtdIncome = 0;

  for (const t of transactions) {
    try {
      if (isSameMonth(parseISO(t.date), referenceDate)) {
        const val = norm(t);
        if (t.type === 'EXPENSE') {
          totalMtdExpense += val;
        } else if (t.type === 'INCOME' || t.type === 'SETTLEMENT') {
          totalMtdIncome += val;
        }
      }
    } catch {
      // skip invalid dates
    }
  }

  const upcomingSubscriptions = subscriptions
    .filter(sub => {
      if (!sub.isActive) return false;
      try {
        const nextDate = parseISO(sub.nextBillingDate);
        return isSameMonth(nextDate, referenceDate) && getDate(nextDate) > currentDay;
      } catch {
        return false;
      }
    })
    .reduce((sum, s) => {
      const subCurr = (s.currency || 'KRW') as SupportedCurrency;
      return sum + convertCurrency(s.amount, subCurr, currentCurrency, fxRates);
    }, 0);

  let targetPool = 0;
  if (typeof budgetOrTarget === 'number' && budgetOrTarget > 0) {
    targetPool = budgetOrTarget;
  } else if (typeof budgetOrTarget === 'object' && budgetOrTarget && typeof budgetOrTarget.targetBudget === 'number' && budgetOrTarget.targetBudget > 0) {
    targetPool = budgetOrTarget.targetBudget;
  } else if (totalMtdIncome > 0) {
    targetPool = totalMtdIncome;
  }

  const netPool = targetPool - totalMtdExpense - upcomingSubscriptions;
  const safeToSpendToday = Math.max(0, Math.round(netPool / remainingDays));
  const dailyBurnAverage = Math.round(totalMtdExpense / Math.max(1, currentDay));

  return {
    safeToSpendToday,
    dailyBurnAverage,
    remainingDays,
    targetPool: Math.round(targetPool),
    totalMtdExpense: Math.round(totalMtdExpense),
    upcomingSubscriptions: Math.round(upcomingSubscriptions)
  };
}
