import express from 'express';
import type { Router } from 'express';
import {
  isValidEngineConfig,
  isValidImageInput,
  isValidTextInput,
  resolveGeminiApiKey,
} from '../serverSecurity';
import {
  getCachedFxRates,
  isSupportedFxCurrency,
  type FxRateCache,
} from '../fxRates';
import { generateSecureId } from '../identifiers';
import { anonymizeFinancialInput } from '../piiSanitizer';
import { 
  parseFinancialInputDeterministically, 
  parseFinancialText,
  parseKoreanAmount,
  detectInstallment,
  addMonthsToDate,
  cleanInstallmentItemTitle,
  parseQueryIntentLocally,
  normalizeTransactionCategory
} from '../financialParser';
import { generateGeminiWithResilience, createGeminiClient } from './geminiClient';
import { parseAssetsWithLocalRules } from './localAssetParser';
import {
  getReceiptPrompt,
  RECEIPT_SCHEMA,
  ASSET_SCREENSHOT_PROMPT,
  ASSET_SCREENSHOT_SCHEMA,
  getTransactionParseInstruction,
  TRANSACTION_PARSE_SCHEMA,
  SMART_ASSET_INSTRUCTION,
  SMART_ASSET_SCHEMA,
  getQueryIntentInstruction,
  QUERY_INTENT_SCHEMA,
} from './prompts';

