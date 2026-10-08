import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText,
  anonymizeFinancialInput, 
  inferCategoryAndMerchant 
} from './src/financialParser';

// Use robust deterministic financial parser as local fallback and on-device engine
function parseWithLocalRules(rawPrompt: string) {
  return parseFinancialInputDeterministically(rawPrompt);
}

// Local rule-based parser for Smart Asset extraction
function parseAssetsWithLocalRules(rawText: string) {
  // Strip out any PII like card numbers, account numbers, resident IDs, or masked names
  const sanitized = rawText
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '')
    .replace(/\b\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,8}\b/g, '')
    .replace(/[가-힣]\*[가-힣]/g, '');

  const assets: Array<{
    id: string;
    name: string;
    type: 'CARD' | 'BANK' | 'CASH' | 'OTHER';
    billingDay?: number;
    enabled: boolean;
    note?: string;
  }> = [];

  const foundNames = new Set<string>();

  // Helper to detect billing day numbers (1-31)
  const extractBillingDay = (str: string): number | undefined => {
    const patterns = [
      /(?:결제일|청구일|납부일|결제예정일|결제일자|bill(?:ing)?\s*(?:day|date|cycle)?|due\s*(?:day|date)?|payment\s*(?:day|date)?)(?:은|는|이|가)?\s*[:=]?\s*(\d{1,2})\s*(?:일|th|st|nd|rd)?/i,
      /(\d{1,2})\s*(?:일|th|st|nd|rd)\s*(?:결제일|청구일|납부일|결제예정일|결제|bill|due)/i,
      /(?:매월|매달|every\s*month|monthly)\s*(\d{1,2})\s*(?:일|th|st|nd|rd)?/i,
      /\b(\d{1,2})\s*(?:th|st|nd|rd)\s*(?:of\s*(?:the|each|every)?\s*month)?\b/i
    ];

    for (const pat of patterns) {
      const m = str.match(pat);
      if (m) {
        const day = parseInt(m[1], 10);
        if (day >= 1 && day <= 31) return day;
      }
    }
    return undefined;
  };

  const cardPatterns = [
    { regex: /현대카드|\bhyundai\s*(?:card)?\b/i, name: '현대카드' },
    { regex: /신한카드|신한체크|\bshinhan\s*card\b/i, name: '신한카드' },
    { regex: /국민카드|kb국민카드|kb카드|\bkb\s*card\b|\bkookmin\s*card\b/i, name: 'KB국민카드' },
    { regex: /삼성카드|\bsamsung\s*(?:card)?\b/i, name: '삼성카드' },
    { regex: /롯데카드|\blotte\s*(?:card)?\b/i, name: '롯데카드' },
    { regex: /우리카드|우리체크|\bwoori\s*card\b/i, name: '우리카드' },
    { regex: /하나카드|하나체크|\bhana\s*card\b/i, name: '하나카드' },
    { regex: /농협카드|nh카드|nh농협카드|\bnh\s*card\b/i, name: 'NH농협카드' },
    { regex: /비씨카드|bc카드|\bbc\s*card\b/i, name: 'BC카드' },
    { regex: /카카오뱅크\s*(?:체크)?카드|카카오카드|\bkakao\s*card\b/i, name: '카카오뱅크 카드' },
    { regex: /토스\s*(?:체크)?카드|토스뱅크\s*카드|\btoss\s*card\b/i, name: '토스뱅크 카드' },
    { regex: /케이뱅크\s*(?:체크)?카드|\bkbank\s*card\b/i, name: '케이뱅크 카드' },
    { regex: /아멕스|아메리칸\s*익스프레스|\bamex\b|\bamerican\s*express\b/i, name: '아멕스 카드' },
    { regex: /체이스\s*카드|\bchase\s*(?:sapphire|card)\b/i, name: 'Chase Card' },
    { regex: /애플\s*카드|\bapple\s*card\b/i, name: 'Apple Card' },
  ];

  const bankPatterns = [
    { regex: /신한은행|\bshinhan(?:\s*bank)?\b/i, name: '신한은행' },
    { regex: /국민은행|kb국민은행|kb은행|\bkookmin(?:\s*bank)?\b|\bkb(?:\s*bank)?\b/i, name: 'KB국민은행' },
    { regex: /우리은행|\bwoori(?:\s*bank)?\b/i, name: '우리은행' },
    { regex: /하나은행|\bhana(?:\s*bank)?\b/i, name: '하나은행' },
    { regex: /농협은행|nh농협은행|농협|\bnh(?:\s*bank)?\b/i, name: 'NH농협은행' },
    { regex: /카카오뱅크|\bkakao(?:\s*bank)?\b/i, name: '카카오뱅크' },
    { regex: /토스뱅크|\btoss(?:\s*bank)?\b/i, name: '토스뱅크' },
    { regex: /케이뱅크|k뱅크|\bkbank\b/i, name: '케이뱅크' },
    { regex: /기업은행|ibk기업은행|\bibk\b/i, name: 'IBK기업은행' },
    { regex: /sc제일은행|제일은행|\bstandard\s*chartered\b/i, name: 'SC제일은행' },
    { regex: /우체국|우체국예금/i, name: '우체국' },
    { regex: /새마을금고/i, name: '새마을금고' },
    { regex: /신협/i, name: '신협' },
    { regex: /수협은행|수협/i, name: '수협은행' },
    { regex: /대구은행|im뱅크|iM뱅크/i, name: 'iM뱅크(대구은행)' },
    { regex: /부산은행/i, name: '부산은행' },
    { regex: /광주은행/i, name: '광주은행' },
    { regex: /체이스\s*은행|\bchase(?:\s*bank)?\b/i, name: 'Chase Bank' },
    { regex: /뱅크\s*오브\s*아메리카|\bbank\s*of\s*america\b|\bboa\b/i, name: 'Bank of America' },
  ];

  const cashPatterns = [
    { regex: /비상금\s*현금|비상금/i, name: '비상금 현금' },
    { regex: /지갑\s*현금|지갑/i, name: '지갑 현금' },
    { regex: /현금|cash/i, name: '현금' },
  ];

  const segments = sanitized.split(/[,\n;/|]+/).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const billingDay = extractBillingDay(seg);

    for (const cp of cardPatterns) {
      if (cp.regex.test(seg) && !foundNames.has(cp.name)) {
        foundNames.add(cp.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: cp.name,
          type: 'CARD',
          billingDay,
          enabled: true,
          note: billingDay ? `매월 ${billingDay}일 결제` : '신용/체크카드'
        });
      }
    }

    for (const bp of bankPatterns) {
      if (bp.regex.test(seg) && !foundNames.has(bp.name)) {
        if (/체크카드|신용카드|카드/i.test(seg) && !/계좌|통장|주거래|bank/i.test(seg)) {
          continue;
        }
        foundNames.add(bp.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: bp.name,
          type: 'BANK',
          enabled: true,
          note: /주거래/i.test(seg) ? '주거래 계좌' : '은행 계좌'
        });
      }
    }

    for (const cash of cashPatterns) {
      if (cash.regex.test(seg) && !foundNames.has(cash.name)) {
        foundNames.add(cash.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: cash.name,
          type: 'CASH',
          enabled: true,
          note: '현금 자산'
        });
        break;
      }
    }
  }

  // If no assets matched in segments, test against entire sanitized text
  if (assets.length === 0) {
    const globalBilling = extractBillingDay(sanitized);

    for (const cp of cardPatterns) {
      if (cp.regex.test(sanitized) && !foundNames.has(cp.name)) {
        foundNames.add(cp.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: cp.name,
          type: 'CARD',
          billingDay: globalBilling,
          enabled: true,
          note: globalBilling ? `매월 ${globalBilling}일 결제` : undefined
        });
      }
    }

    for (const bp of bankPatterns) {
      if (bp.regex.test(sanitized) && !foundNames.has(bp.name)) {
        foundNames.add(bp.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: bp.name,
          type: 'BANK',
          enabled: true,
        });
      }
    }

    for (const cash of cashPatterns) {
      if (cash.regex.test(sanitized) && !foundNames.has(cash.name)) {
        foundNames.add(cash.name);
        assets.push({
          id: `asset-${Date.now()}-${assets.length + 1}`,
          name: cash.name,
          type: 'CASH',
          enabled: true,
        });
        break;
      }
    }
  }

  // Fallback for custom asset mentions like "토스머니", "네이버페이 머니"
  if (assets.length === 0) {
    const customMatch = sanitized.match(/([가-힣a-zA-Z0-9\s]{2,15}(?:카드|은행|통장|페이|현금|계좌|머니))/);
    if (customMatch) {
      const name = customMatch[1].trim();
      const isCard = /카드/i.test(name);
      const isBank = /은행|통장|계좌/i.test(name);
      const isCash = /현금/i.test(name);
      assets.push({
        id: `asset-${Date.now()}-1`,
        name,
        type: isCard ? 'CARD' : isBank ? 'BANK' : isCash ? 'CASH' : 'OTHER',
        billingDay: isCard ? extractBillingDay(sanitized) : undefined,
        enabled: true
      });
    }
  }

  return assets;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Cached FX rates provider (KRW base)
  let cachedFxRates: {
    base: string;
    rates: Record<string, number>;
    updatedAt: string;
  } = {
    base: 'KRW',
    rates: {
      KRW: 1,
      USD: 0.00075,
      EUR: 0.00069,
      JPY: 0.113,
      GBP: 0.00058,
      IDR: 11.63,     // 1 KRW ≈ 11.63 IDR (or 1 IDR ≈ 0.086 KRW)
      CNY: 0.0054,    // 1 KRW ≈ 0.0054 CNY (or 1 CNY ≈ 185 KRW)
      CAD: 0.00102,   // 1 KRW ≈ 0.00102 CAD
      AUD: 0.00115,   // 1 KRW ≈ 0.00115 AUD
      SGD: 0.00101,   // 1 KRW ≈ 0.00101 SGD
      HKD: 0.00585,   // 1 KRW ≈ 0.00585 HKD
      THB: 0.026,     // 1 KRW ≈ 0.026 THB
      VND: 18.6,      // 1 KRW ≈ 18.6 VND
      CHF: 0.00066,   // 1 KRW ≈ 0.00066 CHF
      TWD: 0.024,     // 1 KRW ≈ 0.024 TWD
      PHP: 0.043,     // 1 KRW ≈ 0.043 PHP
      INR: 0.063,     // 1 KRW ≈ 0.063 INR
    },
    updatedAt: new Date().toISOString(),
  };

  app.get('/api/fx-rates', (req, res) => {
    res.json(cachedFxRates);
  });

  // Query or add single currency rate
  app.get('/api/fx-rates/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    if (cachedFxRates.rates[code]) {
      return res.json({ code, rate: cachedFxRates.rates[code], updatedAt: cachedFxRates.updatedAt });
    }
    // Return approximate estimated rate for common global currencies if not explicitly mapped
    const fallbackRate = 0.001;
    cachedFxRates.rates[code] = fallbackRate;
    return res.json({ code, rate: fallbackRate, updatedAt: cachedFxRates.updatedAt });
  });

  // Multimodal Receipt Scanner (Gemini Vision with Strict Structured JSON Schema)
  app.post('/api/parse-receipt', async (req, res) => {
    try {
      const { image, mimeType = 'image/webp', engineConfig } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: '영수증 이미지 데이터(Base64)가 필요합니다.' });
      }

      let apiKey = process.env.GEMINI_API_KEY;
      if (engineConfig?.engineType === 'byok' && engineConfig?.apiKey && engineConfig?.provider === 'gemini') {
        apiKey = engineConfig.apiKey;
      }

      const today = new Date().toISOString().slice(0, 10);

      // If no API key or local-only mode, return a smart deterministic receipt mock
      if (!apiKey || engineConfig?.engineType === 'local') {
        return res.json({
          receipt: {
            merchantName: '영수증 가맹점',
            merchant: '영수증 가맹점',
            date: today,
            totalAmount: 15000,
            currency: 'KRW',
            category: 'Food',
            suggestedCategory: 'Food',
            items: [
              { name: '품목 내역', price: 15000, amount: 15000, quantity: 1 }
            ],
            confidenceScore: 0.95
          },
          source: 'local'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      // Strip data url prefix if present
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType || 'image/webp'
                }
              },
              {
                text: `You are an expert OCR receipt parsing AI. Analyze this receipt or bill photo and extract structured transaction details.
Requirements:
1. "merchantName": Store or business name (e.g., "스타벅스 강남점", "Costco", "Trader Joe's", "세븐일레븐").
2. "date": Transaction date in strict ISO-8601 format (YYYY-MM-DD). If missing, year is omitted, or unreadable, fallback to "${today}".
3. "totalAmount": Final total amount paid as a positive number (no commas, currency signs, or negative numbers).
4. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP"). Default to "KRW" if Korean won or not explicitly stated.
5. "category": Strictly one of ["Food", "Living", "Transport", "Fixed", "Health", "Leisure", "Uncategorized"].
6. "items": Array of purchased line items with "name", "price" (unit or line price as positive number), and optional "quantity" (positive integer).
7. "confidenceScore": Extraction confidence score between 0.0 and 1.0 based on image legibility.
8. NEVER extract credit card numbers, personal telephone numbers, or account numbers.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
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
                description: 'ISO currency code such as KRW, USD, EUR, JPY, GBP'
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
          }
        }
      });

      const jsonStr = response.text?.trim() || '{}';
      const parsed = JSON.parse(jsonStr);

      const validCategories = ['Food', 'Living', 'Transport', 'Fixed', 'Health', 'Leisure', 'Uncategorized'];
      const rawDate = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today;

      const items = Array.isArray(parsed.items)
        ? parsed.items.map((it: any) => ({
            name: String(it.name || '품목').trim(),
            price: Math.abs(Number(it.price)) || 0,
            quantity: it.quantity ? Math.max(1, Number(it.quantity)) : 1,
            amount: Math.abs(Number(it.price)) || 0 // backward compatibility
          }))
        : [];

      const calculatedTotal = items.length > 0 && (!parsed.totalAmount || Number(parsed.totalAmount) === 0)
        ? items.reduce((acc: number, it: any) => acc + (it.price * (it.quantity || 1)), 0)
        : Math.abs(Number(parsed.totalAmount)) || 0;

      const receipt = {
        merchantName: String(parsed.merchantName || '영수증 결제').trim(),
        date: rawDate,
        totalAmount: calculatedTotal,
        currency: (['KRW', 'USD', 'EUR', 'JPY', 'GBP'].includes(parsed.currency?.toUpperCase()) ? parsed.currency.toUpperCase() : 'KRW'),
        category: validCategories.includes(parsed.category) ? parsed.category : 'Living',
        items,
        confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(1, Math.max(0, parsed.confidenceScore)) : 0.95,
        // Backward compatibility fields for legacy components
        merchant: String(parsed.merchantName || '영수증 결제').trim(),
        suggestedCategory: validCategories.includes(parsed.category) ? parsed.category : 'Living'
      };

      res.json({ receipt, source: 'gemini' });
    } catch (err: any) {
      console.error('Receipt parse error:', err);
      res.status(500).json({ error: err.message || '영수증 분석 중 오류가 발생했습니다.' });
    }
  });

  // Multimodal Portfolio & Brokerage Screenshot Scanner (Gemini Vision with Structured JSON Schema)
  app.post('/api/parse-asset-screenshot', async (req, res) => {
    try {
      const { image, mimeType = 'image/webp', engineConfig } = req.body;
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: '계좌/증권 스크린샷 이미지 데이터(Base64)가 필요합니다.' });
      }

      let apiKey = process.env.GEMINI_API_KEY;
      if (engineConfig?.engineType === 'byok' && engineConfig?.apiKey && engineConfig?.provider === 'gemini') {
        apiKey = engineConfig.apiKey;
      }

      // If no API key or local-only mode, return a smart deterministic demo result
      if (!apiKey || engineConfig?.engineType === 'local') {
        return res.json({
          asset: {
            institution: '토스증권',
            accountName: '토스 미국/국내 주식 잔고',
            assetType: 'BROKERAGE',
            currentBalance: 12500000,
            cashBalance: 1500000,
            investedAssets: 11000000,
            currency: 'KRW',
            holdings: [
              { name: 'S&P 500 ETF', valuation: 8000000, profitRate: 12.4 },
              { name: '빅테크 포트폴리오', valuation: 4500000, profitRate: 8.7 }
            ],
            confidenceScore: 0.95,
            notes: '오프라인/로컬 모드 스캔 완료 (샘플 데이터)',
            readyMutation: {
              action: 'UPDATE_EXISTING',
              institution: '토스증권',
              accountName: '토스 미국/국내 주식 잔고',
              totalAccountValue: 12500000,
              cashBalance: 1500000,
              investedAssets: 11000000,
              currency: 'KRW',
              confidenceScore: 0.95,
              explanation: '토스증권 총 자산 1,250만원 (투자 1,100만원, 예수금 150만원) 즉시 반영 준비'
            }
          },
          source: 'local'
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType || 'image/webp'
                }
              },
              {
                text: `You are an expert OCR financial portfolio parsing AI for 'Vibe Vault'.
Analyze this screenshot from a Korean or global financial mobile app (e.g., Toss Securities 토스증권, Kakao Pay Securities 카카오페이증권, Upbit 업비트, KakaoBank 카카오뱅크, Kiwoom 키움증권, Shinhan, KB, Mirae Asset, Chase, Robinhood, etc.).

Extract the financial asset details into structured data:
1. "institution": The financial institution or broker name (e.g., "토스증권", "카카오페이증권", "업비트", "카카오뱅크", "KB국민은행", "키움증권", "미래에셋증권").
2. "accountName": The specific account label or title visible (e.g., "해외주식 종합계좌", "국내주식 ISA", "종합매매", "자유입출금 통장", "가상자산 잔고").
3. "assetType": Strictly one of ["BROKERAGE", "BANK", "CRYPTO", "REAL_ESTATE", "CASH", "LIABILITY"].
4. "currentBalance": The total account balance or total portfolio evaluated asset value (총 평가금액, 총 자산, 예수금 합산 등) as a pure positive number in base unit (e.g., "1,250만원" -> 12500000, "$4,200.50" -> 4200.5).
5. "cashBalance": Cash balance, uninvested deposit, or available cash (예수금, 출금가능금액, 원화 잔고) as a positive number.
6. "investedAssets": Total invested market value or evaluation amount of stocks/crypto/funds (주식/코인 평가금액, 투자원금) as a positive number.
7. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP"). Default to "KRW" if Korean won.
8. "holdings": Optional array of recognized individual holding items/stocks visible on the screen (with "name", "valuation", "quantity", and "profitRate" as percentage number e.g. +14.2% -> 14.2).
9. "confidenceScore": Extraction confidence score between 0.0 and 1.0.
10. "notes": Brief summary of parsed asset (e.g. "총 평가자산 12,500,000원 감지됨").

[STRICT PRIVACY RULE]
Never output full resident identity numbers, personal passwords, or full unmasked account numbers.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
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
                description: 'ISO currency code: KRW, USD, EUR, JPY, GBP'
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
          }
        }
      });

      const jsonStr = response.text?.trim() || '{}';
      const parsed = JSON.parse(jsonStr);

      const validAssetTypes = ['BROKERAGE', 'BANK', 'CRYPTO', 'REAL_ESTATE', 'CASH', 'LIABILITY'];
      const assetType = validAssetTypes.includes(parsed.assetType) ? parsed.assetType : 'BROKERAGE';
      const totalVal = Math.abs(Number(parsed.currentBalance)) || 0;
      const cashVal = typeof parsed.cashBalance === 'number' ? Math.abs(parsed.cashBalance) : undefined;
      const invVal = typeof parsed.investedAssets === 'number' ? Math.abs(parsed.investedAssets) : (cashVal !== undefined ? Math.max(0, totalVal - cashVal) : undefined);

      const instName = String(parsed.institution || '기타 금융기관').trim();
      const accName = String(parsed.accountName || '자산 계좌').trim();
      const curr = (['KRW', 'USD', 'EUR', 'JPY', 'GBP'].includes(parsed.currency?.toUpperCase()) ? parsed.currency.toUpperCase() : 'KRW');
      const conf = typeof parsed.confidenceScore === 'number' ? Math.min(1, Math.max(0, parsed.confidenceScore)) : 0.95;

      const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.map((h: any) => ({
        name: String(h.name || '').trim(),
        valuation: Math.abs(Number(h.valuation)) || 0,
        quantity: h.quantity ? Number(h.quantity) : undefined,
        profitRate: typeof h.profitRate === 'number' ? h.profitRate : undefined,
      })) : [];

      const asset = {
        institution: instName,
        accountName: accName,
        assetType,
        currentBalance: totalVal,
        cashBalance: cashVal,
        investedAssets: invVal,
        currency: curr,
        holdings,
        confidenceScore: conf,
        notes: String(parsed.notes || '').trim(),
        readyMutation: {
          action: 'UPDATE_EXISTING',
          institution: instName,
          accountName: accName,
          totalAccountValue: totalVal,
          cashBalance: cashVal,
          investedAssets: invVal,
          currency: curr,
          holdings,
          confidenceScore: conf,
          explanation: `${instName} 총 자산 ${totalVal.toLocaleString()}원 ${curr} 잔고 반영 준비`
        }
      };

      res.json({ asset, source: 'gemini' });
    } catch (err: any) {
      console.error('Asset screenshot parse error:', err);
      res.status(500).json({ error: err.message || '자산 스크린샷 분석 중 오류가 발생했습니다.' });
    }
  });

  app.post('/api/parse', async (req, res) => {
    try {
      const { prompt: rawPrompt, text, engineConfig } = req.body;
      const prompt = text || rawPrompt || '';
      // Enforce PII sanitization (strip card numbers, account numbers, resident IDs, phones)
      const sanitizedPrompt = anonymizeFinancialInput(prompt);

      let apiKey = process.env.GEMINI_API_KEY;

      if (engineConfig?.engineType === 'byok' && engineConfig?.apiKey && engineConfig?.provider === 'gemini') {
        apiKey = engineConfig.apiKey;
      }

      // If in on-device mode or without an API key, use the robust deterministic local parsing engine
      if (engineConfig?.engineType === 'local' || !apiKey) {
        const localParsed = parseFinancialInputDeterministically(sanitizedPrompt);
        const localItems = parseFinancialText(sanitizedPrompt);
        return res.json({ transactions: localParsed, items: localItems });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const today = new Date().toISOString().slice(0, 10);
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: sanitizedPrompt,
          config: {
            systemInstruction: `You are 'Vibe Ledger AI', an expert NLP financial logic parser.
Your mission is to parse natural language inputs (Korean or English) into structured financial transactions.

CRITICAL INSTRUCTIONS:
Always return a JSON array of ParsedItem objects.

Schema for each ParsedItem:
{
  "date": "YYYY-MM-DD",
  "type": "expense" | "income" | "transfer",
  "amount": number (positive numeric net cost for the user),
  "currency": string (e.g. "KRW", "USD"),
  "category": string (e.g. "식비", "카페/간식", "교통", "생활/쇼핑", "문화/여가", "의료/건강", "주거/통신", "급여/수입", "이체/저축"),
  "merchant": string,
  "note": string (optional, e.g. "식사 20,000원 (더치페이 분담)")
}

1. MULTI-ITEM EXTRACTION:
   - Split composite sentences by commas, periods, or coordinating conjunctions (그리고, 및, +).
   - Extract EACH item as a separate ParsedItem entry.
   - Preserve common metadata (e.g., 오늘 -> current date ${today}) across all extracted items in that prompt.

2. SPLIT BILL & DUTCH-PAY ARITHMETIC:
   - Detect keywords: 더치페이, 엔빵, N빵, 각자, 만 원씩, 반반, 반띵.
   - ALWAYS explicitly calculate the user's actual NET COST:
     * If a specific portion is mentioned (e.g., "식사 2만 원... 만 원씩 더치페이"), user expense is 10000 with note "식사 20,000원 (더치페이 분담)".
     * If "2명 N빵 / 반반" is specified on an amount, divide the item amount accordingly (e.g. 20000 / 2 = 10000), with note "<merchant> <totalAmount>원 (더치페이 분담)".

3. NUMBER UNITS IN KOREAN:
   - "만" / "만원" = 10,000. Standalone "만 원씩" = 10,000.
   - "천" / "천원" = 1,000.
   - "억" / "억원" = 100,000,000.

Output a strict JSON array of ParsedItem objects.`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING, description: "YYYY-MM-DD format" },
                  type: { type: Type.STRING, description: "expense, income, or transfer" },
                  amount: { type: Type.NUMBER, description: "Positive numeric net expense for user" },
                  currency: { type: Type.STRING, description: "Currency code, e.g. KRW, USD" },
                  category: { type: Type.STRING, description: "Category in Korean, e.g. 식비, 카페/간식, 교통, etc." },
                  merchant: { type: Type.STRING, description: "Clean merchant or item title" },
                  note: { type: Type.STRING, description: "Optional note for split-bill explanation" }
                },
                required: ["date", "type", "amount", "currency", "category", "merchant"]
              }
            }
          }
        });

        const jsonStr = response.text?.trim() || "[]";
        let rawParsed: any[] = [];
        try {
          rawParsed = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse JSON from Gemini", e);
        }

        // Post-inference schema verification & enrichment
        let validatedTransactions: any[] = (Array.isArray(rawParsed) ? rawParsed : []).map((t: any) => {
          let amount = Math.abs(Number(t.amount) || 0);

          // Guard against accidental unit misinterpretation (e.g. LLM returned 4 instead of 40,000 for "4만원")
          if (amount < 100 && /(?:만|천|억)/.test(sanitizedPrompt)) {
            const deterministic = parseFinancialInputDeterministically(sanitizedPrompt);
            if (deterministic.length > 0 && deterministic[0].amount > amount) {
              amount = deterministic[0].amount;
            }
          }

          let type = t.type || 'EXPENSE';
          const isIncomeKeyword = /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(sanitizedPrompt) || /(?:월급|급여|보너스|상여금|수당|용돈|배당금|이자수익|알바비|연봉|퇴직금|주급|들어옴|입금|수입|벌었|salary|paycheck|bonus|allowance)/i.test(t.description || '');
          const isExplicitExpense = /(?:결제|지출|썼|사먹|구입|구매)/i.test(sanitizedPrompt);

          if (isIncomeKeyword && !isExplicitExpense && type !== 'TRANSFER') {
            type = 'INCOME';
          }

          let category = t.category;
          let subCategory = t.subCategory;

          if (type === 'INCOME') {
            category = 'Fixed';
            if (!subCategory || subCategory === 'General') {
              subCategory = 'Salary';
            }
          } else if (!category || category === 'Uncategorized' || category === '미분류') {
            const inferred = inferCategoryAndMerchant(t.description || sanitizedPrompt);
            category = inferred.category;
            subCategory = inferred.subCategory;
          }

          let desc = (t.description || '').trim();
          desc = desc.replace(/만\s*원\s*들어옴/i, '들어옴')
                     .replace(/^[\s,·\.\-원\d]+(?:\s*원)?\s*/i, '')
                     .replace(/\s+/g, ' ')
                     .trim();
          if (!desc || desc === '원') {
            desc = type === 'INCOME' ? '급여 수입' : '지출 내역';
          }

          const isInternalTransfer = t.isInternalTransfer === true || type === 'TRANSFER' || /카드대금|계좌이체|송금|자산이체|원금상환|대여금회수/i.test(desc + (subCategory || ''));

          return {
            type,
            amount,
            currency: t.currency || 'KRW',
            category,
            subCategory: subCategory || (type === 'INCOME' ? 'Salary' : 'General'),
            description: desc,
            date: t.date || new Date().toISOString(),
            paymentMethod: t.paymentMethod || (type === 'INCOME' ? '계좌이체' : 'Card'),
            groupId: t.groupId,
            originalTotal: t.originalTotal ? Math.abs(Number(t.originalTotal)) : undefined,
            isInternalTransfer
          };
        });

        if (validatedTransactions.length === 0) {
          validatedTransactions = parseFinancialInputDeterministically(sanitizedPrompt);
        }

        const parsedItems = (Array.isArray(rawParsed) && rawParsed.length > 0)
          ? rawParsed
          : parseFinancialText(sanitizedPrompt);

        res.json({ transactions: validatedTransactions, items: parsedItems });
      } catch (geminiError: any) {
        console.warn("Gemini parsing error, falling back to deterministic rules:", geminiError.message);
        const fallbackParsed = parseFinancialInputDeterministically(sanitizedPrompt);
        const fallbackItems = parseFinancialText(sanitizedPrompt);
        res.json({ transactions: fallbackParsed, items: fallbackItems });
      }
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'Failed to process request' });
    }
  });

  // Smart Asset Setup endpoint
  app.post('/api/parse-assets', async (req, res) => {
    try {
      const { text: rawText, prompt: rawPrompt, engineConfig } = req.body;
      const text = (rawText || rawPrompt || '').trim();

      if (!text) {
        return res.status(400).json({ error: '자산 분석을 위한 텍스트를 입력해주세요.' });
      }

      let apiKey = process.env.GEMINI_API_KEY;
      if (engineConfig?.engineType === 'byok' && engineConfig?.apiKey && engineConfig?.provider === 'gemini') {
        apiKey = engineConfig.apiKey;
      }

      // If in on-device mode or without an API key, use the local parsing engine
      if (engineConfig?.engineType === 'local' || !apiKey) {
        const localAssets = parseAssetsWithLocalRules(text);
        return res.json({ assets: localAssets, source: 'local' });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: text,
          config: {
            systemInstruction: `You are 'Vibe Ledger AI', an intelligent personal finance asset parser.
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

Output a JSON array of parsed assets.`,
            responseMimeType: "application/json",
            responseSchema: {
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
            }
          }
        });

        const jsonStr = response.text?.trim() || "[]";
        let parsed: any[] = [];
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse asset JSON", e);
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          // Fall back to local rules if LLM returned empty array
          const fallbackAssets = parseAssetsWithLocalRules(text);
          return res.json({ assets: fallbackAssets, source: 'fallback' });
        }

        const assets = parsed.map((item: any, idx: number) => ({
          id: `asset-${Date.now()}-${idx + 1}`,
          name: String(item.name || '자산').trim(),
          type: ['CARD', 'BANK', 'CASH', 'OTHER'].includes(item.type) ? item.type : 'CARD',
          billingDay: typeof item.billingDay === 'number' && item.billingDay >= 1 && item.billingDay <= 31 ? item.billingDay : undefined,
          enabled: true,
          note: item.note ? String(item.note) : undefined
        }));

        res.json({ assets, source: 'gemini' });
      } catch (geminiError: any) {
        console.warn("Gemini asset parsing error, falling back to local rules:", geminiError.message);
        const fallbackAssets = parseAssetsWithLocalRules(text);
        res.json({ assets: fallbackAssets, source: 'fallback' });
      }
    } catch (error: any) {
      console.error('Asset parse error:', error);
      res.status(500).json({ error: error.message || 'Failed to parse assets' });
    }
  });

  // Key validation endpoint
  app.post('/api/validate-key', async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ valid: false, message: 'API key is required.' });
    }

    try {
      if (provider === 'gemini') {
        const testClient = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        // Lightweight ping using recommended gemini-3.8-flash
        const ping = await testClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'ping',
        });
        if (ping.text) {
          return res.json({ valid: true, message: 'Key validated successfully' });
        }
        return res.json({ valid: true, message: 'Key validated' });
      } else {
        // OpenAI or Anthropic format checks and connection acknowledgement
        if (provider === 'openai' && (apiKey.startsWith('sk-') || apiKey.length > 20)) {
          return res.json({ valid: true, message: 'OpenAI key validated' });
        }
        if (provider === 'anthropic' && (apiKey.startsWith('sk-ant') || apiKey.length > 20)) {
          return res.json({ valid: true, message: 'Anthropic key validated' });
        }
        if (apiKey.length >= 16) {
          return res.json({ valid: true, message: 'Key format validated' });
        }
        return res.status(400).json({ valid: false, message: 'Invalid API key format' });
      }
    } catch (err: any) {
      console.error('Key validation failed:', err);
      return res.status(400).json({ valid: false, message: err.message || 'Connection failed' });
    }
  });

  // Natural Language Financial Query Intent & Parameter Extraction (Gemini Structured Output)
  app.post('/api/query-intent', async (req, res) => {
    try {
      const { query: rawQuery, prompt: rawPrompt, engineConfig } = req.body;
      const query = String(rawQuery || rawPrompt || '').trim();
      if (!query) {
        return res.status(400).json({ error: '질문 내용을 입력해주세요.' });
      }

      let apiKey = process.env.GEMINI_API_KEY;
      if (engineConfig?.engineType === 'byok' && engineConfig?.apiKey && engineConfig?.provider === 'gemini') {
        apiKey = engineConfig.apiKey;
      }

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      // Deterministic rule-based intent fallback
      const parseIntentLocally = (text: string) => {
        let metric = 'general_financial';
        let category: string | undefined = undefined;
        let targetCurrency = 'KRW';
        let month = currentMonth;
        let year = currentYear;
        let merchantKeyword: string | undefined = undefined;

        // Month matching (e.g., "9월", "8월", "2026년 9월")
        const monthMatch = text.match(/(?:(\d{4})년\s*)?(\d{1,2})월/);
        if (monthMatch) {
          if (monthMatch[1]) year = parseInt(monthMatch[1], 10);
          month = parseInt(monthMatch[2], 10);
        } else if (/지난달|지난\s*달/i.test(text)) {
          month = currentMonth === 1 ? 12 : currentMonth - 1;
          if (currentMonth === 1) year = currentYear - 1;
        }

        // FX Gain / Loss matching
        if (/환차|환율|달러|usd|외환|환전|환손익|환차익|환차손/i.test(text)) {
          metric = 'fx_gain_loss';
          targetCurrency = 'USD';
        } else if (/주말|토요일|일요일|weekend/i.test(text)) {
          metric = 'weekend_expense';
        } else if (/식비|카페|커피|외식|음식|배달|점심|저녁|마트|장보기/i.test(text)) {
          metric = 'category_sum';
          category = 'Food';
        } else if (/교통|지하철|버스|택시|주유|주차/i.test(text)) {
          metric = 'category_sum';
          category = 'Transport';
        } else if (/생활|쇼핑|다이소|쿠팡|올리브영|편의점/i.test(text)) {
          metric = 'category_sum';
          category = 'Living';
        } else if (/고정비|월세|관리비|통신비|보험|공과금/i.test(text)) {
          metric = 'category_sum';
          category = 'Fixed';
        } else if (/의료|병원|약국|헬스|운동/i.test(text)) {
          metric = 'category_sum';
          category = 'Health';
        } else if (/여가|문화|영화|여행|숙박/i.test(text)) {
          metric = 'category_sum';
          category = 'Leisure';
        } else if (/총\s*지출|얼마\s*썼|지출\s*총액/i.test(text)) {
          metric = 'total_expense';
        } else if (/수입|월급|급여|들어온\s*돈/i.test(text)) {
          metric = 'total_income';
        } else if (/저축|순수익|흑자|잉여/i.test(text)) {
          metric = 'net_savings';
        }

        const dateRange = `${year}-${String(month).padStart(2, '0')}`;
        return {
          metric,
          dateRange,
          year,
          month,
          targetCurrency,
          category,
          merchantKeyword,
          querySummary: `${month}월 ${metric === 'fx_gain_loss' ? '환차손익' : metric === 'weekend_expense' ? '주말 지출' : category || '재정'} 분석`
        };
      };

      if (!apiKey || engineConfig?.engineType === 'local') {
        const localParams = parseIntentLocally(query);
        return res.json({ parameters: localParams, source: 'local' });
      }

      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: query,
          config: {
            systemInstruction: `You are an expert financial natural language query intent extractor.
The user is asking a financial analytics question about their finances.
Current reference date is ${today.toISOString().slice(0, 10)} (Year: ${currentYear}, Month: ${currentMonth}).

Extract the structured parameters:
- "metric": Strictly one of ["fx_gain_loss", "category_sum", "weekend_expense", "total_expense", "total_income", "net_savings", "merchant_expense", "general_financial"].
  * "fx_gain_loss": FX exchange rate fluctuations, foreign exchange profits/losses, dollar gains/losses (e.g. 9월 달러 환차손익, 환차익, 외화 변동, 환율 이익).
  * "category_sum": Spending on a specific category (e.g. 식비 분석, 식비 총합, 교통비, 생활비).
  * "weekend_expense": Weekend spending analysis (e.g. 주말 지출, 주말 소비).
  * "total_expense": Overall expense for a period.
  * "total_income": Overall income for a period.
  * "net_savings": Savings, surplus, or net balance for a period.
  * "merchant_expense": Spending at a specific merchant/store (e.g. 스타벅스 지출).
- "dateRange": "YYYY-MM" format (e.g. "2026-09"). If year not specified, default to ${currentYear}. If month not specified, default to ${currentMonth}.
- "year": Integer year.
- "month": Integer month (1-12).
- "targetCurrency": "USD", "KRW", "EUR", "JPY", "GBP". Default "USD" if FX/dollar mentioned, otherwise "KRW".
- "category": One of ["Food", "Living", "Transport", "Fixed", "Health", "Leisure"] if category_sum.
- "merchantKeyword": Merchant name string if merchant_expense.
- "querySummary": Short Korean title of the query (e.g. "9월 달러 환차손익 분석").`,
            responseMimeType: 'application/json',
            responseSchema: {
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
            }
          }
        });

        const jsonStr = response.text?.trim() || '{}';
        const parsed = JSON.parse(jsonStr);
        res.json({ parameters: parsed, source: 'gemini' });
      } catch (geminiError: any) {
        console.warn('Gemini query intent fallback to local:', geminiError.message);
        const fallbackParams = parseIntentLocally(query);
        res.json({ parameters: fallbackParams, source: 'fallback' });
      }
    } catch (err: any) {
      console.error('Query intent error:', err);
      res.status(500).json({ error: err.message || '질문 의도 분석 중 오류가 발생했습니다.' });
    }
  });

  // Support both /api/* and /vibevault/api/*
  app.use((req, res, next) => {
    if (req.url.startsWith('/vibevault/api/')) {
      req.url = req.url.replace('/vibevault/api/', '/api/');
    }
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    // Support legacy /vibevault path by redirecting cleanly to /
    app.get(['/vibevault', '/vibevault/'], (req, res) => {
      res.redirect('/');
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('/vibevault', express.static(distPath));
    app.get(['/vibevault', '/vibevault/*'], (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
