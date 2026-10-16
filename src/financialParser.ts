import { Transaction, TransactionType, CurrencyCode, ParsedReceiptData, ReceiptItem, DebtItem, LoanSplitSuggestion, ReceivableRecoverySuggestion, InstallmentMetadata } from './types';
import { cleanMerchantTitle } from './merchantSanitizer';
import { generateSecureId } from './identifiers';
import { anonymizeFinancialInput } from './piiSanitizer';
export { anonymizeFinancialInput } from './piiSanitizer';

export interface ParsedItem {
  date: string; // YYYY-MM-DD
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  category: string;
  merchant: string;
  note?: string;
  installmentMonths?: number;
  isInterestFree?: boolean;
  totalAmount?: number;
  isOverdraft?: boolean;
  overdraftLimit?: number;
  currentBalance?: number;
}

export interface PeerDebtEvent {
  counterparty: string;
  // RECEIVABLE: they owe me, PAYABLE: I owe them, REPAYMENT: I paid back what I owed
  direction: 'RECEIVABLE' | 'PAYABLE' | 'REPAYMENT';
  amount: number;
  // true when no money moved for the user (someone else paid) so no transaction is recorded
  debtOnly: boolean;
}

export interface UnequalSplitInfo {
  total: number;
  userShare: number;
  method: 'ratio' | 'extra';
}

export interface ParsedTransactionResult {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  category: string;
  subCategory?: string;
  description: string;
  merchant?: string;
  date: string;
  paymentMethod?: string;
  groupId?: string;
  originalTotal?: number;
  confidenceScore?: number;
  rawClause?: string;
  isInternalTransfer?: boolean;
  peerDebt?: PeerDebtEvent;
  splitInfo?: UnequalSplitInfo;
  clarification?: string;
  note?: string;
  loanSplitSuggestion?: LoanSplitSuggestion;
  receivableRecoverySuggestion?: ReceivableRecoverySuggestion;
  installment?: InstallmentMetadata;
  isOverdraft?: boolean;
  overdraftLimit?: number;
  currentBalance?: number;
}

