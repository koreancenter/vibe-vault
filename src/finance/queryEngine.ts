import { 
  Transaction, 
  AssetAccount, 
  SupportedCurrency, 
  FxRates, 
  FinancialQueryParameters, 
  CalculationBreakdownPill, 
  FinancialQueryResult 
} from '../types';
import { parseQueryIntentLocally } from '../financialParser';
import { getAllTransactions, getAllAssetAccounts } from '../db';
import { convertCurrency, DEFAULT_FX_RATES, AIEngineConfig, getCurrencySymbol, getCategoryKo } from '../utils';
import { parseISO, getDay } from 'date-fns';

/**
 * ============================================================================
 * CONVERSATIONAL FINANCIAL QUERY ENGINE ("Ask AI Vault")
 * Code-Interpreter-Style: Deterministic Local Math + Zero Math Hallucination
 * ============================================================================
 */

/**
 * Step 1: Intent & Filter Extraction
 * Extracts dateRange, metric, targetCurrency, and filter criteria via /api/query-intent (Gemini)
 * with robust local heuristic fallback for offline / low-latency environments.
 */
export async function extractFinancialQueryIntent(
  query: string,
  engineConfig?: AIEngineConfig
): Promise<{ parameters: FinancialQueryParameters; source: 'gemini' | 'local' | 'fallback' }> {
  // If local engine requested or offline, return local immediately
  if (engineConfig?.engineType === 'local' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { parameters: parseQueryIntentLocally(query), source: 'local' };
  }

  // Try backend endpoint /api/query-intent
  try {
    const res = await fetch('/api/query-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, engineConfig })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.parameters) {
        return { parameters: data.parameters, source: data.source || 'gemini' };
      }
    }
  } catch {
    // Backend unreachable or network error, fallback to local parser
  }

  return { parameters: parseQueryIntentLocally(query), source: 'fallback' };
}

/**
 * Step 2: Deterministic Local Compute (Zero Math Hallucination)
 * Computes exact mathematical result in pure TypeScript directly from local ledger & vault accounts.
 */
