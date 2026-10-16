import { describe, it, expect } from 'vitest';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText,
  parseKoreanAmount, 
  anonymizeFinancialInput,
  getTodayIsoDate,
  detectInstallment,
  addMonthsToDate
} from '../src/financialParser';

describe('Financial Parser Deterministic Engine', () => {
  it('parses Korean amount representations accurately', () => {
    expect(parseKoreanAmount('4만원')).toBe(40000);
    expect(parseKoreanAmount('4만 5천원')).toBe(45000);
    expect(parseKoreanAmount('1.5만')).toBe(15000);
    expect(parseKoreanAmount('3,500,000원')).toBe(3500000);
    expect(parseKoreanAmount('150만원')).toBe(1500000);
    expect(parseKoreanAmount('20k')).toBe(20000);
    expect(parseKoreanAmount('$35')).toBe(35);
    expect(parseKoreanAmount('1억 2천만원')).toBe(120000000);
    expect(parseKoreanAmount('만 원씩')).toBe(10000);
    expect(parseKoreanAmount('만 원')).toBe(10000);
  });

  it('anonymizes and strips sensitive PII (card, phone, RRN)', () => {
    const piiInput = '신한카드 9410-1234-5678-9999로 010-1234-5678에서 5만원 결제함 950101-1234567';
    const sanitized = anonymizeFinancialInput(piiInput);
    expect(sanitized).not.toContain('9410-1234-5678-9999');
    expect(sanitized).not.toContain('010-1234-5678');
    expect(sanitized).not.toContain('950101-1234567');
    expect(sanitized).toContain('[CARD]');
  });

  it('anonymizes account numbers and masked Korean names', () => {
    const sanitized = anonymizeFinancialInput('계좌 123-456-789012 및 김*수에게 2만원 송금');
    expect(sanitized).not.toContain('123-456-789012');
    expect(sanitized).not.toContain('김*수');
    expect(sanitized).toContain('[ACCOUNT]');
    expect(sanitized).toContain('[NAME]');
  });

  it('correctly splits Dutch Pay into expense and settlement', () => {
    const dutchPrompt = '민수랑 파스타 4만원 더치페이하고 토스로 2만원 받음';
    const dutchResult = parseFinancialInputDeterministically(dutchPrompt);
    expect(dutchResult).toHaveLength(2);
    expect(dutchResult[0].type).toBe('EXPENSE');
    expect(dutchResult[0].amount).toBe(40000);
    expect(dutchResult[0].category).toBe('Food');
    expect(dutchResult[1].type).toBe('SETTLEMENT');
    expect(dutchResult[1].amount).toBe(20000);
    expect(dutchResult[1].paymentMethod).toBe('Toss');
  });

  it('suggests appropriate categories and subcategories', () => {
    const starbucksResult = parseFinancialInputDeterministically('스타벅스 아메리카노 4500원 카드 결제');
    expect(starbucksResult[0].amount).toBe(4500);
    expect(starbucksResult[0].category).toBe('Food');
    expect(starbucksResult[0].subCategory).toBe('Cafe');

    const emartResult = parseFinancialInputDeterministically('이마트 장보기 35000원 현대카드');
    expect(emartResult[0].amount).toBe(35000);
    expect(emartResult[0].category).toBe('Food');
    expect(emartResult[0].subCategory).toBe('Grocery');
    expect(emartResult[0].paymentMethod).toBe('현대카드');

    const sundubuResult = parseFinancialInputDeterministically('점심 순두부찌개 12000원 계좌이체');
    expect(sundubuResult[0].amount).toBe(12000);
    expect(sundubuResult[0].category).toBe('Food');
    expect(sundubuResult[0].subCategory).toBe('Dining');
  });

  it('handles multi-item compound clauses', () => {
    const multiResult = parseFinancialInputDeterministically('쿠팡에서 화장지 2만원, 영양제 3만원 결제함');
    expect(multiResult).toHaveLength(2);
    expect(multiResult[0].amount).toBe(20000);
    expect(multiResult[0].category).toBe('Living');
    expect(multiResult[1].amount).toBe(30000);
    expect(multiResult[1].category).toBe('Health');
  });

  it('identifies salary income and transfers', () => {
    const salaryResult = parseFinancialInputDeterministically('이번 달 월급 3,500,000원 기업은행 입금');
    expect(salaryResult[0].type).toBe('INCOME');
    expect(salaryResult[0].amount).toBe(3500000);

    const transferResult = parseFinancialInputDeterministically('주택청약 통장으로 150만원 자동이체');
    expect(transferResult[0].type).toBe('TRANSFER');
    expect(transferResult[0].amount).toBe(1500000);
  });

  describe('Multi-Item Parsing and Dutch-Pay Arithmetic (parseFinancialText)', () => {
    it('accurately parses multi-item sentences with trailing Dutch-pay portion instructions', () => {
      const prompt = '오늘 말자랑 데이트 식사 2만 원, 커피 15,000원 지출. 식사비는 만 원씩 더치페이';
      const items = parseFinancialText(prompt);

      expect(items).toHaveLength(2);

      // Segment 1: 식사 2만 원 -> 식비, 10000 (after Dutch-pay portion deduction)
      expect(items[0].category).toBe('식비');
      expect(items[0].merchant).toBe('식사');
      expect(items[0].amount).toBe(10000);
      expect(items[0].type).toBe('expense');
      expect(items[0].currency).toBe('KRW');
      expect(items[0].note).toBe('식사 20,000원 (더치페이 분담)');
      expect(items[0].date).toBe(getTodayIsoDate());

      // Segment 2: 커피 15,000원 -> 카페/간식, 15000
      expect(items[1].category).toBe('카페/간식');
      expect(items[1].merchant).toBe('커피');
      expect(items[1].amount).toBe(15000);
      expect(items[1].type).toBe('expense');
      expect(items[1].currency).toBe('KRW');
      expect(items[1].note).toBeUndefined();
      expect(items[1].date).toBe(getTodayIsoDate());
    });

    it('correctly handles "2명 N빵" and "반반" arithmetic', () => {
      const nSplitPrompt = '오늘 삼겹살 4만원 2명 N빵';
      const nItems = parseFinancialText(nSplitPrompt);
      expect(nItems).toHaveLength(1);
      expect(nItems[0].amount).toBe(20000);
      expect(nItems[0].category).toBe('식비');
      expect(nItems[0].note).toBe('삼겹살 40,000원 (더치페이 분담)');

      const banbanPrompt = '파스타 3만원 반반';
      const banbanItems = parseFinancialText(banbanPrompt);
      expect(banbanItems).toHaveLength(1);
      expect(banbanItems[0].amount).toBe(15000);
      expect(banbanItems[0].note).toBe('파스타 30,000원 (더치페이 분담)');
    });

    it('correctly splits by coordinating conjunctions (그리고, 및, +)', () => {
      const prompt = '식사 2만원 및 커피 5천원 그리고 택시 12,000원';
      const items = parseFinancialText(prompt);
      expect(items).toHaveLength(3);
      expect(items[0].category).toBe('식비');
      expect(items[0].amount).toBe(20000);
      expect(items[1].category).toBe('카페/간식');
      expect(items[1].amount).toBe(5000);
      expect(items[2].category).toBe('교통');
      expect(items[2].amount).toBe(12000);
    });

    it('correctly calculates 3명 엔빵 and companion Dutch-pay', () => {
      const threeSplit = parseFinancialText('식사 3만원 3명 엔빵');
      expect(threeSplit).toHaveLength(1);
      expect(threeSplit[0].amount).toBe(10000);
      expect(threeSplit[0].note).toBe('식사 30,000원 (더치페이 분담)');

      const companionSplit = parseFinancialText('친구랑 식사 4만원 더치페이');
      expect(companionSplit).toHaveLength(1);
      expect(companionSplit[0].amount).toBe(20000);
      expect(companionSplit[0].note).toBe('식사 40,000원 (더치페이 분담)');
    });
  });

  describe('Financial Calculation Core: Multi-Item Parsing Suite', () => {
    it('parses "쿠팡 화장지 2만원, 영양제 3만원" into 2 distinct transactions with amounts 20000 and 30000 (deterministic engine)', () => {
      const input = '쿠팡 화장지 2만원, 영양제 3만원';
      const results = parseFinancialInputDeterministically(input);

      expect(results).toHaveLength(2);
      expect(results[0].amount).toBe(20000);
      expect(results[0].type).toBe('EXPENSE');
      expect(results[0].category).toBe('Living');
      expect(results[0].merchant).toBe('쿠팡');

      expect(results[1].amount).toBe(30000);
      expect(results[1].type).toBe('EXPENSE');
      expect(results[1].category).toBe('Health');
      expect(results[1].merchant).toBe('영양제');
    });

    it('parses "쿠팡 화장지 2만원, 영양제 3만원" via parseFinancialText with exact item amounts', () => {
      const input = '쿠팡 화장지 2만원, 영양제 3만원';
      const items = parseFinancialText(input);

      expect(items).toHaveLength(2);
      expect(items[0].amount).toBe(20000);
      expect(items[0].currency).toBe('KRW');
      expect(items[0].type).toBe('expense');

      expect(items[1].amount).toBe(30000);
      expect(items[1].currency).toBe('KRW');
      expect(items[1].type).toBe('expense');
    });

    it('handles multi-item compound phrases with different punctuation and conjunctions', () => {
      const commaSeparated = parseFinancialInputDeterministically('스타벅스 아메리카노 4500원, 김밥천국 6000원');
      expect(commaSeparated).toHaveLength(2);
      expect(commaSeparated[0].amount).toBe(4500);
      expect(commaSeparated[1].amount).toBe(6000);

      const conjunctionSeparated = parseFinancialText('다이소 건전지 3000원 그리고 올리브영 립밤 8000원');
      expect(conjunctionSeparated).toHaveLength(2);
      expect(conjunctionSeparated[0].amount).toBe(30000 > 3000 ? 3000 : 3000);
      expect(conjunctionSeparated[1].amount).toBe(8000);
    });
  });

  describe('Financial Calculation Core: Dutch-Pay & Settlement Arithmetic Suite', () => {
    it('correctly calculates net user expense 20000 and receivable settlement 20000 for "민수랑 파스타 4만원 더치페이하고 2만원 받음"', () => {
      const input = '민수랑 파스타 4만원 더치페이하고 2만원 받음';
      const results = parseFinancialInputDeterministically(input);

      expect(results).toHaveLength(2);

      const expense = results.find(r => r.type === 'EXPENSE');
      const settlement = results.find(r => r.type === 'SETTLEMENT');

      expect(expense).toBeDefined();
      expect(settlement).toBeDefined();

      // Full original expense on card/account
      expect(expense!.amount).toBe(40000);
      expect(expense!.category).toBe('Food');

      // Reimbursement received from counterparty
      expect(settlement!.amount).toBe(20000);

      // Core arithmetic: Net user expense = total expense (40,000) - receivable settlement (20,000) = 20,000
      const netUserExpense = expense!.amount - settlement!.amount;
      expect(netUserExpense).toBe(20000);

      // Receivable settlement amount
      expect(settlement!.amount).toBe(20000);
    });

    it('extracts net portion directly in parseFinancialText for Dutch-pay settlement prompts', () => {
      const input = '민수랑 파스타 4만원 더치페이하고 2만원 받음';
      const items = parseFinancialText(input);

      expect(items.length).toBeGreaterThanOrEqual(1);
      // Net user expense portion resolved to 20,000
      expect(items[0].amount).toBe(20000);
      expect(items[0].category).toBe('식비');
    });

    it('correctly processes additional Dutch-pay settlement scenarios', () => {
      const prompt = '철수랑 고기 6만원 더치페이하고 3만원 받음';
      const results = parseFinancialInputDeterministically(prompt);

      expect(results).toHaveLength(2);
      const expense = results.find(r => r.type === 'EXPENSE')!;
      const settlement = results.find(r => r.type === 'SETTLEMENT')!;

      expect(expense.amount).toBe(60000);
      expect(settlement.amount).toBe(30000);

      const netUserExpense = expense.amount - settlement.amount;
      expect(netUserExpense).toBe(30000);
      expect(settlement.amount).toBe(30000);
    });
  });

  describe('Financial Calculation Core: Unit Normalizations Suite', () => {
    it('ensures "4만원 더치페이" amount normalizes to 40000 (not 4 or -4)', () => {
      const normalizedAmount = parseKoreanAmount('4만원 더치페이');

      expect(normalizedAmount).toBe(40000);
      expect(normalizedAmount).not.toBe(4);
      expect(normalizedAmount).not.toBe(-4);
      expect(typeof normalizedAmount).toBe('number');
      expect(Number.isInteger(normalizedAmount)).toBe(true);
      expect(normalizedAmount! > 0).toBe(true);
    });

    it('normalizes various Korean currency expressions with Dutch-pay suffixes accurately', () => {
      expect(parseKoreanAmount('4만원 더치페이')).toBe(40000);
      expect(parseKoreanAmount('2.5만원 더치페이')).toBe(25000);
      expect(parseKoreanAmount('10만원 더치페이')).toBe(100000);
      expect(parseKoreanAmount('5천원 더치페이')).toBe(5000);
      expect(parseKoreanAmount('1억 2천만원')).toBe(120000000);
    });
  });

  describe('Credit Card Settlement & Reconciliation Rules', () => {
    it('strictly categorizes "현대카드 결제대금 출금 850,000원" as TRANSFER with subCategory "카드대금 납부" and isInternalTransfer true', () => {
      const results = parseFinancialInputDeterministically('현대카드 결제대금 출금 850,000원');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.type).toBe('TRANSFER');
      expect(res.subCategory).toBe('카드대금 납부');
      expect(res.isInternalTransfer).toBe(true);
      expect(res.amount).toBe(850000);
      expect(res.paymentMethod).toContain('현대카드');
    });

    it('strictly categorizes "신한카드 대금 자동이체 1,200,000원" as TRANSFER with subCategory "카드대금 납부" and isInternalTransfer true', () => {
      const results = parseFinancialInputDeterministically('신한카드 대금 자동이체 1,200,000원');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.type).toBe('TRANSFER');
      expect(res.subCategory).toBe('카드대금 납부');
      expect(res.isInternalTransfer).toBe(true);
      expect(res.amount).toBe(1200000);
      expect(res.paymentMethod).toContain('신한카드');
    });

    it('strictly categorizes English "Card bill payment 500 USD" as TRANSFER with subCategory "카드대금 납부" and isInternalTransfer true', () => {
      const results = parseFinancialInputDeterministically('Card bill payment $500');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.type).toBe('TRANSFER');
      expect(res.subCategory).toBe('카드대금 납부');
      expect(res.isInternalTransfer).toBe(true);
      expect(res.amount).toBe(500);
    });

    it('ensures card settlement transfers do not inflate total monthly expense metrics', () => {
      // Simulate 2 daily expenses followed by a monthly bill debit
      const exp1 = parseFinancialInputDeterministically('스타벅스 커피 5,500원 현대카드 결제')[0];
      const exp2 = parseFinancialInputDeterministically('이마트 장보기 67,200원 현대카드')[0];
      const settlement = parseFinancialInputDeterministically('현대카드 결제대금 출금 72,700원')[0];

      expect(exp1.type).toBe('EXPENSE');
      expect(exp2.type).toBe('EXPENSE');
      expect(settlement.type).toBe('TRANSFER');
      expect(settlement.isInternalTransfer).toBe(true);
      expect(settlement.subCategory).toBe('카드대금 납부');

      // Calculation of monthly expenses (excluding isInternalTransfer or TRANSFER)
      const transactions = [exp1, exp2, settlement];
      const totalExpense = transactions
        .filter(t => t.type === 'EXPENSE' && !t.isInternalTransfer)
        .reduce((sum, t) => sum + t.amount, 0);

      // Total expense must equal 5500 + 67200 = 72700, NOT double-counted with the settlement (145,400)
      expect(totalExpense).toBe(72700);
    });
  });

  describe('Interest-Free Installment Parsing & Multi-Month Scheduling (무이자 할부 분할 파싱)', () => {
    it('detects interest-free installment metadata accurately with detectInstallment', () => {
      const input = '삼성카드로 옥션에서 삼성 갤럭시북 180만 원 무이자 할부 10개월 구입';
      const parsed = detectInstallment(input, 1800000);

      expect(parsed).not.toBeNull();
      expect(parsed!.totalMonths).toBe(10);
      expect(parsed!.monthlyAmount).toBe(180000);
      expect(parsed!.remainder).toBe(0);
      expect(parsed!.isInterestFree).toBe(true);
      expect(parsed!.totalAmount).toBe(1800000);
    });

    it('calculates monthly amount and remainder correctly when not evenly divisible', () => {
      // 100,000 KRW divided by 3 months -> 33,333 KRW/month, remainder 1 KRW
      const parsed = detectInstallment('3개월 무이자 할부', 100000);

      expect(parsed).not.toBeNull();
      expect(parsed!.totalMonths).toBe(3);
      expect(parsed!.monthlyAmount).toBe(33333);
      expect(parsed!.remainder).toBe(1);
      expect(parsed!.isInterestFree).toBe(true);
    });

    it('detects standard interest-bearing installment as isInterestFree = false', () => {
      const parsed = detectInstallment('현대카드로 6개월 할부 결제', 600000);

      expect(parsed).not.toBeNull();
      expect(parsed!.totalMonths).toBe(6);
      expect(parsed!.monthlyAmount).toBe(100000);
      expect(parsed!.remainder).toBe(0);
      expect(parsed!.isInterestFree).toBe(false);
    });

    it('detects 0% and 수수료 없음 variations as interest-free', () => {
      const zeroPercent = detectInstallment('아이패드 120만원 12개월 0% 할부', 1200000);
      expect(zeroPercent).not.toBeNull();
      expect(zeroPercent!.isInterestFree).toBe(true);
      expect(zeroPercent!.totalMonths).toBe(12);

      const feeFree = detectInstallment('다이슨 드라이기 50만원 수수료 없는 5개월 할부', 500000);
      expect(feeFree).not.toBeNull();
      expect(feeFree!.isInterestFree).toBe(true);
      expect(feeFree!.totalMonths).toBe(5);
    });

    it('returns null for single lump-sum payments or non-installment phrases', () => {
      expect(detectInstallment('스타벅스 아메리카노 4500원 일시불', 4500)).toBeNull();
      expect(detectInstallment('이마트 장보기 100000원 결제', 100000)).toBeNull();
      expect(detectInstallment('10개월 헬스장 이용권 60만원 결제', 600000)).toBeNull();
    });

    it('splits "삼성카드로 옥션에서 삼성 갤럭시북 180만 원 무이자 할부 10개월 구입" into 10 discrete scheduled transactions', () => {
      const prompt = '삼성카드로 옥션에서 삼성 갤럭시북 180만 원 무이자 할부 10개월 구입';
      const results = parseFinancialInputDeterministically(prompt);

      // Must NOT log a single lump-sum 1,800,000 KRW expense
      expect(results).toHaveLength(10);

      // All 10 transactions must share the same groupId
      const sharedGroupId = results[0].groupId;
      expect(sharedGroupId).toBeDefined();
      expect(results.every(t => t.groupId === sharedGroupId)).toBe(true);

      // Total sum of all 10 transactions must equal 1,800,000 KRW
      const sum = results.reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBe(1800000);

      // Verify each discrete month
      results.forEach((tx, idx) => {
        const monthNum = idx + 1;
        expect(tx.type).toBe('EXPENSE');
        expect(tx.amount).toBe(180000);
        expect(tx.currency).toBe('KRW');
        expect(tx.paymentMethod).toBe('삼성카드');
        expect(tx.originalTotal).toBe(1800000);

        // Description check: [Merchant/Item] (${i}/${N}회차 · 무이자)
        expect(tx.description).toContain(`${monthNum}/10회차 · 무이자`);

        // Installment metadata verification
        expect(tx.installment).toBeDefined();
        expect(tx.installment!.totalMonths).toBe(10);
        expect(tx.installment!.currentMonth).toBe(monthNum);
        expect(tx.installment!.totalAmount).toBe(1800000);
        expect(tx.installment!.monthlyAmount).toBe(180000);
        expect(tx.installment!.isInterestFree).toBe(true);
      });

      // Verify dates are incremented monthly: Month 1 is today, Month 2 is +1 month, etc.
      const d1 = new Date(results[0].date);
      const d2 = new Date(results[1].date);
      const d10 = new Date(results[9].date);

      expect(d2.getMonth()).toBe((d1.getMonth() + 1) % 12);
      expect(d10.getMonth()).toBe((d1.getMonth() + 9) % 12);
    });

    it('handles remainder distribution in Month 1 for uneven divisions', () => {
      // 100,000 KRW over 3 months -> Month 1: 33,334 KRW, Month 2: 33,333 KRW, Month 3: 33,333 KRW
      const prompt = '신한카드로 10만원 3개월 무이자 할부 결제';
      const results = parseFinancialInputDeterministically(prompt);

      expect(results).toHaveLength(3);
      expect(results[0].amount).toBe(33334); // 33333 + 1
      expect(results[1].amount).toBe(33333);
      expect(results[2].amount).toBe(33333);

      const total = results.reduce((acc, t) => acc + t.amount, 0);
      expect(total).toBe(100000);

      expect(results[0].installment!.currentMonth).toBe(1);
      expect(results[1].installment!.currentMonth).toBe(2);
      expect(results[2].installment!.currentMonth).toBe(3);
      expect(results[0].installment!.totalAmount).toBe(100000);
    });
  });

  describe('Overdraft Account (마이너스 통장 / 한도대출) Parser Suite', () => {
    it('parses signed negative Korean amounts', () => {
      expect(parseKoreanAmount('-350만원')).toBe(-3500000);
      expect(parseKoreanAmount('-350만')).toBe(-3500000);
      expect(parseKoreanAmount('-3,500,000원')).toBe(-3500000);
      expect(parseKoreanAmount('잔액 -350만원')).toBe(-3500000);
      expect(parseKoreanAmount('-$35')).toBe(-35);
    });

    it('parses negative balance entry: "신한 마통 잔액 -350만원"', () => {
      const results = parseFinancialInputDeterministically('신한 마통 잔액 -350만원');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.isOverdraft).toBe(true);
      expect(res.currentBalance).toBe(-3500000);
      expect(res.amount).toBe(3500000);
      expect(res.isInternalTransfer).toBe(true);
    });

    it('parses overdraft usage: "마이너스 통장 200만원 사용"', () => {
      const results = parseFinancialInputDeterministically('마이너스 통장 200만원 사용');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.isOverdraft).toBe(true);
      expect(res.type).toBe('EXPENSE');
      expect(res.amount).toBe(2000000);
      expect(res.subCategory).toBe('마이너스대출 사용');
    });

    it('parses deposit: "마통에 100만원 입금"', () => {
      const results = parseFinancialInputDeterministically('마통에 100만원 입금');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.isOverdraft).toBe(true);
      expect(res.type).toBe('TRANSFER');
      expect(res.amount).toBe(1000000);
      expect(res.subCategory).toBe('마이너스대출 상환');
      expect(res.isInternalTransfer).toBe(true);
    });

    it('parses repayment: "마통 상환 50만원"', () => {
      const results = parseFinancialInputDeterministically('마통 상환 50만원');
      expect(results).toHaveLength(1);
      const res = results[0];
      expect(res.isOverdraft).toBe(true);
      expect(res.type).toBe('TRANSFER');
      expect(res.amount).toBe(500000);
      expect(res.subCategory).toBe('마이너스대출 상환');
      expect(res.isInternalTransfer).toBe(true);
    });
  });
});
