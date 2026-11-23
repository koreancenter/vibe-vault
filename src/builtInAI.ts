import {
  FinancialQueryMetric,
  FinancialQueryParameters,
  SupportedCurrency,
  TransactionType,
} from './types';

/**
 * Chrome Built-in AI (Prompt API / `LanguageModel`) Auto-Detection & On-Device Inference
 *
 * Supports both:
 * 1. Modern W3C / Chrome standard global `LanguageModel` (`availability()`, `create()`)
 * 2. Legacy `window.ai.languageModel` (`capabilities()`, `create()`)
 *
 * Design principles:
 * - Zero-config automatic activation when model state is `'available'`.
 * - Never triggers background multi-GB model downloads without explicit user action.
 * - Strict JSON validation & timeout guardrails so any unexpected output silently
 *   falls back to Vibe Vault's deterministic local engine without errors.
 */

export type BuiltInAIState = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface BuiltInAIStatus {
  state: BuiltInAIState;
  supported: boolean;
  source: 'language-model' | 'window-ai' | 'none';
  labelKo: string;
  labelEn: string;
  detailKo: string;
  detailEn: string;
}

export interface BuiltInParsedTransaction {
  type: TransactionType;
  amount: number;
  currency: SupportedCurrency;
  category: string;
  description: string;
  merchant: string;
  date: string;
  paymentMethod?: string;
  note?: string;
}

interface PromptDownloadMonitor {
  addEventListener: (
    type: 'downloadprogress',
    listener: (e: { loaded?: number; total?: number }) => void
  ) => void;
}

interface BuiltInLanguageModelSession {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  destroy?: () => void;
}

interface ModernLanguageModelAPI {
  availability: (options?: Record<string, unknown>) => Promise<string>;
  create: (options?: {
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    expectedInputs?: Array<{ type: string; languages?: string[] }>;
    expectedOutputs?: Array<{ type: string; languages?: string[] }>;
    monitor?: (m: PromptDownloadMonitor) => void;
    signal?: AbortSignal;
  }) => Promise<BuiltInLanguageModelSession>;
}

interface LegacyWindowAILanguageModelAPI {
  capabilities?: () => Promise<{ available?: string }>;
  availability?: () => Promise<string>;
  create: (options?: {
    systemPrompt?: string;
    temperature?: number;
    topK?: number;
    monitor?: (m: PromptDownloadMonitor) => void;
    signal?: AbortSignal;
  }) => Promise<BuiltInLanguageModelSession>;
}

interface ResolvedBuiltInProvider {
  source: 'language-model' | 'window-ai';
  modern?: ModernLanguageModelAPI;
  legacy?: LegacyWindowAILanguageModelAPI;
}

const VALID_CURRENCIES = new Set<string>([
  'KRW', 'USD', 'EUR', 'JPY', 'GBP', 'IDR', 'CNY', 'SGD',
  'THB', 'VND', 'AUD', 'CAD', 'CHF', 'HKD', 'TWD',
]);

const VALID_CATEGORIES = new Set<string>([
  'Food',
  'Living',
  'Transport',
  'Fixed',
  'Health',
  'Leisure',
  'Finance',
  'Income',
  'Uncategorized',
]);

const VALID_METRICS = new Set<FinancialQueryMetric>([
  'fx_gain_loss',
  'category_sum',
  'weekend_expense',
  'total_expense',
  'total_income',
  'net_savings',
  'merchant_expense',
  'general_financial',
]);

const DEFAULT_PROMPT_TIMEOUT_MS = 4500;

let cachedStatus: BuiltInAIStatus | null = null;
let txSessionPromise: Promise<BuiltInLanguageModelSession | null> | null = null;
let txSessionInstance: BuiltInLanguageModelSession | null = null;
let querySessionPromise: Promise<BuiltInLanguageModelSession | null> | null = null;
let querySessionInstance: BuiltInLanguageModelSession | null = null;

function resolveBuiltInProvider(): ResolvedBuiltInProvider | null {
  if (typeof globalThis === 'undefined') return null;

  const g = globalThis as unknown as {
    LanguageModel?: ModernLanguageModelAPI;
    ai?: { languageModel?: LegacyWindowAILanguageModelAPI };
    window?: {
      LanguageModel?: ModernLanguageModelAPI;
      ai?: { languageModel?: LegacyWindowAILanguageModelAPI };
    };
  };

  const modern = g.LanguageModel || g.window?.LanguageModel;
  if (modern && typeof modern.availability === 'function' && typeof modern.create === 'function') {
    return { source: 'language-model', modern };
  }

  const legacy = g.ai?.languageModel || g.window?.ai?.languageModel;
  if (legacy && typeof legacy.create === 'function') {
    return { source: 'window-ai', legacy };
  }

  return null;
}

