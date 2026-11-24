import type {
  CurrencyCode,
  DebtItem,
  LoanSplitSuggestion,
  ReceivableRecoverySuggestion,
  Transaction,
  TransactionType,
} from '../types';
import { cleanMerchantTitle } from '../merchantSanitizer';
import { generateSecureId } from '../identifiers';
import { detectCreditCardSettlement, parseKoreanAmount } from '../finance/lightweightDetectors';
import {
  AMOUNT_TOKEN_PATTERN,
  BORROW_REGEX,
  CATEGORY_LEXICON,
  KOREAN_NAME_PATTERN,
  LEND_REGEX,
  NON_PERSON_PAYERS,
  OVERDRAFT_REGEX,
  REFUND_NOISE_REGEX,
  REPAY_REGEX,
  THIRD_PARTY_PAID_REGEX,
  type DutchPayModifier,
  type OverdraftDetectionResult,
  type PeerDebtEvent,
  type UnequalSplitInfo,
} from './constants';
import { stripDateExpressions } from './dateAndAmount';

export function inferCategoryAndMerchant(text: string): {
  category: string;
  subCategory: string;
  merchant?: string;
  confidence: number;
} {
  const clean = text.trim();

  for (const rule of CATEGORY_LEXICON) {
    for (const pat of rule.patterns) {
      const match = clean.match(pat);
      if (match) {
        return {
          category: rule.category,
          subCategory: rule.subCategory,
          merchant: match[0],
          confidence: rule.confidence,
        };
      }
    }
  }

  // Smart Heuristic fallback for general terms
  if (/먹었|먹음|맛있|식사|밥|마셨|음료|안주|점심|저녁/.test(clean)) {
    return { category: 'Food', subCategory: 'Dining', confidence: 0.85 };
  }
  if (/샀음|구매|쇼핑|지름|주문/.test(clean)) {
    return { category: 'Living', subCategory: 'Shopping', confidence: 0.8 };
  }
  if (/탔음|이동|탑승|주차/.test(clean)) {
    return { category: 'Transport', subCategory: 'Public Transport', confidence: 0.8 };
  }

  // Absolute fallback: assign Living instead of uncategorized, with lower confidence
  return {
    category: 'Living',
    subCategory: 'General',
    confidence: 0.5,
  };
}

/**
 * Extracts category and merchant specifically for ParsedItem segments.
 */
