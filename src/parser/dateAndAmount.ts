import type { CurrencyCode } from '../types';
import { cleanMerchantTitle } from '../merchantSanitizer';
import { convertHangulNumerals, parseKoreanAmount } from '../finance/lightweightDetectors';
import {
  CURRENCY_KEYWORD_RULES,
  ENGLISH_MONTH_MAP,
  HIGH_PRIORITY_TOTAL_REGEX,
  MEDIUM_PRIORITY_TOTAL_REGEX,
  WEEKDAY_INDEX,
  type InstallmentDetectionResult,
} from './constants';

export { convertHangulNumerals, parseKoreanAmount };

/**
 * Currency Detector
 */
export function detectCurrency(text: string): CurrencyCode {
  const lower = text.toLowerCase();
  for (const rule of CURRENCY_KEYWORD_RULES) {
    if (rule.tokens.some((token) => lower.includes(token))) {
      return rule.code;
    }
  }
  return 'KRW';
}

/**
 * Payment Instrument Detector
 */
export function detectPaymentMethod(text: string, isIncome: boolean = false): string {
  if (isIncome) {
    if (/토스뱅크|토스|toss/i.test(text)) return '토스뱅크';
    if (/기업은행|신한은행|국민은행|하나은행|우리은행|카카오뱅크|케이뱅크|농협은행|sc제일은행|씨티은행/i.test(text)) {
      const match = text.match(/(기업은행|신한은행|국민은행|하나은행|우리은행|카카오뱅크|케이뱅크|농협은행|sc제일은행|씨티은행)/i);
      return match ? match[1] : '통장';
    }
    if (/현금|지폐|동전|cash/i.test(text)) return '현금';
    return '통장';
  }

  if (/카카오\s*페이|카카오페이|kakaopay/i.test(text)) return '카카오페이';
  if (/토스\s*페이|toss\s*pay/i.test(text)) return '토스페이';
  if (/토스뱅크|토스|toss/i.test(text)) return '토스';
  if (/네이버\s*페이|네이버페이|naverpay/i.test(text)) return '네이버페이';
  if (/쿠팡\s*페이|쿠페이|coupangpay/i.test(text)) return '쿠페이';
  if (/애플\s*페이|애플페이|applepay/i.test(text)) return '애플페이';
  if (/현대\s*카드|현대카드|hyundai\s*card/i.test(text)) return '현대카드';
  if (/신한\s*카드|신한카드|shinhan\s*card/i.test(text)) return '신한카드';
  if (/국민\s*카드|kb\s*카드|kookmin\s*card/i.test(text)) return 'KB국민카드';
  if (/삼성\s*카드|samsung\s*card/i.test(text)) return '삼성카드';
  if (/롯데\s*카드|lotte\s*card/i.test(text)) return '롯데카드';
  if (/우리\s*카드|woori\s*card/i.test(text)) return '우리카드';
  if (/하나\s*카드|hana\s*card/i.test(text)) return '하나카드';
  if (/농협\s*카드|nh\s*카드/i.test(text)) return 'NH농협카드';
  if (/현금|지폐|동전|cash/i.test(text)) return '현금';
  if (/계좌\s*이체|계좌이체|무통장|송금|자동이체|bank\s*transfer|wire|기업은행|신한은행|국민은행|하나은행|우리은행|카카오뱅크|케이뱅크|농협은행|sc제일은행|씨티은행/i.test(text)) return '계좌이체';
  if (/체크\s*카드|체크카드/i.test(text)) return '체크카드';
  if (/신용\s*카드|신용카드|카드\s*결제|카드|card/i.test(text)) return '카드';
  return '카드';
}

/**
 * Helper to get today's date in YYYY-MM-DD format based on local time.
 */
export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatLocalIsoDate(d);
}

/**
 * Extracts common date metadata across clauses (e.g., 오늘, 어제, 그제, ISO dates).
 */
export function extractCommonDate(text: string): string {
  return extractExplicitDate(text) ?? getTodayIsoDate();
}

/**
 * Removes date expressions ("3일 전", "2026-10-01", "10월 5일") so their numbers
 * are never mistaken for amounts or merchant names.
 */
