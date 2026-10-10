import { TransactionType, CurrencyCode, ParsedReceiptData, ReceiptItem, DebtItem, LoanSplitSuggestion, ReceivableRecoverySuggestion } from './types';
import { cleanMerchantTitle } from './merchantSanitizer';

export interface ParsedItem {
  date: string; // YYYY-MM-DD
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  category: string;
  merchant: string;
  note?: string;
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
  loanSplitSuggestion?: LoanSplitSuggestion;
  receivableRecoverySuggestion?: ReceivableRecoverySuggestion;
}

/**
 * PII Sanitizer & Anonymizer:
 * Strips card numbers, account numbers, resident IDs, and phone numbers before sending to AI or saving.
 */
export function anonymizeFinancialInput(rawText: string): string {
  return rawText
    // Card numbers (16 digits with hyphens or spaces)
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
    // Bank account numbers (3-6 digits - 2-6 digits - 3-8 digits)
    .replace(/\b\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,8}\b/g, '[ACCOUNT]')
    // Korean Resident Registration Numbers (RRN)
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[RRN]')
    // Phone numbers (010, 011, etc.)
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[PHONE]');
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
export function parseKoreanAmount(text: string): number | null {
  if (!text) return null;

  // Clean commas in numbers like 3,500,000
  const normalized = text.replace(/(\d+),(\d{3})/g, '$1$2').replace(/(\d+),(\d{3})/g, '$1$2');

  // Check if text has any Korean units: 억, 만, 천
  if (/[억만천]/.test(normalized)) {
    let total = 0;
    let hasMatched = false;

    // 1. 억 part (e.g. "1억", "2.5억", "억")
    const eokMatch = normalized.match(/(\d+(?:\.\d+)?)\s*억/);
    if (eokMatch) {
      total += parseFloat(eokMatch[1]) * 100000000;
      hasMatched = true;
    } else if (/(?:^|[^\d])억/.test(normalized)) {
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
      } else if (/(?:^|[^\d])만(?:\s*원|\s*씩)?/.test(normalized)) {
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
      } else if (/(?:^|[^\d])천(?:\s*원|\s*씩)?/.test(normalized)) {
        total += 1000;
        hasMatched = true;
      }
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
      return Math.round(total);
    }
  }

  // 4. K or M notation: e.g. "20k", "1.5M"
  const kMatch = normalized.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  const mMatch = normalized.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);

  // 5. Standard number with currency marker: e.g. "4500원", "12000 KRW", "$35.50", "€12.99"
  const globalDecimalMatch = normalized.match(/(?:\$|€|¥|£|₩)?\s*(\d+(?:\.\d+)?)\s*(?:원|krw|usd|달러|dollar|eur|유로|euro|jpy|엔|yen|gbp|파운드)?/i);
  if (globalDecimalMatch && globalDecimalMatch[1]) {
    const parsed = parseFloat(globalDecimalMatch[1]);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // 6. Any standalone number sequence (including decimal)
  const anyNum = normalized.match(/\b\d+(?:\.\d+)?\b/);
  if (anyNum) {
    const parsed = parseFloat(anyNum[0]);
    if (!isNaN(parsed) && parsed > 0) return parsed;
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
  const isCardBilling = /(?:카드\s*(?:결제\s*대금|대금\s*결제|결제금액|청구\s*금액|결제일|이용대금|대금\s*출금|대금|납부|청구서)|(?:신용카드|체크카드)\s*대금|(?:후불교통|후불교통비)\s*출금)/i.test(text);
  if (!isCardBilling) return null;

  const cardMatch = text.match(/(현대카드|신한카드|국민카드|KB국민카드|삼성카드|롯데카드|우리카드|하나카드|NH농협카드|농협카드|BC카드|씨티카드|토스카드|카카오페이카드|카카오뱅크카드|[가-힣a-zA-Z0-9]+카드)/i);
  const cardName = cardMatch ? cardMatch[1].trim() : '신용카드';
  const amount = parseKoreanAmount(text);

  return {
    isCardSettlement: true,
    cardName,
    amount: amount || undefined,
    description: `${cardName} 결제대금 출금 (예산 중복 집계 방지 TRANSFER)`
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
  const now = new Date();
  const todayStr = getTodayIsoDate();

  if (/오늘/i.test(text)) {
    return todayStr;
  }

  if (/어제/i.test(text)) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (/그제|그저께/i.test(text)) {
    const prevDay = new Date(now);
    prevDay.setDate(now.getDate() - 2);
    const y = prevDay.getFullYear();
    const m = String(prevDay.getMonth() + 1).padStart(2, '0');
    const d = String(prevDay.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (/내일/i.test(text)) {
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);
    const y = nextDay.getFullYear();
    const m = String(nextDay.getMonth() + 1).padStart(2, '0');
    const d = String(nextDay.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    const y = now.getFullYear();
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return todayStr;
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

  // Split by comma, period, coordinating conjunctions (그리고, 및, +), and newlines
  const rawSegments = protectedText
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
  const hasDutchKeyword = /더치페이|엔빵|n빵|각자|반반|반띵|씩/i.test(clause);
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
    if (/더치페이|엔빵|n빵|각자/i.test(clause)) {
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
export function parseFinancialText(text: string, baseCurrency = 'KRW'): ParsedItem[] {
  if (!text || !text.trim()) return [];

  const sanitized = anonymizeFinancialInput(text);
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
    const amount = parseKoreanAmount(clause);
    if (!amount || amount <= 0) continue;

    // Check item type: income vs transfer vs expense
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance/i.test(clause) &&
      !/결제|지출|썼|사먹|구입|구매/i.test(clause);
    const isPurchase = /(?:순두부|찌개|식사|점심|저녁|커피|카페|스타벅스|마트|장보기|다이소|편의점|배달|치킨|피자|파스타|택시|주유|옷|신발|병원|약국)/i.test(clause);
    const isTransfer = /(?:자동이체|송금|적금|예금|청약|주택청약|저축|통장으로|계좌로|to\s*account|savings)/i.test(clause) && !isPurchase;

    if (isIncome) {
      type = 'income';
    } else if (isTransfer) {
      type = 'transfer';
    }

    const { category, merchant } = extractItemCategoryAndMerchant(clause, type);

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

    // Apply Dutch-Pay Arithmetic Logic
    let finalAmount = amount;
    let note: string | undefined = undefined;

    if (type === 'expense' && matchedModifier) {
      const resolved = applyDutchPayRule(amount, merchant, category, matchedModifier);
      finalAmount = resolved.amount;
      note = resolved.note;
    }

    results.push({
      date: commonDate,
      type,
      amount: finalAmount,
      currency: commonCurrency,
      category,
      merchant,
      note
    });
  }

  // Fallback if no item matched (e.g. single raw string)
  if (results.length === 0) {
    const rawAmt = parseKoreanAmount(sanitized) || 10000;
    const isInc = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었/i.test(sanitized);
    const rawType = isInc ? 'income' : 'expense';
    const { category, merchant } = extractItemCategoryAndMerchant(sanitized, rawType);

    results.push({
      date: commonDate,
      type: rawType,
      amount: rawAmt,
      currency: commonCurrency,
      category,
      merchant
    });
  }

  return results;
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
        if (Array.isArray(data.items) && data.items.length > 0) {
          return data.items;
        }
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          return data.transactions.map((t: any) => ({
            date: t.date?.slice(0, 10) || getTodayIsoDate(),
            type: (t.type?.toLowerCase() === 'income' ? 'income' : t.type?.toLowerCase() === 'transfer' ? 'transfer' : 'expense') as 'expense' | 'income' | 'transfer',
            amount: Math.abs(Number(t.amount)) || 0,
            currency: t.currency || baseCurrency,
            category: t.category || '생활/쇼핑',
            merchant: t.merchant || t.description || '지출',
            note: t.note
          }));
        }
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
  const sanitized = anonymizeFinancialInput(rawPrompt);
  const currency = detectCurrency(sanitized);
  const paymentMethod = detectPaymentMethod(sanitized);
  const results: ParsedTransactionResult[] = [];

  // A. Check for Loan Repayment Notification (Smart Principal vs Interest Split)
  const loanRepayment = detectLoanRepaymentNotification(sanitized, debts);
  if (loanRepayment && loanRepayment.totalPayment > 0) {
    const groupId = `loan-split-${Date.now()}`;
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
        subCategory: '카드대금',
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
      const groupId = `dutch-${Date.now()}`;
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
  const isIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance/i.test(sanitized);
  const notExpense = !/결제|지출|썼|사먹|구입|구매/i.test(sanitized);

  if (isIncome && notExpense) {
    const amount = parseKoreanAmount(sanitized) || 3000000;
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

  if ((isPureTransfer || isGenericTransfer) && !isPurchaseItem) {
    const amount = parseKoreanAmount(sanitized) || 500000;
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
  const amount = parseKoreanAmount(sanitized) || 10000;
  const isFallbackIncome = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance/i.test(sanitized) && !/결제|지출|썼|사먹|구입|구매/i.test(sanitized);

  const { category: inferredCategory, subCategory: inferredSubCategory, merchant, confidence } = inferCategoryAndMerchant(sanitized);
  const category = isFallbackIncome ? '급여' : inferredCategory;
  const subCategory = isFallbackIncome ? '정기수입' : inferredSubCategory;
  const type = isFallbackIncome ? 'INCOME' : 'EXPENSE';

  let cleanDesc = cleanMerchantTitle(sanitized, isFallbackIncome ? '급여 수입' : merchant || '지출 내역');

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
    date: now,
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