export function extractItemCategoryAndMerchant(
  clause: string,
  type: 'expense' | 'income' | 'transfer'
): { category: string; merchant: string } {
  if (type === 'income') {
    return { category: '급여/수입', merchant: cleanMerchantTitle(clause, '급여 수입') };
  }
  if (type === 'transfer') {
    const cardSettlement = detectCreditCardSettlement(clause);
    if (cardSettlement) {
      return { category: 'Fixed', merchant: cardSettlement.description };
    }
    return { category: '이체/저축', merchant: cleanMerchantTitle(clause, '계좌 이체') };
  }

  // Remove Dutch-pay keywords first so words like "N빵", "엔빵" don't falsely trigger the Bakery / Cafe regex
  const clean = clause.replace(/더치페이|엔빵|N빵|n빵|반반|반띵|각자/gi, ' ').trim();

  // Cafe / Bakery / Dessert
  if (/스타벅스|스벅|투썸|이디야|메가커피|빽다방|컴포즈|폴바셋|블루보틀|할리스|공차|설빙|던킨|배스킨|배라|파리바게뜨|파바|뚜레쥬르|성심당|커피|카페|아메리카노|라떼|에스프레소|디저트|베이커리|케이크|마카롱|와플|coffee|cafe|latte|dessert|(?<![Nn엔])빵(?:집|\b)/i.test(clean)) {
    const m = clean.match(/스타벅스|스벅|투썸|이디야|메가커피|빽다방|컴포즈|폴바셋|블루보틀|할리스|공차|설빙|던킨|배스킨|파리바게뜨|뚜레쥬르|성심당/i);
    return {
      category: '카페/간식',
      merchant: m ? m[0] : (clean.includes('커피') ? '커피' : '카페'),
    };
  }

  // Meal / Dining / Food
  if (/식사|밥|점심|저녁|아침|순두부|찌개|파스타|고기|삼겹살|갈비|한우|곱창|초밥|스시|라멘|마라탕|짜장면|짬뽕|탕수육|치킨|피자|버거|햄버거|맥도날드|버거킹|맘스터치|롯데리아|서브웨이|교촌|bbq|bhc|식당|레스토랑|외식|밥값|회식|분식|떡볶이|김밥|meal|lunch|dinner|dining|food/i.test(clean)) {
    const m = clean.match(/맥도날드|버거킹|맘스터치|롯데리아|서브웨이|교촌|bbq|bhc|굽네|삼겹살|갈비|파스타|피자|치킨|순두부|초밥|라멘|마라탕|식사|점심|저녁|식당|밥/i);
    return {
      category: '식비',
      merchant: m ? m[0] : '식사',
    };
  }

  // Transport
  if (/지하철|전철|시내버스|버스|택시|카카오택시|카카오\s*t|타다|우버|교통|교통카드|티머니|ktx|srt|기차|주유소|주유|기름|휘발유|경유|통행료|하이패스|주차장|주차|주차비|따릉이|킥보드|subway|bus|taxi|cab|transport/i.test(clean)) {
    const m = clean.match(/카카오택시|카카오\s*t|타다|우버|지하철|버스|택시|주유소|주유|기차|ktx|srt|주차장|주차비|주차/i);
    return {
      category: '교통',
      merchant: m ? m[0] : '교통',
    };
  }

  // Living / Shopping
  if (/이마트|홈플러스|롯데마트|코스트코|트레이더스|마트|장보기|슈퍼마켓|다이소|올리브영|올영|무인양품|자주|생필품|화장지|휴지|세제|샴푸|칫솔|쿠팡|네이버쇼핑|11번가|지마켓|알리|테무|아마존|쇼핑|무신사|유니클로|자라|나이키|아디다스|옷|의류|신발|gs25|cu|씨유|세븐일레븐|이마트24|편의점/i.test(clean)) {
    const m = clean.match(/이마트|홈플러스|롯데마트|코스트코|트레이더스|다이소|올리브영|쿠팡|네이버쇼핑|무신사|유니클로|자라|나이키|gs25|cu|씨유|세븐일레븐|이마트24|편의점|마트|쇼핑|생필품/i);
    return {
      category: '생활/쇼핑',
      merchant: m ? m[0] : '생활/쇼핑',
    };
  }

  // Medical / Health
  if (/병원|의원|내과|이비인후과|치과|안과|피부과|정형외과|한의원|약국|약값|처방전|안경|헬스|헬스장|피트니스|pt|피티|필라테스|요가|영양제|비타민/i.test(clean)) {
    const m = clean.match(/병원|약국|치과|안과|피부과|한의원|헬스장|헬스|pt|영양제/i);
    return {
      category: '의료/건강',
      merchant: m ? m[0] : '의료/건강',
    };
  }

  // Leisure / Culture
  if (/cgv|롯데시네마|메가박스|영화|콘서트|뮤지컬|연극|공연|전시|미술관|티켓|노래방|코노|pc방|골프|스크린골프|호텔|리조트|펜션|에어비앤비|야놀자|여기어때|숙소|숙박|항공권|비행기|서점|교보문고|도서|책|게임|스팀/i.test(clean)) {
    const m = clean.match(/cgv|메가박스|롯데시네마|영화|콘서트|뮤지컬|연극|공연|호텔|항공권|교보문고|책/i);
    return {
      category: '문화/여가',
      merchant: m ? m[0] : '문화/여가',
    };
  }

  // Utilities / Telecom / Fixed
  if (/관리비|전기세|전기요금|도시가스|가스비|수도세|수도요금|통신비|휴대폰요금|인터넷요금|월세|임대료|넷플릭스|유튜브|디즈니|티빙|웨이브|스포티파이|멜론|쿠팡와우|네이버플러스|구독/i.test(clean)) {
    const m = clean.match(/넷플릭스|유튜브|디즈니|티빙|스포티파이|멜론|관리비|월세|전기세|가스비|통신비|구독/i);
    return {
      category: '주거/통신',
      merchant: m ? m[0] : '고정지출',
    };
  }

  const title = cleanMerchantTitle(clean, '지출 내역');
  return {
    category: '생활/쇼핑',
    merchant: title !== '지출 내역' ? title : '지출',
  };
}

/**
 * Consolidates server and client transaction category normalization into a single shared function.
 * Maps multilingual category inputs and descriptors to standard Obsidian vault category keys.
 */