/**
 * Converts Korean & Global numbers into numerical integers.
 * Examples:
 *   "4만원" -> 40000
 *   "4만 5천원" -> 45000
 *   "1.5만" -> 15000
 *   "20k" -> 20000
 *   "1.5M" -> 1500000
 *   "3,500,000원" -> 3500000
 *   "1억 2천만원" -> 120000000
 *   "만 원씩" -> 10000
 */
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
  // e.g. "-350만원", "잔액 -350만원", "-350만", "- 3,500,000원", "-$35"
  const isExplicitNegative = /(?:^|\s|[^\p{L}\d\-])-\s*(?:\d|[억만천]|원|\$|€|¥|£|₩)/u.test(text);

  // Clean commas in numbers like 3,500,000
  const normalized = text.replace(/(\d+),(\d{3})/g, '$1$2').replace(/(\d+),(\d{3})/g, '$1$2');

  // Check if text has any Korean units: 억, 만, 천
  if (/[억만천]|\d\s*백/.test(normalized)) {
    let total = 0;
    let hasMatched = false;

    // 1. 억 part (e.g. "1억", "2.5억", "억")
    const eokMatch = normalized.match(/(\d+(?:\.\d+)?)\s*억/);
    if (eokMatch) {
      total += parseFloat(eokMatch[1]) * 100000000;
      hasMatched = true;
    } else if (/(?:^|[^\p{L}\d])억(?:\s*원|\s*씩)/u.test(normalized)) {
      total += 100000000;
      hasMatched = true;
    }

    // 2. 천만 part (e.g. "1억 2천만", "2천만원")
    const cheonManMatch = normalized.match(/(\d+(?:\.\d+)?)\s*천\s*만/);
    if (cheonManMatch) {
      total += parseFloat(cheonManMatch[1]) * 10000000;
      hasMatched = true;
    } else {
      // Regular 만 part (e.g. "4만", "1.5만", "350만", or standalone "만", "만원", "만 원씩")
      const manMatch = normalized.match(/(\d+(?:\.\d+)?)\s*만/);
      if (manMatch) {
        total += parseFloat(manMatch[1]) * 10000;
        hasMatched = true;
      } else if (/(?:^|[^\p{L}\d])만(?:\s*원|\s*씩)/u.test(normalized)) {
        total += 10000;
        hasMatched = true;
      }
    }

    // 3. 천 part (e.g. "4만 5천", "5천원", or standalone "천", "천원")
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

    // 3b. 백 part (e.g. "4천5백원", "9백원")
    const baekMatch = normalized.match(/(\d+(?:\.\d+)?)\s*백/);
    if (baekMatch) {
      total += parseFloat(baekMatch[1]) * 100;
      hasMatched = true;
    }

    // 4. Remaining raw digits before '원' if after 만 (e.g. "4만 500원")
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

  // 4. K or M notation: e.g. "20k", "1.5M"
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

  // 5. Standard number with currency marker: e.g. "4500원", "12000 KRW", "$35.50", "€12.99"
  const globalDecimalMatch = normalized.match(/(?:\$|€|¥|£|₩)?\s*(\d+(?:\.\d+)?)\s*(?:원|krw|usd|달러|dollar|eur|유로|euro|jpy|엔|yen|gbp|파운드)?/i);
  if (globalDecimalMatch && globalDecimalMatch[1]) {
    const parsed = parseFloat(globalDecimalMatch[1]);
    if (!isNaN(parsed) && parsed > 0) {
      return isExplicitNegative ? -parsed : parsed;
    }
  }

  // 6. Any standalone number sequence (including decimal)
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
 * Currency Detector
 */
export function detectCurrency(text: string): CurrencyCode {
  const lower = text.toLowerCase();
  if (lower.includes('$') || lower.includes('usd') || lower.includes('달러') || lower.includes('dollar')) {
    return 'USD';
  }
  if (lower.includes('€') || lower.includes('eur') || lower.includes('유로') || lower.includes('euro')) {
    return 'EUR';
  }
  if (lower.includes('¥') || lower.includes('jpy') || lower.includes('엔') || lower.includes('yen')) {
    return 'JPY';
  }
  if (lower.includes('£') || lower.includes('gbp') || lower.includes('파운드')) {
    return 'GBP';
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
 * Top 500 Domestic & Global Merchant and Concept Lexicon
 */
interface CategoryRule {
  category: string;
  subCategory: string;
  patterns: RegExp[];
  confidence: number;
}

const CATEGORY_LEXICON: CategoryRule[] = [
  // --- Food: Cafe ---
  {
    category: 'Food',
    subCategory: 'Cafe',
    patterns: [
      /스타벅스|스벅|starbucks|투썸|투썸플레이스|twosome|메가커피|빽다방|컴포즈|이디야|ediya|커피빈|coffee\s*bean|폴바셋|블루보틀|blue\s*bottle|할리스|hollys|파스쿠찌|공차|gongcha|베스킨라빈스|배스킨|배라|baskin|설빙|던킨|dunkin|카페|커피|아메리카노|라떼|에스프레소|디저트|베이커리|빵집|성심당|파리바게뜨|파바|뚜레쥬르|마카롱|케이크|와플|cafe|coffee|latte|dessert/i
    ],
    confidence: 0.98
  },
  // --- Food: Dining / Restaurants ---
  {
    category: 'Food',
    subCategory: 'Dining',
    patterns: [
      /순두부|순두부찌개|김치찌개|된장찌개|부대찌개|파스타|pasta|피자|pizza|버거|burger|햄버거|맥도날드|mcdonald|버거킹|burger\s*king|맘스터치|롯데리아|서브웨이|subway|삼겹살|고기집|갈비|한우|곱창|막창|초밥|스시|sushi|라멘|마라탕|마라샹궈|짜장면|짬뽕|탕수육|중식|한식|일식|양식|분식|떡볶이|엽떡|신전|김밥|김밥천국|식당|레스토랑|점심|저녁|아침|식사|회식|술집|포차|이자카야|호프|치킨|교촌|bbq|bhc|굽네|푸라닭|노랑통닭|dinner|lunch|dining|restaurant|meal/i
    ],
    confidence: 0.95
  },
  // --- Food: Delivery ---
  {
    category: 'Food',
    subCategory: 'Delivery',
    patterns: [
      /배달의민족|배민|baemin|요기요|yogiyo|쿠팡이츠|coupangeats|배달|야식|배달팁/i
    ],
    confidence: 0.96
  },
  // --- Food: Grocery ---
  {
    category: 'Food',
    subCategory: 'Grocery',
    patterns: [
      /이마트|emart|홈플러스|homeplus|롯데마트|lottemart|트레이더스|traders|코스트코|costco|하나로마트|노브랜드|nobrand|마켓컬리|컬리|kurly|오아시스|정육점|청과|야채|과일|반찬|식자재|슈퍼마켓|마트|장보기|grocery|supermarket/i
    ],
    confidence: 0.97
  },
  // --- Living: Daily Supplies ---
  {
    category: 'Living',
    subCategory: 'Daily Supplies',
    patterns: [
      /다이소|daiso|올리브영|올영|oliveyoung|무인양품|muji|자주|jaju|화장지|휴지|세제|섬유유연제|샴푸|린스|바디워시|칫솔|치약|비누|수건|청소용품|생필품|건전지|문구|daily\s*supplies|toilet\s*paper|detergent/i
    ],
    confidence: 0.95
  },
  // --- Living: E-commerce / Shopping ---
  {
    category: 'Living',
    subCategory: 'Shopping',
    patterns: [
      /쿠팡|coupang|네이버쇼핑|11번가|g마켓|지마켓|옥션|위메프|티몬|알리|aliexpress|테무|temu|아마존|amazon|인터넷쇼핑/i
    ],
    confidence: 0.92
  },
  // --- Living: Fashion & Beauty ---
  {
    category: 'Living',
    subCategory: 'Fashion',
    patterns: [
      /무신사|musinsa|지그재그|에이블리|29cm|w컨셉|유니클로|uniqlo|자라|zara|h&m|스파오|탑텐|나이키|nike|아디다스|adidas|옷|의류|신발|가방|미용실|헤어샵|바버샵|네일|화장품|스킨케어|향수/i
    ],
    confidence: 0.95
  },
  // --- Living: Convenience Store ---
  {
    category: 'Living',
    subCategory: 'Convenience',
    patterns: [
      /gs25|cu|씨유|세븐일레븐|7-eleven|이마트24|미니스톱|편의점|convenience/i
    ],
    confidence: 0.96
  },
  // --- Transport: Public ---
  {
    category: 'Transport',
    subCategory: 'Public Transport',
    patterns: [
      /지하철|전철|메트로|metro|subway|시내버스|광역버스|버스|bus|티머니|캐시비|교통카드|코레일|ktx|srt|기차|열차/i
    ],
    confidence: 0.97
  },
  // --- Transport: Taxi & Mobility ---
  {
    category: 'Transport',
    subCategory: 'Taxi',
    patterns: [
      /카카오택시|카카오\s*t|kakaot|타다|tada|우버|uber|택시|taxi|cab|킥보드|지쿠터|씽씽|따릉이|쏘카|socar|그린카/i
    ],
    confidence: 0.96
  },
  // --- Transport: Fuel & Vehicle ---
  {
    category: 'Transport',
    subCategory: 'Vehicle',
    patterns: [
      /주유소|sk에너지|gs칼텍스|s-oil|에쓰오일|현대오일뱅크|주유|기름|휘발유|경유|전기차충전|하이패스|통행료|톨게이트|주차장|주차|주차비|세차|엔진오일|타이어|차량정비|car|gas\s*station/i
    ],
    confidence: 0.95
  },
  // --- Fixed: Subscriptions ---
  {
    category: 'Fixed',
    subCategory: '구독',
    patterns: [
      /넷플릭스|netflix|유튜브|youtube|디즈니플러스|disney|티빙|tving|웨이브|wavve|왓챠|watcha|스포티파이|spotify|멜론|melon|지니|genie|벅스|플로|flo|밀리의서재|리디북스|리디|애플|apple|icloud|구글원|google\s*one|chatgpt|openai|claude|notion|노션|aws|클라우드|쿠팡와우|와우멤버십|네이버플러스|구독|subscription/i
    ],
    confidence: 0.98
  },
  // --- Fixed: Utilities & Telecom ---
  {
    category: 'Fixed',
    subCategory: 'Utilities',
    patterns: [
      /관리비|아파트관리비|전기세|전기요금|한전|도시가스|가스비|수도세|수도요금|skt|kt|lg\s*u\+|lg유플러스|알뜰폰|통신비|휴대폰요금|인터넷요금|월세|임대료|rent|utilities/i
    ],
    confidence: 0.97
  },
  // --- Income: Salary & Regular Income ---
  {
    category: '급여',
    subCategory: '정기수입',
    patterns: [
      /월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|salary|paycheck|allowance/i
    ],
    confidence: 0.98
  },
  // --- Fixed: Finance & Insurance & Savings ---
  {
    category: 'Fixed',
    subCategory: 'Finance',
    patterns: [
      /주택청약|청약|적금|예금|펀드|투자|국민연금|건강보험|실손보험|삼성화재|현대해상|db손해보험|kb손해보험|교보생명|대출|대출이자|이자납입|학자금/i
    ],
    confidence: 0.96
  },
  // --- Health: Medical & Fitness ---
  {
    category: 'Health',
    subCategory: 'Medical',
    patterns: [
      /병원|의원|내과|이비인후과|치과|안과|피부과|정형외과|한의원|외과|종합병원|응급실|약국|처방전|약값|안경|콘택트렌즈|영양제|비타민|오메가3|유산균|health|hospital|pharmacy/i
    ],
    confidence: 0.97
  },
  {
    category: 'Health',
    subCategory: 'Fitness',
    patterns: [
      /헬스|헬스장|피트니스|fitness|gym|pt|피티|필라테스|요가|크로스핏|수영장|수영|클라이밍|테니스/i
    ],
    confidence: 0.96
  },
  // --- Leisure: Culture & Entertainment ---
  {
    category: 'Leisure',
    subCategory: 'Entertainment',
    patterns: [
      /cgv|롯데시네마|메가박스|영화|cinema|movie|콘서트|뮤지컬|연극|공연|전시|미술관|박물관|티켓|인터파크|노래방|코인노래방|코노|pc방|오락실|볼링|당구|골프|스크린골프|golf/i
    ],
    confidence: 0.97
  },
  // --- Leisure: Travel & Lodging ---
  {
    category: 'Leisure',
    subCategory: 'Travel',
    patterns: [
      /호텔|hotel|리조트|펜션|에어비앤비|airbnb|야놀자|여기어때|모텔|숙소|숙박|항공권|비행기|대한항공|아시아나|제주항공|진에어|면세점|travel|flight/i
    ],
    confidence: 0.96
  },
  // --- Leisure: Books & Games ---
  {
    category: 'Leisure',
    subCategory: 'Hobbies',
    patterns: [
      /교보문고|알라딘|yes24|영풍문고|서점|도서|책|스팀|steam|닌텐도|플레이스테이션|플스|게임|game|취미/i
    ],
    confidence: 0.95
  }
];

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
          confidence: rule.confidence
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

  // Absolute fallback: still assign living instead of uncategorized to protect user trust, but mark lower confidence
  return {
    category: 'Living',
    subCategory: 'General',
    confidence: 0.5
  };
}

/**
 * 1. Credit Card Settlement & Internal Transfer Deduplication Detector:
 * Recognizes credit card bill debits, payment notifications, and inter-account transfers.
 * Marks them strictly as TRANSFER (with isInternalTransfer: true) to prevent double counting
 * against monthly spending budgets!
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
  let cardName = cardMatch ? cardMatch[1].trim() : (/card\s*bill|credit\s*card/i.test(text) ? 'Card' : '신용카드');
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
 * Overdraft Account (마이너스 통장 / 한도대출) Detector:
 * Recognizes overdraft account keywords (마통, 마이너스 통장, 한도 대출, overdraft).
 * - Identifies deposit / repayment: "마통에 100만원 입금", "마통 상환 50만원" -> TRANSFER with subCategory '마이너스대출 상환'
 * - Identifies negative balance entry & usage: "신한 마통 잔액 -350만원", "마이너스 통장 200만원 사용" -> isOverdraft: true, currentBalance: -3500000
 */
export const OVERDRAFT_REGEX = /(?:마통|마이너스\s*통장|한도\s*대출|overdraft)/i;

export interface OverdraftDetectionResult {
  isOverdraft: boolean;
  action: 'REPAYMENT' | 'BALANCE_OR_USAGE';
  amount: number;
  currentBalance?: number;
  overdraftLimit?: number;
  institution?: string;
  accountName?: string;
  description: string;
}

export function detectOverdraftTransaction(text: string): OverdraftDetectionResult | null {
  if (!OVERDRAFT_REGEX.test(text)) return null;

  // Extract bank/institution if mentioned
  const bankMatch = text.match(/(신한은행|신한|국민은행|KB국민은행|KB국민|국민|카카오뱅크|토스뱅크|토스|하나은행|하나|우리은행|우리|NH농협은행|NH농협|농협|케이뱅크|기업은행|IBK기업|SC제일은행|씨티은행|새마을금고|신협|수협)/i);
  const institution = bankMatch ? bankMatch[0] : undefined;
  const accountLabel = institution ? `${institution} 마이너스통장` : '마이너스 통장';

  // Extract overdraft limit if mentioned (e.g. "한도 3000만원", "한도 3천만", "한도: 5천만원")
  const limitMatch = text.match(/한도(?:\s*[:은는]?\s*)?(\d+(?:\.\d+)?\s*(?:억원|억|만원|만|천원|천|원)?)/i);
  const overdraftLimit = limitMatch ? (parseKoreanAmount(limitMatch[1]) ? Math.abs(parseKoreanAmount(limitMatch[1])!) : undefined) : undefined;

  // Parse amount (parseKoreanAmount handles signed/unsigned)
  const parsedAmt = parseKoreanAmount(text);
  const absAmount = parsedAmt ? Math.abs(parsedAmt) : 0;

  // Repayment / deposit keyword check
  // e.g. "마통에 100만원 입금", "마통 상환 50만원", "신한 마통 100만원 채워넣음", "마이너스통장 200만원 갚음"
  const isRepayment = /(?:입금|상환|채워|갚음|갚았|채움|메꿈|메꿨|납입|deposit|repay|원금상환)/i.test(text);

  if (isRepayment) {
    return {
      isOverdraft: true,
      action: 'REPAYMENT',
      amount: absAmount,
      overdraftLimit,
      institution,
      accountName: accountLabel,
      description: `${accountLabel} 상환`
    };
  }

  // Negative balance entry or overdraft usage/draw
  // e.g. "신한 마통 잔액 -350만원", "마이너스 통장 200만원 사용", "마통에서 100만원 인출"
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
    description: desc
  };
}

/**
 * 2. Smart Debt & Loan Split Detector:
 * Recognizes loan repayment notifications/SMS (e.g. "[카카오뱅크] 대출 원리금 1,000,000원 납입 완료").
 * Cross-references with existing DebtItem records, calculates or estimates the split:
 * Principal (reduces debt liability) vs Interest (logged as financial expense).
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

  // 1. Try to find matching debt from existing records
  const activeDebts = debts.filter(d => d.isActive !== false && d.type !== 'LOAN_RECEIVABLE');
  let matchedDebt = activeDebts.find(d => 
    text.includes(d.counterpartyOrBank) || 
    text.includes(d.name) ||
    (d.counterpartyOrBank && text.includes(d.counterpartyOrBank.replace(/은행|뱅크/g, '')))
  );

  if (!matchedDebt && activeDebts.length > 0) {
    // If only one active debt exists, associate with it
    matchedDebt = activeDebts[0];
  }

  // 2. Check for explicit principal vs interest split in text
  // e.g., "원금 820,000원, 이자 180,000원" or "원금 80만원 / 이자 20만원"
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
    // Auto-calculate split using debt contract details
    const annualRate = matchedDebt.interestRateAnnual || 4.5;
    // Monthly interest = Remaining Principal * (Annual Rate / 100 / 12)
    interest = Math.round(matchedDebt.remainingPrincipal * (annualRate / 100 / 12));
    if (interest >= totalPayment) {
      interest = Math.round(totalPayment * 0.25); // reasonable safety bound
    }
    principal = Math.max(0, totalPayment - interest);
  } else if (totalPayment > 0) {
    // Default estimated 80/20 split if no debt registered yet
    interest = Math.round(totalPayment * 0.2);
    principal = totalPayment - interest;
  }

  const remainingAfter = matchedDebt 
    ? Math.max(0, matchedDebt.remainingPrincipal - principal)
    : 0;

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
    explanation: `${debtName} 상환: 원금 감채 ${principal.toLocaleString()}원 (부채 감소) + 이자 비용 ${interest.toLocaleString()}원 (금융비용)`
  };

  return {
    isLoanRepayment: true,
    debt: matchedDebt,
    totalPayment,
    principal,
    interest,
    suggestion
  };
}

/**
 * 3. Context-Aware Receivable Matching:
 * When an incoming transfer arrives from a known counterparty (e.g. "김민수 50,000원 입금"),
 * checks if there is an active LOAN_RECEIVABLE associated with that person.
 * Suggests deducting from the receivable balance instead of incorrectly counting it as newly earned Income!
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

  const receivables = debts.filter(d => d.type === 'LOAN_RECEIVABLE' && d.isActive !== false && d.remainingPrincipal > 0);
  if (receivables.length === 0) return null;

  // Check if any borrower's name or debt label is mentioned
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
    explanation: `${matchedReceivable.counterpartyOrBank}님에게 빌려준 돈(${matchedReceivable.remainingPrincipal.toLocaleString()}원 중) ${amount.toLocaleString()}원 상환 회수 (미수 채권 차감 및 수입 부풀림 방지)`
  };

  return {
    isReceivableRecovery: true,
    debt: matchedReceivable,
    recoveredAmount: amount,
    suggestion
  };
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

/**
 * Extracts common date metadata across clauses (e.g., 오늘, 어제, 그제, ISO dates).
 */
export function extractCommonDate(text: string): string {
  return extractExplicitDate(text) ?? getTodayIsoDate();
}

function formatLocalIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatLocalIsoDate(d);
}

