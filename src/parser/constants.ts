import type {
  CurrencyCode,
  InstallmentMetadata,
  LoanSplitSuggestion,
  ReceivableRecoverySuggestion,
  TransactionType,
} from '../types';

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
  paidBy?: string;
  splitParticipants?: string[];
  fxRateAtEntry?: number;
}

export interface CategoryRule {
  category: string;
  subCategory: string;
  patterns: RegExp[];
  confidence: number;
}

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

export interface InstallmentDetectionResult {
  totalMonths: number;
  monthlyAmount: number;
  remainder: number;
  isInterestFree: boolean;
  totalAmount: number;
}

export interface DutchPayModifier {
  targetKeyword?: string;  // e.g. "식사", "식사비", "밥", "커피"
  portionAmount?: number;  // e.g. 10000 ("만 원씩", "각자 15,000원씩")
  splitCount?: number;     // e.g. 2 ("2명 N빵", "반반"), 3 ("3명 엔빵")
  rawClause: string;
}

export interface RealtimePreviewData {
  merchant?: string;
  amount?: number;
  currency: CurrencyCode;
  category?: string;
  paymentMethod?: string;
  isDutch?: boolean;
  paidBy?: string;
}

/**
 * Supported currencies for AI response sanitization and currency keyword lookup.
 */
export const AI_CURRENCIES: readonly string[] = ['KRW', 'USD', 'EUR', 'JPY', 'GBP'];

export const CURRENCY_KEYWORD_RULES: readonly { code: CurrencyCode; tokens: readonly string[] }[] = [
  { code: 'USD', tokens: ['$', 'usd', '달러', 'dollar'] },
  { code: 'EUR', tokens: ['€', 'eur', '유로', 'euro'] },
  { code: 'JPY', tokens: ['¥', 'jpy', '엔', 'yen'] },
  { code: 'GBP', tokens: ['£', 'gbp', '파운드'] },
];

/**
 * Korean weekday and English month lookup tables.
 */
export const WEEKDAY_INDEX: Record<string, number> = {
  월: 0,
  화: 1,
  수: 2,
  목: 3,
  금: 4,
  토: 5,
  일: 6,
};

export const ENGLISH_MONTH_MAP: Record<string, string> = {
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
  dec: '12', december: '12',
};

export const EN_MONTH_NAMES: readonly string[] = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export const EN_MONTH_SHORT: readonly string[] = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/**
 * Overdraft, peer-debt, refund, income, and expense detection patterns.
 */
export const OVERDRAFT_REGEX = /(?:마통|마이너스\s*통장|한도\s*대출|overdraft)/i;

export const KOREAN_NAME_PATTERN = '([가-힣]{2,4})';
export const LEND_REGEX = /(?:한테|에게|께).*(?:빌려\s*줌|빌려\s*줬|빌려\s*드|꿔\s*줬|꿔\s*줌)/;
export const REPAY_REGEX = /(?:한테|에게|께).*(?:갚음|갚았|갚았다|돌려\s*줌|돌려\s*줬)/;
export const BORROW_REGEX = /(?:한테|에게).*(?:빌림|빌렸|빌려\s*받|꿨)/;
export const THIRD_PARTY_PAID_REGEX = /[가-힣]{2,4}(?:이|가)\s+[^,.]*(?:냈어|냈음|냈다|쏨|쐈|쏴줌|계산했)/;

export const AMOUNT_TOKEN_PATTERN = '((?:\\d[\\d,.]*\\s*[억만천백]?\\s*)+원?)';
export const REFUND_NOISE_REGEX = /환불|반품|취소|캐시백|페이백|받음|받았|들어옴|입금|원|\d+|만|천|[을를이가은는도로으]|\s+/g;
export const REFUND_REGEX = /환불|반품|취소\s*(?:됨|환급|되어)|캐시백|페이백/;
export const EXPENSE_CUE_REGEX = /결제|지출|썼|씀|냄|냈|사먹|구입|구매|샀/;
export const INCOME_CUE_REGEX = /월급|급여|보너스|상여금|수당|용돈|배당금|환급|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|받았|받음|salary|paycheck|bonus|allowance/i;

export const HIGH_PRIORITY_TOTAL_REGEX =
  /(?:합\s*계|총\s*액|결제\s*금액|승인\s*금액|받을\s*금액|카드\s*승인|total\s*amount|grand\s*total|amount\s*due|balance\s*due|final\s*total|montant\s*total|gesamtbetrag|total\s*ttc|importe\s*total|합계금액|합\s*계\s*금\s*액|총\s*합\s*계|合計|お会計|支払金額)/i;
export const MEDIUM_PRIORITY_TOTAL_REGEX =
  /(?:^|\s)(?:total|subtotal|sub-total|amount|summe|netto|brutto|payer|somme)(?:\s*[:：]|\s+|$)/i;

