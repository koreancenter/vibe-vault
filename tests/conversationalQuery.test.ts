import { describe, it, expect } from 'vitest';
import { 
  extractFinancialQueryIntent, 
  computeDeterministicFinancialQuery 
} from '../src/autonomousFinance';
import { Transaction, AssetAccount, FxRates } from '../src/types';

describe('Conversational Financial Query Engine (Ask AI Vault)', () => {
  const mockFxRates: FxRates = {
    base: 'KRW',
    rates: {
      KRW: 1,
      USD: 0.00075, // ~1,333.33 KRW/USD
      EUR: 0.00069,
      JPY: 0.113,
      GBP: 0.00058
    },
    updatedAt: '2026-09-25T00:00:00Z'
  };

  const mockAccounts: AssetAccount[] = [
    {
      id: 'acc-toss-usd',
      institution: '토스증권',
      accountName: '토스 미국 주식 계좌',
      assetType: 'BROKERAGE',
      currentBalance: 1420,
      currency: 'USD',
      lastUpdated: '2026-09-25T00:00:00Z'
    },
    {
      id: 'acc-kakaobank',
      institution: '카카오뱅크',
      accountName: '생활비 통장',
      assetType: 'BANK',
      currentBalance: 3500000,
      currency: 'KRW',
      lastUpdated: '2026-09-25T00:00:00Z'
    }
  ];

  const mockTransactions: Transaction[] = [
    // Weekend expense (2026-09-05 is Saturday)
    {
      id: 'tx-1',
      type: 'EXPENSE',
      amount: 45000,
      currency: 'KRW',
      category: 'Food',
      description: '주말 외식 삼겹살',
      date: '2026-09-05T18:00:00Z'
    },
    // Weekend expense (2026-09-06 is Sunday)
    {
      id: 'tx-2',
      type: 'EXPENSE',
      amount: 15000,
      currency: 'KRW',
      category: 'Food',
      description: '주말 카페 스타벅스',
      date: '2026-09-06T14:00:00Z'
    },
    // Weekday expense (2026-09-08 is Tuesday)
    {
      id: 'tx-3',
      type: 'EXPENSE',
      amount: 12000,
      currency: 'KRW',
      category: 'Food',
      description: '평일 점심 백반',
      date: '2026-09-08T12:30:00Z'
    },
    // Weekday transport
    {
      id: 'tx-4',
      type: 'EXPENSE',
      amount: 55000,
      currency: 'KRW',
      category: 'Transport',
      description: '교통카드 충전',
      date: '2026-09-10T09:00:00Z'
    }
  ];

  it('extracts intent parameters locally for FX gain queries', async () => {
    const { parameters } = await extractFinancialQueryIntent('9월에 원화와 달러 환차손으로 얼마나 수익이 있었지?');
    expect(parameters.metric).toBe('fx_gain_loss');
    expect(parameters.month).toBe(9);
    expect(parameters.targetCurrency).toBe('USD');
  });

  it('extracts intent parameters locally for food expense queries', async () => {
    const { parameters } = await extractFinancialQueryIntent('식비 분석');
    expect(parameters.metric).toBe('category_sum');
    expect(parameters.category).toBe('Food');
  });

  it('extracts intent parameters locally for weekend expense queries', async () => {
    const { parameters } = await extractFinancialQueryIntent('9월 주말 지출');
    expect(parameters.metric).toBe('weekend_expense');
    expect(parameters.month).toBe(9);
  });

  it('computes deterministic FX gain/loss with zero math hallucination', () => {
    const params = {
      metric: 'fx_gain_loss' as const,
      month: 9,
      year: 2026,
      targetCurrency: 'USD' as const
    };

    const result = computeDeterministicFinancialQuery(
      params,
      mockTransactions,
      mockAccounts,
      mockFxRates,
      'KRW'
    );

    expect(result.metric).toBe('fx_gain_loss');
    expect(result.directAnswer).toContain('9월 USD 환차손익은 총');
    expect(result.summarySentence).toContain('보유 USD 자산($1,420)');
    expect(result.breakdownPills.length).toBeGreaterThanOrEqual(3);
    expect(result.breakdownPills.some(p => p.label.includes('환차손익'))).toBe(true);
    expect(result.breakdownPills.some(p => p.label.includes('외화 평가익'))).toBe(true);
  });

  it('computes deterministic food category sum exactly', () => {
    const params = {
      metric: 'category_sum' as const,
      category: 'Food',
      month: 9,
      year: 2026,
      targetCurrency: 'KRW' as const
    };

    const result = computeDeterministicFinancialQuery(
      params,
      mockTransactions,
      mockAccounts,
      mockFxRates,
      'KRW'
    );

    // Food txs sum: 45000 + 15000 + 12000 = 72000
    expect(result.calculatedValue).toBe(72000);
    expect(result.directAnswer).toContain('72,000');
    expect(result.breakdownPills.find(p => p.label.includes('총 지출'))?.value).toBe('₩72,000');
    expect(result.breakdownPills.find(p => p.label.includes('결제 건수'))?.value).toBe('3건');
  });

  it('computes deterministic weekend expenses accurately', () => {
    const params = {
      metric: 'weekend_expense' as const,
      month: 9,
      year: 2026,
      targetCurrency: 'KRW' as const
    };

    const result = computeDeterministicFinancialQuery(
      params,
      mockTransactions,
      mockAccounts,
      mockFxRates,
      'KRW'
    );

    // Weekend txs: 45000 + 15000 = 60000
    expect(result.calculatedValue).toBe(60000);
    expect(result.directAnswer).toContain('60,000');
    expect(result.breakdownPills.find(p => p.label.includes('주말 총 지출'))?.value).toBe('₩60,000');
  });
});