const WEEKDAY_INDEX: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };

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

export interface InstallmentDetectionResult {
  totalMonths: number;
  monthlyAmount: number;
  remainder: number;
  isInterestFree: boolean;
  totalAmount: number;
}

/**
 * Deterministically detects installment payment indicators (무이자/일반 할부)
 * and calculates monthly scheduled amounts and remainder.
 *
 * Rules:
 * - Match regex for months: (\d{1,2})\s*(?:개월|달|회)(?:\s*할부)?
 * - Detect zero-interest keyword: /(?:무이자|0%|수수료\s*없(?:는|음))/i
 * - Calculate monthlyAmount = Math.floor(totalAmount / months) and remainder = totalAmount - (monthlyAmount * months)
 */
export function detectInstallment(text: string, totalAmount: number): InstallmentDetectionResult | null {
  if (!text || totalAmount <= 0) return null;

  // Match regex for months: (\d{1,2})\s*(?:개월|달|회)(?:\s*할부)?
  // Also tolerate prefix syntax like "할부 10개월", "할부 10회", "할부 10"
  const monthMatch = text.match(/(\d{1,2})\s*(?:개월|달|회(?:차)?)(?:\s*할부)?/) ||
                     text.match(/할부\s*(\d{1,2})\s*(?:개월|달|회(?:차)?)?/);

  if (!monthMatch) return null;

  const months = parseInt(monthMatch[1], 10);
  if (isNaN(months) || months < 2 || months > 60) {
    return null;
  }

  // Check installment or zero-interest context
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
    totalAmount
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

export interface DutchPayModifier {
  targetKeyword?: string;  // e.g. "식사", "식사비", "밥", "커피"
  portionAmount?: number;  // e.g. 10000 ("만 원씩", "각자 15,000원씩")
  splitCount?: number;     // e.g. 2 ("2명 N빵", "반반"), 3 ("3명 엔빵")
  rawClause: string;
}

/**
 * Splits sentence by commas, periods, or coordinating conjunctions (그리고, 및, +)
 * while preserving numbers with thousands commas (e.g. 15,000) or decimals.
 */
export function splitIntoClauses(raw: string): string[] {
  // Protect numbers with commas (e.g. 15,000) and decimals (e.g. 1.5)
  const protectedText = raw
    .replace(/(\d+),(\d{3})/g, '$1#COMMA#$2')
    .replace(/(\d+),(\d{3})/g, '$1#COMMA#$2')
    .replace(/\b(\d+)\.(\d+)\b/g, '$1#DOT#$2');

  // Separate chained events ("5만원 받았는데 2만원 씀", "20유로 쓰고 1,000엔 씀")
  // and consecutive "item amount" pairs ("커피 4,500원 점심 9,000원") into their own clauses.
  const separatedText = protectedText
    .replace(/(받았는데|받았고|받았지만|받고|쓰고|썼고|내고|냈고|샀고)\s+(?=[^,.]*\d)/g, '$1, ')
    .replace(
      /(?<=(?:\d|[만천억])\s?(?:원|엔|달러|유로|파운드|불)?)\s+(?=[가-힣A-Za-z]{1,8}\s*(?:[\d$€¥£₩])(?!\d*\s*(?:명|인|개월|일|시|분)))/g,
      ', '
    );

  // Split by comma, period, coordinating conjunctions (그리고, 및, +), and newlines
  const rawSegments = separatedText
    .split(/(?:[,\.]\s*|\s+(?:그리고|및|\+)\s+|\r?\n+)/g)
    .map(s => s.replace(/#COMMA#/g, ',').replace(/#DOT#/g, '.').trim())
    .filter(s => s.length > 0);

  return rawSegments;
}

/**
 * Extracts Dutch-Pay modifier rule from clause if present.
 * Detects keywords: 더치페이, 엔빵, N빵, 각자, 만 원씩, 반반, 반띵
 */
export function extractDutchPayModifier(clause: string): DutchPayModifier | null {
  const hasDutchKeyword = /더치페이|엔빵|n빵|각자|반반|반띵|씩|나눔|나눠|나눴/i.test(clause);
  if (!hasDutchKeyword) return null;

  // 1. Check for explicit portion amount: e.g. "만 원씩", "10,000원씩", "각자 만원씩"
  let portionAmount: number | undefined;
  const portionMatch = clause.match(/(?:각자\s*)?([0-9.,만천억원kKmM\s]+?)\s*씩/i);
  if (portionMatch) {
    const parsedAmt = parseKoreanAmount(portionMatch[1]);
    if (parsedAmt && parsedAmt > 0) {
      portionAmount = parsedAmt;
    }
  }

  // 2. Check for split count: e.g. "2명 N빵", "3명", "3명 엔빵", "반반", "반띵"
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

  // If generic "더치페이" or "엔빵" without explicit count or portion, default to 2
  if (!portionAmount && !splitCount) {
    if (/더치페이|엔빵|n빵|각자|나눔|나눠|나눴/i.test(clause)) {
      splitCount = 2;
    }
  }

  // 3. Extract target keyword: e.g. "식사비는", "식사는", "밥값은", "커피는"
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
      rawClause: clause
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
    note
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
      merchant: m ? m[0] : (clean.includes('커피') ? '커피' : '카페')
    };
  }

  // Meal / Dining / Food
  if (/식사|밥|점심|저녁|아침|순두부|찌개|파스타|고기|삼겹살|갈비|한우|곱창|초밥|스시|라멘|마라탕|짜장면|짬뽕|탕수육|치킨|피자|버거|햄버거|맥도날드|버거킹|맘스터치|롯데리아|서브웨이|교촌|bbq|bhc|식당|레스토랑|외식|밥값|회식|분식|떡볶이|김밥|meal|lunch|dinner|dining|food/i.test(clean)) {
    const m = clean.match(/맥도날드|버거킹|맘스터치|롯데리아|서브웨이|교촌|bbq|bhc|굽네|삼겹살|갈비|파스타|피자|치킨|순두부|초밥|라멘|마라탕|식사|점심|저녁|식당|밥/i);
    return {
      category: '식비',
      merchant: m ? m[0] : '식사'
    };
  }

  // Transport
  if (/지하철|전철|시내버스|버스|택시|카카오택시|카카오\s*t|타다|우버|교통|교통카드|티머니|ktx|srt|기차|주유소|주유|기름|휘발유|경유|통행료|하이패스|주차장|주차|주차비|따릉이|킥보드|subway|bus|taxi|cab|transport/i.test(clean)) {
    const m = clean.match(/카카오택시|카카오\s*t|타다|우버|지하철|버스|택시|주유소|주유|기차|ktx|srt|주차장|주차비|주차/i);
    return {
      category: '교통',
      merchant: m ? m[0] : '교통'
    };
  }

  // Living / Shopping
  if (/이마트|홈플러스|롯데마트|코스트코|트레이더스|마트|장보기|슈퍼마켓|다이소|올리브영|올영|무인양품|자주|생필품|화장지|휴지|세제|샴푸|칫솔|쿠팡|네이버쇼핑|11번가|지마켓|알리|테무|아마존|쇼핑|무신사|유니클로|자라|나이키|아디다스|옷|의류|신발|gs25|cu|씨유|세븐일레븐|이마트24|편의점/i.test(clean)) {
    const m = clean.match(/이마트|홈플러스|롯데마트|코스트코|트레이더스|다이소|올리브영|쿠팡|네이버쇼핑|무신사|유니클로|자라|나이키|gs25|cu|씨유|세븐일레븐|이마트24|편의점|마트|쇼핑|생필품/i);
    return {
      category: '생활/쇼핑',
      merchant: m ? m[0] : '생활/쇼핑'
    };
  }

  // Medical / Health
  if (/병원|의원|내과|이비인후과|치과|안과|피부과|정형외과|한의원|약국|약값|처방전|안경|헬스|헬스장|피트니스|pt|피티|필라테스|요가|영양제|비타민/i.test(clean)) {
    const m = clean.match(/병원|약국|치과|안과|피부과|한의원|헬스장|헬스|pt|영양제/i);
    return {
      category: '의료/건강',
      merchant: m ? m[0] : '의료/건강'
    };
  }

  // Leisure / Culture
  if (/cgv|롯데시네마|메가박스|영화|콘서트|뮤지컬|연극|공연|전시|미술관|티켓|노래방|코노|pc방|골프|스크린골프|호텔|리조트|펜션|에어비앤비|야놀자|여기어때|숙소|숙박|항공권|비행기|서점|교보문고|도서|책|게임|스팀/i.test(clean)) {
    const m = clean.match(/cgv|메가박스|롯데시네마|영화|콘서트|뮤지컬|연극|공연|호텔|항공권|교보문고|책/i);
    return {
      category: '문화/여가',
      merchant: m ? m[0] : '문화/여가'
    };
  }

  // Utilities / Telecom / Fixed
  if (/관리비|전기세|전기요금|도시가스|가스비|수도세|수도요금|통신비|휴대폰요금|인터넷요금|월세|임대료|넷플릭스|유튜브|디즈니|티빙|웨이브|스포티파이|멜론|쿠팡와우|네이버플러스|구독/i.test(clean)) {
    const m = clean.match(/넷플릭스|유튜브|디즈니|티빙|스포티파이|멜론|관리비|월세|전기세|가스비|통신비|구독/i);
    return {
      category: '주거/통신',
      merchant: m ? m[0] : '고정지출'
    };
  }

  const title = cleanMerchantTitle(clean, '지출 내역');
  return {
    category: '생활/쇼핑',
    merchant: title !== '지출 내역' ? title : '지출'
  };
}

/**
 * Parses financial natural language input into an array of ParsedItem objects.
 * Supports multi-item sentences and split-bill / Dutch-Pay arithmetic.
 *
 * Example:
 *   "오늘 말자랑 데이트 식사 2만 원, 커피 15,000원 지출. 식사비는 만 원씩 더치페이"
 *   -> [
 *        { date: "2026-10-08", type: "expense", amount: 10000, currency: "KRW", category: "식비", merchant: "식사", note: "식사 20,000원 (더치페이 분담)" },
 *        { date: "2026-10-08", type: "expense", amount: 15000, currency: "KRW", category: "카페/간식", merchant: "커피" }
 *      ]
 */
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

const NAME = '([가-힣]{2,4})';
const LEND_REGEX = /(?:한테|에게|께).*(?:빌려\s*줌|빌려\s*줬|빌려\s*드|꿔\s*줬|꿔\s*줌)/;
const REPAY_REGEX = /(?:한테|에게|께).*(?:갚음|갚았|갚았다|돌려\s*줌|돌려\s*줬)/;
const BORROW_REGEX = /(?:한테|에게).*(?:빌림|빌렸|빌려\s*받|꿨)/;
const THIRD_PARTY_PAID_REGEX = /[가-힣]{2,4}(?:이|가)\s+[^,.]*(?:냈어|냈음|냈다|쏨|쐈|쏴줌|계산했)/;

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
    const name = text.match(new RegExp(`${NAME}(?:이|가)\\s`))?.[1];
    return name ? { counterparty: name, direction: 'PAYABLE', amount: abs, debtOnly: true } : null;
  }
  const target = text.match(new RegExp(`${NAME}(?:한테|에게|께)`))?.[1];
  if (!target) return null;
  if (LEND_REGEX.test(text)) return { counterparty: target, direction: 'RECEIVABLE', amount: abs, debtOnly: false };
  if (BORROW_REGEX.test(text)) return { counterparty: target, direction: 'PAYABLE', amount: abs, debtOnly: false };
  if (REPAY_REGEX.test(text)) return { counterparty: target, direction: 'REPAYMENT', amount: abs, debtOnly: false };
  return null;
}

