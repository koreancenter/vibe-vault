import { Type } from '@google/genai';

export function getReceiptPrompt(today: string): string {
  return `You are an expert OCR receipt parsing AI specialized in international and multilingual receipts (Korean, English, Japanese, European, etc.). Analyze this receipt or bill photo and extract structured transaction details.

Multilingual Parsing Rules:
1. "merchantName": Store or business name (e.g., "스타벅스 강남점", "Costco Wholesale", "Trader Joe's", "セブンイレブン", "Carrefour").
2. "date": Transaction date in strict ISO-8601 format (YYYY-MM-DD).
   - Accurately parse Asian formats (YYYY.MM.DD, YYYY/MM/DD, YYYY年MM月DD日), European formats (DD/MM/YYYY, DD.MM.YYYY), US formats (MM/DD/YYYY), or month-word dates (12 Oct 2026, Oct 12 2026).
   - If missing, year is omitted, or completely unreadable, fallback to "${today}".
3. "totalAmount": Final total amount paid as a positive number (no commas, currency signs, or negative numbers).
   - Look for total indicators across languages: 합계, 총액, 결제금액, 승인금액, Total, Grand Total, Amount Due, Balance Due, Montant Total, Gesamtbetrag, Total TTC, 合計, お会計, etc.
   - For decimal currencies (USD, EUR, GBP), extract decimals accurately (e.g. 42.50). For whole currencies (KRW, JPY), extract integer amounts.
4. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP", "IDR", "CNY", "SGD", "THB", "VND", "AUD", "CAD", "CHF", "HKD", "TWD"). Default to "KRW" if Korean won or not explicitly stated.
5. "category": Strictly one of ["Food", "Living", "Transport", "Fixed", "Health", "Leisure", "Uncategorized"].
6. "items": Array of purchased line items with "name", "price" (unit or line price as positive number), and optional "quantity" (positive integer).
7. "confidenceScore": Extraction confidence score between 0.0 and 1.0 based on image legibility.
8. NEVER extract credit card numbers, personal telephone numbers, or account numbers.`;
}

export const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    merchantName: {
      type: Type.STRING,
      description: 'Store or merchant name on the receipt'
    },
    date: {
      type: Type.STRING,
      description: 'Transaction date in ISO-8601 format YYYY-MM-DD'
    },
    totalAmount: {
      type: Type.NUMBER,
      description: 'Final total amount paid as a positive number'
    },
    currency: {
      type: Type.STRING,
      description: 'ISO currency code such as KRW, USD, EUR, JPY, GBP, IDR, CNY, SGD, THB, VND, AUD, CAD, CHF, HKD, TWD'
    },
    category: {
      type: Type.STRING,
      description: 'Strictly matching one of: Food, Living, Transport, Fixed, Health, Leisure, Uncategorized'
    },
    items: {
      type: Type.ARRAY,
      description: 'Purchased line items',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          price: { type: Type.NUMBER },
          quantity: { type: Type.INTEGER }
        },
        required: ['name', 'price']
      }
    },
    confidenceScore: {
      type: Type.NUMBER,
      description: 'Extraction confidence score between 0.0 and 1.0'
    }
  },
  required: ['merchantName', 'date', 'totalAmount', 'currency', 'category', 'items', 'confidenceScore']
};

