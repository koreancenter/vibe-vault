import { describe, it, expect } from 'vitest';
import { computeSafeToSpend } from '../src/finance/cashflowForecast';
import { extractPayer, parseFinancialInputDeterministically } from '../src/financialParser';
import { computeDeterministicFinancialQuery } from '../src/finance/queryEngine';
import { Transaction, SubscriptionItem, FxRates, AssetAccount } from '../src/types';

describe('Phase 4: Safe-to-Spend Today Calculator', () => {
  const mockFxRates: FxRates = {
    base: 'KRW',
    rates: { USD: 1350, EUR: 1450, JPY: 9 },
    source: 'estimated',
    stale: false
  };

  it('correctly calculates Safe-to-Spend based on budget, MTD expenses, and upcoming subscriptions', () => {
    // Current date: 15th of month with 30 days -> 16 remaining days (including today)
    const fixedDate = new Date(2026, 8, 15); // Sep 15, 2026 (September has 30 days)

    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        type: 'EXPENSE',
        amount: 300000,
        currency: 'KRW',
        category: 'Food',
        description: '식비',
        date: '2026-09-05T12:00:00Z'
      },
      {
        id: 'tx-2',
        type: 'EXPENSE',
        amount: 200000,
        currency: 'KRW',
        category: 'Living',
        description: '생활비',
        date: '2026-09-10T12:00:00Z'
      }
    ];

    const subscriptions: SubscriptionItem[] = [
      {
        id: 'sub-1',
        merchant: '쿠팡 로켓와우',
        amount: 4990,
        currency: 'KRW',
        cycleDays: 30,
        lastBillingDate: '2026-08-25T00:00:00Z',
        nextBillingDate: '2026-09-25T00:00:00Z',
        dDay: 10,
        confidence: 0.95,
        occurrencesCount: 3,
        category: 'Living',
        isActive: true
      },
      {
        id: 'sub-past',
        merchant: '넷플릭스',
        amount: 17000,
        currency: 'KRW',
        cycleDays: 30,
        lastBillingDate: '2026-08-05T00:00:00Z',
        nextBillingDate: '2026-09-05T00:00:00Z', // already billed
        dDay: -10,
        confidence: 0.98,
        occurrencesCount: 5,
        category: 'Leisure',
        isActive: true
      }
    ];

    // Budget: 1,500,000 KRW
    // MTD Expenses: 500,000 KRW
    // Upcoming Subscriptions: 4,990 KRW
    // Net Available: 1,500,000 - 500,000 - 4,990 = 995,010 KRW
    // Remaining days: 30 - 15 + 1 = 16 days
    // Safe-to-spend: round(995,010 / 16) = 62,188 KRW
    const result = computeSafeToSpend(
      transactions,
      subscriptions,
      1500000,
      'KRW',
      mockFxRates,
      fixedDate
    );

    expect(result.remainingDays).toBe(16);
    expect(result.targetPool).toBe(1500000);
    expect(result.totalMtdExpense).toBe(500000);
    expect(result.upcomingSubscriptions).toBe(4990);
    expect(result.safeToSpendToday).toBe(Math.round(995010 / 16));
  });

  it('clamps Safe-to-Spend to 0 when budget is exhausted', () => {
    const fixedDate = new Date(2026, 8, 15);
    const transactions: Transaction[] = [
      {
        id: 'tx-big',
        type: 'EXPENSE',
        amount: 2000000,
        currency: 'KRW',
        category: 'Shopping',
        description: '명품 지출',
        date: '2026-09-02T12:00:00Z'
      }
    ];

    const result = computeSafeToSpend(
      transactions,
      [],
      1000000, // Budget 1,000,000 < Expenses 2,000,000
      'KRW',
      mockFxRates,
      fixedDate
    );

    expect(result.safeToSpendToday).toBe(0);
  });
});

describe('Phase 4: Multi-Payer Payer Extraction', () => {
  it('detects payer from "발리 숙소 60만원 김대리 결제"', () => {
    const input = '발리 숙소 60만원 김대리 결제';
    const payer = extractPayer(input);
    expect(payer).toBe('김대리');

    const parsed = parseFinancialInputDeterministically(input);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].paidBy).toBe('김대리');
    expect(parsed[0].amount).toBe(600000);
    expect(parsed[0].description).toBe('발리 숙소');
  });

  it('detects payer from "저녁 12만원 박과장 결제"', () => {
    const input = '저녁 12만원 박과장 결제';
    const payer = extractPayer(input);
    expect(payer).toBe('박과장');

    const parsed = parseFinancialInputDeterministically(input);
    expect(parsed[0].paidBy).toBe('박과장');
    expect(parsed[0].amount).toBe(120000);
  });

  it('does not confuse payment methods (카드, 삼성페이) with payer names', () => {
    expect(extractPayer('점심 15000원 카드 결제')).toBeUndefined();
    expect(extractPayer('커피 5000원 삼성페이 결제')).toBeUndefined();
    expect(extractPayer('다이소 8000원 현금 결제')).toBeUndefined();
  });
});

describe('Phase 4: Historical FX Snapshot & Net Worth Attribution', () => {
  const mockFxRates: FxRates = {
    base: 'KRW',
    rates: { KRW: 1, USD: 1 / 1400 }, // 1 USD = 1400 KRW
    source: 'estimated',
    stale: false
  };

  const mockAccounts: AssetAccount[] = [
    {
      id: 'acc-usd',
      institution: '토스증권',
      accountName: '미국 배당주',
      assetType: 'BROKERAGE',
      currency: 'USD',
      currentBalance: 1000, // $1000
      fxRateAtEntry: 1300,  // Historical entry rate: 1300
      lastUpdated: '2026-09-01T00:00:00Z'
    }
  ];

  it('separates organic savings from FX valuation gain', () => {
    const params = {
      metric: 'fx_gain_loss' as const,
      month: 9,
      year: 2026,
      targetCurrency: 'USD' as const
    };

    const result = computeDeterministicFinancialQuery(
      params,
      [],
      mockAccounts,
      mockFxRates,
      'KRW'
    );

    expect(result.metric).toBe('fx_gain_loss');
    expect(result.breakdownPills.some(p => p.label.includes('저축 기여분'))).toBe(true);
    expect(result.breakdownPills.some(p => p.label.includes('환율 변동분'))).toBe(true);

    const organicPill = result.breakdownPills.find(p => p.label.includes('저축 기여분'));
    // Entry cost = 1000 * 1300 = 1,300,000 KRW
    expect(organicPill?.value).toContain('1,300,000');

    const fxPill = result.breakdownPills.find(p => p.label.includes('환율 변동분'));
    // FX fluctuation = 1000 * (1400 - 1300) = +100,000 KRW
    expect(fxPill?.value).toContain('100,000');
  });
});
