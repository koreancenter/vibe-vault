import type {
  CurrencyCode,
  DebtItem,
  ParsedReceiptData,
  ReceiptItem,
} from './types';
import { cleanMerchantTitle } from './merchantSanitizer';
import { generateSecureId } from './identifiers';
import { anonymizeFinancialInput } from './piiSanitizer';
import {
  convertHangulNumerals,
  parseKoreanAmount,
  detectCreditCardSettlement,
  isAnalyticalQueryInput,
} from './finance/lightweightDetectors';
import {
  AI_CURRENCIES,
  EXPENSE_CUE_REGEX,
  INCOME_CUE_REGEX,
  OVERDRAFT_REGEX,
  REFUND_REGEX,
  type DutchPayModifier,
  type InstallmentDetectionResult,
  type OverdraftDetectionResult,
  type ParsedItem,
  type ParsedTransactionResult,
  type PeerDebtEvent,
  type RealtimePreviewData,
  type UnequalSplitInfo,
} from './parser/constants';
import {
  addMonthsToDate,
  cleanInstallmentItemTitle,
  dateToIsoTimestamp,
  detectCurrency,
  detectInstallment,
  detectPaymentMethod,
  extractCommonDate,
  extractExplicitDate,
  extractReceiptDateLocally,
  extractReceiptTotalAmountLocally,
  getTodayIsoDate,
  resolveExpenseDate,
  stripDateExpressions,
} from './parser/dateAndAmount';
import {
  applyDutchPayRule,
  applySelfCorrection,
  buildLinkedRefund,
  detectClarificationNeeded,
  detectLoanRepaymentNotification,
  detectOverdraftTransaction,
  detectPeerDebt,
  detectReceivableRecoveryNotification,
  extractDutchPayModifier,
  extractItemCategoryAndMerchant,
  extractPayer,
  extractUnequalSplit,
  findRefundTarget,
  inferCategoryAndMerchant,
  isPaidByThirdParty,
  normalizeTransactionCategory,
  planPeerDebtUpdate,
  splitIntoClauses,
} from './parser/categoryAndPayer';
import { parseQueryIntentLocally } from './parser/queryIntent';

// ---------------------------------------------------------------------------
// Public Barrel Re-Exports (100% Backward Compatibility)
// ---------------------------------------------------------------------------
export {
  anonymizeFinancialInput,
  convertHangulNumerals,
  parseKoreanAmount,
  detectCreditCardSettlement,
  isAnalyticalQueryInput,
  OVERDRAFT_REGEX,
  detectCurrency,
  detectPaymentMethod,
  getTodayIsoDate,
  extractCommonDate,
  stripDateExpressions,
  extractExplicitDate,
  detectInstallment,
  addMonthsToDate,
  cleanInstallmentItemTitle,
  extractReceiptDateLocally,
  extractReceiptTotalAmountLocally,
  inferCategoryAndMerchant,
  extractItemCategoryAndMerchant,
  normalizeTransactionCategory,
  extractPayer,
  splitIntoClauses,
  extractDutchPayModifier,
  applyDutchPayRule,
  applySelfCorrection,
  isPaidByThirdParty,
  detectPeerDebt,
  extractUnequalSplit,
  detectClarificationNeeded,
  planPeerDebtUpdate,
  findRefundTarget,
  buildLinkedRefund,
  detectOverdraftTransaction,
  detectLoanRepaymentNotification,
  detectReceivableRecoveryNotification,
  parseQueryIntentLocally,
};

export type {
  ParsedItem,
  PeerDebtEvent,
  UnequalSplitInfo,
  ParsedTransactionResult,
  OverdraftDetectionResult,
  InstallmentDetectionResult,
  DutchPayModifier,
  RealtimePreviewData,
};

// ---------------------------------------------------------------------------
// High-Level Orchestrators
// ---------------------------------------------------------------------------

/**
 * Parses financial natural language input into an array of ParsedItem objects.
 * Supports multi-item sentences and split-bill / Dutch-Pay arithmetic.
 */