export const ASSET_SCREENSHOT_PROMPT = `You are an expert OCR financial portfolio parsing AI for 'Vibe Vault'.
Analyze this screenshot from a Korean or global financial mobile app (e.g., Toss Securities 토스증권, Kakao Pay Securities 카카오페이증권, Upbit 업비트, KakaoBank 카카오뱅크, Kiwoom 키움증권, Shinhan, KB, Mirae Asset, Chase, Robinhood, etc.).

Extract the financial asset details into structured data:
1. "institution": The financial institution or broker name (e.g., "토스증권", "카카오페이증권", "업비트", "카카오뱅크", "KB국민은행", "키움증권", "미래에셋증권").
2. "accountName": The specific account label or title visible (e.g., "해외주식 종합계좌", "국내주식 ISA", "종합매매", "자유입출금 통장", "가상자산 잔고").
3. "assetType": Strictly one of ["BROKERAGE", "BANK", "CRYPTO", "REAL_ESTATE", "CASH", "LIABILITY"].
4. "currentBalance": The total account balance or total portfolio evaluated asset value (총 평가금액, 총 자산, 예수금 합산 등) as a pure positive number in base unit (e.g., "1,250만원" -> 12500000, "$4,200.50" -> 4200.5).
5. "cashBalance": Cash balance, uninvested deposit, or available cash (예수금, 출금가능금액, 원화 잔고) as a positive number.
6. "investedAssets": Total invested market value or evaluation amount of stocks/crypto/funds (주식/코인 평가금액, 투자원금) as a positive number.
7. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP", "IDR", "CNY", "SGD", "THB", "VND", "AUD", "CAD", "CHF", "HKD", "TWD"). Default to "KRW" if Korean won.
8. "holdings": Optional array of recognized individual holding items/stocks visible on the screen (with "name", "valuation", "quantity", and "profitRate" as percentage number e.g. +14.2% -> 14.2).
9. "confidenceScore": Extraction confidence score between 0.0 and 1.0.
10. "notes": Brief summary of parsed asset (e.g. "총 평가자산 12,500,000원 감지됨").

[STRICT PRIVACY RULE]
Never output full resident identity numbers, personal passwords, or full unmasked account numbers.`;

export const ASSET_SCREENSHOT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    institution: {
      type: Type.STRING,
      description: 'Financial institution name (e.g. 토스증권, 카카오페이증권, 업비트, 카카오뱅크)'
    },
    accountName: {
      type: Type.STRING,
      description: 'Account title or portfolio name'
    },
    assetType: {
      type: Type.STRING,
      description: 'BROKERAGE, BANK, CRYPTO, REAL_ESTATE, CASH, or LIABILITY'
    },
    currentBalance: {
      type: Type.NUMBER,
      description: 'Total evaluated balance or account value as a number'
    },
    cashBalance: {
      type: Type.NUMBER,
      description: 'Cash deposit or uninvested cash (예수금/출금가능금액)'
    },
    investedAssets: {
      type: Type.NUMBER,
      description: 'Invested stock/crypto market valuation'
    },
    currency: {
      type: Type.STRING,
      description: 'ISO currency code: KRW, USD, EUR, JPY, GBP, IDR, CNY, SGD, THB, VND, AUD, CAD, CHF, HKD, TWD'
    },
    holdings: {
      type: Type.ARRAY,
      description: 'List of visible stock/crypto holdings',
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          valuation: { type: Type.NUMBER },
          quantity: { type: Type.NUMBER },
          profitRate: { type: Type.NUMBER }
        },
        required: ['name', 'valuation']
      }
    },
    confidenceScore: {
      type: Type.NUMBER,
      description: 'Confidence between 0.0 and 1.0'
    },
    notes: {
      type: Type.STRING,
      description: 'Short explanation of extracted asset'
    }
  },
  required: ['institution', 'accountName', 'assetType', 'currentBalance', 'currency', 'confidenceScore']
};

