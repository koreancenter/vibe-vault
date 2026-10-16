import { describe, it, expect } from 'vitest';
import {
  computeFinancialAggregates,
  formatCurrency,
  getCategoryKo,
  sanitizeTextInput,
  sanitizeTransactionInput
} from './utils';
import { AssetAccount, DebtItem, Transaction } from './types';

describe('Utils - Overdraft (마이너스 통장) & Financial Calculations Suite', () => {
  describe('1. Positive Balance Case (Liquid Cash Asset)', () => {
    it('treats positive overdraft account balance as liquid asset with zero liability', () => {
      const overdraftAccount: AssetAccount = {
        id: 'acc-overdraft-pos',
        institution: '카카오뱅크',
        accountName: '마이너스 통장 (양수 잔액)',
        assetType: 'BANK',
        currentBalance: 2000000,
        isOverdraft: true,
        overdraftLimit: 30000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const result = computeFinancialAggregates([overdraftAccount], [], 'KRW');

      // Assert totalAssets increases by 2,000,000 KRW
      expect(result.totalAssets).toBe(2000000);
      // Assert totalLiabilities has 0 KRW from this account
      expect(result.totalLiabilities).toBe(0);
      // Assert netWorth reflects positive liquid cash
      expect(result.netWorth).toBe(2000000);
    });

    it('correctly augments portfolio assets when positive overdraft is added to existing checking account', () => {
      const checkingAccount: AssetAccount = {
        id: 'acc-checking',
        institution: '토스뱅크',
        accountName: '생활비 통장',
        assetType: 'BANK',
        currentBalance: 3000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const overdraftPositive: AssetAccount = {
        id: 'acc-overdraft',
        institution: '신한은행',
        accountName: '신한 마이너스통장',
        assetType: 'BANK',
        currentBalance: 2000000,
        isOverdraft: true,
        overdraftLimit: 20000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const baseline = computeFinancialAggregates([checkingAccount], [], 'KRW');
      expect(baseline.totalAssets).toBe(3000000);
      expect(baseline.netWorth).toBe(3000000);

      const combined = computeFinancialAggregates([checkingAccount, overdraftPositive], [], 'KRW');
      expect(combined.totalAssets).toBe(5000000); // 3M + 2M
      expect(combined.totalLiabilities).toBe(0);
      expect(combined.netWorth).toBe(5000000);
    });
  });

  describe('2. Negative Overdraft Case (Dynamic Reclassification)', () => {
    it('dynamically classifies negative balance overdraft as liability with zero asset contribution', () => {
      const overdraftNegative: AssetAccount = {
        id: 'acc-overdraft-neg',
        institution: '국민은행',
        accountName: 'KB 마이너스 통장',
        assetType: 'BANK',
        currentBalance: -3500000,
        isOverdraft: true,
        overdraftLimit: 50000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const result = computeFinancialAggregates([overdraftNegative], [], 'KRW');

      // Assert totalAssets is 0 KRW from this account
      expect(result.totalAssets).toBe(0);
      // Assert totalLiabilities increases by 3,500,000 KRW
      expect(result.totalLiabilities).toBe(3500000);
      // Assert netWorth drops by 3,500,000 KRW (zero double-deduction)
      expect(result.netWorth).toBe(-3500000);
    });

    it('reclassifies negative balance without double-deduction against other assets', () => {
      const primaryChecking: AssetAccount = {
        id: 'acc-primary',
        institution: '신한은행',
        accountName: '급여통장',
        assetType: 'BANK',
        currentBalance: 5000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const overdraftLoan: AssetAccount = {
        id: 'acc-overdraft-utilized',
        institution: '우리은행',
        accountName: '우리 마이포켓 마이너스대출',
        assetType: 'BANK',
        currentBalance: -3500000,
        isOverdraft: true,
        overdraftLimit: 30000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const result = computeFinancialAggregates([primaryChecking, overdraftLoan], [], 'KRW');

      // Gross assets: solely the positive 5,000,000 KRW
      expect(result.totalAssets).toBe(5000000);
      // Liabilities: 3,500,000 KRW utilized limit
      expect(result.totalLiabilities).toBe(3500000);
      // Net Worth: 5,000,000 - 3,500,000 = 1,500,000 KRW
      expect(result.netWorth).toBe(1500000);
    });
  });

  describe('3. Internal Transfer / Repayment Validation', () => {
    it('preserves net worth when transferring from checking to overdraft reducing liability', () => {
      // Before Repayment:
      // Bank A Checking: 5,000,000 KRW
      // Overdraft Account: -3,500,000 KRW
      const bankABefore: AssetAccount = {
        id: 'bank-a',
        institution: '신한은행',
        accountName: '체크 계좌 (Bank A)',
        assetType: 'BANK',
        currentBalance: 5000000,
        isOverdraft: false,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const overdraftBefore: AssetAccount = {
        id: 'overdraft-b',
        institution: '하나은행',
        accountName: '마이너스 통장 (Overdraft B)',
        assetType: 'BANK',
        currentBalance: -3500000,
        isOverdraft: true,
        overdraftLimit: 30000000,
        currency: 'KRW',
        lastUpdated: new Date().toISOString()
      };

      const aggregatesBefore = computeFinancialAggregates([bankABefore, overdraftBefore], [], 'KRW');
      expect(aggregatesBefore.totalAssets).toBe(5000000);
      expect(aggregatesBefore.totalLiabilities).toBe(3500000);
      expect(aggregatesBefore.netWorth).toBe(1500000);

      // Repayment Transfer: 1,000,000 KRW transferred from Bank A to Overdraft Account
      // Bank A: 5,000,000 -> 4,000,000 KRW
      // Overdraft: -3,500,000 -> -2,500,000 KRW (liability reduced by 1,000,000)
      const bankAAfter: AssetAccount = {
        ...bankABefore,
        currentBalance: 4000000
      };

      const overdraftAfter: AssetAccount = {
        ...overdraftBefore,
        currentBalance: -2500000
      };

      const aggregatesAfter = computeFinancialAggregates([bankAAfter, overdraftAfter], [], 'KRW');
      expect(aggregatesAfter.totalAssets).toBe(4000000);
      expect(aggregatesAfter.totalLiabilities).toBe(2500000);
      // Net worth strictly preserved
      expect(aggregatesAfter.netWorth).toBe(1500000);
      expect(aggregatesAfter.netWorth).toBe(aggregatesBefore.netWorth);
    });

    it('ensures monthly expense total remains unchanged when an internal transfer / repayment is executed', () => {
      // Standard monthly transactions set:
      const initialTransactions: Transaction[] = [
        {
          id: 'tx-expense-1',
          type: 'EXPENSE',
          amount: 50000,
          currency: 'KRW',
          category: 'Food',
          subCategory: 'Dining',
          description: '점심 식사',
          date: new Date().toISOString(),
          isInternalTransfer: false
        },
        {
          id: 'tx-expense-2',
          type: 'EXPENSE',
          amount: 120000,
          currency: 'KRW',
          category: 'Living',
          subCategory: 'Shopping',
          description: '생필품 구매',
          date: new Date().toISOString(),
          isInternalTransfer: false
        }
      ];

      // Helper function matching useBudgetAnalytics filter:
      // only non-transfer EXPENSE transactions count towards monthly budget expenditure
      const calculateMonthlyExpenses = (txs: Transaction[]) =>
        txs
          .filter(t => t.type === 'EXPENSE' && !t.isInternalTransfer)
          .reduce((sum, t) => sum + t.amount, 0);

      const baselineExpenses = calculateMonthlyExpenses(initialTransactions);
      expect(baselineExpenses).toBe(170000); // 50,000 + 120,000

      // Execute internal transfer transaction (Bank A -> Overdraft Account)
      const repaymentTransferTx: Transaction = {
        id: 'tx-transfer-repayment',
        type: 'TRANSFER',
        amount: 1000000,
        currency: 'KRW',
        category: 'Fixed',
        subCategory: '계좌이체',
        description: '마이너스 통장 한도 상환 (Bank A -> 마통)',
        date: new Date().toISOString(),
        sourceAccountId: 'bank-a',
        targetAccountId: 'overdraft-b',
        isInternalTransfer: true // Explicitly marked as internal transfer
      };

      const transactionsWithRepayment = [...initialTransactions, repaymentTransferTx];
      const updatedExpenses = calculateMonthlyExpenses(transactionsWithRepayment);

      // Assert monthly expense total remains strictly unchanged (treated as liability payoff, not duplicate expense)
      expect(updatedExpenses).toBe(170000);
      expect(updatedExpenses).toBe(baselineExpenses);
    });
  });

  describe('4. General Utility Functions', () => {
    it('formats Korean and multi-currency amounts properly with formatCurrency', () => {
      expect(formatCurrency(1500000, 'KRW')).toBe('₩1,500,000');
      expect(formatCurrency(1250, 'USD')).toBe('$1,250');
      expect(formatCurrency(1250.5, 'USD')).toBe('$1,250.5');
      expect(formatCurrency(850.75, 'EUR')).toBe('€850.75');
    });

    it('resolves localized category names cleanly with getCategoryKo', () => {
      expect(getCategoryKo('Food')).toBe('식비');
      expect(getCategoryKo('Food', 'Dining')).toBe('식비');
      expect(getCategoryKo('Food', 'Cafe')).toBe('식비 · 카페/디저트');
      expect(getCategoryKo('Income')).toBe('급여');
      expect(getCategoryKo('Fixed', 'Subscription')).toBe('고정지출 · 구독');
    });

    it('sanitizes malicious script and HTML inputs via sanitizeTextInput and sanitizeTransactionInput', () => {
      const maliciousHtml = '<b>저녁 식사</b>';
      expect(sanitizeTextInput(maliciousHtml)).toBe('저녁 식사');

      const pseudoProtocol = 'javascript:void(0)점심 식사';
      expect(sanitizeTextInput(pseudoProtocol)).toBe('void(0)점심 식사');

      const sanitizedTx = sanitizeTransactionInput({
        description: '<span>스타벅스</span>',
        paymentMethod: '<b>현대카드</b>'
      });
      expect(sanitizedTx.description).toBe('스타벅스');
      expect(sanitizedTx.paymentMethod).toBe('현대카드');
    });
  });
});