export function parseFinancialText(text: string, baseCurrency = 'KRW'): ParsedItem[] {
  if (!text || !text.trim()) return [];

  const sanitized = applySelfCorrection(anonymizeFinancialInput(text));
  if (isPaidByThirdParty(sanitized) || detectPeerDebt(sanitized)) return [];
  const commonDate = extractCommonDate(sanitized);
  const commonCurrency = detectCurrency(sanitized) || baseCurrency;

  const clauses = splitIntoClauses(sanitized);

  // 1. Identify Dutch-Pay modifier clauses
  const dutchModifiers: DutchPayModifier[] = [];
  const candidateItemClauses: string[] = [];

  for (const clause of clauses) {
    const modifier = extractDutchPayModifier(clause);
    const isPureModifier = modifier && (
      clause.length <= 28 ||
      /식사비|밥값|회식비|커피값|비용|음식값/i.test(clause) ||
      !/(?:사먹|먹었|결제|구매|지출|샀음|쇼핑|구입)/i.test(clause.replace(/더치페이|엔빵|n빵|각자|반반/g, ''))
    );

    if (isPureModifier && modifier) {
      dutchModifiers.push(modifier);
    } else {
      candidateItemClauses.push(clause);
    }
  }

  const activeClauses = candidateItemClauses.length > 0 ? candidateItemClauses : clauses;
  const results: ParsedItem[] = [];

  for (const clause of activeClauses) {
    const rawParsed = parseKoreanAmount(stripDateExpressions(clause));
    if (!rawParsed) continue;
    const amount = Math.abs(rawParsed);
    if (amount <= 0) continue;

    // Overdraft account transaction
    const overdraftMatch = detectOverdraftTransaction(clause);
    if (overdraftMatch && overdraftMatch.amount > 0) {
      if (overdraftMatch.action === 'REPAYMENT') {
        results.push({
          date: commonDate,
          type: 'transfer',
          amount: overdraftMatch.amount,
          currency: commonCurrency,
          category: 'Fixed',
          merchant: overdraftMatch.description,
          note: '마이너스대출 상환',
          isOverdraft: true,
          overdraftLimit: overdraftMatch.overdraftLimit,
        });
        continue;
      } else {
        const isUsage = /(?:사용|인출|출금|씀|결제)/i.test(clause);
        results.push({
          date: commonDate,
          type: isUsage ? 'expense' : 'transfer',
          amount: overdraftMatch.amount,
          currency: commonCurrency,
          category: isUsage ? '생활/쇼핑' : 'Fixed',
          merchant: overdraftMatch.description,
          note: isUsage ? '마이너스대출 사용' : '마이너스대출 잔액',
          isOverdraft: true,
          currentBalance: overdraftMatch.currentBalance,
          overdraftLimit: overdraftMatch.overdraftLimit,
        });
        continue;
      }
    }

    // Item type: income vs transfer vs expense
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    const isIncome = INCOME_CUE_REGEX.test(clause) && !EXPENSE_CUE_REGEX.test(clause);
    const clauseCurrency: CurrencyCode = /(?:\d|[만천억])\s?원/.test(clause)
      ? 'KRW'
      : (detectCurrency(clause) !== 'KRW' ? detectCurrency(clause) : commonCurrency);
    const clauseDate = extractExplicitDate(clause) ?? commonDate;
    const cardSettlementMatch = detectCreditCardSettlement(clause);
    const isPurchase = /(?:순두부|찌개|식사|점심|저녁|커피|카페|스타벅스|마트|장보기|다이소|편의점|배달|치킨|피자|파스타|택시|주유|옷|신발|병원|약국)/i.test(clause);
    const isTransfer = (cardSettlementMatch !== null || /(?:자동이체|송금|적금|예금|청약|주택청약|저축|통장으로|계좌로|to\s*account|savings)/i.test(clause)) && !isPurchase;

    if (isIncome) {
      type = 'income';
    } else if (isTransfer) {
      type = 'transfer';
    }

    const { category, merchant } = extractItemCategoryAndMerchant(stripDateExpressions(clause), type);

    // Match Dutch-pay rule (inline or from separate modifier clause)
    const inlineModifier = extractDutchPayModifier(clause);
    let matchedModifier: DutchPayModifier | null = null;
    if (inlineModifier) {
      matchedModifier = inlineModifier;
    } else if (dutchModifiers.length > 0) {
      matchedModifier = dutchModifiers.find((dm) => {
        if (!dm.targetKeyword) return false;
        const target = dm.targetKeyword;
        return merchant.includes(target) ||
               target.includes(merchant) ||
               (target === '식사' && (category === '식비' || merchant.includes('식사')));
      }) || null;

      if (!matchedModifier) {
        matchedModifier = dutchModifiers.find((dm) => !dm.targetKeyword) || null;
      }
    }

    // Installment payment scheduling
    const inst = type === 'expense' ? detectInstallment(clause, amount) : null;
    if (inst && inst.totalMonths >= 2) {
      const cleanTitle = cleanInstallmentItemTitle(clause, merchant) || merchant;
      const tag = inst.isInterestFree ? '무이자' : '할부';
      for (let i = 1; i <= inst.totalMonths; i++) {
        const isFirst = i === 1;
        const curAmt = isFirst ? (inst.monthlyAmount + inst.remainder) : inst.monthlyAmount;
        const curDate = addMonthsToDate(commonDate, i - 1).slice(0, 10);
        results.push({
          date: curDate,
          type: 'expense',
          amount: curAmt,
          currency: commonCurrency,
          category,
          merchant: `${cleanTitle} (${i}/${inst.totalMonths}회차 · ${tag})`,
          note: `${cleanTitle} ${inst.totalAmount.toLocaleString()}원 (${inst.totalMonths}개월 ${tag})`,
          installmentMonths: inst.totalMonths,
          isInterestFree: inst.isInterestFree,
          totalAmount: inst.totalAmount,
        });
      }
      continue;
    }

    // Dutch-pay arithmetic
    let finalAmount = amount;
    let note: string | undefined = undefined;
    if (type === 'expense' && matchedModifier) {
      const resolved = applyDutchPayRule(amount, merchant, category, matchedModifier);
      finalAmount = resolved.amount;
      note = resolved.note;
    }

    results.push({
      date: type === 'expense' ? resolveExpenseDate(clause, clauseDate) : clauseDate,
      type,
      amount: finalAmount,
      currency: clauseCurrency,
      category,
      merchant,
      note,
    });
  }

  // Fallback if no clause matched but whole text still carries an amount
  if (results.length === 0) {
    const rawAmt = parseKoreanAmount(stripDateExpressions(sanitized));
    if (!rawAmt) return results;
    const isInc = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었/i.test(sanitized) && !EXPENSE_CUE_REGEX.test(sanitized);
    const rawType = isInc ? 'income' : 'expense';
    const { category, merchant } = extractItemCategoryAndMerchant(stripDateExpressions(sanitized), rawType);

    results.push({
      date: commonDate,
      type: rawType,
      amount: Math.abs(rawAmt),
      currency: commonCurrency,
      category,
      merchant,
    });
  }

  return results;
}