export function getTransactionParseInstruction(today: string): string {
  return `You are 'Vibe Vault AI', an expert multilingual NLP financial logic parser.
Your mission is to parse natural language inputs across all supported languages (Korean, English, Japanese, and European languages like German, French, Spanish, Italian) into structured financial transactions.

CRITICAL INSTRUCTIONS:
Always return a JSON array of ParsedItem objects.

Schema for each ParsedItem:
{
  "date": "YYYY-MM-DD",
  "type": "expense" | "income" | "transfer",
  "amount": number (positive numeric net cost for the user),
  "currency": string (e.g. "KRW", "USD", "JPY", "EUR", "GBP"),
  "category": string (e.g. "Food", "Dining", "Cafe", "Living", "Transport", "Fixed", "Health", "Leisure", "Salary", "Savings", "Refund", "Uncategorized"),
  "merchant": string,
  "note": string (optional, e.g. "Split 50/50 with John")
}

1. MULTILINGUAL NUMBER & CURRENCY RESOLUTION:
   - Korean (KRW / ₩):
     * "만" / "만원" = 10,000 (e.g., "3만" = 30,000, "15만" = 150,000). Standalone "만 원씩" = 10,000.
     * "천" / "천원" = 1,000.
     * "억" / "억원" = 100,000,000.
     * Default currency: "KRW".
   - English (USD / $, GBP / £, EUR / €):
     * "$15", "45 dollars", "1.5k" (= 1,500), "2.5m" (= 2,500,000).
     * Default currency: "USD" if "$" or dollars mentioned, "GBP" for £, "EUR" for €.
   - Japanese (JPY / ¥ / 円):
     * "1,200円", "3万円" (= 30,000 JPY), "5千円" (= 5,000 JPY), "1.5億円" (= 150,000,000 JPY).
     * "千" = 1,000, "万" = 10,000, "億" = 100,000,000.
     * Default currency: "JPY" if "円" or "¥" or yen mentioned.
   - European (EUR / €):
     * "15€", "45 euros", "15 EUR", "12,50 €".
     * Default currency: "EUR" if "€" or "euro" mentioned.

2. MULTI-ITEM EXTRACTION:
   - Split composite inputs by commas, periods, or coordinating conjunctions (and, &, 그리고, 와/과, と, そして, et, und, y, e).
   - Extract EACH item as a separate ParsedItem entry.
   - Preserve common metadata (e.g., today -> current date ${today}) across all extracted items in that prompt.

3. MULTILINGUAL SPLIT BILL & DUTCH-PAY ARITHMETIC:
   - Korean: 더치페이, 엔빵, N빵, 각자, 만 원씩, 반반, 반띵.
   - English: split 50/50, split bill, split with John, split 3 ways, each paid, my share.
   - Japanese: 割り勘 (わりかん), 各自, 半分, N等分.
   - European: partage, faire cinquante-cinquante, getrennte Rechnung, a pachas, dividere.
   - ALWAYS calculate the user's actual NET COST:
     * e.g. "$60 dinner split 50/50 with John" -> amount: 30, currency: "USD", note: "Dinner $60 (Split 50/50 with John)".
     * e.g. "6,000円 居酒屋 3人で割り勘" -> amount: 2000, currency: "JPY", note: "居酒屋 6,000円 (3人割り勘)".
     * e.g. "60€ restaurant partagé à deux" -> amount: 30, currency: "EUR", note: "Restaurant 60€ (Partage)".

4. MULTILINGUAL INSTALLMENTS (할부 / 分割払い / Installments):
   - Korean: "무이자 할부", "할부", "개월", "달", "0%".
   - English: "10 installments", "10 months split", "interest-free", "0% financing".
   - Japanese: "分割払い", "無利息分割払い", "10回払い", "10ヶ月".
   - European: "10 mensualités", "10 Raten", "10 plazos sin intereses", "10 rate".
   - Extract installment attributes:
     * installmentMonths: integer total months (e.g. 10)
     * isInterestFree: boolean (true if interest-free / 0% / 무이자 / 無利息 / sans frais)
     * totalAmount: total purchase amount before split
     * amount: monthly installment amount (Math.floor(totalAmount / installmentMonths)) or total purchase amount

5. CATEGORY INFERENCE:
   - Map inferences cleanly to standard category keys regardless of language:
     "Food", "Dining", "Cafe", "Living", "Transport", "Fixed", "Health", "Leisure", "Salary", "Savings", "Refund", "Uncategorized".

Output a strict JSON array of ParsedItem objects.`;
}

export const TRANSACTION_PARSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "YYYY-MM-DD format" },
      type: { type: Type.STRING, description: "expense, income, or transfer" },
      amount: { type: Type.NUMBER, description: "Positive numeric net expense or monthly installment for user" },
      currency: { type: Type.STRING, description: "Currency code, e.g. KRW, USD, JPY, EUR, GBP" },
      category: { type: Type.STRING, description: "Standard category key: Food, Living, Transport, Fixed, Health, Leisure, Salary, etc." },
      merchant: { type: Type.STRING, description: "Clean merchant or item title" },
      note: { type: Type.STRING, description: "Optional note for split-bill explanation" },
      installmentMonths: { type: Type.INTEGER, description: "Total installment months if installment detected (e.g. 10)" },
      isInterestFree: { type: Type.BOOLEAN, description: "True if zero-interest installment" },
      totalAmount: { type: Type.NUMBER, description: "Original total purchase amount before installment split" }
    },
    required: ["date", "type", "amount", "currency", "category", "merchant"]
  }
};