const AMOUNT_TOKEN = '((?:\\d[\\d,.]*\\s*[억만천백]?\\s*)+원?)';

/**
 * Resolves the user's share for unequal splits:
 *  - ratio:  "9만원 내가 3 민수 6으로 나눔", "9만원 7:3으로 나눔" (first number = me)
 *  - extra:  "민수가 2만원 더 먹음, 저녁 10만원 반반" (민수 ate more → my share is smaller)
 * Returns null when the sentence is not an unequal split.
 */
export function extractUnequalSplit(text: string): UnequalSplitInfo | null {
  const clean = stripDateExpressions(text);
  if (!/나눔|나눠|나눴|반반|더치|엔빵|n빵|더\s*(?:먹|마시|시켰|썼)/i.test(clean)) return null;

  const extra = clean.match(new RegExp(`(?:(내가|나)|${NAME}(?:가|이)?)\\s*${AMOUNT_TOKEN}\\s*더\\s*(?:먹|마시|시켰|썼)`));
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
 * - RECEIVABLE / PAYABLE grow an existing active debt with the same person, or create one.
 * - REPAYMENT shrinks the matching payable (never below 0); null when none exists.
 */
export function planPeerDebtUpdate(event: PeerDebtEvent, debts: DebtItem[], currency: CurrencyCode = 'KRW'): DebtItem | null {
  const wantedType = event.direction === 'RECEIVABLE' ? 'LOAN_RECEIVABLE' : 'LOAN_PAYABLE';
  const existing = debts.find(d => d.type === wantedType && d.isActive !== false && d.counterpartyOrBank === event.counterparty);
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
      lastUpdated: nowIso
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
    isActive: true
  };
}

