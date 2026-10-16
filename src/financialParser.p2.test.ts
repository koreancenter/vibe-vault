import type { Transaction } from './types';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import {
  planPeerDebtUpdate,
  findRefundTarget,
  buildLinkedRefund,
  extractUnequalSplit,
  parseFinancialText,
  parseFinancialInputDeterministically,
  parseFinancialTextWithGeminiFallback,
  parseKoreanAmount
} from './financialParser';

describe('P2: 한글 숫자 / 자기정정 / 타인 결제 / 대여', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterAll(() => vi.useRealTimers());

  it.each([
    ['4천5백원', 4500],
    ['이만오천원', 25000],
    ['십만원', 100000],
    ['1억 2천만원', 120000000],
    ['70만원', 700000],
    ['구원 5천원', 5000]
  ])('금액 파싱: %s → %i', (input, expected) => {
    expect(parseKoreanAmount(input)).toBe(expected);
  });

  const CASES: Array<{ id: string; input: string; expected: Array<Record<string, unknown>> }> = [
    { id: 'P2-01', input: '치킨 ㅇㅇ원... 아 2만원 아니다 3만원', expected: [{ type: 'EXPENSE', amount: 30000 }] },
    { id: 'P2-02', input: '저녁 10만원 3명 나눔', expected: [{ type: 'EXPENSE', amount: 33333 }] },
    {
      id: 'P2-03',
      input: '커피 4500 점심 9000 저녁 12000',
      expected: [{ amount: 4500 }, { amount: 9000 }, { amount: 12000 }]
    },
    { id: 'P2-04', input: '민수가 밥값 2만원 냈어', expected: [{ type: 'TRANSFER', amount: 20000, peerDebt: { counterparty: '민수', direction: 'PAYABLE', debtOnly: true } }] },
    { id: 'P2-05', input: '내가 밥값 2만원 냈어', expected: [{ type: 'EXPENSE', amount: 20000 }] },
    { id: 'P2-06', input: '민수한테 2만원 빌려줌', expected: [{ type: 'TRANSFER', amount: 20000, subCategory: '대여금', isInternalTransfer: true }] },
    { id: 'P2-07', input: '민수한테 2만원 갚음', expected: [{ type: 'TRANSFER', amount: 20000, subCategory: '채무 상환' }] },
    { id: 'P2-08', input: '카드값 50만원 결제', expected: [{ type: 'TRANSFER', amount: 500000 }] },
    { id: 'P2-09', input: '0원 커피', expected: [] }
  ];

  it.each(CASES)('[$id] $input', ({ input, expected }) => {
    const results = parseFinancialInputDeterministically(input);
    expect(results).toHaveLength(expected.length);
    expected.forEach((exp, i) => expect(results[i]).toMatchObject(exp));
  });
});

describe('폴백 경로: AI 응답이 비정상이어도 장부가 오염되지 않는다', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const mockFetch = (impl: () => Promise<Partial<Response>>) => {
    globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
  };
  const jsonResponse = (body: unknown, ok = true) => async () => ({ ok, json: async () => body });

  it('정상 AI 응답은 그대로 사용', async () => {
    mockFetch(jsonResponse({ items: [{ date: '2026-10-14', type: 'expense', amount: 4500, currency: 'KRW', category: '식비', merchant: '커피' }] }));
    const items = await parseFinancialTextWithGeminiFallback('커피 4500원');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ amount: 4500, date: '2026-10-14' });
  });

  it('네트워크 오류 → 로컬 파서로 폴백', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    const items = await parseFinancialTextWithGeminiFallback('커피 4,500원');
    expect(items[0]).toMatchObject({ amount: 4500 });
  });

  it('HTTP 500 → 로컬 파서로 폴백', async () => {
    mockFetch(jsonResponse({}, false));
    const items = await parseFinancialTextWithGeminiFallback('점심 9,000원');
    expect(items[0]).toMatchObject({ amount: 9000 });
  });

  it('금액 0 / NaN / 음수 / 문자열 항목은 걸러낸다', async () => {
    mockFetch(jsonResponse({ items: [{ amount: 0 }, { amount: 'abc' }, { amount: null }, { amount: -5000, type: 'expense', merchant: '환불' }] }));
    const items = await parseFinancialTextWithGeminiFallback('커피 4,500원');
    // 유효 항목은 절댓값 처리된 -5000 한 건뿐
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(5000);
  });

  it('전 항목이 비정상이면 로컬 파서로 폴백', async () => {
    mockFetch(jsonResponse({ items: [{ amount: 0 }, { amount: 'x' }] }));
    const items = await parseFinancialTextWithGeminiFallback('커피 4,500원');
    expect(items[0]).toMatchObject({ amount: 4500 });
  });

  it('지원하지 않는 통화/잘못된 날짜는 기본값으로 정규화', async () => {
    mockFetch(jsonResponse({ items: [{ amount: 10, currency: 'XYZ', date: 'not-a-date', type: 'weird' }] }));
    const items = await parseFinancialTextWithGeminiFallback('x 10', undefined, 'KRW');
    expect(items[0]).toMatchObject({ currency: 'KRW', type: 'expense' });
    expect(items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('transactions 키로 응답해도 검증을 거친다', async () => {
    mockFetch(jsonResponse({ transactions: [{ type: 'INCOME', amount: 50000, date: '2026-10-15T00:00:00Z', currency: 'KRW' }] }));
    const items = await parseFinancialTextWithGeminiFallback('용돈');
    expect(items[0]).toMatchObject({ type: 'income', amount: 50000, date: '2026-10-15' });
  });
});

describe('비균등 분할 / 타인 결제 채무 / 환불', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterAll(() => vi.useRealTimers());

  it.each([
    ['민수가 2만원 더 먹음 저녁 10만원 반반', 40000],
    ['내가 2만원 더 먹음 저녁 10만원 반반', 60000],
    ['저녁 9만원 내가 3 민수 6으로 나눔', 30000],
    ['저녁 10만원 7:3으로 나눔', 70000]
  ])('비균등 분할 내 부담분: %s → %i', (input, share) => {
    expect(extractUnequalSplit(input)?.userShare).toBe(share);
    const r = parseFinancialInputDeterministically(input);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'EXPENSE', amount: share });
    expect(r[0].splitInfo?.total).toBeGreaterThan(share);
  });

  it('누구 몫인지 알 수 없는 비율은 추측하지 않고 질문한다', () => {
    const r = parseFinancialInputDeterministically('저녁 9만원 민수 7 영희 3으로 나눔');
    expect(r).toHaveLength(1);
    expect(r[0].clarification).toContain('내 부담 비율');
  });

  it('환불은 급여가 아닌 환불 수입', () => {
    const r = parseFinancialInputDeterministically('환불 3만원 받음');
    expect(r[0]).toMatchObject({ type: 'INCOME', amount: 30000, subCategory: 'Refund' });
  });

  it('문장형 파서는 타인 결제/대여를 지출로 만들지 않는다', () => {
    expect(parseFinancialText('민수가 밥값 2만원 냈어')).toHaveLength(0);
    expect(parseFinancialText('민수한테 2만원 빌려줌')).toHaveLength(0);
  });

  it('planPeerDebtUpdate: 신규 생성 / 누적 / 상환', () => {
    const created = planPeerDebtUpdate({ counterparty: '민수', direction: 'PAYABLE', amount: 20000, debtOnly: true }, [])!;
    expect(created).toMatchObject({ type: 'LOAN_PAYABLE', remainingPrincipal: 20000, isActive: true });

    const grown = planPeerDebtUpdate({ counterparty: '민수', direction: 'PAYABLE', amount: 10000, debtOnly: true }, [created])!;
    expect(grown.id).toBe(created.id);
    expect(grown.remainingPrincipal).toBe(30000);

    const repaid = planPeerDebtUpdate({ counterparty: '민수', direction: 'REPAYMENT', amount: 50000, debtOnly: false }, [grown])!;
    expect(repaid).toMatchObject({ remainingPrincipal: 0, isActive: false });

    expect(planPeerDebtUpdate({ counterparty: '영희', direction: 'REPAYMENT', amount: 1000, debtOnly: false }, [])).toBeNull();
    const lent = planPeerDebtUpdate({ counterparty: '영희', direction: 'RECEIVABLE', amount: 20000, debtOnly: false }, [])!;
    expect(lent.type).toBe('LOAN_RECEIVABLE');
  });
});

