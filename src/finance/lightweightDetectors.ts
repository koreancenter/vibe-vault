import { LaunchScreenMode } from '../types';

const HANGUL_DIGITS: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const HANGUL_SMALL_UNITS: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
const HANGUL_BIG_UNITS: Record<string, number> = { 만: 10000, 억: 100000000 };

/**
 * Converts pure-Hangul amounts followed by 원 ("이만오천원", "십만원") into digits ("25000원").
 * Requires a unit character so words like "삼성" or "구원" are untouched.
 */
export function convertHangulNumerals(text: string): string {
  return text.replace(/(?<![\d만천백억])([일이삼사오육칠팔구십백천만억]+)(\s*원)/g, (match, run: string, won: string) => {
    if (!/[십백천만억]/.test(run)) return match;
    let total = 0;
    let section = 0;
    let digit = 0;
    for (const ch of run) {
      if (ch in HANGUL_DIGITS) {
        digit = HANGUL_DIGITS[ch];
      } else if (ch in HANGUL_SMALL_UNITS) {
        section += (digit || 1) * HANGUL_SMALL_UNITS[ch];
        digit = 0;
      } else {
        total += ((section + digit) || 1) * HANGUL_BIG_UNITS[ch];
        section = 0;
        digit = 0;
      }
    }
    total += section + digit;
    return `${total}${won}`;
  });
}

export function parseKoreanAmount(text: string): number | null {
  if (!text) return null;
  text = convertHangulNumerals(text);

  // Check if explicit negative sign is attached to the amount
  const isExplicitNegative = /(?:^|\s|[^\p{L}\d\-])-\s*(?:\d|[억만천]|원|\$|€|¥|£|₩)/u.test(text);

  // Clean commas in numbers like 3,500,000
  const normalized = text.replace(/(\d+),(\d{3})/g, '$1$2').replace(/(\d+),(\d{3})/g, '$1$2');

  // Check if text has any Korean units: 억, 만, 천
  if (/[억만천]|\d\s*백/.test(normalized)) {
    let total = 0;
    let hasMatched = false;

    const eokMatch = normalized.match(/(\d+(?:\.\d+)?)\s*억/);
    if (eokMatch) {
      total += parseFloat(eokMatch[1]) * 100000000;
      hasMatched = true;
    } else if (/(?:^|[^\p{L}\d])억(?:\s*원|\s*씩)/u.test(normalized)) {
      total += 100000000;
      hasMatched = true;
    }

    const cheonManMatch = normalized.match(/(\d+(?:\.\d+)?)\s*천\s*만/);
    if (cheonManMatch) {
      total += parseFloat(cheonManMatch[1]) * 10000000;
      hasMatched = true;
    } else {
      const manMatch = normalized.match(/(\d+(?:\.\d+)?)\s*만/);
      if (manMatch) {
        total += parseFloat(manMatch[1]) * 10000;
        hasMatched = true;
      } else if (/(?:^|[^\p{L}\d])만(?:\s*원|\s*씩)/u.test(normalized)) {
        total += 10000;
        hasMatched = true;
      }
    }

    if (!cheonManMatch) {
      const cheonMatch = normalized.match(/(?:만\s*)?(\d+(?:\.\d+)?)\s*천(?:\s*원)?/);
      if (cheonMatch) {
        total += parseFloat(cheonMatch[1]) * 1000;
        hasMatched = true;
      } else if (/(?:^|[^\p{L}\d])천(?:\s*원|\s*씩)/u.test(normalized)) {
        total += 1000;
        hasMatched = true;
      }
    }

    const baekMatch = normalized.match(/(\d+(?:\.\d+)?)\s*백/);
    if (baekMatch) {
      total += parseFloat(baekMatch[1]) * 100;
      hasMatched = true;
    }

    const wonRemainder = normalized.match(/만\s*(\d+)\s*(?:원|$)/);
    if (wonRemainder && !normalized.includes('천')) {
      const rem = parseInt(wonRemainder[1], 10);
      if (rem > 0 && rem < 10000) {
        total += rem;
      }
    }

    if (hasMatched && total > 0) {
      const rounded = Math.round(total);
      return isExplicitNegative ? -rounded : rounded;
    }
  }

  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const rounded = Math.round(parseFloat(kMatch[1]) * 1000);
    return isExplicitNegative ? -rounded : rounded;
  }

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (mMatch) {
    const rounded = Math.round(parseFloat(mMatch[1]) * 1000000);
    return isExplicitNegative ? -rounded : rounded;
  }

  const globalDecimalMatch = normalized.match(/(?:\$|€|¥|£|₩)?\s*(\d+(?:\.\d+)?)\s*(?:원|krw|usd|달러|dollar|eur|유로|euro|jpy|엔|yen|gbp|파운드)?/i);
  if (globalDecimalMatch && globalDecimalMatch[1]) {
    const parsed = parseFloat(globalDecimalMatch[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return isExplicitNegative ? -parsed : parsed;
    }
  }

  const anyNum = normalized.match(/\b\d+(?:\.\d+)?\b/);
  if (anyNum) {
    const parsed = parseFloat(anyNum[0]);
    if (!isNaN(parsed) && parsed > 0) {
      return isExplicitNegative ? -parsed : parsed;
    }
  }

  return null;
}

