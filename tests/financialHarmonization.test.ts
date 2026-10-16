import { describe, it, expect } from 'vitest';
import { computeFinancialAggregates } from '../src/utils';
import { SAMPLE_ASSET_ACCOUNTS, SAMPLE_DEBT_ITEMS } from '../src/db';
import { AssetAccount, DebtItem, FxRates } from '../src/types';

describe('Unified Net Worth & Asset Computation Harmonization', () => {
  it('correctly calculates totalAssets, totalLiabilities, and netWorth for sample dataset', () => {
    const result = computeFinancialAggregates(
      SAMPLE_ASSET_ACCOUNTS,
      SAMPLE_DEBT_ITEMS,
      'KRW'
    );

    // SAMPLE_ASSET_ACCOUNTS:
    // Toss (12,500,000) + Kakao Sec (4,800,000) + KakaoBank (3,200,000) + Upbit (2,150,000) + Cash (500,000) = 23,150,000
    // SAMPLE_DEBT_ITEMS:
    // Receivable (김민수): 200,000 -> added to totalAssets
    // Payable (카카오뱅크 대출): 24,500,000 -> added to totalLiabilities
    expect(result.totalAssets).toBe(23350000);
    expect(result.totalLiabilities).toBe(24500000);
    expect(result.netWorth).toBe(-1150000);
  });

  it('filters out inactive debts from both assets and liabilities', () => {
    const activeDebts: DebtItem[] = [
      {
        id: 'd1',
        name: '받을 돈 (활성)',
        type: 'LOAN_RECEIVABLE',
        counterpartyOrBank: '친구',
        originalPrincipal: 500000,
        remainingPrincipal: 300000,
        currency: 'KRW',
        isActive: true,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'd2',
        name: '다 받은 돈 (완납)',
        type: 'LOAN_RECEIVABLE',
        counterpartyOrBank: '동료',
        originalPrincipal: 500000,
        remainingPrincipal: 200000,
        currency: 'KRW',
        isActive: false, // Inactive
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'd3',
        name: '완납한 대출 (비활성)',
        type: 'LOAN_PAYABLE',
        counterpartyOrBank: '은행',
        originalPrincipal: 10000000,
        remainingPrincipal: 5000000,
        currency: 'KRW',
        isActive: false, // Inactive
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'd4',
        name: '진행 중인 신용대출',
        type: 'LOAN_PAYABLE',
        counterpartyOrBank: '은행',
        originalPrincipal: 10000000,
        remainingPrincipal: 4000000,
        currency: 'KRW',
        isActive: true,
        lastUpdated: new Date().toISOString(),
      }
    ];

    const accounts: AssetAccount[] = [
      {
        id: 'a1',
        institution: '은행',
        accountName: '예금',
        assetType: 'BANK',
        currentBalance: 5000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString(),
      }
    ];

    const result = computeFinancialAggregates(accounts, activeDebts, 'KRW');
    // totalAssets = 5,000,000 + 300,000 (d1 only) = 5,300,000
    expect(result.totalAssets).toBe(5300000);
    // totalLiabilities = 4,000,000 (d4 only)
    expect(result.totalLiabilities).toBe(4000000);
    // netWorth = 5,300,000 - 4,000,000 = 1,300,000
    expect(result.netWorth).toBe(1300000);
  });

  it('correctly treats asset accounts with LIABILITY type as liabilities', () => {
    const accounts: AssetAccount[] = [
      {
        id: 'a1',
        institution: '토스증권',
        accountName: '주식',
        assetType: 'BROKERAGE',
        currentBalance: 10000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'a2',
        institution: '현대카드',
        accountName: '결제예정대금',
        assetType: 'LIABILITY',
        currentBalance: 1500000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString(),
      }
    ];

    const debts: DebtItem[] = [];

    const result = computeFinancialAggregates(accounts, debts, 'KRW');
    expect(result.totalAssets).toBe(10000000);
    expect(result.totalLiabilities).toBe(1500000);
    expect(result.netWorth).toBe(8500000);
  });

  it('handles multi-currency conversions using provided fxRates', () => {
    const fxRates: FxRates = {
      base: 'KRW',
      rates: {
        KRW: 1,
        USD: 0.001, // 1 KRW = 0.001 USD -> 1 USD = 1,000 KRW
      },
      source: 'frankfurter',
      updatedAt: new Date().toISOString(),
      stale: false,
    };

    const accounts: AssetAccount[] = [
      {
        id: 'a1',
        institution: 'Schwab',
        accountName: 'US Checking',
        assetType: 'BANK',
        currentBalance: 1000, // $1,000 = 1,000,000 KRW
        currency: 'USD',
        lastUpdated: new Date().toISOString(),
      }
    ];

    const debts: DebtItem[] = [
      {
        id: 'd1',
        name: 'US Loan',
        type: 'LOAN_PAYABLE',
        counterpartyOrBank: 'Chase',
        originalPrincipal: 500,
        remainingPrincipal: 200, // $200 = 200,000 KRW
        currency: 'USD',
        isActive: true,
        lastUpdated: new Date().toISOString(),
      }
    ];

    const result = computeFinancialAggregates(accounts, debts, 'KRW', fxRates);
    expect(result.totalAssets).toBe(1000000);
    expect(result.totalLiabilities).toBe(200000);
    expect(result.netWorth).toBe(800000);
  });

  describe('Overdraft Account (마이너스 통장 / 한도대출) Dynamic Handling', () => {
    it('treats negative overdraft balance as dynamic liability and does not double count', () => {
      const accounts: AssetAccount[] = [
        {
          id: 'a1',
          institution: '신한은행',
          accountName: '급여통장',
          assetType: 'BANK',
          currentBalance: 5000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'a2',
          institution: '신한은행',
          accountName: '신한 마이너스통장',
          assetType: 'BANK',
          currentBalance: -3500000,
          isOverdraft: true,
          overdraftLimit: 30000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        }
      ];

      const result = computeFinancialAggregates(accounts, [], 'KRW');
      // Gross assets: only positive balance (5,000,000)
      expect(result.totalAssets).toBe(5000000);
      // Liabilities: utilized overdraft loan (3,500,000)
      expect(result.totalLiabilities).toBe(3500000);
      // Net worth: 5,000,000 - 3,500,000 = 1,500,000
      expect(result.netWorth).toBe(1500000);
    });

    it('treats positive overdraft balance as liquid cash asset', () => {
      const accounts: AssetAccount[] = [
        {
          id: 'a1',
          institution: '카카오뱅크',
          accountName: '마이너스통장',
          assetType: 'BANK',
          currentBalance: 1200000, // Currently in positive funds
          isOverdraft: true,
          overdraftLimit: 20000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        }
      ];

      const result = computeFinancialAggregates(accounts, [], 'KRW');
      expect(result.totalAssets).toBe(1200000);
      expect(result.totalLiabilities).toBe(0);
      expect(result.netWorth).toBe(1200000);
    });

    it('correctly integrates with existing debts and liability accounts', () => {
      const accounts: AssetAccount[] = [
        {
          id: 'a1',
          institution: '토스뱅크',
          accountName: '입출금통장',
          assetType: 'BANK',
          currentBalance: 10000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'a2',
          institution: '국민은행',
          accountName: 'KB 마통',
          assetType: 'BANK',
          currentBalance: -4000000,
          isOverdraft: true,
          overdraftLimit: 50000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'a3',
          institution: '현대카드',
          accountName: '신용카드 결제예정금',
          assetType: 'LIABILITY',
          currentBalance: 1000000,
          currency: 'KRW',
          lastUpdated: new Date().toISOString(),
        }
      ];

      const debts: DebtItem[] = [
        {
          id: 'd1',
          name: '전세자금대출',
          type: 'LOAN_PAYABLE',
          counterpartyOrBank: '우리은행',
          originalPrincipal: 100000000,
          remainingPrincipal: 50000000,
          currency: 'KRW',
          isActive: true,
          lastUpdated: new Date().toISOString(),
        }
      ];

      const result = computeFinancialAggregates(accounts, debts, 'KRW');
      // Gross assets: 10,000,000
      expect(result.totalAssets).toBe(10000000);
      // Liabilities: 4,000,000 (overdraft) + 1,000,000 (credit card) + 50,000,000 (debt) = 55,000,000
      expect(result.totalLiabilities).toBe(55000000);
      // Net worth: 10,000,000 - 55,000,000 = -45,000,000
      expect(result.netWorth).toBe(-45000000);
    });

    it('correctly includes unpaid credit card liabilities to harmonize Vault & Insights net worth', () => {
      const result = computeFinancialAggregates(
        SAMPLE_ASSET_ACCOUNTS,
        SAMPLE_DEBT_ITEMS,
        'KRW',
        {
          base: 'KRW',
          rates: { KRW: 1 },
          source: 'frankfurter',
          updatedAt: new Date().toISOString(),
          stale: false,
        },
        137700
      );

      expect(result.totalAssets).toBe(23350000);
      expect(result.totalLiabilities).toBe(24637700);
      expect(result.netWorth).toBe(-1287700);
    });
  });
});