describe('환불 ↔ 원거래 연결', () => {
  const tx = (o: Partial<Transaction>): Transaction => ({
    id: 'x', type: 'EXPENSE', amount: 1000, currency: 'KRW', category: 'Living', description: '', date: '2026-10-10T00:00:00.000Z', ...o
  });
  const shoes = tx({ id: 'shoes', amount: 89000, description: '나이키 신발', category: 'Living', date: '2026-10-05T00:00:00.000Z' });
  const coffee = tx({ id: 'coffee', amount: 4500, description: '스타벅스 커피', category: 'Food' });

  it('키워드가 겹치면 원거래에 연결', () => {
    expect(findRefundTarget({ amount: 89000, text: '신발 환불 8만9천원 받음' }, [coffee, shoes])?.id).toBe('shoes');
  });

  it('부분 환불도 허용하되 원금을 초과할 수 없다', () => {
    expect(findRefundTarget({ amount: 30000, text: '신발 환불 3만원' }, [shoes])?.id).toBe('shoes');
    expect(findRefundTarget({ amount: 90000, text: '신발 환불' }, [shoes])).toBeNull();
  });

  it('이미 환불된 금액은 남은 한도에서 차감', () => {
    const prior = tx({ id: 'r1', type: 'EXPENSE', amount: -80000, refundOfId: 'shoes' });
    expect(findRefundTarget({ amount: 20000, text: '신발 환불' }, [shoes, prior])).toBeNull();
    expect(findRefundTarget({ amount: 9000, text: '신발 환불' }, [shoes, prior])?.id).toBe('shoes');
  });

  it('단서가 없거나 통화가 다르면 연결하지 않는다', () => {
    expect(findRefundTarget({ amount: 1234, text: '환불 1234원' }, [shoes, coffee])).toBeNull();
    expect(findRefundTarget({ amount: 89000, text: '신발 환불', currency: 'USD' }, [shoes])).toBeNull();
  });

  it('동점 후보가 둘이면 추측하지 않는다', () => {
    const a = tx({ id: 'a', amount: 5000, description: '커피', date: '2026-10-10T00:00:00.000Z' });
    const b = tx({ id: 'b', amount: 5000, description: '커피', date: '2026-10-10T00:00:00.000Z' });
    expect(findRefundTarget({ amount: 5000, text: '커피 환불' }, [a, b])).toBeNull();
  });

  it('연결된 환불은 원거래 카테고리의 음수 지출로 저장되어 합계가 상쇄된다', () => {
    const refund = buildLinkedRefund(shoes, { amount: 30000, date: '2026-10-15T00:00:00.000Z', description: '신발 환불' });
    expect(refund).toMatchObject({ type: 'EXPENSE', amount: -30000, category: 'Living', refundOfId: 'shoes', subCategory: 'Refund' });
    expect(shoes.amount + refund.amount).toBe(59000);
  });
});