/**
 * Credit Card Settlement & Internal Transfer Deduplication Detector.
 */
export function detectCreditCardSettlement(text: string): {
  isCardSettlement: boolean;
  cardName: string;
  amount?: number;
  description: string;
} | null {
  const isCardBilling = /(?:카드\s*(?:결제\s*대금|대금\s*결제|결제\s*금액|청구\s*금액|결제일|이용\s*대금|대금\s*출금|대금|납부|청구서|값(?:\s*출금|\s*납부)?)|(?:신용카드|체크카드)\s*(?:대금|납부|출금|결제|청구)|(?:후불교통|후불교통비)\s*출금|card\s*bill(?:\s*payment|\s*auto\s*debit|\s*debit|\s*settlement)?|credit\s*card\s*(?:bill(?:\s*payment)?|payment|settlement)|card\s*payment)/i.test(text);
  if (!isCardBilling) return null;

  const cardMatch = text.match(/(현대카드|신한카드|국민카드|KB국민카드|삼성카드|롯데카드|우리카드|하나카드|NH농협카드|농협카드|BC카드|씨티카드|토스카드|카카오페이카드|카카오뱅크카드|[가-힣a-zA-Z0-9]+카드|Hyundai\s*Card|Shinhan\s*Card|KB\s*Card|Samsung\s*Card|Lotte\s*Card|Woori\s*Card|Hana\s*Card|NH\s*Card|BC\s*Card|Toss\s*Card|Kakao\s*Card|Chase\s*(?:Sapphire|Freedom|Card)?|Amex|Apple\s*Card|Credit\s*Card)/i);
  const cardName = cardMatch ? cardMatch[1].trim() : (/card\s*bill|credit\s*card/i.test(text) ? 'Card' : '신용카드');
  const amount = parseKoreanAmount(text);

  let desc = `${cardName} 결제대금 출금`;
  if (/자동이체/i.test(text)) {
    desc = `${cardName} 대금 자동이체`;
  } else if (/납부/i.test(text)) {
    desc = `${cardName} 카드대금 납부`;
  } else if (/card\s*bill\s*payment/i.test(text)) {
    desc = `${cardName} bill payment`;
  }

  return {
    isCardSettlement: true,
    cardName,
    amount: amount || undefined,
    description: desc
  };
}

/**
 * Shared helper to determine whether an input string represents an analytical query
 * or a standard transaction record.
 */
export function isAnalyticalQueryInput(text: string, currentMode: LaunchScreenMode | string = 'ledger'): boolean {
  const clean = text.trim();
  if (!clean) return false;

  const hasExplicitTransactionAmount = /(?:\d+(?:,\d+)*(?:\s*원|\s*만원|\s*천원|\s*KRW|\s*USD|\s*EUR|\s*JPY)|[\$₩€¥]\s*\d+)/i.test(clean);
  const hasAnalyticalKeywords = /(?:환차익|환손익|환차|환율|외환|분석|총액|얼마|추이|주말\s*지출)/i.test(clean);
  const isCategoryQueryAlone = /^(?:식비|교통비|생활비|고정비|문화비|여가비|의료비)(?:\s*(?:분석|조회|현황|통계))?$/i.test(clean);
  const isQuestionOrInsightMode = currentMode === 'insights' || clean.endsWith('?') || /알려줘|어때|조회/i.test(clean);

  const isStandardTransaction = hasExplicitTransactionAmount && !hasAnalyticalKeywords && !isQuestionOrInsightMode;

  return !isStandardTransaction && (
    hasAnalyticalKeywords ||
    isCategoryQueryAlone ||
    (clean.includes('식비') && !hasExplicitTransactionAmount) ||
    isQuestionOrInsightMode
  );
}
