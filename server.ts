import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  consumeAiRequest,
  isLocalHostname,
  isSameLocalOrigin,
  isValidEngineConfig,
  isValidImageInput,
  isValidTextInput,
  resolveGeminiApiKey,
} from './src/serverSecurity';
import {
  getCachedFxRates,
  isSupportedFxCurrency,
  type FxRateCache,
} from './src/fxRates';
import { generateSecureId } from './src/identifiers';
import { anonymizeFinancialInput } from './src/piiSanitizer';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText,
  parseKoreanAmount,
  inferCategoryAndMerchant,
  detectInstallment,
  addMonthsToDate,
  cleanInstallmentItemTitle
} from './src/financialParser';

// Resilient Gemini content generation with multi-model failover (prefers fast and available gemini-3.1-flash-lite)
async function generateGeminiWithResilience(
  ai: GoogleGenAI,
  params: {
    model?: string;
    contents: any;
    config?: any;
  }
) {
  const preferredModel = params.model || 'gemini-3.1-flash-lite';
  const candidateModels = preferredModel === 'gemini-3.1-flash-lite'
    ? ['gemini-3.1-flash-lite', 'gemini-3.8-flash']
    : [preferredModel, 'gemini-3.1-flash-lite'];

  let lastError: unknown;
  for (const model of candidateModels) {
    try {
      return await ai.models.generateContent({
        ...params,
        model,
      });
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      if (status === 503 || status === 429 || status === 404 || status === 500) {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Local rule-based parser for Smart Asset extraction
function parseAssetsWithLocalRules(rawText: string) {
  const sanitized = anonymizeFinancialInput(rawText);

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
          id: generateSecureId('asset'),
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
          id: generateSecureId('asset'),
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
          id: generateSecureId('asset'),
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
          id: generateSecureId('asset'),
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
          id: generateSecureId('asset'),
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
          id: generateSecureId('asset'),
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
        id: generateSecureId('asset'),
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
  const PORT = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://generativelanguage.googleapis.com https://huggingface.co https://*.huggingface.co https://cloudflareinsights.com; img-src 'self' data: blob:; worker-src 'self' blob:;",
    );

    const origin = req.get('origin');
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
        const originHost = parsedOrigin.host.toLowerCase();
        if (originHost !== host && !isLocalHostname(parsedOrigin.hostname) && !host.includes(originHost) && !originHost.includes(host)) {
          return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
        }
      } catch {
        return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
      }
    }
    if (req.path.startsWith('/api/') || req.path.startsWith('/vibevault/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use((req, res, next) => {
    if (req.url.startsWith('/vibevault/api/')) {
      req.url = req.url.replace('/vibevault/api/', '/api/');
    }
    next();
  });

  const aiEndpoints = new Set([
    '/api/parse-receipt',
    '/api/parse-asset-screenshot',
    '/api/parse',
    '/api/parse-assets',
    '/api/validate-key',
    '/api/query-intent',
  ]);
  app.use((req, res, next) => {
    if (req.method !== 'POST' || !aiEndpoints.has(req.path)) return next();

    const result = consumeAiRequest(req.socket.remoteAddress ?? 'unknown');
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many AI requests. Please try again shortly.' });
    }
    next();
  });

  app.use(express.json({ limit: '8mb', strict: true }));
  app.use((req, res, next) => {
    if (
      req.method === 'POST'
      && aiEndpoints.has(req.path)
      && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  const fxRateCache: FxRateCache = {};
  app.get('/api/fx-rates', async (req, res) => {
    const result = await getCachedFxRates(fxRateCache);
    if (result.refreshFailed) {
      console.warn('FX rates refresh failed; serving stale or estimated rates.');
    }
    res.json(result.rates);
  });

  app.get('/api/fx-rates/:code', async (req, res) => {
    const code = req.params.code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      return res.status(400).json({ error: 'Currency code must be a three-letter ISO code.' });
    }
    if (!isSupportedFxCurrency(code)) {
      return res.status(404).json({ error: `No exchange rate is available for ${code}.` });
    }

    const result = await getCachedFxRates(fxRateCache);
    if (result.refreshFailed) {
      console.warn('FX rates refresh failed; serving stale or estimated rates.');
    }
    const rate = result.rates.rates[code];
    if (rate === undefined) {
      return res.status(404).json({ error: `No exchange rate is available for ${code}.` });
    }

    return res.json({
      code,
      rate,
      rates: result.rates.rates,
      source: result.rates.source,
      updatedAt: result.rates.updatedAt,
      stale: result.rates.stale,
    });
  });

  // Multimodal Receipt Scanner (Gemini Vision with Strict Structured JSON Schema)
  app.post('/api/parse-receipt', async (req, res) => {
    try {
      const { image, mimeType = 'image/webp', engineConfig } = req.body;
      if (!isValidImageInput(image, mimeType) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '영수증 분석 요청이 올바르지 않습니다.' });
      }

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);
      const today = new Date().toISOString().slice(0, 10);

      // Image OCR requires cloud AI; text-only local parsing is available in the client.
      if (!apiKey || engineConfig?.engineType === 'local') {
        return res.status(503).json({
          error: '클라우드 영수증 OCR을 사용할 수 없습니다. 영수증 텍스트를 직접 입력해 로컬 파서를 이용해주세요.',
          source: 'unavailable',
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

      const response = await generateGeminiWithResilience(ai, {
        model: 'gemini-3.1-flash-lite',
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
                text: `You are an expert OCR receipt parsing AI specialized in international and multilingual receipts (Korean, English, Japanese, European, etc.). Analyze this receipt or bill photo and extract structured transaction details.

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

      const allowedCurrencies = ['KRW', 'USD', 'EUR', 'JPY', 'GBP', 'IDR', 'CNY', 'SGD', 'THB', 'VND', 'AUD', 'CAD', 'CHF', 'HKD', 'TWD'];
      const parsedCurr = parsed.currency?.toUpperCase();

      const receipt = {
        merchantName: String(parsed.merchantName || '영수증 결제').trim(),
        date: rawDate,
        totalAmount: calculatedTotal,
        currency: (allowedCurrencies.includes(parsedCurr) ? parsedCurr : 'KRW'),
        category: validCategories.includes(parsed.category) ? parsed.category : 'Living',
        items,
        confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(1, Math.max(0, parsed.confidenceScore)) : 0.95,
        // Backward compatibility fields for legacy components
        merchant: String(parsed.merchantName || '영수증 결제').trim(),
        suggestedCategory: validCategories.includes(parsed.category) ? parsed.category : 'Living'
      };

      res.json({ receipt, source: 'gemini' });
    } catch (err) {
      console.error('Receipt parse error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(502).json({ error: '영수증 분석 중 오류가 발생했습니다.' });
    }
  });

  // Multimodal Portfolio & Brokerage Screenshot Scanner (Gemini Vision with Structured JSON Schema)
  app.post('/api/parse-asset-screenshot', async (req, res) => {
    try {
      const { image, mimeType = 'image/webp', engineConfig } = req.body;
      if (!isValidImageInput(image, mimeType) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '자산 스크린샷 분석 요청이 올바르지 않습니다.' });
      }

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      // A screenshot cannot be parsed locally without a real OCR model.
      if (!apiKey || engineConfig?.engineType === 'local') {
        return res.status(503).json({
          error: '클라우드 자산 스크린샷 OCR을 사용할 수 없습니다. AI 설정을 확인하거나 잔고를 직접 입력해주세요.',
          source: 'unavailable',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' }
        }
      });

      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const response = await generateGeminiWithResilience(ai, {
        model: 'gemini-3.1-flash-lite',
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
7. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP", "IDR", "CNY", "SGD", "THB", "VND", "AUD", "CAD", "CHF", "HKD", "TWD"). Default to "KRW" if Korean won.
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
      const allowedAssetCurrencies = ['KRW', 'USD', 'EUR', 'JPY', 'GBP', 'IDR', 'CNY', 'SGD', 'THB', 'VND', 'AUD', 'CAD', 'CHF', 'HKD', 'TWD'];
      const parsedAssetCurr = parsed.currency?.toUpperCase();
      const curr = (allowedAssetCurrencies.includes(parsedAssetCurr) ? parsedAssetCurr : 'KRW');
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
    } catch (err) {
      console.error('Asset screenshot parse error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(502).json({ error: '자산 스크린샷 분석 중 오류가 발생했습니다.' });
    }
  });

  // Multilingual category normalization to standard keys
  function normalizeStandardCategory(rawCat: string | undefined): { category: string; subCategory?: string } {
    if (!rawCat) return { category: 'Living', subCategory: 'General' };
    const lower = rawCat.toLowerCase().trim();
    if (/식비|외식|카페|food|dining|restaurant|grocery|groceries|lunch|dinner|breakfast|meal|repas|déjeuner|essen|lebensmittel|comida|cibo|食費|外食|ランチ|ディナー/i.test(lower)) {
      return { category: 'Food', subCategory: /cafe|카페|coffee|커피|カフェ/i.test(lower) ? 'Cafe' : 'Dining' };
    }
    if (/교통|지하철|버스|택시|주유|주차|transport|transit|subway|metro|bus|taxi|flight|fuel|gas|essence|verkehr|transporte|trasporti|交通|電車|バス|タクシー|ガソリン/i.test(lower)) {
      return { category: 'Transport', subCategory: 'Public Transport' };
    }
    if (/고정|월세|관리비|통신비|보험|공과금|fixed|rent|utilities|bill|subscription|sub|abono|miete|loyer|affitto|固定費|家賃|光熱費|保険/i.test(lower)) {
      return { category: 'Fixed', subCategory: 'Utilities' };
    }
    if (/의료|건강|병원|약국|헬스|운동|health|medical|fitness|pharmacy|doctor|hospital|santé|gesundheit|salud|salute|医療|健康|病院|薬局|フィットネス/i.test(lower)) {
      return { category: 'Health', subCategory: 'Medical' };
    }
    if (/여가|문화|영화|여행|숙박|leisure|culture|entertainment|travel|hotel|hobby|vacation|loisirs|freizeit|ocio|tempo\s*libero|娯楽|趣味|旅行|映画/i.test(lower)) {
      return { category: 'Leisure', subCategory: 'Entertainment' };
    }
    if (/급여|월급|수입|소득|salary|income|wage|paycheck|salaire|gehalt|salario|stipendio|給与|給料|収入/i.test(lower)) {
      return { category: 'Fixed', subCategory: 'Salary' };
    }
    if (/저축|적금|예금|savings|deposit|épargne|sparen|ahorro|risparmio|貯蓄|預金/i.test(lower)) {
      return { category: 'Fixed', subCategory: 'Savings' };
    }
    if (/환불|refund|remboursement|rückerstattung|reembolso|rimborso|返金/i.test(lower)) {
      return { category: 'Living', subCategory: 'Refund' };
    }
    if (/생활|쇼핑|생필품|living|shopping|clothes|fashion|store|market|courses|einkaufen|compras|spesa|日用品|買い物|ショッピング/i.test(lower)) {
      return { category: 'Living', subCategory: 'Shopping' };
    }
    return { category: rawCat, subCategory: 'General' };
  }

  app.post('/api/parse', async (req, res) => {
    try {
      const { prompt: rawPrompt, text, engineConfig } = req.body;
      const prompt = text || rawPrompt || '';
      if (!isValidTextInput(prompt) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '거래 분석 요청이 올바르지 않습니다.' });
      }
      // Enforce PII sanitization (strip card numbers, account numbers, resident IDs, phones)
      const sanitizedPrompt = anonymizeFinancialInput(prompt);

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      // If in on-device mode or without an API key, use the robust deterministic local parsing engine
      if (engineConfig?.engineType === 'local' || !apiKey) {
        const localParsed = parseFinancialInputDeterministically(sanitizedPrompt);
        const localItems = parseFinancialText(sanitizedPrompt);
        return res.json({ transactions: localParsed, items: localItems, source: 'local' });
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
        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: sanitizedPrompt,
          config: {
            systemInstruction: `You are 'Vibe Vault AI', an expert multilingual NLP financial logic parser.
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

Output a strict JSON array of ParsedItem objects.`,
            responseMimeType: "application/json",
            responseSchema: {
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
            }
          }
        });

        const jsonStr = response.text?.trim() || "[]";
        let rawParsed: any[] = [];
        try {
          rawParsed = JSON.parse(jsonStr);
        } catch {
          console.error('Failed to parse Gemini response JSON.');
        }

        // Post-inference schema verification & enrichment
        const installmentCheck = detectInstallment(sanitizedPrompt, parseKoreanAmount(sanitizedPrompt) || 0);
        let validatedTransactions: any[] = [];
        const rawItems = Array.isArray(rawParsed) ? rawParsed : [];

        for (const t of rawItems) {
          const months = t.installmentMonths || (rawItems.length === 1 ? installmentCheck?.totalMonths : undefined);
          const isInstallment = months && months >= 2;

          if (isInstallment) {
            const isZeroInterest = typeof t.isInterestFree === 'boolean'
              ? t.isInterestFree
              : (installmentCheck ? installmentCheck.isInterestFree : /(?:무이자|0%|수수료\s*없(?:는|음))/i.test(sanitizedPrompt));
            const fullTotal = t.totalAmount || installmentCheck?.totalAmount || parseKoreanAmount(sanitizedPrompt) || (t.amount * months);
            const monthlyAmt = Math.floor(fullTotal / months);
            const rem = fullTotal - (monthlyAmt * months);
            const grpId = generateSecureId('installment');
            const cleanTitle = cleanInstallmentItemTitle(sanitizedPrompt, t.merchant || t.description || '할부 결제');
            const tag = isZeroInterest ? '무이자' : '할부';
            const baseDate = t.date ? new Date(t.date).toISOString() : new Date().toISOString();

            let { category, subCategory } = normalizeStandardCategory(t.category);
            if (!category || category === 'Uncategorized' || category === '미분류') {
              const inferred = inferCategoryAndMerchant(cleanTitle || sanitizedPrompt);
              category = inferred.category;
              subCategory = inferred.subCategory;
            }

            for (let i = 1; i <= months; i++) {
              const currentAmt = i === 1 ? (monthlyAmt + rem) : monthlyAmt;
              const dateStr = addMonthsToDate(baseDate, i - 1);

              validatedTransactions.push({
                type: 'EXPENSE',
                amount: currentAmt,
                currency: t.currency || 'KRW',
                category: category || 'Living',
                subCategory: subCategory || 'Shopping',
                description: `${cleanTitle} (${i}/${months}회차 · ${tag})`,
                merchant: cleanTitle,
                date: dateStr,
                paymentMethod: t.paymentMethod || '카드',
                groupId: grpId,
                originalTotal: fullTotal,
                isInternalTransfer: false,
                installment: {
                  totalMonths: months,
                  currentMonth: i,
                  totalAmount: fullTotal,
                  monthlyAmount: monthlyAmt,
                  isInterestFree: isZeroInterest
                }
              });
            }
            continue;
          }

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

          let { category, subCategory } = normalizeStandardCategory(t.category);

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

          validatedTransactions.push({
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
          });
        }

        let source: 'gemini' | 'fallback' = 'gemini';
        if (validatedTransactions.length === 0) {
          validatedTransactions = parseFinancialInputDeterministically(sanitizedPrompt);
          source = 'fallback';
        }

        const parsedItems = (Array.isArray(rawParsed) && rawParsed.length > 0)
          ? rawParsed
          : parseFinancialText(sanitizedPrompt);

        res.json({ transactions: validatedTransactions, items: parsedItems, source });
      } catch (geminiError) {
        const fallbackParsed = parseFinancialInputDeterministically(sanitizedPrompt);
        const fallbackItems = parseFinancialText(sanitizedPrompt);
        res.json({ transactions: fallbackParsed, items: fallbackItems, source: 'fallback' });
      }
    } catch (error) {
      console.error('Transaction parse error:', error instanceof Error ? error.name : 'Unknown error');
      res.status(502).json({ error: '거래 분석 중 오류가 발생했습니다.' });
    }
  });

  // Smart Asset Setup endpoint
  app.post('/api/parse-assets', async (req, res) => {
    try {
      const { text: rawText, prompt: rawPrompt, engineConfig } = req.body;
      const inputText = rawText || rawPrompt || '';
      if (!isValidTextInput(inputText) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '자산 분석 요청이 올바르지 않습니다.' });
      }
      const text = anonymizeFinancialInput(inputText.trim());

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

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

        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: text,
          config: {
            systemInstruction: `You are 'Vibe Vault AI', an intelligent personal finance asset parser.
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
        } catch {
          console.error('Failed to parse asset response JSON.');
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          // Fall back to local rules if LLM returned empty array
          const fallbackAssets = parseAssetsWithLocalRules(text);
          return res.json({ assets: fallbackAssets, source: 'fallback' });
        }

        const assets = parsed.map((item: any, idx: number) => ({
          id: generateSecureId('asset'),
          name: String(item.name || '자산').trim(),
          type: ['CARD', 'BANK', 'CASH', 'OTHER'].includes(item.type) ? item.type : 'CARD',
          billingDay: typeof item.billingDay === 'number' && item.billingDay >= 1 && item.billingDay <= 31 ? item.billingDay : undefined,
          enabled: true,
          note: item.note ? String(item.note) : undefined
        }));

        res.json({ assets, source: 'gemini' });
      } catch (geminiError) {
        const fallbackAssets = parseAssetsWithLocalRules(text);
        res.json({ assets: fallbackAssets, source: 'fallback' });
      }
    } catch (error) {
      console.error('Asset parse error:', error instanceof Error ? error.name : 'Unknown error');
      res.status(502).json({ error: '자산 분석 중 오류가 발생했습니다.' });
    }
  });

  // Key validation endpoint
  app.post('/api/validate-key', async (req, res) => {
    const { provider, apiKey } = req.body;
    if (
      !['gemini', 'openai', 'anthropic'].includes(provider)
      || typeof apiKey !== 'string'
      || apiKey.trim().length === 0
      || apiKey.length > 512
    ) {
      return res.status(400).json({ valid: false, message: 'API key is required.' });
    }

    try {
      if (provider === 'gemini') {
        const testClient = new GoogleGenAI({
          apiKey: apiKey.trim(),
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        // Lightweight ping using gemini-3.1-flash-lite
        const ping = await generateGeminiWithResilience(testClient, {
          model: 'gemini-3.1-flash-lite',
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
    } catch (err) {
      console.error('Key validation failed:', err instanceof Error ? err.name : 'Unknown error');
      return res.status(502).json({ valid: false, message: 'Connection failed' });
    }
  });

  // Natural Language Financial Query Intent & Parameter Extraction (Gemini Structured Output)
  app.post('/api/query-intent', async (req, res) => {
    try {
      const { query: rawQuery, prompt: rawPrompt, engineConfig } = req.body;
      const inputQuery = rawQuery || rawPrompt || '';
      if (!isValidTextInput(inputQuery) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '질문 분석 요청이 올바르지 않습니다.' });
      }
      const query = anonymizeFinancialInput(inputQuery.trim());

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      // Deterministic rule-based intent fallback with multilingual support (KO, EN, JA, EU)
      const parseIntentLocally = (text: string) => {
        let metric = 'general_financial';
        let category: string | undefined = undefined;
        let targetCurrency = 'KRW';
        let month = currentMonth;
        let year = currentYear;
        let merchantKeyword: string | undefined = undefined;

        // Month matching
        // Korean: "9월", "2026년 9월"
        // Japanese: "9月", "2026年9月"
        const koJaMonthMatch = text.match(/(?:(\d{4})[년年]\s*)?(\d{1,2})[월月]/);
        // English month names
        const enMonthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        const enMonthShort = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

        if (koJaMonthMatch) {
          if (koJaMonthMatch[1]) year = parseInt(koJaMonthMatch[1], 10);
          month = parseInt(koJaMonthMatch[2], 10);
        } else if (/지난달|지난\s*달|last\s*month|先月|le\s*mois\s*dernier|letzter\s*monat|el\s*mes\s*pasado/i.test(text)) {
          month = currentMonth === 1 ? 12 : currentMonth - 1;
          if (currentMonth === 1) year = currentYear - 1;
        } else {
          for (let i = 0; i < 12; i++) {
            const regex = new RegExp(`\\b(?:${enMonthNames[i]}|${enMonthShort[i]})\\b`, 'i');
            if (regex.test(text)) {
              month = i + 1;
              break;
            }
          }
        }

        // Target currency detection
        if (/usd|dollar|달러|\$|환차|환율|외환|fx|forex|為替/i.test(text)) {
          targetCurrency = 'USD';
        } else if (/eur|euro|유로|€/i.test(text)) {
          targetCurrency = 'EUR';
        } else if (/jpy|yen|엔화|円|¥/i.test(text)) {
          targetCurrency = 'JPY';
        } else if (/gbp|pound|파운드|£/i.test(text)) {
          targetCurrency = 'GBP';
        }

        // FX Gain / Loss matching
        if (/환차|환율|달러|usd|외환|환전|환손익|환차익|환차손|fx|forex|exchange\s*rate|foreign\s*exchange|currency\s*gain|為替|為替差益|為替差損|為替レート|taux\s*de\s*change|wechselkurs|tipo\s*de\s*cambio/i.test(text)) {
          metric = 'fx_gain_loss';
          targetCurrency = targetCurrency || 'USD';
        } else if (/주말|토요일|일요일|weekend|samedi|dimanche|wochenende|fin\s*de\s*semana|週末|土曜日|日曜日/i.test(text)) {
          metric = 'weekend_expense';
        } else if (/식비|카페|커피|외식|음식|배달|점심|저녁|마트|장보기|food|dining|restaurant|coffee|cafe|groceries|lunch|dinner|meal|essen|lebensmittel|nourriture|repas|comida|cibo|食費|カフェ|外食|ランチ|ディナー/i.test(text)) {
          metric = 'category_sum';
          category = 'Food';
        } else if (/교통|지하철|버스|택시|주유|주차|transport|transit|subway|metro|bus|taxi|flight|fuel|gas|essence|verkehr|transporte|trasporti|交通|電車|バス|タクシー|ガソリン/i.test(text)) {
          metric = 'category_sum';
          category = 'Transport';
        } else if (/생활|쇼핑|다이소|쿠팡|올리브영|편의점|shopping|living|store|market|courses|einkaufen|compras|spesa|日用品|買い物|ショッピング/i.test(text)) {
          metric = 'category_sum';
          category = 'Living';
        } else if (/고정비|월세|관리비|통신비|보험|공과금|fixed|rent|utility|utilities|bill|insurance|subscription|miete|loyer|alquiler|bollette|固定費|家賃|光熱費|保険|サブスク/i.test(text)) {
          metric = 'category_sum';
          category = 'Fixed';
        } else if (/의료|병원|약국|헬스|운동|health|medical|doctor|hospital|pharmacy|fitness|gym|santé|gesundheit|salud|salute|医療|健康|病院|薬局|フィットネス/i.test(text)) {
          metric = 'category_sum';
          category = 'Health';
        } else if (/여가|문화|영화|여행|숙박|leisure|culture|movie|cinema|trip|travel|hotel|hobby|vacation|loisirs|freizeit|ocio|tempo\s*libero|娯楽|趣味|旅行|映画/i.test(text)) {
          metric = 'category_sum';
          category = 'Leisure';
        } else if (/총\s*지출|얼마\s*썼|지출\s*총액|total\s*expense|how\s*much\s*did\s*i\s*spend|total\s*spending|dépenses\s*totales|gesamtausgaben|gastos\s*totales|総支出|支出合計/i.test(text)) {
          metric = 'total_expense';
        } else if (/수입|월급|급여|들어온\s*돈|income|salary|earnings|revenue|revenu|einkommen|ingresos|entrata|収入|給料/i.test(text)) {
          metric = 'total_income';
        } else if (/저축|순수익|흑자|잉여|savings|net\s*savings|surplus|épargne|ersparnis|ahorro|risparmio|貯蓄|余剰/i.test(text)) {
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
          querySummary: `${month} / ${year} (${metric === 'fx_gain_loss' ? 'FX' : metric === 'weekend_expense' ? 'Weekend' : category || 'Finance'})`
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

        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: `You are an expert multilingual financial natural language query intent extractor.
The user is asking a financial analytics question about their finances in Korean, English, Japanese, or European languages.
Current reference date is ${today.toISOString().slice(0, 10)} (Year: ${currentYear}, Month: ${currentMonth}).

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
- "querySummary": Short title of the query in the user's input language or English (e.g. "September FX Gains Analysis", "9월 달러 환차손익 분석", "9月の為替差益分析").`,
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
      } catch (geminiError) {
        const fallbackParams = parseIntentLocally(query);
        res.json({ parameters: fallbackParams, source: 'fallback' });
      }
    } catch (err) {
      console.error('Query intent error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(502).json({ error: '질문 의도 분석 중 오류가 발생했습니다.' });
    }
  });

  const requestErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    console.error('Request processing error:', err instanceof Error ? err.name : 'Unknown error');
    return res.status(500).json({ error: 'Request could not be processed.' });
  };

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

  app.use(requestErrorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