export const NON_PERSON_PAYERS = new Set([
  '카드', '신용카드', '체크카드', '현금', '계좌이체', '삼성페이', '애플페이', '토스',
  '카카오페이', '네이버페이', '법인카드', '법카', '할부', '일시불', '직접', '온라인',
  '모바일', '현장', '간편', '통장', '은행', '나', 'me',
]);

/**
 * Top 500 Domestic & Global Merchant and Concept Lexicon
 */
export const CATEGORY_LEXICON: CategoryRule[] = [
  // --- Food: Cafe ---
  {
    category: 'Food',
    subCategory: 'Cafe',
    patterns: [
      /스타벅스|스벅|starbucks|투썸|투썸플레이스|twosome|메가커피|빽다방|컴포즈|이디야|ediya|커피빈|coffee\s*bean|폴바셋|블루보틀|blue\s*bottle|할리스|hollys|파스쿠찌|공차|gongcha|베스킨라빈스|배스킨|배라|baskin|설빙|던킨|dunkin|카페|커피|아메리카노|라떼|에스프레소|디저트|베이커리|빵집|성심당|파리바게뜨|파바|뚜레쥬르|마카롱|케이크|와플|cafe|coffee|latte|dessert/i,
    ],
    confidence: 0.98,
  },
  // --- Food: Dining / Restaurants ---
  {
    category: 'Food',
    subCategory: 'Dining',
    patterns: [
      /순두부|순두부찌개|김치찌개|된장찌개|부대찌개|파스타|pasta|피자|pizza|버거|burger|햄버거|맥도날드|mcdonald|버거킹|burger\s*king|맘스터치|롯데리아|서브웨이|subway|삼겹살|고기집|갈비|한우|곱창|막창|초밥|스시|sushi|라멘|마라탕|마라샹궈|짜장면|짬뽕|탕수육|중식|한식|일식|양식|분식|떡볶이|엽떡|신전|김밥|김밥천국|식당|레스토랑|점심|저녁|아침|식사|회식|술집|포차|이자카야|호프|치킨|교촌|bbq|bhc|굽네|푸라닭|노랑통닭|dinner|lunch|dining|restaurant|meal/i,
    ],
    confidence: 0.95,
  },
  // --- Food: Delivery ---
  {
    category: 'Food',
    subCategory: 'Delivery',
    patterns: [
      /배달의민족|배민|baemin|요기요|yogiyo|쿠팡이츠|coupangeats|배달|야식|배달팁/i,
    ],
    confidence: 0.96,
  },
  // --- Food: Grocery ---
  {
    category: 'Food',
    subCategory: 'Grocery',
    patterns: [
      /이마트|emart|홈플러스|homeplus|롯데마트|lottemart|트레이더스|traders|코스트코|costco|하나로마트|노브랜드|nobrand|마켓컬리|컬리|kurly|오아시스|정육점|청과|야채|과일|반찬|식자재|슈퍼마켓|마트|장보기|grocery|supermarket/i,
    ],
    confidence: 0.97,
  },
  // --- Living: Daily Supplies ---
  {
    category: 'Living',
    subCategory: 'Daily Supplies',
    patterns: [
      /다이소|daiso|올리브영|올영|oliveyoung|무인양품|muji|자주|jaju|화장지|휴지|세제|섬유유연제|샴푸|린스|바디워시|칫솔|치약|비누|수건|청소용품|생필품|건전지|문구|daily\s*supplies|toilet\s*paper|detergent/i,
    ],
    confidence: 0.95,
  },
  // --- Living: E-commerce / Shopping ---
  {
    category: 'Living',
    subCategory: 'Shopping',
    patterns: [
      /쿠팡|coupang|네이버쇼핑|11번가|g마켓|지마켓|옥션|위메프|티몬|알리|aliexpress|테무|temu|아마존|amazon|인터넷쇼핑/i,
    ],
    confidence: 0.92,
  },
  // --- Living: Fashion & Beauty ---
  {
    category: 'Living',
    subCategory: 'Fashion',
    patterns: [
      /무신사|musinsa|지그재그|에이블리|29cm|w컨셉|유니클로|uniqlo|자라|zara|h&m|스파오|탑텐|나이키|nike|아디다스|adidas|옷|의류|신발|가방|미용실|헤어샵|바버샵|네일|화장품|스킨케어|향수/i,
    ],
    confidence: 0.95,
  },
  // --- Living: Convenience Store ---
  {
    category: 'Living',
    subCategory: 'Convenience',
    patterns: [
      /gs25|cu|씨유|세븐일레븐|7-eleven|이마트24|미니스톱|편의점|convenience/i,
    ],
    confidence: 0.96,
  },
  // --- Transport: Public ---
  {
    category: 'Transport',
    subCategory: 'Public Transport',
    patterns: [
      /지하철|전철|메트로|metro|subway|시내버스|광역버스|버스|bus|티머니|캐시비|교통카드|코레일|ktx|srt|기차|열차/i,
    ],
    confidence: 0.97,
  },
  // --- Transport: Taxi & Mobility ---
  {
    category: 'Transport',
    subCategory: 'Taxi',
    patterns: [
      /카카오택시|카카오\s*t|kakaot|타다|tada|우버|uber|택시|taxi|cab|킥보드|지쿠터|씽씽|따릉이|쏘카|socar|그린카/i,
    ],
    confidence: 0.96,
  },
  // --- Transport: Fuel & Vehicle ---
  {
    category: 'Transport',
    subCategory: 'Vehicle',
    patterns: [
      /주유소|sk에너지|gs칼텍스|s-oil|에쓰오일|현대오일뱅크|주유|기름|휘발유|경유|전기차충전|하이패스|통행료|톨게이트|주차장|주차|주차비|세차|엔진오일|타이어|차량정비|car|gas\s*station/i,
    ],
    confidence: 0.95,
  },
  // --- Fixed: Subscriptions ---
  {
    category: 'Fixed',
    subCategory: '구독',
    patterns: [
      /넷플릭스|netflix|유튜브|youtube|디즈니플러스|disney|티빙|tving|웨이브|wavve|왓챠|watcha|스포티파이|spotify|멜론|melon|지니|genie|벅스|플로|flo|밀리의서재|리디북스|리디|애플|apple|icloud|구글원|google\s*one|chatgpt|openai|claude|notion|노션|aws|클라우드|쿠팡와우|와우멤버십|네이버플러스|구독|subscription/i,
    ],
    confidence: 0.98,
  },
  // --- Fixed: Utilities & Telecom ---
  {
    category: 'Fixed',
    subCategory: 'Utilities',
    patterns: [
      /관리비|아파트관리비|전기세|전기요금|한전|도시가스|가스비|수도세|수도요금|skt|kt|lg\s*u\+|lg유플러스|알뜰폰|통신비|휴대폰요금|인터넷요금|월세|임대료|rent|utilities/i,
    ],
    confidence: 0.97,
  },
  // --- Income: Salary & Regular Income ---
  {
    category: '급여',
    subCategory: '정기수입',
    patterns: [
      /월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|salary|paycheck|allowance/i,
    ],
    confidence: 0.98,
  },
  // --- Fixed: Finance & Insurance & Savings ---
  {
    category: 'Fixed',
    subCategory: 'Finance',
    patterns: [
      /주택청약|청약|적금|예금|펀드|투자|국민연금|건강보험|실손보험|삼성화재|현대해상|db손해보험|kb손해보험|교보생명|대출|대출이자|이자납입|학자금/i,
    ],
    confidence: 0.96,
  },
  // --- Health: Medical & Fitness ---
  {
    category: 'Health',
    subCategory: 'Medical',
    patterns: [
      /병원|의원|내과|이비인후과|치과|안과|피부과|정형외과|한의원|외과|종합병원|응급실|약국|처방전|약값|안경|콘택트렌즈|영양제|비타민|오메가3|유산균|health|hospital|pharmacy/i,
    ],
    confidence: 0.97,
  },
  {
    category: 'Health',
    subCategory: 'Fitness',
    patterns: [
      /헬스|헬스장|피트니스|fitness|gym|pt|피티|필라테스|요가|크로스핏|수영장|수영|클라이밍|테니스/i,
    ],
    confidence: 0.96,
  },
  // --- Leisure: Culture & Entertainment ---
  {
    category: 'Leisure',
    subCategory: 'Entertainment',
    patterns: [
      /cgv|롯데시네마|메가박스|영화|cinema|movie|콘서트|뮤지컬|연극|공연|전시|미술관|박물관|티켓|인터파크|노래방|코인노래방|코노|pc방|오락실|볼링|당구|골프|스크린골프|golf/i,
    ],
    confidence: 0.97,
  },
  // --- Leisure: Travel & Lodging ---
  {
    category: 'Leisure',
    subCategory: 'Travel',
    patterns: [
      /호텔|hotel|리조트|펜션|에어비앤비|airbnb|야놀자|여기어때|모텔|숙소|숙박|항공권|비행기|대한항공|아시아나|제주항공|진에어|면세점|travel|flight/i,
    ],
    confidence: 0.96,
  },
  // --- Leisure: Books & Games ---
  {
    category: 'Leisure',
    subCategory: 'Hobbies',
    patterns: [
      /교보문고|알라딘|yes24|영풍문고|서점|도서|책|스팀|steam|닌텐도|플레이스테이션|플스|게임|game|취미/i,
    ],
    confidence: 0.95,
  },
];