export function normalizeTransactionCategory(
  rawCat?: string,
  description?: string,
  type?: TransactionType
): { category: string; subCategory?: string } {
  const raw = (rawCat || '').trim();
  const lower = raw.toLowerCase();

  // 1. Explicit Refund check
  if (/환불|refund|remboursement|rückerstattung|reembolso|rimborso|返金/i.test(lower)) {
    return { category: 'Living', subCategory: 'Refund' };
  }

  // 2. Transfer / Savings check
  if (type === 'TRANSFER' || /이체|저축|적금|예금|savings|deposit|épargne|sparen|ahorro|risparmio|貯蓄|預金/i.test(lower)) {
    return { category: 'Fixed', subCategory: 'Savings' };
  }

  // 3. Income / Salary check
  if (type === 'INCOME' || /급여|월급|수입|소득|salary|income|wage|paycheck|salaire|gehalt|salario|stipendio|給与|給料|収入/i.test(lower)) {
    return { category: 'Fixed', subCategory: 'Salary' };
  }

  // 4. Food: Cafe vs Dining
  if (/식비|외식|카페|간식|food|dining|restaurant|grocery|groceries|lunch|dinner|breakfast|meal|repas|déjeuner|essen|lebensmittel|comida|cibo|食費|外食|ランチ|ディナー/i.test(lower)) {
    const isCafe = /cafe|카페|coffee|커피|간식|디저트|dessert|カフェ/i.test(lower);
    return { category: 'Food', subCategory: isCafe ? 'Cafe' : 'Dining' };
  }

  // 5. Transport: Public Transport
  if (/교통|지하철|버스|택시|주유|주차|transport|transit|subway|metro|bus|taxi|flight|fuel|gas|essence|verkehr|transporte|trasporti|交通|電車|バス|タクシー|ガソリン/i.test(lower)) {
    return { category: 'Transport', subCategory: 'Public Transport' };
  }

  // 6. Fixed: Utilities
  if (/고정|주거|월세|관리비|통신비|통신|보험|공과금|fixed|rent|utilities|bill|subscription|sub|abono|miete|loyer|affitto|固定費|家賃|光熱費|保険/i.test(lower)) {
    return { category: 'Fixed', subCategory: 'Utilities' };
  }

  // 7. Health: Medical
  if (/의료|건강|병원|약국|헬스|운동|health|medical|fitness|pharmacy|doctor|hospital|santé|gesundheit|salud|salute|医療|健康|病院|薬局|フィットネス/i.test(lower)) {
    return { category: 'Health', subCategory: 'Medical' };
  }

  // 8. Leisure: Entertainment
  if (/여가|문화|영화|여행|숙박|leisure|culture|entertainment|travel|hotel|hobby|vacation|loisirs|freizeit|ocio|tempo\s*libero|娯楽|趣味|旅行|映画/i.test(lower)) {
    return { category: 'Leisure', subCategory: 'Entertainment' };
  }

  // 9. Living: Shopping
  if (/생활|쇼핑|생필품|living|shopping|clothes|fashion|store|market|courses|einkaufen|compras|spesa|日用品|買い物|ショッピング/i.test(lower)) {
    return { category: 'Living', subCategory: 'Shopping' };
  }

  // 10. If raw is empty, 'Uncategorized', or '미분류', attempt inference from description
  if (!raw || /^(?:uncategorized|미분류)$/i.test(raw)) {
    if (description && description.trim()) {
      const inferred = inferCategoryAndMerchant(description);
      return { category: inferred.category, subCategory: inferred.subCategory };
    }
    return { category: 'Living', subCategory: 'General' };
  }

  // 11. Preserved raw category fallback
  return { category: raw, subCategory: 'General' };
}

/**
 * Extracts payer name from natural language input (e.g., "김대리 결제", "선결제: 박과장", "paid by Alice")
 */