export function stripDateExpressions(text: string): string {
  return text
    .replace(/\b20\d{2}[-/.년]\s*\d{1,2}[-/.월]\s*\d{1,2}(?:일)?/g, ' ')
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, ' ')
    .replace(/\d+\s*(?:일|주|주일|개월|달)\s*전/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Returns an explicit/relative date found in the text, or null when none is present.
 */
export function extractExplicitDate(text: string): string | null {
  if (/오늘/i.test(text)) return getTodayIsoDate();

  if (/글피/.test(text)) return shiftDays(3);
  if (/모레/.test(text)) return shiftDays(2);
  if (/내일/.test(text)) return shiftDays(1);
  if (/엊그제|엊그저께|그제|그저께/.test(text)) return shiftDays(-2);
  if (/어제|어젯/.test(text)) return shiftDays(-1);

  const daysAgo = text.match(/(\d+)\s*일\s*전/);
  if (daysAgo) return shiftDays(-parseInt(daysAgo[1], 10));

  const weeksAgo = text.match(/(\d+)\s*(?:주|주일)\s*전/);
  if (weeksAgo) return shiftDays(-7 * parseInt(weeksAgo[1], 10));

  const lastWeekDay = text.match(/지난\s*주\s*([월화수목금토일])요일/);
  if (lastWeekDay) {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    return shiftDays(-mondayOffset - 7 + WEEKDAY_INDEX[lastWeekDay[1]]);
  }

  // ISO YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  const isoMatch = text.match(/\b(20\d{2})[-/.년]\s*(0?[1-9]|1[0-2])[-/.월]\s*(0?[1-9]|[12]\d|3[01])(?:일)?\b/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // M월 D일
  const mdMatch = text.match(/\b(0?[1-9]|1[0-2])월\s*(0?[1-9]|[12]\d|3[01])일\b/);
  if (mdMatch) {
    const y = new Date().getFullYear();
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Advance bookings ("내일 모레 갈 콘서트 예매") are paid today, so a future event
 * date must not become the transaction date.
 */
export function resolveExpenseDate(text: string, date: string): string {
  const today = getTodayIsoDate();
  return date > today && /예매|예약/.test(text) ? today : date;
}

export function dateToIsoTimestamp(date: string): string {
  if (date === getTodayIsoDate()) return new Date().toISOString();
  return new Date(`${date}T12:00:00`).toISOString();
}

/**
 * Deterministically detects installment payment indicators (무이자/일반 할부)
 * and calculates monthly scheduled amounts and remainder.
 */
export function detectInstallment(text: string, totalAmount: number): InstallmentDetectionResult | null {
  if (!text || totalAmount <= 0) return null;

  const monthMatch = text.match(/(\d{1,2})\s*(?:개월|달|회(?:차)?)(?:\s*할부)?/) ||
                     text.match(/할부\s*(\d{1,2})\s*(?:개월|달|회(?:차)?)?/);

  if (!monthMatch) return null;

  const months = parseInt(monthMatch[1], 10);
  if (isNaN(months) || months < 2 || months > 60) {
    return null;
  }

  const hasInstallmentKeyword = /할부|무이자|0%|수수료\s*없(?:는|음)/i.test(text);
  if (!hasInstallmentKeyword && !monthMatch[0].includes('할부')) {
    return null;
  }

  const isInterestFree = /(?:무이자|0%|수수료\s*없(?:는|음))/i.test(text);
  const monthlyAmount = Math.floor(totalAmount / months);
  const remainder = totalAmount - (monthlyAmount * months);

  return {
    totalMonths: months,
    monthlyAmount,
    remainder,
    isInterestFree,
    totalAmount,
  };
}

/**
 * Deterministically increments an ISO date string or Date by a given number of months.
 * Keeps the day of the month or snaps to last day of target month if the target month has fewer days.
 */
export function addMonthsToDate(dateInput: string | Date, monthsToAdd: number): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  if (monthsToAdd === 0) {
    return d.toISOString();
  }

  const originalDay = d.getDate();
  d.setDate(1); // prevent month rollover
  d.setMonth(d.getMonth() + monthsToAdd);
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, daysInTargetMonth));

  return d.toISOString();
}