/**
 * LLM output is untrusted: drop items without a positive finite amount and
 * normalize type, currency and date so bad AI output never reaches the ledger.
 */
function sanitizeAiItem(t: any, baseCurrency: string): ParsedItem | null {
  const amount = Math.abs(Number(t?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rawType = String(t?.type ?? '').toLowerCase();
  const type = rawType === 'income' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense';
  const currency = AI_CURRENCIES.includes(String(t?.currency).toUpperCase()) ? String(t.currency).toUpperCase() : baseCurrency;
  const dateStr = typeof t?.date === 'string' ? t.date.slice(0, 10) : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(Date.parse(dateStr)) ? dateStr : getTodayIsoDate();
  return {
    date,
    type,
    amount,
    currency,
    category: t.category || '생활/쇼핑',
    merchant: t.merchant || t.description || '지출',
    note: t.note,
  };
}

/**
 * Fallback parser using Gemini API when enabled.
 */
export async function parseFinancialTextWithGeminiFallback(
  text: string,
  apiKey?: string,
  baseCurrency = 'KRW'
): Promise<ParsedItem[]> {
  try {
    if (typeof fetch !== 'undefined') {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          engineConfig: apiKey ? { engineType: 'byok', provider: 'gemini', apiKey } : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawItems: any[] = Array.isArray(data.items) && data.items.length > 0
          ? data.items
          : Array.isArray(data.transactions) ? data.transactions : [];
        const validItems = rawItems
          .map((t) => sanitizeAiItem(t, baseCurrency))
          .filter((item): item is ParsedItem => item !== null);
        if (validItems.length > 0) return validItems;
      }
    }
  } catch (err) {
    console.warn('Gemini API fetch error, falling back to local deterministic:', err);
  }

  return parseFinancialText(text, baseCurrency);
}

/**
 * Parses full natural language string deterministically into structured transactions.
 */
export function parseFinancialInputDeterministically(rawPrompt: string, debts: DebtItem[] = []): ParsedTransactionResult[] {
  const now = new Date().toISOString();
  const sanitized = applySelfCorrection(anonymizeFinancialInput(rawPrompt));
  const currency = detectCurrency(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized);
  const results: ParsedTransactionResult[] = [];
  const payer = extractPayer(sanitized);

  const finalize = (list: ParsedTransactionResult[]): ParsedTransactionResult[] => {
    if (payer) {
      for (const item of list) {
        if (!item.paidBy) item.paidBy = payer;
      }
    }
    return list;
  };

  const clarification = detectClarificationNeeded(sanitized);
  if (clarification) {
    return finalize([{ type: 'EXPENSE', amount: 0, currency, category: 'Living', description: '확인 필요', date: now, clarification, rawClause: sanitized }]);
  }

  const peer = detectPeerDebt(sanitized);
  if (peer) {
    const peerDate = dateToIsoTimestamp(extractCommonDate(sanitized));
    if (peer.debtOnly) {
      return [{
        type: 'TRANSFER',
        amount: peer.amount,
        currency,
        category: 'Fixed',
        subCategory: '타인 대신 결제',
        description: `${peer.counterparty}님이 결제한 ${peer.amount.toLocaleString()}원 (갚을 돈)`,
        date: peerDate,
        paymentMethod,
        isInternalTransfer: true,
        peerDebt: peer,
        confidenceScore: 0.9,
        rawClause: sanitized,
      }];
    }
    const label = peer.direction === 'RECEIVABLE' ? '대여금' : peer.direction === 'PAYABLE' ? '차입금' : '채무 상환';
    return [{
      type: 'TRANSFER',
      amount: peer.amount,
      currency,
      category: 'Fixed',
      subCategory: label,
      description: sanitized.replace(/\s+/g, ' ').trim(),
      date: peerDate,
      paymentMethod,
      isInternalTransfer: true,
      peerDebt: peer,
      confidenceScore: 0.9,
      rawClause: sanitized,
    }];
  }

  const unequal = extractUnequalSplit(sanitized);
  if (unequal) {
    const { category, subCategory, merchant, confidence } = inferCategoryAndMerchant(stripDateExpressions(sanitized));
    return [{
      type: 'EXPENSE',
      amount: unequal.userShare,
      currency,
      category,
      subCategory,
      description: merchant || '더치페이 지출',
      merchant,
      date: dateToIsoTimestamp(extractCommonDate(sanitized)),
      paymentMethod,
      originalTotal: unequal.total,
      splitInfo: unequal,
      note: `총 ${unequal.total.toLocaleString()}원 중 내 부담 ${unequal.userShare.toLocaleString()}원 (비균등 분할)`,
      confidenceScore: confidence,
      rawClause: sanitized,
    }];
  }

  if (REFUND_REGEX.test(sanitized) && !EXPENSE_CUE_REGEX.test(sanitized)) {
    const refundAmount = parseKoreanAmount(stripDateExpressions(sanitized));
    if (refundAmount && refundAmount > 0) {
      return [{
        type: 'INCOME',
        amount: Math.abs(refundAmount),
        currency,
        category: 'Living',
        subCategory: 'Refund',
        description: cleanMerchantTitle(stripDateExpressions(sanitized), '환불'),
        date: dateToIsoTimestamp(extractCommonDate(sanitized)),
        paymentMethod: detectPaymentMethod(sanitized, true),
        confidenceScore: 0.9,
        rawClause: sanitized,
      }];
    }
  }

  // 0. Overdraft account notification & usage
  const overdraftMatch = detectOverdraftTransaction(sanitized);
  if (overdraftMatch && overdraftMatch.amount > 0) {
    if (overdraftMatch.action === 'REPAYMENT') {
      results.push({
        type: 'TRANSFER',
        amount: overdraftMatch.amount,
        currency,
        category: 'Fixed',
        subCategory: '마이너스대출 상환',
        description: overdraftMatch.description,
        date: now,
        paymentMethod: overdraftMatch.accountName || '계좌이체',
        isInternalTransfer: true,
        isOverdraft: true,
        overdraftLimit: overdraftMatch.overdraftLimit,
        confidenceScore: 0.98,
        rawClause: sanitized,
      });
      return results;
    } else {
      const isUsage = /(?:사용|인출|출금|씀|결제)/i.test(sanitized);
      results.push({
        type: isUsage ? 'EXPENSE' : 'TRANSFER',
        amount: overdraftMatch.amount,
        currency,
        category: isUsage ? 'Living' : 'Fixed',
        subCategory: isUsage ? '마이너스대출 사용' : '마이너스대출 잔액',
        description: overdraftMatch.description,
        merchant: overdraftMatch.accountName,
        date: now,
        paymentMethod: overdraftMatch.accountName || paymentMethod,
        isInternalTransfer: !isUsage,
        isOverdraft: true,
        currentBalance: overdraftMatch.currentBalance,
        overdraftLimit: overdraftMatch.overdraftLimit,
        confidenceScore: 0.98,
        rawClause: sanitized,
      });
      return results;
    }
  }

  // A. Loan repayment notification (principal vs interest split)
  const loanRepayment = detectLoanRepaymentNotification(sanitized, debts);
  if (loanRepayment && loanRepayment.totalPayment > 0) {
    const groupId = generateSecureId('loan-split');
    if (loanRepayment.principal > 0) {
      results.push({
        type: 'TRANSFER',
        amount: loanRepayment.principal,
        currency: loanRepayment.suggestion.currency,
        category: 'Fixed',
        subCategory: '원금상환',
        description: `${loanRepayment.debt?.name || '대출'} 원금 상환`,
        date: now,
        paymentMethod: loanRepayment.debt?.counterpartyOrBank || paymentMethod,
        isInternalTransfer: true,
        groupId,
        confidenceScore: 0.98,
        rawClause: sanitized,
        loanSplitSuggestion: loanRepayment.suggestion,
      });
    }
    if (loanRepayment.interest > 0) {
      results.push({
        type: 'EXPENSE',
        amount: loanRepayment.interest,
        currency: loanRepayment.suggestion.currency,
        category: 'Fixed',
        subCategory: '대출이자',
        description: `${loanRepayment.debt?.name || '대출'} 이자 비용`,
        date: now,
        paymentMethod: loanRepayment.debt?.counterpartyOrBank || paymentMethod,
        isInternalTransfer: false,
        groupId,
        confidenceScore: 0.98,
        rawClause: sanitized,
        loanSplitSuggestion: loanRepayment.suggestion,
      });
    }
    return results;
  }

  // B. Context-aware receivable recovery matching
  const receivableRecovery = detectReceivableRecoveryNotification(sanitized, debts);
  if (receivableRecovery && receivableRecovery.recoveredAmount > 0) {
    results.push({
      type: 'SETTLEMENT',
      amount: receivableRecovery.recoveredAmount,
      currency: receivableRecovery.suggestion.currency,
      category: 'Fixed',
      subCategory: '대여금회수',
      description: `${receivableRecovery.debt.name} 상환 입금 (${receivableRecovery.debt.counterpartyOrBank})`,
      date: now,
      paymentMethod: '계좌이체',
      originalTotal: receivableRecovery.debt.originalPrincipal,
      isInternalTransfer: true,
      confidenceScore: 0.98,
      rawClause: sanitized,
      receivableRecoverySuggestion: receivableRecovery.suggestion,
    });
    return results;
  }

  // C. Credit card settlement deduplication
  const cardSettlement = detectCreditCardSettlement(sanitized);
  if (cardSettlement) {
    const amount = cardSettlement.amount || parseKoreanAmount(sanitized) || 0;
    if (amount > 0) {
      results.push({
        type: 'TRANSFER',
        amount,
        currency,
        category: 'Fixed',
        subCategory: '카드대금 납부',
        description: cardSettlement.description,
        date: now,
        paymentMethod: cardSettlement.cardName,
        isInternalTransfer: true,
        confidenceScore: 0.98,
        rawClause: sanitized,
      });
      return results;
    }
  }

  // D. Interest-free / installment multi-month scheduling
  const fullAmount = parseKoreanAmount(sanitized) || 0;
  const directInstallment = detectInstallment(sanitized, fullAmount);
  if (directInstallment && directInstallment.totalMonths >= 2 && directInstallment.totalAmount > 0) {
    const groupId = generateSecureId('installment');
    const { category: infCategory, subCategory: infSubCategory, merchant: infMerchant, confidence } = inferCategoryAndMerchant(sanitized);
    const itemTitle = cleanInstallmentItemTitle(sanitized, infMerchant) || infMerchant || '할부 구매';
    const tag = directInstallment.isInterestFree ? '무이자' : '할부';
    const finalPaymentMethod = detectPaymentMethod(sanitized, false);

    for (let i = 1; i <= directInstallment.totalMonths; i++) {
      const isFirstMonth = i === 1;
      const monthAmount = isFirstMonth
        ? (directInstallment.monthlyAmount + directInstallment.remainder)
        : directInstallment.monthlyAmount;
      const txDate = addMonthsToDate(now, i - 1);
      const desc = `${itemTitle} (${i}/${directInstallment.totalMonths}회차 · ${tag})`;

      results.push({
        type: 'EXPENSE',
        amount: monthAmount,
        currency,
        category: infCategory || 'Living',
        subCategory: infSubCategory || 'Shopping',
        description: desc,
        merchant: itemTitle,
        date: txDate,
        paymentMethod: finalPaymentMethod,
        groupId,
        originalTotal: directInstallment.totalAmount,
        confidenceScore: confidence || 0.98,
        rawClause: sanitized,
        installment: {
          totalMonths: directInstallment.totalMonths,
          currentMonth: i,
          totalAmount: directInstallment.totalAmount,
          monthlyAmount: directInstallment.monthlyAmount,
          isInterestFree: directInstallment.isInterestFree,
        },
      });
    }
    return results;
  }

  // 1. Dutch Pay / Settlement reimbursement
  const isDutch = /더치페이|더치|n빵|엔빵|정산|반띵|각자|dutch|split|settle/i.test(sanitized);
  const isReceivedSettlement = /받음|입금됨|돌려받|받았다|got\s*back|received/i.test(sanitized);

  if (isDutch && isReceivedSettlement) {
    const parts = sanitized.split(/(?:하고|한\s*후|후|and|,|then)/i);
    let totalBill: number | null = null;
    let settledAmount: number | null = null;

    if (parts.length >= 2) {
      totalBill = parseKoreanAmount(parts[0]);
      settledAmount = parseKoreanAmount(parts[1]);
    }

    if (!totalBill || !settledAmount) {
      const matches = sanitized.match(/(?:\d+(?:\.\d+)?\s*(?:억|만|천|k|m|원|\$|€|¥|₩)?)/gi) || [];
      const parsedAmounts = matches
        .map((m) => parseKoreanAmount(m))
        .filter((val): val is number => typeof val === 'number' && val > 0);

      if (parsedAmounts.length >= 2) {
        totalBill = Math.max(parsedAmounts[0], parsedAmounts[1]);
        settledAmount = Math.min(parsedAmounts[0], parsedAmounts[1]);
      }
    }

    if (totalBill && settledAmount) {
      const { category, subCategory, merchant, confidence } = inferCategoryAndMerchant(sanitized);
      const groupId = generateSecureId('dutch');
      const descPart = sanitized
        .replace(/(?:민수랑|철수랑|영희랑|친구랑|더치페이하고|더치페이|토스로|카카오페이로|\d+(?:\.\d+)?\s*(?:만원|만|천원|천|원|k|m)|받음|정산받음)/gi, '')
        .trim();
      const cleanDesc = descPart || merchant || '더치페이 식사';

      results.push({
        type: 'EXPENSE',
        amount: totalBill,
        currency,
        category,
        subCategory,
        description: cleanDesc,
        merchant,
        date: now,
        paymentMethod,
        groupId,
        originalTotal: totalBill,
        confidenceScore: confidence,
        rawClause: sanitized,
      });

      const settlementMethod = /토스/i.test(sanitized) ? 'Toss' : /카카오/i.test(sanitized) ? 'Kakao Pay' : paymentMethod;
      results.push({
        type: 'SETTLEMENT',
        amount: settledAmount,
        currency,
        category,
        subCategory,
        description: `더치페이 정산 (${cleanDesc})`,
        merchant,
        date: now,
        paymentMethod: settlementMethod,
        groupId,
        originalTotal: totalBill,
        confidenceScore: confidence,
        rawClause: sanitized,
      });

      return results;
    }
  }

  // 2. Salary / Income
  const isIncome = INCOME_CUE_REGEX.test(sanitized);
  const notExpense = !EXPENSE_CUE_REGEX.test(sanitized);
  const amountText = stripDateExpressions(sanitized);
  const detectedAmount = parseKoreanAmount(amountText);

  if (isIncome && notExpense && detectedAmount) {
    let desc = '급여 / 수입';
    if (/월급/i.test(sanitized)) desc = /오늘/i.test(sanitized) ? '오늘 월급' : '이번 달 월급';
    else if (/용돈/i.test(sanitized)) desc = '용돈 입금';
    else if (/보너스|상여/i.test(sanitized)) desc = '보너스/상여금';
    else if (/배당/i.test(sanitized)) desc = '배당금';
    else if (/알바/i.test(sanitized)) desc = '아르바이트 급여';
    else if (/들어옴|입금/i.test(sanitized)) desc = '수입 입금';

    results.push({
      type: 'INCOME',
      amount: detectedAmount,
      currency,
      category: '급여',
      subCategory: '정기수입',
      description: desc,
      date: now,
      paymentMethod: detectPaymentMethod(sanitized, true),
      confidenceScore: 0.98,
      rawClause: sanitized,
    });
    return results;
  }

  // 3. Transfers / Savings
  const isPurchaseItem = /(?:순두부|찌개|식사|점심|저녁|커피|카페|스타벅스|마트|장보기|다이소|편의점|배달|치킨|피자|파스타|택시|주유|옷|신발|병원|약국|화장지|영양제)/i.test(sanitized);
  const isPureTransfer = /(?:자동이체|송금|적금|예금|청약|주택청약|저축|통장으로|계좌로|에게\s*이체|to\s*account|savings)/i.test(sanitized);
  const isGenericTransfer = /(?:이체|transfer|wire)/i.test(sanitized) && !isPurchaseItem && notExpense;

  if ((isPureTransfer || isGenericTransfer) && !isPurchaseItem && detectedAmount) {
    let desc = '계좌 이체 / 저축';
    if (/청약/i.test(sanitized)) desc = '주택청약 납입';
    else if (/적금/i.test(sanitized)) desc = '적금 저축';
    else if (/송금/i.test(sanitized)) desc = '계좌 송금';

    results.push({
      type: 'TRANSFER',
      amount: detectedAmount,
      currency,
      category: 'Fixed',
      subCategory: 'Savings',
      description: desc,
      date: now,
      paymentMethod: '계좌이체',
      isInternalTransfer: true,
      confidenceScore: 0.95,
      rawClause: sanitized,
    });
    return results;
  }

  // 4. Multi-item clauses and Dutch-Pay arithmetic via parseFinancialText
  const parsedItems = parseFinancialText(sanitized, currency);
  if (parsedItems.length > 1 || (parsedItems.length === 1 && (parsedItems[0].note || /더치페이|엔빵|n빵|각자|반반|반띵/i.test(sanitized)))) {
    for (const item of parsedItems) {
      let mappedCategory = 'Living';
      let mappedSubCategory = 'General';

      if (item.category.includes('식비') || item.category === 'Food') {
        mappedCategory = 'Food';
        mappedSubCategory = 'Dining';
      } else if (item.category.includes('카페') || item.category.includes('간식')) {
        mappedCategory = 'Food';
        mappedSubCategory = 'Cafe';
      } else if (item.category.includes('교통') || item.category === 'Transport') {
        mappedCategory = 'Transport';
        mappedSubCategory = 'Public Transport';
      } else if (item.category.includes('생활') || item.category.includes('쇼핑') || item.category === 'Living') {
        mappedCategory = 'Living';
        mappedSubCategory = 'Shopping';
      } else if (item.category.includes('의료') || item.category.includes('건강') || item.category === 'Health') {
        mappedCategory = 'Health';
        mappedSubCategory = 'Medical';
      } else if (item.category.includes('문화') || item.category.includes('여가') || item.category === 'Leisure') {
        mappedCategory = 'Leisure';
        mappedSubCategory = 'Entertainment';
      } else if (item.category.includes('주거') || item.category.includes('통신') || item.category === 'Fixed') {
        mappedCategory = 'Fixed';
        mappedSubCategory = 'Utilities';
      } else if (item.category.includes('급여') || item.category.includes('수입')) {
        mappedCategory = '급여';
        mappedSubCategory = '정기수입';
      } else if (item.category.includes('이체') || item.category.includes('저축')) {
        mappedCategory = 'Fixed';
        mappedSubCategory = 'Savings';
      }

      results.push({
        type: item.type === 'income' ? 'INCOME' : item.type === 'transfer' ? 'TRANSFER' : 'EXPENSE',
        amount: item.amount,
        currency: (item.currency as CurrencyCode) || currency,
        category: mappedCategory,
        subCategory: mappedSubCategory,
        description: item.merchant || '지출 항목',
        merchant: item.merchant || '지출 항목',
        date: item.date ? new Date(item.date).toISOString() : now,
        paymentMethod: item.type === 'income' ? detectPaymentMethod(sanitized, true) : paymentMethod,
        confidenceScore: 0.95,
        rawClause: sanitized,
        originalTotal: item.note ? (item.amount * 2) : undefined,
      });
    }
    if (results.length > 0) return finalize(results);
  }

  // 5. Standard single transaction
  if (!detectedAmount) return finalize(results);
  const isFallbackIncome = INCOME_CUE_REGEX.test(sanitized) && notExpense;

  const { category: inferredCategory, subCategory: inferredSubCategory, merchant, confidence } = inferCategoryAndMerchant(stripDateExpressions(sanitized));
  const category = isFallbackIncome ? '급여' : inferredCategory;
  const subCategory = isFallbackIncome ? '정기수입' : inferredSubCategory;
  const type = isFallbackIncome ? 'INCOME' : 'EXPENSE';

  let cleanDesc = cleanMerchantTitle(stripDateExpressions(sanitized), isFallbackIncome ? '급여 수입' : merchant || '지출 내역');
  if (payer) {
    cleanDesc = cleanDesc.replace(new RegExp(`\\s*${payer}\\s*(?:가|이|께서)?\\s*(?:선결제|결제|지불|냄|냈음|부담|쏨)?$`, 'i'), '').trim();
    if (!cleanDesc) cleanDesc = isFallbackIncome ? '급여 수입' : '지출 내역';
  }

  results.push({
    type,
    amount: Math.abs(detectedAmount),
    currency,
    category,
    subCategory,
    description: cleanDesc,
    merchant: cleanDesc,
    date: dateToIsoTimestamp(type === 'EXPENSE' ? resolveExpenseDate(sanitized, extractCommonDate(sanitized)) : extractCommonDate(sanitized)),
    paymentMethod: detectPaymentMethod(sanitized, isFallbackIncome),
    confidenceScore: confidence,
    rawClause: sanitized,
    paidBy: payer,
  });

  return finalize(results);
}

/**
 * Omnibar Real-Time Input Extractor:
 * Quickly extracts detected Merchant, Amount, Currency, and Category chips for live preview.
 */
export function extractRealtimePreview(text: string): RealtimePreviewData | null {
  if (!text || text.trim().length < 2) return null;
  const sanitized = anonymizeFinancialInput(text);

  const overdraft = detectOverdraftTransaction(sanitized);
  if (overdraft && overdraft.amount > 0) {
    return {
      merchant: overdraft.accountName || '마이너스 통장',
      amount: overdraft.amount,
      currency: detectCurrency(sanitized),
      category: overdraft.action === 'REPAYMENT' ? '마이너스대출 상환' : '마이너스대출',
      paymentMethod: overdraft.accountName || '계좌',
      isDutch: false,
    };
  }

  const amount = parseKoreanAmount(sanitized);
  const currency = detectCurrency(sanitized);
  const { category, merchant } = inferCategoryAndMerchant(sanitized);
  const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었/i.test(sanitized) && !/결제|지출|썼|사먹|구입|구매/i.test(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized, isIncome);
  const isDutch = /더치페이|더치|n빵|정산|반띵/i.test(sanitized);
  const paidBy = extractPayer(sanitized);
  let cleanedTitle = cleanMerchantTitle(sanitized, merchant);
  if (paidBy) {
    cleanedTitle = cleanedTitle.replace(new RegExp(`\\s*${paidBy}\\s*(?:가|이|께서)?\\s*(?:선결제|결제|지불|냄|냈음|부담|쏨)?$`, 'i'), '').trim();
  }

  if (amount || merchant || (category && category !== 'Living')) {
    return {
      merchant: cleanedTitle !== '지출 내역' ? cleanedTitle : merchant,
      amount: amount || undefined,
      currency,
      category: isIncome ? '급여' : category,
      paymentMethod: paymentMethod || undefined,
      isDutch,
      paidBy,
    };
  }

  return null;
}

/**
 * Local Heuristic Receipt Parser:
 * Fallback parser when offline or when Gemini AI is unreachable.
 */
export function parseReceiptTextLocally(
  rawText: string,
  defaultCurrency: CurrencyCode = 'KRW'
): ParsedReceiptData {
  const sanitized = anonymizeFinancialInput(rawText);
  const lines = sanitized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const today = new Date().toISOString().slice(0, 10);
  let merchantName = '';
  const date = extractReceiptDateLocally(sanitized, today);
  const currency = detectCurrency(sanitized) || defaultCurrency;
  const items: ReceiptItem[] = [];

  for (const line of lines) {
    const merchantPrefixMatch = line.match(/(?:상호(?:명)?|가맹점(?:명)?|매장(?:명)?|점포명|store(?:\s*name)?|merchant|shop)\s*[:：]?\s*([가-힣a-zA-Z0-9\s()·\-&']+)/i);
    if (merchantPrefixMatch && !merchantName) {
      merchantName = merchantPrefixMatch[1].trim();
      continue;
    }

    const isExcludedHeader = /(?:합\s*계|총\s*액|결제|승인|거래|일시|영수증|사업자|전화|주소|date|total|tax|subtotal|receipt|tel|vat|gst)/i.test(line);
    if (!isExcludedHeader) {
      const itemMatch = line.match(/^([가-힣a-zA-Z0-9\s\-_/&'.]+?)\s+(?:(\d+)\s+)?(?:[\$€£¥₩])?([\d,]+(?:\.\d{1,2})?)\s*(?:원|엔|krw|usd|eur|jpy)?$/i);
      if (itemMatch) {
        const name = itemMatch[1].trim();
        const qty = itemMatch[2] ? parseInt(itemMatch[2], 10) : 1;
        const parsedPrice = parseFloat(itemMatch[3].replace(/,/g, ''));
        if (!isNaN(parsedPrice) && parsedPrice > 0 && name.length >= 2) {
          items.push({
            name,
            price: parsedPrice,
            quantity: isNaN(qty) ? 1 : qty,
            amount: parsedPrice,
          });
        }
      }
    }
  }

  const { totalAmount: detectedTotal, foundTotal } = extractReceiptTotalAmountLocally(lines, sanitized, currency);
  let totalAmount = detectedTotal;

  if (!foundTotal && items.length > 0) {
    totalAmount = items.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);
  } else if (totalAmount === 0) {
    const rawKoreanFallback = parseKoreanAmount(sanitized);
    if (rawKoreanFallback) {
      totalAmount = rawKoreanFallback;
    }
  }

  if (!merchantName) {
    const { merchant } = inferCategoryAndMerchant(sanitized);
    if (merchant) {
      merchantName = merchant;
    } else if (lines.length > 0) {
      const cleanFirst = lines[0].replace(/\[.*?\]|\(.*?\)|영수증|매출전표|고객용|receipt|bill|invoice/gi, '').trim();
      merchantName = cleanFirst.length >= 2 && !/^\d+$/.test(cleanFirst) ? cleanFirst : '영수증 결제';
    } else {
      merchantName = '영수증 결제';
    }
  }

  const { category } = inferCategoryAndMerchant(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized);

  return {
    merchantName,
    date,
    totalAmount: Math.abs(totalAmount),
    currency: String(currency),
    category: category || 'Food',
    items,
    confidenceScore: foundTotal ? 0.85 : 0.75,
    merchant: merchantName,
    suggestedCategory: category || 'Food',
    paymentMethod: paymentMethod || undefined,
  };
}