export function extractPayer(text: string): string | undefined {
  if (!text) return undefined;

  // 1. Explicit labels: "결제자: 김대리", "선결제: 박과장", "paid by Alice", "payer: Bob"
  const labelMatch = text.match(/(?:선결제자?|결제자|paid\s*by|payer)\s*[:=]\s*([가-힣a-zA-Z0-9]{2,12})/i);
  if (labelMatch) {
    const candidate = labelMatch[1].trim();
    if (!NON_PERSON_PAYERS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // 2. Trailing/inline pattern: "김대리 결제", "김대리 선결제", "김대리가 결제", "김대리가 냄", "박과장 결제"
  const suffixMatch = text.match(/([가-힣a-zA-Z]{2,10})\s*(?:가|이|께서)?\s*(?:선결제|결제|지불|냄|냈음|부담|쏨)(?:\s|$|[:=])/i);
  if (suffixMatch) {
    const candidate = suffixMatch[1].trim();
    if (!NON_PERSON_PAYERS.has(candidate.toLowerCase()) && !/^(?:신용|체크|법인|현금|계좌|삼성|애플|토스|네이버|카카오)$/.test(candidate)) {
      return candidate;
    }
  }

  // 3. English "paid by [Name]" without colon
  const engMatch = text.match(/paid\s+by\s+([a-zA-Z]{2,15})/i);
  if (engMatch) {
    const candidate = engMatch[1].trim();
    if (!NON_PERSON_PAYERS.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Splits sentence by commas, periods, or coordinating conjunctions (그리고, 및, +)
 * while preserving numbers with thousands commas (e.g. 15,000) or decimals.
 */
export function splitIntoClauses(raw: string): string[] {
  const protectedText = raw
    .replace(/(\d+),(\d{3})/g, '$1#COMMA#$2')
    .replace(/(\d+),(\d{3})/g, '$1#COMMA#$2')
    .replace(/\b(\d+)\.(\d+)\b/g, '$1#DOT#$2');

  const separatedText = protectedText
    .replace(/(받았는데|받았고|받았지만|받고|쓰고|썼고|내고|냈고|샀고)\s+(?=[^,.]*\d)/g, '$1, ')
    .replace(
      /(?<=(?:\d|[만천억])\s?(?:원|엔|달러|유로|파운드|불)?)\s+(?=[가-힣A-Za-z]{1,8}\s*(?:[\d$€¥£₩])(?!\d*\s*(?:명|인|개월|일|시|분)))/g,
      ', '
    );

  return separatedText
    .split(/(?:[,\.]\s*|\s+(?:그리고|및|\+)\s+|\r?\n+)/g)
    .map((s) => s.replace(/#COMMA#/g, ',').replace(/#DOT#/g, '.').trim())
    .filter((s) => s.length > 0);
}

/**
 * Extracts Dutch-Pay modifier rule from clause if present.
 * Detects keywords: 더치페이, 엔빵, N빵, 각자, 만 원씩, 반반, 반띵
 */
export function extractDutchPayModifier(clause: string): DutchPayModifier | null {
  const hasDutchKeyword = /더치페이|엔빵|n빵|각자|반반|반띵|씩|나눔|나눠|나눴/i.test(clause);
  if (!hasDutchKeyword) return null;

  let portionAmount: number | undefined;
  const portionMatch = clause.match(/(?:각자\s*)?([0-9.,만천억원kKmM\s]+?)\s*씩/i);
  if (portionMatch) {
    const parsedAmt = parseKoreanAmount(portionMatch[1]);
    if (parsedAmt && parsedAmt > 0) {
      portionAmount = parsedAmt;
    }
  }

  let splitCount: number | undefined;
  if (/반반|반띵/i.test(clause)) {
    splitCount = 2;
  } else {
    const countMatch = clause.match(/(\d+)\s*(?:명|인)\s*(?:N빵|엔빵|더치페이|각자)?/i);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      if (count > 0) splitCount = count;
    }
  }

  if (!portionAmount && !splitCount) {
    if (/더치페이|엔빵|n빵|각자|나눔|나눠|나눴/i.test(clause)) {
      splitCount = 2;
    }
  }

  let targetKeyword: string | undefined;
  const targetMatch = clause.match(/^([가-힣a-zA-Z0-9]{2,})(?:비|값)?(?:는|은|이|가)?\s*/);
  if (targetMatch && targetMatch[1]) {
    const candidate = targetMatch[1].replace(/비|값/g, '').trim();
    if (candidate && !/더치|엔빵|n빵|각자|반반|반띵|전체|모두|만원|천원/.test(candidate)) {
      targetKeyword = candidate;
    }
  }

  if (portionAmount || splitCount) {
    return {
      targetKeyword,
      portionAmount,
      splitCount,
      rawClause: clause,
    };
  }

  return null;
}

/**
 * Applies Dutch-pay arithmetic logic:
 * - If specific portion is mentioned: deduce user's expense as portionAmount with note "<item> <total>원 (더치페이 분담)"
 * - If split count (or 반반) is mentioned: divide item amount accordingly (amount / N)
 */
export function applyDutchPayRule(
  itemAmount: number,
  merchant: string,
  category: string,
  rule: DutchPayModifier
): { amount: number; note: string } {
  let resolvedAmount = itemAmount;
  if (rule.portionAmount && rule.portionAmount > 0) {
    resolvedAmount = rule.portionAmount;
  } else if (rule.splitCount && rule.splitCount > 1) {
    resolvedAmount = Math.round(itemAmount / rule.splitCount);
  }

  const cleanLabel = merchant || category || '식사';
  const note = `${cleanLabel} ${itemAmount.toLocaleString()}원 (더치페이 분담)`;
  return {
    amount: resolvedAmount,
    note,
  };
}

/**
 * "아 2만원 아니다 3만원" -> keeps only the corrected amount while preserving the item words.
 */
export function applySelfCorrection(text: string): string {
  const marker = /(?:아\s*)?(?:아니다|아니야|아냐|아니고|아니지|아니 )/;
  const match = marker.exec(text);
  if (!match) return text;
  const left = text.slice(0, match.index);
  const right = text.slice(match.index + match[0].length).trim();
  if (!/\d|[만천백억]/.test(right)) return text;
  const amountToken = /(?:\d[\d,.]*|[ㅇㅋㅎ]+)\s*(?:억|만|천|백)?\s*(?:원|엔|달러|유로|파운드)?|\.{2,}|\b아\b/g;
  const keep = left.replace(amountToken, ' ').replace(/\s{2,}/g, ' ').trim();
  return `${keep} ${right}`.trim();
}

/**
 * Detects sentences where someone else paid ("민수가 밥값 2만원 냈어"); these are not
 * the user's own spending and must not be recorded as an expense.
 */
export function isPaidByThirdParty(text: string): boolean {
  if (/내가|제가|나는|난\s|내\s*카드|내\s*돈/.test(text)) return false;
  return THIRD_PARTY_PAID_REGEX.test(text);
}

/**
 * Describes a peer-to-peer money event (lend, borrow, repay, or someone else paying
 * for me) so it can be tracked as a debt instead of being counted as spending.
 */
export function detectPeerDebt(text: string): PeerDebtEvent | null {
  const amount = parseKoreanAmount(stripDateExpressions(text));
  if (!amount || amount <= 0) return null;
  const abs = Math.abs(amount);

  if (isPaidByThirdParty(text)) {
    const name = text.match(new RegExp(`${KOREAN_NAME_PATTERN}(?:이|가)\\s`))?.[1];
    return name ? { counterparty: name, direction: 'PAYABLE', amount: abs, debtOnly: true } : null;
  }
  const target = text.match(new RegExp(`${KOREAN_NAME_PATTERN}(?:한테|에게|께)`))?.[1];
  if (!target) return null;
  if (LEND_REGEX.test(text)) return { counterparty: target, direction: 'RECEIVABLE', amount: abs, debtOnly: false };
  if (BORROW_REGEX.test(text)) return { counterparty: target, direction: 'PAYABLE', amount: abs, debtOnly: false };
  if (REPAY_REGEX.test(text)) return { counterparty: target, direction: 'REPAYMENT', amount: abs, debtOnly: false };
  return null;
}

/**
 * Resolves the user's share for unequal splits:
 *  - ratio:  "9만원 내가 3 민수 6으로 나눔", "9만원 7:3으로 나눔" (first number = me)
 *  - extra:  "민수가 2만원 더 먹음, 저녁 10만원 반반" (민수 ate more → my share is smaller)
 */
export function extractUnequalSplit(text: string): UnequalSplitInfo | null {
  const clean = stripDateExpressions(text);
  if (!/나눔|나눠|나눴|반반|더치|엔빵|n빵|더\s*(?:먹|마시|시켰|썼)/i.test(clean)) return null;

  const extra = clean.match(new RegExp(`(?:(내가|나)|${KOREAN_NAME_PATTERN}(?:가|이)?)\\s*${AMOUNT_TOKEN_PATTERN}\\s*더\\s*(?:먹|마시|시켰|썼)`));
  if (extra) {
    const delta = parseKoreanAmount(extra[3]);
    const rest = clean.replace(extra[0], ' ');
    const total = parseKoreanAmount(rest);
    if (!delta || !total || delta >= total) return null;
    const userShare = extra[1] ? (total + delta) / 2 : (total - delta) / 2;
    return { total, userShare: Math.round(userShare), method: 'extra' };
  }

  const ratio = clean.match(/(?:(?:내가|나)\s*)?(\d+)\s*(?::|대)\s*(\d+)/) ||
    clean.match(/(?:내가|나)\s*(\d+)\s*(?:[가-힣]{2,4})\s*(\d+)/);
  if (ratio) {
    const mine = parseInt(ratio[1], 10);
    const others = parseInt(ratio[2], 10);
    const total = parseKoreanAmount(clean.replace(ratio[0], ' '));
    if (!total || mine + others <= 0) return null;
    return { total, userShare: Math.round((total * mine) / (mine + others)), method: 'ratio' };
  }
  return null;
}

/**
 * Splits whose ratio names other people but not the user ("민수 7 영희 3") cannot be
 * resolved safely. Returns a user-facing question instead of guessing.
 */
export function detectClarificationNeeded(text: string): string | null {
  if (/(?:내가|나)\s*\d|\d\s*(?::|대)\s*\d/.test(text)) return null;
  if (/[가-힣]{2,4}\s*\d+\s*[가-힣]{2,4}\s*\d+\s*(?:으로|로)?\s*(?:나눔|나눠|나눴)/.test(text)) {
    return '내 부담 비율을 알려주세요. 예: "9만원 내가 3 민수 6으로 나눔"';
  }
  return null;
}

/**
 * Pure planner: returns the debt record to save for a peer-debt event.
 */
export function planPeerDebtUpdate(event: PeerDebtEvent, debts: DebtItem[], currency: CurrencyCode = 'KRW'): DebtItem | null {
  const wantedType = event.direction === 'RECEIVABLE' ? 'LOAN_RECEIVABLE' : 'LOAN_PAYABLE';
  const existing = debts.find((d) => d.type === wantedType && d.isActive !== false && d.counterpartyOrBank === event.counterparty);
  const nowIso = new Date().toISOString();

  if (event.direction === 'REPAYMENT') {
    if (!existing) return null;
    const remaining = Math.max(0, existing.remainingPrincipal - event.amount);
    return { ...existing, remainingPrincipal: remaining, isActive: remaining > 0, lastUpdated: nowIso };
  }
  if (existing) {
    return {
      ...existing,
      originalPrincipal: existing.originalPrincipal + event.amount,
      remainingPrincipal: existing.remainingPrincipal + event.amount,
      lastUpdated: nowIso,
    };
  }
  return {
    id: generateSecureId('debt-peer'),
    name: event.direction === 'RECEIVABLE' ? `${event.counterparty} 빌려준 돈` : `${event.counterparty}에게 갚을 돈`,
    type: wantedType,
    counterpartyOrBank: event.counterparty,
    originalPrincipal: event.amount,
    remainingPrincipal: event.amount,
    currency,
    startDate: nowIso.slice(0, 10),
    lastUpdated: nowIso,
    isActive: true,
  };
}

/**
 * Finds the expense a refund offsets. Returns null unless the match is unambiguous.
 */
export function findRefundTarget(
  refund: { amount: number; text: string; currency?: string },
  transactions: Transaction[]
): Transaction | null {
  const keywords = stripDateExpressions(refund.text)
    .split(/[\s,]+/)
    .map((w) => w.replace(REFUND_NOISE_REGEX, ''))
    .filter((w) => w.length >= 2);

  const refundedSoFar = new Map<string, number>();
  for (const t of transactions) {
    if (t.refundOfId && t.amount < 0) {
      refundedSoFar.set(t.refundOfId, (refundedSoFar.get(t.refundOfId) ?? 0) + Math.abs(t.amount));
    }
  }

  const scored = transactions
    .filter((t) => t.type === 'EXPENSE' && t.amount > 0 && !t.isInternalTransfer && !t.refundOfId)
    .filter((t) => (t.currency || 'KRW') === (refund.currency || 'KRW'))
    .filter((t) => t.amount - (refundedSoFar.get(t.id) ?? 0) >= refund.amount)
    .map((t) => {
      const haystack = `${t.description ?? ''} ${t.category ?? ''}`;
      const keywordHit = keywords.some((k) => haystack.includes(k));
      const exact = t.amount === refund.amount;
      return { t, score: (keywordHit ? 3 : 0) + (exact ? 2 : 0) };
    })
    .filter((c) => c.score >= 2)
    .sort((a, b) => b.score - a.score || b.t.date.localeCompare(a.t.date));

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].t.date === scored[1].t.date) return null;
  return scored[0].t;
}

/**
 * A linked refund is stored as a negative EXPENSE in the original's category so that
 * monthly spending and category totals net out instead of inflating income.
 */
export function buildLinkedRefund(
  original: Transaction,
  refund: { amount: number; date: string; description: string; paymentMethod?: string }
): Omit<Transaction, 'id'> {
  return {
    type: 'EXPENSE',
    amount: -Math.abs(refund.amount),
    currency: original.currency,
    category: original.category,
    subCategory: 'Refund',
    description: `환불: ${original.description}`,
    date: refund.date,
    paymentMethod: refund.paymentMethod ?? original.paymentMethod,
    refundOfId: original.id,
    spaceId: original.spaceId,
    note: `원거래 ${original.amount.toLocaleString()}원 중 ${Math.abs(refund.amount).toLocaleString()}원 환불`,
  };
}

/**
 * Overdraft Account (마이너스 통장 / 한도대출) Detector
 */
export function detectOverdraftTransaction(text: string): OverdraftDetectionResult | null {
  if (!OVERDRAFT_REGEX.test(text)) return null;

  const bankMatch = text.match(/(신한은행|신한|국민은행|KB국민은행|KB국민|국민|카카오뱅크|토스뱅크|토스|하나은행|하나|우리은행|우리|NH농협은행|NH농협|농협|케이뱅크|기업은행|IBK기업|SC제일은행|씨티은행|새마을금고|신협|수협)/i);
  const institution = bankMatch ? bankMatch[0] : undefined;
  const accountLabel = institution ? `${institution} 마이너스통장` : '마이너스 통장';

  const limitMatch = text.match(/한도(?:\s*[:은는]?\s*)?(\d+(?:\.\d+)?\s*(?:억원|억|만원|만|천원|천|원)?)/i);
  const overdraftLimit = limitMatch ? (parseKoreanAmount(limitMatch[1]) ? Math.abs(parseKoreanAmount(limitMatch[1])!) : undefined) : undefined;

  const parsedAmt = parseKoreanAmount(text);
  const absAmount = parsedAmt ? Math.abs(parsedAmt) : 0;

  const isRepayment = /(?:입금|상환|채워|갚음|갚았|채움|메꿈|메꿨|납입|deposit|repay|원금상환)/i.test(text);

  if (isRepayment) {
    return {
      isOverdraft: true,
      action: 'REPAYMENT',
      amount: absAmount,
      overdraftLimit,
      institution,
      accountName: accountLabel,
      description: `${accountLabel} 상환`,
    };
  }

  const isUsage = /(?:사용|인출|출금|씀|결제|빌림|대출받)/i.test(text);
  const currentBalance = -absAmount;

  let desc = `${accountLabel} 잔액`;
  if (isUsage) {
    desc = `${accountLabel} 사용`;
  } else if (text.includes('잔액')) {
    desc = `${accountLabel} 잔액`;
  }

  return {
    isOverdraft: true,
    action: 'BALANCE_OR_USAGE',
    amount: absAmount,
    currentBalance,
    overdraftLimit,
    institution,
    accountName: accountLabel,
    description: desc,
  };
}

/**
 * Smart Debt & Loan Split Detector:
 * Recognizes loan repayment notifications/SMS and calculates Principal vs Interest split.
 */
export function detectLoanRepaymentNotification(
  text: string,
  debts: DebtItem[] = []
): {
  isLoanRepayment: boolean;
  debt?: DebtItem;
  totalPayment: number;
  principal: number;
  interest: number;
  suggestion: LoanSplitSuggestion;
} | null {
  const isLoanKeyword = /(?:대출|원리금|원금\s*상환|대출금|이자\s*납입|대출이자|학자금\s*상환|마이너스통장|담보대출|전세대출|신용대출)/i.test(text);
  const isActionKeyword = /(?:상환|납입|출금|자동이체|납부|이체|원리금)/i.test(text);

  if (!isLoanKeyword || !isActionKeyword) return null;

  const activeDebts = debts.filter((d) => d.isActive !== false && d.type !== 'LOAN_RECEIVABLE');
  let matchedDebt = activeDebts.find(
    (d) =>
      text.includes(d.counterpartyOrBank) ||
      text.includes(d.name) ||
      (d.counterpartyOrBank && text.includes(d.counterpartyOrBank.replace(/은행|뱅크/g, '')))
  );

  if (!matchedDebt && activeDebts.length > 0) {
    matchedDebt = activeDebts[0];
  }

  const principalMatch = text.match(/원금(?:\s*상환액)?(?:\s*[:은는]?\s*)?(\d+(?:\.\d+)?\s*(?:억원|억|만원|만|천원|천|원)?)/i);
  const interestMatch = text.match(/이자(?:\s*비용)?(?:\s*[:은는]?\s*)?(\d+(?:\.\d+)?\s*(?:억원|억|만원|만|천원|천|원)?)/i);

  let principal = 0;
  let interest = 0;
  let totalPayment = parseKoreanAmount(text) || 0;

  if (principalMatch && interestMatch) {
    principal = parseKoreanAmount(principalMatch[1]) || 0;
    interest = parseKoreanAmount(interestMatch[1]) || 0;
    if (principal > 0 && interest > 0) {
      totalPayment = principal + interest;
    }
  } else if (totalPayment > 0 && matchedDebt) {
    const annualRate = matchedDebt.interestRateAnnual || 4.5;
    interest = Math.round(matchedDebt.remainingPrincipal * (annualRate / 100 / 12));
    if (interest >= totalPayment) {
      interest = Math.round(totalPayment * 0.25);
    }
    principal = Math.max(0, totalPayment - interest);
  } else if (totalPayment > 0) {
    interest = Math.round(totalPayment * 0.2);
    principal = totalPayment - interest;
  }

  const remainingAfter = matchedDebt ? Math.max(0, matchedDebt.remainingPrincipal - principal) : 0;
  const debtName = matchedDebt ? matchedDebt.name : '대출 원리금 상환';
  const counterparty = matchedDebt ? matchedDebt.counterpartyOrBank : '금융기관';
  const debtId = matchedDebt ? matchedDebt.id : 'unknown-debt';

  const suggestion: LoanSplitSuggestion = {
    debtId,
    debtName,
    totalPayment,
    principalAmount: principal,
    interestAmount: interest,
    currency: matchedDebt?.currency || 'KRW',
    remainingPrincipalAfter: remainingAfter,
    counterpartyOrBank: counterparty,
    explanation: `${debtName} 상환: 원금 감채 ${principal.toLocaleString()}원 (부채 감소) + 이자 비용 ${interest.toLocaleString()}원 (금융비용)`,
  };

  return {
    isLoanRepayment: true,
    debt: matchedDebt,
    totalPayment,
    principal,
    interest,
    suggestion,
  };
}

/**
 * Context-Aware Receivable Matching:
 * Detects incoming transfer from a known borrower with an active LOAN_RECEIVABLE.
 */
export function detectReceivableRecoveryNotification(
  text: string,
  debts: DebtItem[] = []
): {
  isReceivableRecovery: boolean;
  debt: DebtItem;
  recoveredAmount: number;
  suggestion: ReceivableRecoverySuggestion;
} | null {
  const isIncoming = /(?:입금|송금받|받았|들어옴|받음|이체받|정산금|빌려준\s*돈)/i.test(text);
  if (!isIncoming) return null;

  const receivables = debts.filter((d) => d.type === 'LOAN_RECEIVABLE' && d.isActive !== false && d.remainingPrincipal > 0);
  if (receivables.length === 0) return null;

  let matchedReceivable: DebtItem | undefined;
  for (const rec of receivables) {
    const nameOnly = rec.counterpartyOrBank.trim();
    if (nameOnly && (text.includes(nameOnly) || rec.name.includes(nameOnly))) {
      matchedReceivable = rec;
      break;
    }
  }

  if (!matchedReceivable) return null;

  const amount = parseKoreanAmount(text) || matchedReceivable.remainingPrincipal;
  const remainingAfter = Math.max(0, matchedReceivable.remainingPrincipal - amount);

  const suggestion: ReceivableRecoverySuggestion = {
    debtId: matchedReceivable.id,
    debtName: matchedReceivable.name,
    recoveredAmount: amount,
    currency: matchedReceivable.currency || 'KRW',
    remainingPrincipalAfter: remainingAfter,
    counterparty: matchedReceivable.counterpartyOrBank,
    explanation: `${matchedReceivable.counterpartyOrBank}님에게 빌려준 돈(${matchedReceivable.remainingPrincipal.toLocaleString()}원 중) ${amount.toLocaleString()}원 상환 회수 (미수 채권 차감 및 수입 부풀림 방지)`,
  };

  return {
    isReceivableRecovery: true,
    debt: matchedReceivable,
    recoveredAmount: amount,
    suggestion,
  };
}