/**
 * Sanitizes merchant / item label for installment descriptions.
 * Strips card names, particles, and installment keywords while preserving merchant and product names.
 */
export function cleanInstallmentItemTitle(rawText: string, fallback?: string): string {
  if (!rawText) return fallback || '지출 내역';
  let s = rawText;

  // Strip payment method names with attached particles
  s = s.replace(/(?:국민카드|KB국민카드|신한카드|현대카드|삼성카드|롯데카드|우리카드|하나카드|NH농협카드|농협카드|BC카드|씨티카드|토스카드|토스뱅크|토스페이|토스|카카오페이|네이버페이|쿠팡페이|애플페이|신용카드|체크카드)(?:로|으로|에서)?/gi, ' ');

  // Strip installment keywords & months
  s = s.replace(/무이자\s*(?:할부)?/gi, ' ');
  s = s.replace(/(\d{1,2})\s*(?:개월|달|회(?:차)?)(?:\s*할부)?/gi, ' ');
  s = s.replace(/할부\s*(\d{1,2})\s*(?:개월|달|회(?:차)?)?/gi, ' ');
  s = s.replace(/할부/gi, ' ');
  s = s.replace(/0%|수수료\s*없(?:는|음)/gi, ' ');

  // Strip store postposition '에서 ' (e.g. "옥션에서" -> "옥션 ")
  s = s.replace(/(?<=[가-힣a-zA-Z0-9])에서\s+/g, ' ');

  let cleaned = cleanMerchantTitle(s, fallback);
  cleaned = cleaned.replace(/^[로으로에에서을를\s]+/g, '').replace(/[\s로으로에에서을를]+$/g, '').trim();

  return cleaned || fallback || '지출 내역';
}

/**
 * Robust Multilingual Date Extractor for Receipts:
 * Supports Korean, ISO (YYYY-MM-DD), Japanese/Chinese (YYYY年MM月DD日),
 * European (DD/MM/YYYY, DD.MM.YYYY), US (MM/DD/YYYY),
 * and alphanumeric dates (12 Oct 2026, Oct 12 2026).
 */
export function extractReceiptDateLocally(rawText: string, fallbackDate: string): string {
  const text = rawText;

  const formatIsoDate = (year: number, month: number, day: number): string | null => {
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (year < 2000 || year > 2099) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // 1. ISO 8601 & Asian Formats: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY년 MM월 DD일, YYYY年 MM月 DD日
  const isoMatch = text.match(/\b(20\d{2})[-/.년年]\s*(0?[1-9]|1[0-2])[-/.월月]\s*(0?[1-9]|[12]\d|3[01])(?:\s*[일日])?\b/i);
  if (isoMatch) {
    const formatted = formatIsoDate(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10), parseInt(isoMatch[3], 10));
    if (formatted) return formatted;
  }

  // 2. Short Asian format: YY-MM-DD, YY.MM.DD, YY/MM/DD (e.g., 26-09-19 or 26.09.19)
  const shortAsianMatch = text.match(/\b([2-3]\d)[-/.년年]\s*(0?[1-9]|1[0-2])[-/.월月]\s*(0?[1-9]|[12]\d|3[01])(?:\s*[일日])?\b/i);
  if (shortAsianMatch) {
    const formatted = formatIsoDate(2000 + parseInt(shortAsianMatch[1], 10), parseInt(shortAsianMatch[2], 10), parseInt(shortAsianMatch[3], 10));
    if (formatted) return formatted;
  }

  // 3. English Month Name formats: "12 Oct 2026", "12-Oct-2026", "Oct 12, 2026", "October 12 2026"
  const monthNameDayYear = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s/-]+(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[,\s/-]+(20\d{2})\b/i);
  if (monthNameDayYear) {
    const mStr = monthNameDayYear[1].toLowerCase();
    const month = parseInt(ENGLISH_MONTH_MAP[mStr] || '01', 10);
    const day = parseInt(monthNameDayYear[2], 10);
    const year = parseInt(monthNameDayYear[3], 10);
    const formatted = formatIsoDate(year, month, day);
    if (formatted) return formatted;
  }

  const dayMonthNameYear = text.match(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[.\s/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s/,-]+(20\d{2})\b/i);
  if (dayMonthNameYear) {
    const day = parseInt(dayMonthNameYear[1], 10);
    const mStr = dayMonthNameYear[2].toLowerCase();
    const month = parseInt(ENGLISH_MONTH_MAP[mStr] || '01', 10);
    const year = parseInt(dayMonthNameYear[3], 10);
    const formatted = formatIsoDate(year, month, day);
    if (formatted) return formatted;
  }

  // 4. European / Latin: DD/MM/YYYY or DD.MM.YYYY
  const euroMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (euroMatch) {
    const p1 = parseInt(euroMatch[1], 10);
    const p2 = parseInt(euroMatch[2], 10);
    const year = parseInt(euroMatch[3], 10);
    const formatted = formatIsoDate(year, p2, p1);
    if (formatted) return formatted;
  }

  // 5. US format: MM/DD/YYYY
  const usMatch = text.match(/\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2})\b/);
  if (usMatch) {
    const month = parseInt(usMatch[1], 10);
    const day = parseInt(usMatch[2], 10);
    const year = parseInt(usMatch[3], 10);
    const formatted = formatIsoDate(year, month, day);
    if (formatted) return formatted;
  }

  return fallbackDate;
}