function normalizeAvailability(raw: unknown): BuiltInAIState {
  if (typeof raw !== 'string') return 'unavailable';
  const v = raw.toLowerCase().trim();
  if (v === 'available' || v === 'readily') return 'available';
  if (v === 'downloadable' || v === 'after-download') return 'downloadable';
  if (v === 'downloading') return 'downloading';
  return 'unavailable';
}

function buildStatus(state: BuiltInAIState, source: BuiltInAIStatus['source']): BuiltInAIStatus {
  switch (state) {
    case 'available':
      return {
        state: 'available',
        supported: true,
        source,
        labelKo: '기기 내장 AI 자동 연결됨',
        labelEn: 'Built-in On-Device AI Active',
        detailKo: '브라우저 내장 Gemini Nano 모델이 감지되어 API 키나 인터넷 없이도 자동으로 동작합니다.',
        detailEn: 'Browser built-in Gemini Nano is ready and runs automatically on-device, even offline.',
      };
    case 'downloadable':
      return {
        state: 'downloadable',
        supported: true,
        source,
        labelKo: '기기 내장 AI 지원 기기 (활성화 가능)',
        labelEn: 'Built-in AI Supported (Ready to Enable)',
        detailKo: '이 브라우저는 내장 온디바이스 AI를 지원합니다. 아래 버튼으로 한 번 활성화하면 이후 자동으로 연동됩니다.',
        detailEn: 'Your browser supports built-in on-device AI. Enable it once below for automatic local inference.',
      };
    case 'downloading':
      return {
        state: 'downloading',
        supported: true,
        source,
        labelKo: '기기 내장 AI 모델 준비 중',
        labelEn: 'Preparing Built-in AI Model',
        detailKo: '브라우저가 온디바이스 AI 모델을 백그라운드에서 준비하고 있습니다. 완료되면 자동으로 전환됩니다.',
        detailEn: 'Your browser is preparing the on-device AI model. It will connect automatically once ready.',
      };
    case 'unavailable':
    default:
      return {
        state: 'unavailable',
        supported: false,
        source,
        labelKo: '브라우저 내장 AI 미지원 환경',
        labelEn: 'Built-in AI Not Available Here',
        detailKo: '현재 브라우저에서는 Chrome Built-in AI(LanguageModel)를 사용할 수 없어 내장 로컬 재무 엔진이 자동으로 작동합니다.',
        detailEn: 'Chrome Built-in AI (LanguageModel) is not supported in this browser; the built-in local finance engine runs automatically.',
      };
  }
}

/**
 * Automatically probes whether Chrome Built-in AI (`LanguageModel`) is available on this device.
 * Never throws and never initiates unexpected model downloads.
 */
export async function detectBuiltInAI(forceRefresh: boolean = false): Promise<BuiltInAIStatus> {
  if (!forceRefresh && cachedStatus) {
    return cachedStatus;
  }

  const provider = resolveBuiltInProvider();
  if (!provider) {
    cachedStatus = buildStatus('unavailable', 'none');
    return cachedStatus;
  }

  try {
    let rawState: unknown = 'unavailable';

    if (provider.modern) {
      try {
        rawState = await provider.modern.availability();
      } catch {
        rawState = await provider.modern.availability({
          expectedInputs: [{ type: 'text' }],
          expectedOutputs: [{ type: 'text' }],
        });
      }
    } else if (provider.legacy) {
      if (typeof provider.legacy.availability === 'function') {
        rawState = await provider.legacy.availability();
      } else if (typeof provider.legacy.capabilities === 'function') {
        const caps = await provider.legacy.capabilities();
        rawState = caps?.available;
      }
    }

    const state = normalizeAvailability(rawState);
    cachedStatus = buildStatus(state, provider.source);
    return cachedStatus;
  } catch {
    cachedStatus = buildStatus('unavailable', provider.source);
    return cachedStatus;
  }
}

export function getCachedBuiltInAIStatus(): BuiltInAIStatus | null {
  return cachedStatus;
}

export function isBuiltInAIReadySync(): boolean {
  return cachedStatus?.state === 'available';
}

/**
 * Explicit user-initiated activation when the browser reports `'downloadable'`.
 * Triggers Chrome's native built-in model download with progress callback.
 */
export async function prepareBuiltInAI(
  onProgress?: (percent: number) => void
): Promise<BuiltInAIStatus> {
  const provider = resolveBuiltInProvider();
  if (!provider) {
    cachedStatus = buildStatus('unavailable', 'none');
    return cachedStatus;
  }

  const monitor = (m: PromptDownloadMonitor) => {
    m.addEventListener('downloadprogress', (e) => {
      if (typeof e.loaded === 'number') {
        const ratio =
          typeof e.total === 'number' && e.total > 0
            ? e.loaded / e.total
            : e.loaded <= 1
              ? e.loaded
              : e.loaded / 100;
        const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));
        onProgress?.(pct);
      }
    });
  };

  try {
    let session: BuiltInLanguageModelSession | null = null;
    if (provider.modern) {
      session = await provider.modern.create({ monitor });
    } else if (provider.legacy) {
      session = await provider.legacy.create({ monitor });
    }
    session?.destroy?.();
    onProgress?.(100);
    return await detectBuiltInAI(true);
  } catch {
    return await detectBuiltInAI(true);
  }
}