export function createApiRouter(): Router {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  const serverFxCache: FxRateCache = {};

  // ECB Multi-currency foreign exchange rates endpoint (ECB Daily via Frankfurter API)
  router.get('/fx-rates', async (req, res) => {
    try {
      const { rates } = await getCachedFxRates(serverFxCache);
      res.json(rates);
    } catch (err) {
      console.error('FX rates endpoint error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(503).json({ error: '환율 정보를 불러오는 중 일시적인 오류가 발생했습니다.' });
    }
  });

  router.get('/fx-rates/:code', async (req, res) => {
    const code = (req.params.code || '').toUpperCase();
    if (!isSupportedFxCurrency(code)) {
      return res.status(400).json({ error: `Unsupported currency code: ${code}` });
    }
    try {
      const { rates } = await getCachedFxRates(serverFxCache);
      const rate = rates.rates[code];
      if (!rate) {
        return res.status(404).json({ error: `Exchange rate not found for ${code}` });
      }
      res.json({
        code,
        base: rates.base,
        rate,
        rates: rates.rates,
        source: rates.source,
        stale: rates.stale,
        updatedAt: rates.updatedAt
      });
    } catch (err) {
      console.error('FX single rate error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(503).json({ error: '환율 정보를 조회할 수 없습니다.' });
    }
  });

  // Multimodal Receipt Scanner (Gemini Vision with Strict Structured JSON Schema)
  router.post('/parse-receipt', async (req, res) => {
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

      const ai = createGeminiClient(apiKey);
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
                text: getReceiptPrompt(today)
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: RECEIPT_SCHEMA
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
  router.post('/parse-asset-screenshot', async (req, res) => {
    try {
      const { image, mimeType = 'image/webp', engineConfig } = req.body;
      if (!isValidImageInput(image, mimeType) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '자산 스크린샷 분석 요청이 올바르지 않습니다.' });
      }

      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      if (!apiKey || engineConfig?.engineType === 'local') {
        return res.status(503).json({
          error: '클라우드 자산 스크린샷 OCR을 사용할 수 없습니다. AI 설정을 확인하거나 잔고를 직접 입력해주세요.',
          source: 'unavailable',
        });
      }

      const ai = createGeminiClient(apiKey);
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
                text: ASSET_SCREENSHOT_PROMPT
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: ASSET_SCREENSHOT_SCHEMA
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

  // Natural Language Financial Transaction Parsing endpoint
  router.post('/parse', async (req, res) => {
    try {
      const { prompt: rawPrompt, text, engineConfig } = req.body;
      const prompt = text || rawPrompt || '';
      if (!isValidTextInput(prompt) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '거래 분석 요청이 올바르지 않습니다.' });
      }
      const sanitizedPrompt = anonymizeFinancialInput(prompt);
      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      if (engineConfig?.engineType === 'local' || !apiKey) {
        const localParsed = parseFinancialInputDeterministically(sanitizedPrompt);
        const localItems = parseFinancialText(sanitizedPrompt);
        return res.json({ transactions: localParsed, items: localItems, source: 'local' });
      }

      try {
        const ai = createGeminiClient(apiKey);
        const today = new Date().toISOString().slice(0, 10);
        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: sanitizedPrompt,
          config: {
            systemInstruction: getTransactionParseInstruction(today),
            responseMimeType: "application/json",
            responseSchema: TRANSACTION_PARSE_SCHEMA
          }
        });

        const jsonStr = response.text?.trim() || "[]";
        let rawParsed: any[] = [];
        try {
          rawParsed = JSON.parse(jsonStr);
        } catch {
          console.error('Failed to parse Gemini response JSON.');
        }

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

            let { category, subCategory } = normalizeTransactionCategory(t.category, cleanTitle || sanitizedPrompt);

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

          let { category, subCategory } = normalizeTransactionCategory(t.category, t.description || sanitizedPrompt, type as any);

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
  router.post('/parse-assets', async (req, res) => {
    try {
      const { text: rawText, prompt: rawPrompt, engineConfig } = req.body;
      const inputText = rawText || rawPrompt || '';
      if (!isValidTextInput(inputText) || !isValidEngineConfig(engineConfig)) {
        return res.status(400).json({ error: '자산 분석 요청이 올바르지 않습니다.' });
      }
      const text = anonymizeFinancialInput(inputText.trim());
      const apiKey = resolveGeminiApiKey(engineConfig, process.env.GEMINI_API_KEY);

      if (engineConfig?.engineType === 'local' || !apiKey) {
        const localAssets = parseAssetsWithLocalRules(text);
        return res.json({ assets: localAssets, source: 'local' });
      }

      try {
        const ai = createGeminiClient(apiKey);
        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: text,
          config: {
            systemInstruction: SMART_ASSET_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: SMART_ASSET_SCHEMA
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
          const fallbackAssets = parseAssetsWithLocalRules(text);
          return res.json({ assets: fallbackAssets, source: 'fallback' });
        }

        const assets = parsed.map((item: any) => ({
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

  // Key validation endpoint (strictly restricted to Gemini)
  router.post('/validate-key', async (req, res) => {
    const { provider, apiKey } = req.body;
    if (
      provider !== 'gemini'
      || typeof apiKey !== 'string'
      || apiKey.trim().length === 0
      || apiKey.length > 512
    ) {
      return res.status(400).json({ valid: false, message: 'Provider must be gemini and a valid API key is required.' });
    }

    try {
      const testClient = createGeminiClient(apiKey.trim());
      const ping = await generateGeminiWithResilience(testClient, {
        model: 'gemini-3.1-flash-lite',
        contents: 'ping',
      });
      if (ping.text) {
        return res.json({ valid: true, message: 'Key validated successfully' });
      }
      return res.json({ valid: true, message: 'Key validated' });
    } catch (err) {
      console.error('Key validation failed:', err instanceof Error ? err.name : 'Unknown error');
      return res.status(502).json({ valid: false, message: 'Connection failed' });
    }
  });

  // Natural Language Financial Query Intent & Parameter Extraction (Gemini Structured Output)
  router.post('/query-intent', async (req, res) => {
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

      if (!apiKey || engineConfig?.engineType === 'local') {
        const localParams = parseQueryIntentLocally(query, today);
        return res.json({ parameters: localParams, source: 'local' });
      }

      try {
        const ai = createGeminiClient(apiKey);
        const response = await generateGeminiWithResilience(ai, {
          model: 'gemini-3.1-flash-lite',
          contents: query,
          config: {
            systemInstruction: getQueryIntentInstruction(today.toISOString().slice(0, 10), currentYear, currentMonth),
            responseMimeType: 'application/json',
            responseSchema: QUERY_INTENT_SCHEMA
          }
        });

        const jsonStr = response.text?.trim() || '{}';
        const parsed = JSON.parse(jsonStr);
        res.json({ parameters: parsed, source: 'gemini' });
      } catch (geminiError) {
        const fallbackParams = parseQueryIntentLocally(query, today);
        res.json({ parameters: fallbackParams, source: 'fallback' });
      }
    } catch (err) {
      console.error('Query intent error:', err instanceof Error ? err.name : 'Unknown error');
      res.status(502).json({ error: '질문 의도 분석 중 오류가 발생했습니다.' });
    }
  });

  return router;
}