const REFUND_NOISE = /환불|반품|취소|캐시백|페이백|받음|받았|들어옴|입금|원|\d+|만|천|[을를이가은는도로으]|\s+/g;

/**
 * Finds the expense a refund offsets. Returns null (leave as plain income) unless the match is
 * unambiguous: same currency, remaining refundable amount large enough, and either a shared
 * keyword or an identical amount. Ties between equally good candidates are never guessed.
 */
export function findRefundTarget(
  refund: { amount: number; text: string; currency?: string },
  transactions: Transaction[]
): Transaction | null {
  const keywords = stripDateExpressions(refund.text)
    .split(/[\s,]+/)
    .map(w => w.replace(REFUND_NOISE, ''))
    .filter(w => w.length >= 2);

  const refundedSoFar = new Map<string, number>();
  for (const t of transactions) {
    if (t.refundOfId && t.amount < 0) {
      refundedSoFar.set(t.refundOfId, (refundedSoFar.get(t.refundOfId) ?? 0) + Math.abs(t.amount));
    }
  }

  const scored = transactions
    .filter(t => t.type === 'EXPENSE' && t.amount > 0 && !t.isInternalTransfer && !t.refundOfId)
    .filter(t => (t.currency || 'KRW') === (refund.currency || 'KRW'))
    .filter(t => t.amount - (refundedSoFar.get(t.id) ?? 0) >= refund.amount)
    .map(t => {
      const haystack = `${t.description ?? ''} ${t.category ?? ''}`;
      const keywordHit = keywords.some(k => haystack.includes(k));
      const exact = t.amount === refund.amount;
      return { t, score: (keywordHit ? 3 : 0) + (exact ? 2 : 0) };
    })
    .filter(c => c.score >= 2)
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
    note: `원거래 ${original.amount.toLocaleString()}원 중 ${Math.abs(refund.amount).toLocaleString()}원 환불`
  };
}

const REFUND_REGEX = /환불|반품|취소\s*(?:됨|환급|되어)|캐시백|페이백/;