/**
 * Robust Multilingual Total Amount Extractor:
 * Parses totals across Korean, English, Japanese, French, German, Spanish receipts.
 * Recognizes keywords, handles decimal currency (USD $42.50, EUR €12.99) and whole currencies (KRW, JPY).
 */
export function extractReceiptTotalAmountLocally(
  lines: string[],
  _fullText: string,
  currency: CurrencyCode
): { totalAmount: number; foundTotal: boolean } {
  let bestAmount = 0;
  let foundExplicit = false;

  const isDecimalCurrency = currency === 'USD' || currency === 'EUR' || currency === 'GBP';

  const parseAmountFromLine = (line: string): number | null => {
    if (/[만천원]/.test(line)) {
      const ko = parseKoreanAmount(line);
      if (ko && ko > 0) return ko;
    }

    const patterns = [
      /(?:[\$€£¥₩]\s*)([\d,]+(?:\.\d{1,2})?)/g,
      /([\d,]+(?:\.\d{1,2})?)\s*(?:[\$€£¥₩]|krw|usd|eur|jpy|gbp|원|엔|달러|유로)/gi,
      /(?:[:：]\s*)([\d,]+(?:\.\d{1,2})?)/g,
      /\b([\d,]+(?:\.\d{1,2})?)\b/g,
    ];

    for (const pat of patterns) {
      const matches = Array.from(line.matchAll(pat));
      if (matches.length > 0) {
        for (let i = matches.length - 1; i >= 0; i--) {
          const rawNum = matches[i][1] || matches[i][0];
          const cleaned = rawNum.replace(/,/g, '').trim();
          const val = parseFloat(cleaned);
          if (!isNaN(val) && val > 0) {
            if ((val === 2024 || val === 2025 || val === 2026 || val === 2027) && /date|일자|년/i.test(line)) {
              continue;
            }
            return isDecimalCurrency ? Math.round(val * 100) / 100 : Math.round(val);
          }
        }
      }
    }

    return null;
  };

  for (const line of lines) {
    if (HIGH_PRIORITY_TOTAL_REGEX.test(line)) {
      const parsed = parseAmountFromLine(line);
      if (parsed && parsed > 0) {
        bestAmount = parsed;
        foundExplicit = true;
      }
    } else if (!foundExplicit && MEDIUM_PRIORITY_TOTAL_REGEX.test(line)) {
      const parsed = parseAmountFromLine(line);
      if (parsed && parsed > 0) {
        bestAmount = parsed;
        foundExplicit = true;
      }
    }
  }

  return { totalAmount: bestAmount, foundTotal: foundExplicit };
}
