import { describe, it, expect } from 'vitest';
import {
  parseFinancialInputDeterministically,
  parseFinancialText,
  detectInstallment,
  addMonthsToDate,
  cleanInstallmentItemTitle
} from './financialParser';

describe('Financial Parser - Interest-Free Installment Parsing Suite', () => {
  describe('1. Natural Language Pattern Matching', () => {
    const input = '삼성카드로 옥션에서 삼성 갤럭시북 180만 원 무이자 할부 10개월 구입';

    it('accurately parses 10-month interest-free installment via parseFinancialInputDeterministically', () => {
      const results = parseFinancialInputDeterministically(input);

      // Assert generated transaction count equals 10
      expect(results).toHaveLength(10);

      // Assert installment metadata on every generated transaction
      results.forEach((tx, idx) => {
        const monthNum = idx + 1;
        const isInstallment = Boolean(tx.installment);
        expect(isInstallment).toBe(true);
        expect(tx.installment?.isInterestFree).toBe(true);
        expect(tx.installment?.totalMonths).toBe(10);
        expect(tx.installment?.currentMonth).toBe(monthNum);
        expect(tx.installment?.totalAmount).toBe(1800000);
        expect(tx.installment?.monthlyAmount).toBe(180000);
        expect(tx.type).toBe('EXPENSE');
        expect(tx.paymentMethod).toContain('삼성카드');

        // Assert descriptions are formatted with (1/10회차 · 무이자), (2/10회차 · 무이자), etc.
        expect(tx.description).toContain(`(${monthNum}/10회차 · 무이자)`);
      });

      // Assert 1st month amount is 180,000 KRW
      expect(results[0].amount).toBe(180000);

      // Assert all months sum to the total amount of 1,800,000 KRW
      const totalSum = results.reduce((sum, tx) => sum + tx.amount, 0);
      expect(totalSum).toBe(1800000);

      // Assert scheduled dates increment precisely by 1 month
      const firstDate = new Date(results[0].date);
      for (let i = 0; i < results.length; i++) {
        const currentDate = new Date(results[i].date);
        const expectedDate = new Date(addMonthsToDate(firstDate, i));
        expect(currentDate.getFullYear()).toBe(expectedDate.getFullYear());
        expect(currentDate.getMonth()).toBe(expectedDate.getMonth());
      }
    });

    it('accurately parses multi-month interest-free installment via parseFinancialText', () => {
      const items = parseFinancialText(input);

      expect(items).toHaveLength(10);
      items.forEach((item, idx) => {
        const monthNum = idx + 1;
        expect(item.installmentMonths).toBe(10);
        expect(item.isInterestFree).toBe(true);
        expect(item.totalAmount).toBe(1800000);
        expect(item.amount).toBe(180000);
        expect(item.type).toBe('expense');
        expect(item.merchant).toContain(`(${monthNum}/10회차 · 무이자)`);
      });

      // Scheduled dates increment sequentially by month
      const firstDate = new Date(items[0].date);
      for (let i = 0; i < items.length; i++) {
        const cur = new Date(items[i].date);
        const exp = new Date(addMonthsToDate(firstDate, i));
        expect(cur.getFullYear()).toBe(exp.getFullYear());
        expect(cur.getMonth()).toBe(exp.getMonth());
      }
    });

    it('directly detects installment terms using detectInstallment helper', () => {
      const detected = detectInstallment(input, 1800000);
      expect(detected).not.toBeNull();
      expect(detected?.totalMonths).toBe(10);
      expect(detected?.monthlyAmount).toBe(180000);
      expect(detected?.remainder).toBe(0);
      expect(detected?.isInterestFree).toBe(true);
      expect(detected?.totalAmount).toBe(1800000);
    });

    it('formats clean product title removing payment and installment particles', () => {
      const cleaned = cleanInstallmentItemTitle(input, '갤럭시북');
      expect(cleaned).toContain('갤럭시북');
      expect(cleaned).not.toContain('삼성카드로');
      expect(cleaned).not.toContain('10개월');
      expect(cleaned).not.toContain('무이자');
    });
  });

  describe('2. Remainder (Odd-amount) Handling', () => {
    const oddInput = '100,000원 3개월 무이자 할부 결제';

    it('splits 100,000 KRW across 3 months with remainder added strictly to Month 1', () => {
      const results = parseFinancialInputDeterministically(oddInput);

      expect(results).toHaveLength(3);

      // Month 1: 33,334 KRW (base 33,333 + remainder 1)
      expect(results[0].amount).toBe(33334);
      expect(results[0].description).toContain('(1/3회차 · 무이자)');

      // Month 2: 33,333 KRW
      expect(results[1].amount).toBe(33333);
      expect(results[1].description).toContain('(2/3회차 · 무이자)');

      // Month 3: 33,333 KRW
      expect(results[2].amount).toBe(33333);
      expect(results[2].description).toContain('(3/3회차 · 무이자)');

      // Total sum strictly equals 100,000 KRW
      const totalSum = results.reduce((sum, tx) => sum + tx.amount, 0);
      expect(totalSum).toBe(100000);
    });

    it('preserves remainder logic in parseFinancialText', () => {
      const items = parseFinancialText(oddInput);

      expect(items).toHaveLength(3);
      expect(items[0].amount).toBe(33334);
      expect(items[1].amount).toBe(33333);
      expect(items[2].amount).toBe(33333);

      const totalSum = items.reduce((sum, item) => sum + item.amount, 0);
      expect(totalSum).toBe(100000);
    });

    it('verifies detectInstallment remainder calculation for various non-divisible sums', () => {
      // 100,000 / 3 = 33,333 with remainder 1
      const res3 = detectInstallment('100,000원 3개월 할부', 100000);
      expect(res3?.monthlyAmount).toBe(33333);
      expect(res3?.remainder).toBe(1);

      // 500,000 / 6 = 83,333 with remainder 2
      const res6 = detectInstallment('500,000원 6개월 무이자', 500000);
      expect(res6?.monthlyAmount).toBe(83333);
      expect(res6?.remainder).toBe(2);

      // 10,000 / 3 = 3,333 with remainder 1
      const res10k = detectInstallment('1만원 3달 할부', 10000);
      expect(res10k?.monthlyAmount).toBe(3333);
      expect(res10k?.remainder).toBe(1);
    });

    it('handles general (non-interest-free) installments with appropriate tag label', () => {
      const regularInstallmentInput = '노트북 60만원 6개월 할부';
      const results = parseFinancialInputDeterministically(regularInstallmentInput);

      expect(results).toHaveLength(6);
      expect(results[0].installment?.isInterestFree).toBe(false);
      expect(results[0].description).toContain('(1/6회차 · 할부)');
      expect(results[0].amount).toBe(100000);
      expect(results[5].description).toContain('(6/6회차 · 할부)');
    });
  });
});