const EXPENSE_CUE_REGEX = /결제|지출|썼|씀|냄|냈|사먹|구입|구매|샀/;

/**
 * Advance bookings ("내일 모레 갈 콘서트 예매") are paid today, so a future event
 * date must not become the transaction date.
 */
function resolveExpenseDate(text: string, date: string): string {
  const today = getTodayIsoDate();
  return date > today && /예매|예약/.test(text) ? today : date;
}

function dateToIsoTimestamp(date: string): string {
  if (date === getTodayIsoDate()) return new Date().toISOString();
  return new Date(`${date}T12:00:00`).toISOString();
}

export function parseFinancialText(text: string, baseCurrency = 'KRW'): ParsedItem[] {
  if (!text || !text.trim()) return [];

  const sanitized = applySelfCorrection(anonymizeFinancialInput(text));
  if (isPaidByThirdParty(sanitized) || detectPeerDebt(sanitized)) return [];
  const commonDate = extractCommonDate(sanitized);
  const commonCurrency = detectCurrency(sanitized) || baseCurrency;

  // Split sentence into clauses by comma, period, coordinating conjunctions, or newlines
  const clauses = splitIntoClauses(sanitized);

  // 1. Identify Dutch-Pay modifier clauses
  const dutchModifiers: DutchPayModifier[] = [];
  const candidateItemClauses: string[] = [];

  for (const clause of clauses) {
    const modifier = extractDutchPayModifier(clause);
    // If it is purely a Dutch-pay modifier clause (e.g. "식사비는 만 원씩 더치페이", "2명 N빵", "반반 더치페이")
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

  // If no candidate item clauses were found, use all clauses
  const activeClauses = candidateItemClauses.length > 0 ? candidateItemClauses : clauses;
  const results: ParsedItem[] = [];

  for (const clause of activeClauses) {
    const rawParsed = parseKoreanAmount(stripDateExpressions(clause));
    if (!rawParsed) continue;
    const amount = Math.abs(rawParsed);
    if (amount <= 0) continue;

    // Check for Overdraft Account Transaction
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
          overdraftLimit: overdraftMatch.overdraftLimit
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
          overdraftLimit: overdraftMatch.overdraftLimit
        });
        continue;
      }
    }

    // Check item type: income vs transfer vs expense
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|받았|받음|salary|paycheck|bonus|allowance/i.test(clause) &&
      !EXPENSE_CUE_REGEX.test(clause);
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

    // Check if an inline Dutch-pay rule exists within this clause (e.g. "식사 2만 원 반반")
    const inlineModifier = extractDutchPayModifier(clause);

    // Find any matching Dutch-pay rule (either inline or from separate modifier clause)
    let matchedModifier: DutchPayModifier | null = null;
    if (inlineModifier) {
      matchedModifier = inlineModifier;
    } else if (dutchModifiers.length > 0) {
      // Find matching modifier by targetKeyword
      matchedModifier = dutchModifiers.find(dm => {
        if (!dm.targetKeyword) return false;
        const target = dm.targetKeyword;
        return merchant.includes(target) ||
               target.includes(merchant) ||
               (target === '식사' && (category === '식비' || merchant.includes('식사')));
      }) || null;

      // If no targeted modifier matched, but modifier has no specific target, apply if only 1 expense item
      if (!matchedModifier) {
        matchedModifier = dutchModifiers.find(dm => !dm.targetKeyword) || null;
      }
    }

    // Check for installment payment
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
          totalAmount: inst.totalAmount
        });
      }
      continue;
    }

    // Apply Dutch-Pay Arithmetic Logic
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
      note
    });
  }

  // Fallback if no clause matched but the whole text still carries an amount
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
      merchant
    });
  }

  return results;
}

const AI_CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY', 'GBP'];

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
    note: t.note
  };
}