/**
 * Releases any cached on-device LanguageModel sessions from memory.
 */
export function destroyBuiltInAISession(): void {
  try {
    txSessionInstance?.destroy?.();
  } catch {
    // ignore cleanup errors
  }
  try {
    querySessionInstance?.destroy?.();
  } catch {
    // ignore cleanup errors
  }
  txSessionInstance = null;
  txSessionPromise = null;
  querySessionInstance = null;
  querySessionPromise = null;
}

/**
 * Resets internal cache (used primarily for tests).
 */
export function resetBuiltInAICacheForTesting(): void {
  destroyBuiltInAISession();
  cachedStatus = null;
}

async function createSession(systemPrompt: string): Promise<BuiltInLanguageModelSession | null> {
  const status = await detectBuiltInAI();
  if (status.state !== 'available') return null;

  const provider = resolveBuiltInProvider();
  if (!provider) return null;

  try {
    if (provider.modern) {
      try {
        return await provider.modern.create({
          initialPrompts: [{ role: 'system', content: systemPrompt }],
          temperature: 0.1,
          topK: 3,
        });
      } catch {
        return await provider.modern.create({
          systemPrompt,
          temperature: 0.1,
          topK: 3,
        });
      }
    }

    if (provider.legacy) {
      return await provider.legacy.create({
        systemPrompt,
        temperature: 0.1,
        topK: 3,
      });
    }
  } catch {
    return null;
  }

  return null;
}

async function getTransactionSession(): Promise<BuiltInLanguageModelSession | null> {
  if (txSessionInstance) return txSessionInstance;
  if (!txSessionPromise) {
    const systemPrompt = [
      'You are a strict financial transaction parser.',
      'Return ONLY a valid JSON object matching: {"items":[{"type":"EXPENSE"|"INCOME"|"TRANSFER","amount":number,"currency":"KRW"|"USD"|"EUR"|"JPY","category":"Food"|"Living"|"Transport"|"Fixed"|"Health"|"Leisure"|"Finance"|"Income"|"Uncategorized","merchant":string,"paymentMethod":string,"date":"YYYY-MM-DD"}]}',
      'Rules:',
      '- amount must be a positive number.',
      '- Never include explanations or markdown outside JSON.',
      '- If no valid financial transaction exists, return {"items":[]}.',
    ].join('\n');

    txSessionPromise = createSession(systemPrompt)
      .then((session) => {
        txSessionInstance = session;
        if (!session) txSessionPromise = null;
        return session;
      })
      .catch(() => {
        txSessionPromise = null;
        return null;
      });
  }
  return txSessionPromise;
}

async function getQueryIntentSession(): Promise<BuiltInLanguageModelSession | null> {
  if (querySessionInstance) return querySessionInstance;
  if (!querySessionPromise) {
    const systemPrompt = [
      'You extract structured query parameters from Korean or English personal finance questions.',
      'Return ONLY a valid JSON object matching: {"metric":"fx_gain_loss"|"category_sum"|"weekend_expense"|"total_expense"|"total_income"|"net_savings"|"merchant_expense"|"general_financial","year":number,"month":number,"targetCurrency":"KRW"|"USD"|"EUR"|"JPY","category":"Food"|"Living"|"Transport"|"Fixed"|"Health"|"Leisure"|"Finance"|"Income","merchantKeyword":string}',
      'Rules:',
      '- Omit optional fields when not mentioned.',
      '- Return JSON only with no markdown or prose.',
    ].join('\n');

    querySessionPromise = createSession(systemPrompt)
      .then((session) => {
        querySessionInstance = session;
        if (!session) querySessionPromise = null;
        return session;
      })
      .catch(() => {
        querySessionPromise = null;
        return null;
      });
  }
  return querySessionPromise;
}