export function computeDeterministicFinancialQuery(
  rawParams: FinancialQueryParameters,
  transactions: Transaction[],
  accounts: AssetAccount[],
  fxRates: FxRates,
  baseCurrency: SupportedCurrency = 'KRW'
): FinancialQueryResult {
  const now = new Date();
  const targetYear = rawParams.year || now.getFullYear();
  const targetMonth = rawParams.month || (now.getMonth() + 1);
  const targetCurrency = rawParams.targetCurrency || 'USD';

  // Filter transactions for the requested year and month
  const monthTransactions = transactions.filter(t => {
    try {
      const d = parseISO(t.date);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth;
    } catch {
      return false;
    }
  });

  const norm = (t: Transaction): number => {
    return convertCurrency(t.amount, t.currency || 'KRW', baseCurrency, fxRates);
  };

  const currSymbol = getCurrencySymbol(baseCurrency);
  let directAnswer = '';
  let summarySentence = '';
  const breakdownPills: CalculationBreakdownPill[] = [];
  let calculatedValue = 0;
  let details: Record<string, any> = {};

  switch (rawParams.metric) {
    case 'fx_gain_loss': {
      // 1. Foreign Exchange Profit & Loss Computation
      const targetCurrencyRate = fxRates.rates[targetCurrency];
      if (!targetCurrencyRate) {
        throw new Error(`환율 정보를 사용할 수 없어 ${targetCurrency} 환차손익을 계산할 수 없습니다.`);
      }
      const targetRate = targetCurrency === 'KRW' ? 1 : 1 / targetCurrencyRate;

      // Identify foreign asset accounts strictly matching targetCurrency
      const foreignAccounts = accounts.filter(
        a => a.currency === targetCurrency || (targetCurrency === 'USD' && /달러|usd|해외|외화/i.test(a.accountName + a.institution))
      );

      let foreignBalance = 0;
      for (const a of foreignAccounts) {
        if (a.currency === targetCurrency) {
          foreignBalance += a.currentBalance;
        } else if (a.investedAssets && /달러|usd|해외/i.test(a.accountName + a.institution)) {
          foreignBalance += (a.investedAssets / targetRate);
        }
      }

      // Realized FX transactions in this month
      const foreignTxs = monthTransactions.filter(
        t => t.currency === targetCurrency || (targetCurrency === 'USD' && /달러|usd|환전|환차|외화/i.test(t.description))
      );

      // Return zero result if no foreign assets and no foreign transactions exist for this period
      if (foreignBalance === 0 && foreignTxs.length === 0) {
        calculatedValue = 0;
        directAnswer = `${targetMonth}월에는 기록된 ${targetCurrency} 외화 자산 또는 FX 거래 내역이 없습니다.`;
        summarySentence = `해당 기간에 보유한 ${targetCurrency} 계좌 잔액이나 외환 거래가 기록되지 않아 환차손익이 발생하지 않았습니다.`;

        breakdownPills.push({
          label: `총 ${targetCurrency} 환차손익`,
          value: `${currSymbol}0`,
          highlight: true,
          color: 'slate'
        });
        breakdownPills.push({
          label: '외화 평가익',
          value: `${currSymbol}0`,
          color: 'slate'
        });
        breakdownPills.push({
          label: '실현 환차익',
          value: `${currSymbol}0`,
          color: 'slate'
        });
        breakdownPills.push({
          label: '적용 기준환율',
          value: `${targetRate.toFixed(1)} KRW/${targetCurrency}`,
          color: 'slate'
        });

        details = { foreignBalance: 0, unrealizedValuationGain: 0, realizedFxGain: 0, targetRate };
        break;
      }

      // Calculate unrealized valuation gain strictly from holdings with recorded profit rates if available
      let unrealizedValuationGain = 0;
      for (const a of foreignAccounts) {
        if (Array.isArray(a.holdings)) {
          for (const h of a.holdings) {
            if (typeof h.profitRate === 'number' && typeof h.valuation === 'number') {
              const profitForeign = h.valuation * (h.profitRate / 100);
              unrealizedValuationGain += Math.round(profitForeign * targetRate);
            }
          }
        }
      }

      // Calculate realized FX gain strictly from actual transactions in that month
      let realizedFxGain = 0;
      if (foreignTxs.length > 0) {
        realizedFxGain = foreignTxs.reduce((acc, t) => {
          if (t.convertedAmount && t.currency === targetCurrency) {
            return acc + Math.round((t.amount * targetRate) - t.convertedAmount);
          }
          const matchProfit = (t.note || t.description).match(/(?:환차익|수익|손익|이익|gain)[\s:+]*([+-]?\d+(?:,\d+)*)/i);
          if (matchProfit) {
            const rawVal = parseInt(matchProfit[1].replace(/,/g, ''), 10);
            if (!isNaN(rawVal)) return acc + rawVal;
          }
          return acc;
        }, 0);
      }

      // Calculate organic savings and FX fluctuation comparing fxRateAtEntry against live targetRate
      let organicSavings = 0;
      let fxFluctuation = 0;
      let hasEntryRates = false;

      const normalizeRateToKrw = (r: number): number => {
        if (r <= 0) return targetRate;
        return (r < 1 && targetRate > 10) ? (1 / r) : r;
      };

      for (const a of foreignAccounts) {
        if (a.currency === targetCurrency && a.currentBalance > 0) {
          const entryRate = a.fxRateAtEntry ? normalizeRateToKrw(a.fxRateAtEntry) : targetRate;
          if (a.fxRateAtEntry) hasEntryRates = true;
          const baseCost = a.currentBalance * entryRate;
          const liveValue = a.currentBalance * targetRate;
          organicSavings += baseCost;
          fxFluctuation += (liveValue - baseCost);
        }
      }

      for (const t of foreignTxs) {
        if (t.currency === targetCurrency && t.amount > 0) {
          const entryRate = t.fxRateAtEntry ? normalizeRateToKrw(t.fxRateAtEntry) : targetRate;
          if (t.fxRateAtEntry) hasEntryRates = true;
          const baseCost = t.amount * entryRate;
          const liveValue = t.amount * targetRate;
          organicSavings += baseCost;
          fxFluctuation += (liveValue - baseCost);
        }
      }

      const totalGain = unrealizedValuationGain + realizedFxGain;
      calculatedValue = totalGain;

      const formattedTotal = totalGain >= 0 
        ? `+${currSymbol}${totalGain.toLocaleString()}` 
        : `-${currSymbol}${Math.abs(totalGain).toLocaleString()}`;

      directAnswer = `${targetMonth}월 ${targetCurrency} 환차손익은 총 ${formattedTotal} 입니다.`;
      summarySentence = `보유 ${targetCurrency} 자산($${Math.round(foreignBalance).toLocaleString()})의 평가익(+${currSymbol}${unrealizedValuationGain.toLocaleString()})과 ${targetMonth}월 중 외환 거래 실현 손익(+${currSymbol}${realizedFxGain.toLocaleString()})이 발생했습니다.${hasEntryRates ? ` (저축 기여분: ${currSymbol}${Math.round(organicSavings).toLocaleString()} · 환율 변동분: ${fxFluctuation >= 0 ? '+' : ''}${currSymbol}${Math.round(fxFluctuation).toLocaleString()})` : ''}`;

      breakdownPills.push({
        label: `총 ${targetCurrency} 환차손익`,
        value: formattedTotal,
        highlight: true,
        color: totalGain >= 0 ? 'sky' : 'amber'
      });
      breakdownPills.push({
        label: '외화 평가익',
        value: `${unrealizedValuationGain >= 0 ? '+' : ''}${currSymbol}${unrealizedValuationGain.toLocaleString()}`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '실현 환차익',
        value: `${realizedFxGain >= 0 ? '+' : ''}${currSymbol}${realizedFxGain.toLocaleString()}`,
        color: 'purple'
      });
      if (hasEntryRates) {
        breakdownPills.push({
          label: '저축 기여분 (Organic)',
          value: `${currSymbol}${Math.round(organicSavings).toLocaleString()}`,
          color: 'slate'
        });
        breakdownPills.push({
          label: '환율 변동분 (FX)',
          value: `${fxFluctuation >= 0 ? '+' : ''}${currSymbol}${Math.round(fxFluctuation).toLocaleString()}`,
          color: fxFluctuation >= 0 ? 'sky' : 'amber'
        });
      }
      breakdownPills.push({
        label: '적용 기준환율',
        value: `${targetRate.toFixed(1)} KRW/${targetCurrency}`,
        color: 'slate'
      });

      details = { foreignBalance, unrealizedValuationGain, realizedFxGain, targetRate, organicSavings, fxFluctuation };
      break;
    }

    case 'category_sum': {
      const category = rawParams.category || 'Food';
      const categoryKo = getCategoryKo(category);

      const categoryTxs = monthTransactions.filter(
        t => t.type === 'EXPENSE' && (t.category === category || (category === 'Food' && /식비|식당|카페|커피|마트|배민/i.test(t.description)))
      );

      const totalSum = categoryTxs.reduce((acc, t) => acc + norm(t), 0);
      const totalMonthExpense = monthTransactions
        .filter(t => t.type === 'EXPENSE')
        .reduce((acc, t) => acc + norm(t), 0);

      const count = categoryTxs.length;
      const daysElapsed = Math.min(now.getDate(), 30);
      const dailyAvg = Math.round(totalSum / Math.max(1, daysElapsed));
      const pctOfTotal = totalMonthExpense > 0 ? Math.round((totalSum / totalMonthExpense) * 100) : 0;

      let maxTx: Transaction | undefined;
      for (const t of categoryTxs) {
        if (!maxTx || t.amount > maxTx.amount) {
          maxTx = t;
        }
      }

      calculatedValue = totalSum;
      directAnswer = `${targetMonth}월 ${categoryKo} 총 지출은 ${currSymbol}${Math.round(totalSum).toLocaleString()} 입니다.`;
      summarySentence = `총 ${count}건의 결제로 월 전체 소비의 ${pctOfTotal}%를 차지했으며, 일평균 지출액은 ${currSymbol}${dailyAvg.toLocaleString()}입니다.`;

      breakdownPills.push({
        label: `${categoryKo} 총 지출`,
        value: `${currSymbol}${Math.round(totalSum).toLocaleString()}`,
        highlight: true,
        color: 'sky'
      });
      breakdownPills.push({
        label: '결제 건수',
        value: `${count}건`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '지출 비중',
        value: `${pctOfTotal}%`,
        color: 'purple'
      });
      breakdownPills.push({
        label: '일평균 소비',
        value: `${currSymbol}${dailyAvg.toLocaleString()}/일`,
        color: 'slate'
      });
      breakdownPills.push({
        label: '최대 단일 결제',
        value: maxTx ? `${maxTx.description} (${currSymbol}${Math.round(maxTx.amount).toLocaleString()})` : '내역 없음',
        color: 'amber'
      });

      details = { totalSum, count, dailyAvg, pctOfTotal, maxTx };
      break;
    }

    case 'weekend_expense': {
      const expenses = monthTransactions.filter(t => t.type === 'EXPENSE');
      const weekendTxs = expenses.filter(t => {
        try {
          const d = parseISO(t.date);
          const day = getDay(d);
          return day === 0 || day === 6; // Sunday or Saturday
        } catch {
          return false;
        }
      });

      const weekendSum = weekendTxs.reduce((acc, t) => acc + norm(t), 0);
      const totalExpenseSum = expenses.reduce((acc, t) => acc + norm(t), 0);
      const weekendRatio = totalExpenseSum > 0 ? Math.round((weekendSum / totalExpenseSum) * 100) : 0;

      let weekendDaysCount = 0;
      for (let day = 1; day <= Math.min(now.getDate(), 30); day++) {
        const d = new Date(targetYear, targetMonth - 1, day);
        if (d.getDay() === 0 || d.getDay() === 6) {
          weekendDaysCount++;
        }
      }
      weekendDaysCount = Math.max(1, weekendDaysCount);
      const weekendDailyAvg = Math.round(weekendSum / weekendDaysCount);

      const catCount: Record<string, number> = {};
      for (const t of weekendTxs) {
        catCount[t.category] = (catCount[t.category] || 0) + norm(t);
      }
      let topCategory = 'Food';
      let topVal = 0;
      for (const [c, val] of Object.entries(catCount)) {
        if (val > topVal) {
          topVal = val;
          topCategory = c;
        }
      }

      calculatedValue = weekendSum;
      directAnswer = `${targetMonth}월 주말(토·일) 총 지출은 ${currSymbol}${Math.round(weekendSum).toLocaleString()} 입니다.`;
      summarySentence = `월 전체 소비의 ${weekendRatio}%가 주말에 발생했으며, 주말 1일 평균 지출은 ${currSymbol}${weekendDailyAvg.toLocaleString()} (${getCategoryKo(topCategory)} 비중 최대)입니다.`;

      breakdownPills.push({
        label: '주말 총 지출',
        value: `${currSymbol}${Math.round(weekendSum).toLocaleString()}`,
        highlight: true,
        color: 'sky'
      });
      breakdownPills.push({
        label: '주말 소비 비중',
        value: `${weekendRatio}%`,
        color: 'amber'
      });
      breakdownPills.push({
        label: '주말 일평균',
        value: `${currSymbol}${weekendDailyAvg.toLocaleString()}/일`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '주요 소비처',
        value: getCategoryKo(topCategory),
        color: 'purple'
      });

      details = { weekendSum, weekendRatio, weekendDailyAvg, topCategory };
      break;
    }

    case 'total_expense': {
      const expenses = monthTransactions.filter(t => t.type === 'EXPENSE');
      const totalExp = expenses.reduce((acc, t) => acc + norm(t), 0);
      const count = expenses.length;
      const dailyAvg = Math.round(totalExp / Math.max(1, Math.min(now.getDate(), 30)));

      calculatedValue = totalExp;
      directAnswer = `${targetMonth}월 총 지출은 ${currSymbol}${Math.round(totalExp).toLocaleString()} 입니다.`;
      summarySentence = `총 ${count}건의 결제가 기록되었으며, 하루 평균 소비액은 ${currSymbol}${dailyAvg.toLocaleString()}입니다.`;

      breakdownPills.push({
        label: '총 지출액',
        value: `${currSymbol}${Math.round(totalExp).toLocaleString()}`,
        highlight: true,
        color: 'sky'
      });
      breakdownPills.push({
        label: '총 결제 건수',
        value: `${count}건`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '일평균 지출',
        value: `${currSymbol}${dailyAvg.toLocaleString()}/일`,
        color: 'purple'
      });
      break;
    }

    case 'total_income': {
      const incomes = monthTransactions.filter(t => t.type === 'INCOME' || t.type === 'SETTLEMENT');
      const totalInc = incomes.reduce((acc, t) => acc + norm(t), 0);
      const count = incomes.length;

      calculatedValue = totalInc;
      directAnswer = `${targetMonth}월 총 수입은 ${currSymbol}${Math.round(totalInc).toLocaleString()} 입니다.`;
      summarySentence = `급여 및 정산 입금을 포함하여 총 ${count}건의 수입이 기록되었습니다.`;

      breakdownPills.push({
        label: '총 수입액',
        value: `${currSymbol}${Math.round(totalInc).toLocaleString()}`,
        highlight: true,
        color: 'sky'
      });
      breakdownPills.push({
        label: '입금 건수',
        value: `${count}건`,
        color: 'blue'
      });
      break;
    }

    case 'net_savings': {
      const inc = monthTransactions.filter(t => t.type === 'INCOME' || t.type === 'SETTLEMENT').reduce((acc, t) => acc + norm(t), 0);
      const exp = monthTransactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + norm(t), 0);
      const net = inc - exp;
      const rate = inc > 0 ? Math.max(0, Math.round((net / inc) * 100)) : 0;

      calculatedValue = net;
      const prefix = net >= 0 ? '+' : '';
      directAnswer = `${targetMonth}월 순 저축액(흑자)은 ${prefix}${currSymbol}${Math.round(net).toLocaleString()} 입니다.`;
      summarySentence = `총 수입(${currSymbol}${Math.round(inc).toLocaleString()}) 대비 저축률은 ${rate}%를 기록했습니다.`;

      breakdownPills.push({
        label: '순 저축액',
        value: `${prefix}${currSymbol}${Math.round(net).toLocaleString()}`,
        highlight: true,
        color: net >= 0 ? 'sky' : 'amber'
      });
      breakdownPills.push({
        label: '저축률',
        value: `${rate}%`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '수입 대 지출',
        value: `${currSymbol}${Math.round(inc).toLocaleString()} / ${currSymbol}${Math.round(exp).toLocaleString()}`,
        color: 'purple'
      });
      break;
    }

    case 'merchant_expense': {
      const kw = (rawParams.merchantKeyword || '').toLowerCase().trim();
      const matchingTxs = monthTransactions.filter(
        t => t.type === 'EXPENSE' && (t.description.toLowerCase().includes(kw) || kw.includes(t.description.toLowerCase()))
      );

      const total = matchingTxs.reduce((acc, t) => acc + norm(t), 0);
      const count = matchingTxs.length;
      const avg = count > 0 ? Math.round(total / count) : 0;

      calculatedValue = total;
      directAnswer = `${targetMonth}월 '${rawParams.merchantKeyword || '해당 가맹점'}' 지출은 총 ${currSymbol}${Math.round(total).toLocaleString()} 입니다.`;
      summarySentence = `총 ${count}회의 결제가 발생하였으며, 1회 평균 결제액은 ${currSymbol}${avg.toLocaleString()}입니다.`;

      breakdownPills.push({
        label: '가맹점 지출',
        value: `${currSymbol}${Math.round(total).toLocaleString()}`,
        highlight: true,
        color: 'sky'
      });
      breakdownPills.push({
        label: '결제 횟수',
        value: `${count}회`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '1회 평균액',
        value: `${currSymbol}${avg.toLocaleString()}`,
        color: 'purple'
      });
      break;
    }

    default: {
      const inc = monthTransactions.filter(t => t.type === 'INCOME' || t.type === 'SETTLEMENT').reduce((acc, t) => acc + norm(t), 0);
      const exp = monthTransactions.filter(t => t.type === 'EXPENSE').reduce((acc, t) => acc + norm(t), 0);
      const net = inc - exp;

      calculatedValue = net;
      directAnswer = `${targetMonth}월 재정 집계: 순수지 ${net >= 0 ? '+' : ''}${currSymbol}${Math.round(net).toLocaleString()} 입니다.`;
      summarySentence = `수입 ${currSymbol}${Math.round(inc).toLocaleString()}, 지출 ${currSymbol}${Math.round(exp).toLocaleString()}이 기록되었습니다.`;

      breakdownPills.push({
        label: '순수지',
        value: `${net >= 0 ? '+' : ''}${currSymbol}${Math.round(net).toLocaleString()}`,
        highlight: true,
        color: net >= 0 ? 'sky' : 'blue'
      });
      breakdownPills.push({
        label: '총 수입',
        value: `+${currSymbol}${Math.round(inc).toLocaleString()}`,
        color: 'blue'
      });
      breakdownPills.push({
        label: '총 지출',
        value: `-${currSymbol}${Math.round(exp).toLocaleString()}`,
        color: 'purple'
      });
      break;
    }
  }

  return {
    query: rawParams.querySummary || '',
    directAnswer,
    summarySentence,
    breakdownPills,
    metric: rawParams.metric,
    parameters: rawParams,
    calculatedValue,
    calculatedCurrency: baseCurrency,
    details,
    timestamp: new Date().toISOString()
  };
}

/**
 * Step 3: End-to-End Financial Query Execution Orchestrator
 */
export async function executeFinancialQuery(
  queryText: string,
  transactions?: Transaction[],
  accounts?: AssetAccount[],
  fxRates?: FxRates,
  baseCurrency: SupportedCurrency = 'KRW',
  engineConfig?: AIEngineConfig
): Promise<FinancialQueryResult> {
  const trimmed = queryText.trim();
  if (!trimmed) {
    throw new Error('질문 내용을 입력해주세요.');
  }

  // 1. Fetch data from IndexedDB if not provided
  const txs = transactions && transactions.length > 0 ? transactions : await getAllTransactions();
  const accs = accounts && accounts.length > 0 ? accounts : await getAllAssetAccounts();
  const rates = fxRates || DEFAULT_FX_RATES;

  // 2. Extract Intent and Parameters
  const { parameters } = await extractFinancialQueryIntent(trimmed, engineConfig);

  // 3. Deterministic Local Compute (Zero Math Hallucination)
  const result = computeDeterministicFinancialQuery(parameters, txs, accs, rates, baseCurrency);
  result.query = trimmed;
  return result;
}