/**
 * Fallback parser using Gemini API when enabled.
 * Instructs LLM to return ParsedItem[] with user net cost explicitly calculated for Dutch-pay scenarios.
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
          engineConfig: apiKey ? { engineType: 'byok', provider: 'gemini', apiKey } : undefined
        })
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

  const clarification = detectClarificationNeeded(sanitized);
  if (clarification) {
    return [{ type: 'EXPENSE', amount: 0, currency, category: 'Living', description: '확인 필요', date: now, clarification, rawClause: sanitized }];
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
        rawClause: sanitized
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
      rawClause: sanitized
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
      rawClause: sanitized
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
        rawClause: sanitized
      }];
    }
  }

  // 0. Check for Overdraft Account (마이너스 통장 / 한도대출) Notification & Usage
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
        rawClause: sanitized
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
        rawClause: sanitized
      });
      return results;
    }
  }

  // A. Check for Loan Repayment Notification (Smart Principal vs Interest Split)
  const loanRepayment = detectLoanRepaymentNotification(sanitized, debts);
  if (loanRepayment && loanRepayment.totalPayment > 0) {
    const groupId = generateSecureId('loan-split');
    // 1) Principal reduction (Non-expense liability reduction)
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
        loanSplitSuggestion: loanRepayment.suggestion
      });
    }
    // 2) Interest expense (Financial expense)
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
        loanSplitSuggestion: loanRepayment.suggestion
      });
    }
    return results;
  }

  // B. Check for Context-Aware Receivable Matching (Recovering lent money)
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
      isInternalTransfer: true, // Prevents misclassifying as new income!
      confidenceScore: 0.98,
      rawClause: sanitized,
      receivableRecoverySuggestion: receivableRecovery.suggestion
    });
    return results;
  }

  // C. Check for Credit Card Settlement (Deduplication against budget inflation)
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
        rawClause: sanitized
      });
      return results;
    }
  }

  // D. Check for Interest-Free / Installment Multi-Month Scheduling (무이자 할부 분할 파싱)
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
          isInterestFree: directInstallment.isInterestFree
        }
      });
    }

    return results;
  }

  // 1. Check for Dutch Pay / Settlement in Korean or English
  // Examples:
  // "민수랑 파스타 4만원 더치페이하고 토스로 2만원 받음"
  // "파스타 4만원 결제하고 영희한테 2만원 정산받음"
  // "회식비 12만원 결제 후 3명 더치페이"
  const isDutch = /더치페이|더치|n빵|엔빵|정산|반띵|각자|dutch|split|settle/i.test(sanitized);
  const isReceivedSettlement = /받음|입금됨|돌려받|받았다|got\s*back|received/i.test(sanitized);

  if (isDutch && isReceivedSettlement) {
    // Extract all numbers
    // Normalize phrases like "4만원" -> 40000 and "2만원" -> 20000
    const parts = sanitized.split(/(?:하고|한\s*후|후|and|,|then)/i);
    let totalBill: number | null = null;
    let settledAmount: number | null = null;

    if (parts.length >= 2) {
      totalBill = parseKoreanAmount(parts[0]);
      settledAmount = parseKoreanAmount(parts[1]);
    }

    if (!totalBill || !settledAmount) {
      // Try global token extraction
      const matches = sanitized.match(/(?:\d+(?:\.\d+)?\s*(?:억|만|천|k|m|원|\$|€|¥|₩)?)/gi) || [];
      const parsedAmounts = matches
        .map(m => parseKoreanAmount(m))
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

      // 1. The full initial bill expense
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
        rawClause: sanitized
      });

      // 2. The settled reimbursement (type: SETTLEMENT)
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
        rawClause: sanitized
      });

      return results;
    }
  }

  // 2. Check for Salary / Income
  // Examples:
  // "이번 달 월급 3,500,000원 기업은행 입금"
  // "오늘 월급 800만원 들어옴"
  // "용돈 10만원 받음"
  const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|받았|받음|salary|paycheck|bonus|allowance/i.test(sanitized);
  const notExpense = !EXPENSE_CUE_REGEX.test(sanitized);
  const amountText = stripDateExpressions(sanitized);
  const detectedAmount = parseKoreanAmount(amountText);

  if (isIncome && notExpense && detectedAmount) {
    const amount = detectedAmount;
    let desc = '급여 / 수입';
    if (/월급/i.test(sanitized)) desc = /오늘/i.test(sanitized) ? '오늘 월급' : '이번 달 월급';
    else if (/용돈/i.test(sanitized)) desc = '용돈 입금';
    else if (/보너스|상여/i.test(sanitized)) desc = '보너스/상여금';
    else if (/배당/i.test(sanitized)) desc = '배당금';
    else if (/알바/i.test(sanitized)) desc = '아르바이트 급여';
    else if (/들어옴|입금/i.test(sanitized)) desc = '수입 입금';

    // Default to '계좌' (Bank/Account) or '현금' (Cash), NEVER Card for income unless explicit card refund
    const incomePaymentMethod = detectPaymentMethod(sanitized, true);

    results.push({
      type: 'INCOME',
      amount,
      currency,
      category: '급여',
      subCategory: '정기수입',
      description: desc,
      date: now,
      paymentMethod: incomePaymentMethod,
      confidenceScore: 0.98,
      rawClause: sanitized
    });
    return results;
  }

  // 3. Check for Transfers / Savings
  // Examples:
  // "주택청약 통장으로 150만원 자동이체"
  // "토스뱅크로 50만원 송금"
  // "신한은행에서 국민은행으로 30만원 이체"
  // NOTE: "점심 순두부찌개 12000원 계좌이체" is an EXPENSE paid via 계좌이체, NOT a TRANSFER!
  const isPurchaseItem = /(?:순두부|찌개|식사|점심|저녁|커피|카페|스타벅스|마트|장보기|다이소|편의점|배달|치킨|피자|파스타|택시|주유|옷|신발|병원|약국|화장지|영양제)/i.test(sanitized);
  const isPureTransfer = /(?:자동이체|송금|적금|예금|청약|주택청약|저축|통장으로|계좌로|에게\s*이체|to\s*account|savings)/i.test(sanitized);
  const isGenericTransfer = /(?:이체|transfer|wire)/i.test(sanitized) && !isPurchaseItem && notExpense;

  if ((isPureTransfer || isGenericTransfer) && !isPurchaseItem && detectedAmount) {
    const amount = detectedAmount;
    let desc = '계좌 이체 / 저축';
    if (/청약/i.test(sanitized)) desc = '주택청약 납입';
    else if (/적금/i.test(sanitized)) desc = '적금 저축';
    else if (/송금/i.test(sanitized)) desc = '계좌 송금';

    results.push({
      type: 'TRANSFER',
      amount,
      currency,
      category: 'Fixed',
      subCategory: 'Savings',
      description: desc,
      date: now,
      paymentMethod: '계좌이체',
      isInternalTransfer: true,
      confidenceScore: 0.95,
      rawClause: sanitized
    });
    return results;
  }

  // 4. Multi-item clauses and Dutch-Pay Arithmetic via parseFinancialText
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
        originalTotal: item.note ? (item.amount * 2) : undefined
      });
    }
    if (results.length > 0) return results;
  }

  // 5. Standard Single Transaction
  // Never fabricate an amount: without one the caller must ask the user again.
  if (!detectedAmount) return results;
  const amount = detectedAmount;
  const isFallbackIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|받았|받음|salary|paycheck|bonus|allowance/i.test(sanitized) && notExpense;

  const { category: inferredCategory, subCategory: inferredSubCategory, merchant, confidence } = inferCategoryAndMerchant(stripDateExpressions(sanitized));
  const category = isFallbackIncome ? '급여' : inferredCategory;
  const subCategory = isFallbackIncome ? '정기수입' : inferredSubCategory;
  const type = isFallbackIncome ? 'INCOME' : 'EXPENSE';

  let cleanDesc = cleanMerchantTitle(stripDateExpressions(sanitized), isFallbackIncome ? '급여 수입' : merchant || '지출 내역');

  const finalPaymentMethod = isFallbackIncome 
    ? detectPaymentMethod(sanitized, true) 
    : detectPaymentMethod(sanitized, false);

  results.push({
    type,
    amount: Math.abs(amount),
    currency,
    category,
    subCategory,
    description: cleanDesc,
    merchant: cleanDesc,
    date: dateToIsoTimestamp(type === 'EXPENSE' ? resolveExpenseDate(sanitized, extractCommonDate(sanitized)) : extractCommonDate(sanitized)),
    paymentMethod: finalPaymentMethod,
    confidenceScore: confidence,
    rawClause: sanitized
  });

  return results;
}

/**
 * Omnibar Real-Time Input Extractor:
 * Quickly extracts detected Merchant, Amount, Currency, and Category chips for live preview.
 */
export interface RealtimePreviewData {
  merchant?: string;
  amount?: number;
  currency: CurrencyCode;
  category?: string;
  paymentMethod?: string;
  isDutch?: boolean;
}

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
      isDutch: false
    };
  }

  const amount = parseKoreanAmount(sanitized);
  const currency = detectCurrency(sanitized);
  const { category, merchant } = inferCategoryAndMerchant(sanitized);
  const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었/i.test(sanitized) && !/결제|지출|썼|사먹|구입|구매/i.test(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized, isIncome);
  const isDutch = /더치페이|더치|n빵|정산|반띵/i.test(sanitized);
  const cleanedTitle = cleanMerchantTitle(sanitized, merchant);

  // Return preview if at least an amount, category or merchant was detected
  if (amount || merchant || (category && category !== 'Living')) {
    return {
      merchant: cleanedTitle !== '지출 내역' ? cleanedTitle : merchant,
      amount: amount || undefined,
      currency,
      category: isIncome ? '급여' : category,
      paymentMethod: paymentMethod || undefined,
      isDutch
    };
  }

  return null;
}

/**
 * Robust Multilingual Date Extractor for Receipts:
 * Supports Korean, ISO (YYYY-MM-DD), Japanese/Chinese (YYYY年MM月DD日),
 * European (DD/MM/YYYY, DD.MM.YYYY), US (MM/DD/YYYY),
 * and alphanumeric dates (12 Oct 2026, Oct 12 2026).
 */