async function promptWithTimeout(
  session: BuiltInLanguageModelSession,
  promptText: string,
  timeoutMs: number = DEFAULT_PROMPT_TIMEOUT_MS
): Promise<string> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new Error('BUILTIN_AI_TIMEOUT'));
      }, timeoutMs);
    });

    const promptPromise = controller
      ? session.prompt(promptText, { signal: controller.signal })
      : session.prompt(promptText);

    return await Promise.race([promptPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Parses a natural-language financial entry using Chrome Built-in On-Device AI (`LanguageModel`).
 * Returns `null` if Built-in AI is unavailable, times out, or produces invalid output so callers
 * can fall back seamlessly to the deterministic local parser.
 */
export async function parseTransactionWithBuiltInAI(
  input: string,
  defaultCurrency: SupportedCurrency = 'KRW',
  timeoutMs: number = DEFAULT_PROMPT_TIMEOUT_MS
): Promise<BuiltInParsedTransaction[] | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const session = await getTransactionSession();
  if (!session) return null;

  const today = new Date().toISOString().slice(0, 10);
  const promptText = `Today: ${today}\nDefault currency: ${defaultCurrency}\nInput: "${trimmed}"`;

  try {
    const raw = await promptWithTimeout(session, promptText, timeoutMs);
    const parsed = extractJsonObject(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;

    const validItems: BuiltInParsedTransaction[] = [];
    for (const rawItem of parsed.items) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const it = rawItem as Record<string, unknown>;

      const amount = Number(it.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const rawType = typeof it.type === 'string' ? it.type.toUpperCase() : 'EXPENSE';
      const type: TransactionType =
        rawType === 'INCOME' || rawType === 'TRANSFER' || rawType === 'SETTLEMENT'
          ? (rawType as TransactionType)
          : 'EXPENSE';

      const rawCurr = typeof it.currency === 'string' ? it.currency.toUpperCase() : defaultCurrency;
      const currency: SupportedCurrency = VALID_CURRENCIES.has(rawCurr)
        ? (rawCurr as SupportedCurrency)
        : defaultCurrency;

      const rawCat = typeof it.category === 'string' ? it.category.trim() : '';
      const category = VALID_CATEGORIES.has(rawCat)
        ? rawCat
        : type === 'INCOME'
          ? 'Income'
          : 'Uncategorized';

      const merchant =
        typeof it.merchant === 'string' && it.merchant.trim()
          ? it.merchant.trim().slice(0, 80)
          : typeof it.description === 'string' && it.description.trim()
            ? it.description.trim().slice(0, 80)
            : trimmed.slice(0, 40);

      const rawDate =
        typeof it.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(it.date)
          ? new Date(it.date).toISOString()
          : new Date().toISOString();

      const paymentMethod =
        typeof it.paymentMethod === 'string' && it.paymentMethod.trim()
          ? it.paymentMethod.trim().slice(0, 40)
          : undefined;

      validItems.push({
        type,
        amount: Math.round(amount * 100) / 100,
        currency,
        category,
        description: merchant,
        merchant,
        date: Number.isNaN(Date.parse(rawDate)) ? new Date().toISOString() : rawDate,
        paymentMethod,
      });
    }

    return validItems.length > 0 ? validItems : null;
  } catch {
    // Invalidate potentially broken session so the next attempt can cleanly recreate it
    destroyBuiltInAISession();
    return null;
  }
}

/**
 * Extracts structured FinancialQueryParameters using Chrome Built-in On-Device AI (`LanguageModel`).
 * Mathematical computation still runs deterministically in TypeScript (zero math hallucination).
 */
export async function extractQueryIntentWithBuiltInAI(
  query: string,
  timeoutMs: number = DEFAULT_PROMPT_TIMEOUT_MS
): Promise<FinancialQueryParameters | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const session = await getQueryIntentSession();
  if (!session) return null;

  const now = new Date();
  const promptText = `Current year: ${now.getFullYear()}, current month: ${now.getMonth() + 1}\nQuestion: "${trimmed}"`;

  try {
    const raw = await promptWithTimeout(session, promptText, timeoutMs);
    const parsed = extractJsonObject(raw);
    if (!parsed) return null;

    const rawMetric = typeof parsed.metric === 'string' ? parsed.metric.trim() : '';
    if (!VALID_METRICS.has(rawMetric as FinancialQueryMetric)) {
      return null;
    }

    const params: FinancialQueryParameters = {
      metric: rawMetric as FinancialQueryMetric,
    };

    const year = Number(parsed.year);
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
      params.year = year;
    }

    const month = Number(parsed.month);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      params.month = month;
    }

    if (typeof parsed.targetCurrency === 'string') {
      const curr = parsed.targetCurrency.toUpperCase().trim();
      if (VALID_CURRENCIES.has(curr)) {
        params.targetCurrency = curr as SupportedCurrency;
      }
    }

    if (typeof parsed.category === 'string' && VALID_CATEGORIES.has(parsed.category.trim())) {
      params.category = parsed.category.trim();
    }

    if (typeof parsed.merchantKeyword === 'string' && parsed.merchantKeyword.trim()) {
      params.merchantKeyword = parsed.merchantKeyword.trim().slice(0, 60);
    }

    return params;
  } catch {
    destroyBuiltInAISession();
    return null;
  }
}