export const SMART_ASSET_INSTRUCTION = `You are 'Vibe Vault AI', an intelligent personal finance asset parser.
Your task is to parse unstructured natural language text, bank SMS alerts, KakaoTalk push notifications, or statements into structured financial asset records (bank accounts, credit/debit cards, cash funds).

[Strict Privacy & Anonymity Rules]
- NEVER extract or return personal identifiers like account numbers, card numbers, passwords, CVC, resident numbers, or customer names.
- Strip any PII automatically.

[Asset Classification]
- type: 'CARD' (Credit card, debit card, 체크카드, 신용카드)
- type: 'BANK' (Bank account, checking, savings, deposit, 주거래은행, 저축은행, 증권사)
- type: 'CASH' (Cash, 비상금, 지갑 현금)
- type: 'OTHER' (Points, vouchers, fintech pay money, etc.)

[Billing Cycle Date (billingDay)]
- If the text mentions a credit card billing date / payment date / due day (e.g. '14일', '결제일 14일', 'bill day 14th', '매월 25일'), extract the day number (1-31).
- If not mentioned or not applicable (e.g. for bank accounts or cash), return null.

Output a JSON array of parsed assets.`;

export const SMART_ASSET_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Standard name of the asset, e.g. 신한은행, 현대카드, 토스뱅크, 비상금 현금" },
      type: { type: Type.STRING, description: "Asset type: CARD, BANK, CASH, or OTHER" },
      billingDay: { type: Type.NUMBER, description: "Monthly billing cycle day (1-31) if applicable, or null" },
      note: { type: Type.STRING, description: "Short descriptive note or label, e.g. 주거래 계좌, 결제일 14일" }
    },
    required: ["name", "type"]
  }
};

export function getQueryIntentInstruction(todayIso: string, currentYear: number, currentMonth: number): string {
  return `You are an expert multilingual financial natural language query intent extractor.
The user is asking a financial analytics question about their finances in Korean, English, Japanese, or European languages.
Current reference date is ${todayIso} (Year: ${currentYear}, Month: ${currentMonth}).

Extract the structured parameters:
- "metric": Strictly one of ["fx_gain_loss", "category_sum", "weekend_expense", "total_expense", "total_income", "net_savings", "merchant_expense", "general_financial"].
  * "fx_gain_loss": FX exchange rate fluctuations, foreign exchange profits/losses, currency gains/losses (e.g., 9월 달러 환차손익, FX return this month, 9月の為替差益, gains de change).
  * "category_sum": Spending on a specific category (e.g., 식비 분석, dining expense ratio, 食費の支出割合, grocery spending, transports ce mois).
  * "weekend_expense": Weekend spending analysis (e.g., 주말 지출, weekend spending, 週末の支出).
  * "total_expense": Overall expense for a period (e.g., total spending this month, 今月の総支出, 얼마 썼어).
  * "total_income": Overall income for a period (e.g., salary, total income, 今月の収入).
  * "net_savings": Savings, surplus, or net balance for a period (e.g., savings rate, 貯蓄額, épargne).
  * "merchant_expense": Spending at a specific merchant/store (e.g., Starbucks spending, 스타벅스 지출, スタバでの支出).
- "dateRange": "YYYY-MM" format (e.g. "2026-09"). If year not specified, default to ${currentYear}. If month not specified, default to ${currentMonth}.
- "year": Integer year.
- "month": Integer month (1-12).
- "targetCurrency": "USD", "KRW", "EUR", "JPY", "GBP". Default "USD" if FX/dollar mentioned, "EUR" if euro mentioned, "JPY" if yen/円 mentioned, otherwise "KRW".
- "category": One of ["Food", "Living", "Transport", "Fixed", "Health", "Leisure"] if category_sum.
- "merchantKeyword": Merchant name string if merchant_expense.
- "querySummary": Short title of the query in the user's input language or English (e.g. "September FX Gains Analysis", "9월 달러 환차손익 분석", "9月の為替差益分析").`;
}

export const QUERY_INTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metric: {
      type: Type.STRING,
      description: 'fx_gain_loss, category_sum, weekend_expense, total_expense, total_income, net_savings, merchant_expense, general_financial'
    },
    dateRange: { type: Type.STRING },
    year: { type: Type.INTEGER },
    month: { type: Type.INTEGER },
    targetCurrency: { type: Type.STRING },
    category: { type: Type.STRING },
    merchantKeyword: { type: Type.STRING },
    querySummary: { type: Type.STRING }
  },
  required: ['metric']
};