export function extractReceiptDateLocally(rawText: string, fallbackDate: string): string {
  const text = rawText;

  // Month mapping for English abbreviations
  const MONTH_MAP: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
  };

  // Helper to validate and format YYYY-MM-DD
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
    const month = parseInt(MONTH_MAP[mStr] || '01', 10);
    const day = parseInt(monthNameDayYear[2], 10);
    const year = parseInt(monthNameDayYear[3], 10);
    const formatted = formatIsoDate(year, month, day);
    if (formatted) return formatted;
  }

  const dayMonthNameYear = text.match(/\b(0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[.\s/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s/,-]+(20\d{2})\b/i);
  if (dayMonthNameYear) {
    const day = parseInt(dayMonthNameYear[1], 10);
    const mStr = dayMonthNameYear[2].toLowerCase();
    const month = parseInt(MONTH_MAP[mStr] || '01', 10);
    const year = parseInt(dayMonthNameYear[3], 10);
    const formatted = formatIsoDate(year, month, day);
    if (formatted) return formatted;
  }

  // 4. European / Latin: DD/MM/YYYY or DD.MM.YYYY
  const euroMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (euroMatch) {
    // If first number > 12, it must be DD/MM/YYYY
    const p1 = parseInt(euroMatch[1], 10);
    const p2 = parseInt(euroMatch[2], 10);
    const year = parseInt(euroMatch[3], 10);
    if (p1 > 12) {
      const formatted = formatIsoDate(year, p2, p1);
      if (formatted) return formatted;
    } else {
      // Ambiguous DD/MM vs MM/DD: European receipts usually DD/MM/YYYY
      const formatted = formatIsoDate(year, p2, p1);
      if (formatted) return formatted;
    }
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
  fullText: string,
  currency: CurrencyCode
): { totalAmount: number; foundTotal: boolean } {
  // Total keywords ranked by priority
  const HIGH_PRIORITY_TOTAL_REGEX = /(?:합\s*계|총\s*액|결제\s*금액|승인\s*금액|받을\s*금액|카드\s*승인|total\s*amount|grand\s*total|amount\s*due|balance\s*due|final\s*total|montant\s*total|gesamtbetrag|total\s*ttc|importe\s*total|합계금액|합\s*계\s*금\s*액|총\s*합\s*계|合計|お会計|支払金額)/i;
  const MEDIUM_PRIORITY_TOTAL_REGEX = /(?:^|\s)(?:total|subtotal|sub-total|amount|summe|netto|brutto|payer|somme)(?:\s*[:：]|\s+|$)/i;

  let bestAmount = 0;
  let foundExplicit = false;

  const isDecimalCurrency = currency === 'USD' || currency === 'EUR' || currency === 'GBP';

  // Helper to extract numeric amount from a total-candidate line
  const parseAmountFromLine = (line: string): number | null => {
    // 1. If Korean units exist (e.g. 1만 5천원, 15,000원)
    if (/[만천원]/.test(line)) {
      const ko = parseKoreanAmount(line);
      if (ko && ko > 0) return ko;
    }

    // 2. Multilingual currency symbols or words: $45.20, €12.50, £9.99, ¥2,500, 15000 KRW
    // Match the LAST number or currency pattern on the line (usually the amount column on the right)
    const patterns = [
      /(?:[\$€£¥₩]\s*)([\d,]+(?:\.\d{1,2})?)/g,
      /([\d,]+(?:\.\d{1,2})?)\s*(?:[\$€£¥₩]|krw|usd|eur|jpy|gbp|원|엔|달러|유로)/gi,
      /(?:[:：]\s*)([\d,]+(?:\.\d{1,2})?)/g,
      /\b([\d,]+(?:\.\d{1,2})?)\b/g
    ];

    for (const pat of patterns) {
      const matches = Array.from(line.matchAll(pat));
      if (matches.length > 0) {
        // Look from rightmost match backwards (amounts are right-aligned on receipts)
        for (let i = matches.length - 1; i >= 0; i--) {
          const rawNum = matches[i][1] || matches[i][0];
          const cleaned = rawNum.replace(/,/g, '').trim();
          const val = parseFloat(cleaned);
          if (!isNaN(val) && val > 0) {
            // Guard against year numbers like 2026 or time like 1430
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

  // Search through lines
  for (const line of lines) {
    if (HIGH_PRIORITY_TOTAL_REGEX.test(line)) {
      const parsed = parseAmountFromLine(line);
      if (parsed && parsed > 0) {
        bestAmount = parsed;
        foundExplicit = true;
        // High priority found, keep searching only if another high priority appears with larger or subsequent value
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

/**
 * Local Heuristic Receipt Parser:
 * Fallback parser when offline or when Gemini AI is unreachable.
 * Analyzes unstructured receipt text, OCR text lines, or manual receipts.
 * Fully enhanced for multilingual receipts (Korean, English, Japanese, European).
 */
export function parseReceiptTextLocally(
  rawText: string,
  defaultCurrency: CurrencyCode = 'KRW'
): ParsedReceiptData {
  const sanitized = anonymizeFinancialInput(rawText);
  const lines = sanitized
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const today = new Date().toISOString().slice(0, 10);
  let merchantName = '';
  const date = extractReceiptDateLocally(sanitized, today);
  const currency = detectCurrency(sanitized) || defaultCurrency;
  const items: ReceiptItem[] = [];

  // Line by line parsing for items & merchant
  for (const line of lines) {
    // Check for merchant headers like "상호:", "가맹점:", "매장명:", "Store:", "Merchant:", "Shop:"
    const merchantPrefixMatch = line.match(/(?:상호(?:명)?|가맹점(?:명)?|매장(?:명)?|점포명|store(?:\s*name)?|merchant|shop)\s*[:：]?\s*([가-힣a-zA-Z0-9\s()·\-&']+)/i);
    if (merchantPrefixMatch && !merchantName) {
      merchantName = merchantPrefixMatch[1].trim();
      continue;
    }

    // Line item extraction: [Item Name] [Price or Quantity Price]
    // Handles Korean (4,500원), Western ($12.50, 12.50), Japanese (¥1,200)
    const isExcludedHeader = /(?:합\s*계|총\s*액|결제|승인|거래|일시|영수증|사업자|전화|주소|date|total|tax|subtotal|receipt|tel|vat|gst)/i.test(line);
    if (!isExcludedHeader) {
      const itemMatch = line.match(/^([가-힣a-zA-Z0-9\s\-_/&'.]+?)\s+(?:(\d+)\s+)?(?:[\$€£¥₩])?([\d,]+(?:\.\d{1,2})?)\s*(?:원|엔|krw|usd|eur|jpy)?$/i);
      if (itemMatch) {
        const name = itemMatch[1].trim();
        const qty = itemMatch[2] ? parseInt(itemMatch[2], 10) : 1;
        const rawPriceStr = itemMatch[3].replace(/,/g, '');
        const parsedPrice = parseFloat(rawPriceStr);
        if (!isNaN(parsedPrice) && parsedPrice > 0 && name.length >= 2) {
          items.push({
            name,
            price: parsedPrice,
            quantity: isNaN(qty) ? 1 : qty,
            amount: parsedPrice
          });
        }
      }
    }
  }

  // Extract total amount using multilingual logic
  const { totalAmount: detectedTotal, foundTotal } = extractReceiptTotalAmountLocally(lines, sanitized, currency);
  let totalAmount = detectedTotal;

  // If no explicit total found, sum up items or find overall amount
  if (!foundTotal && items.length > 0) {
    totalAmount = items.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);
  } else if (totalAmount === 0) {
    const rawKoreanFallback = parseKoreanAmount(sanitized);
    if (rawKoreanFallback) {
      totalAmount = rawKoreanFallback;
    }
  }

  // Fallback for merchant name
  if (!merchantName) {
    const { merchant } = inferCategoryAndMerchant(sanitized);
    if (merchant) {
      merchantName = merchant;
    } else if (lines.length > 0) {
      const cleanFirst = lines[0].replace(/\[.*?\]|\(.*?\)|영수증|매출전표|고객용|receipt|bill|invoice/gi, '').trim();
      if (cleanFirst.length >= 2 && !/^\d+$/.test(cleanFirst)) {
        merchantName = cleanFirst;
      } else {
        merchantName = '영수증 결제';
      }
    } else {
      merchantName = '영수증 결제';
    }
  }

  // Category & payment method inference
  const { category } = inferCategoryAndMerchant(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized);

  return {
    merchantName,
    date,
    totalAmount: Math.abs(totalAmount),
    currency: String(currency),
    category: category || 'Food',
    items,
    confidenceScore: foundTotal ? 0.85 : 0.75, // Higher heuristic score when explicit total is found
    merchant: merchantName,
    suggestedCategory: category || 'Food',
    paymentMethod: paymentMethod || undefined
  };
}
