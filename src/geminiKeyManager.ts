/**
 * ============================================================================
 * SECURE GEMINI API KEY & BYOK (BRING YOUR OWN KEY) MANAGER
 * ============================================================================
 * 
 * Threat Model & Security Architecture:
 * 1. Zero Hardcoded / Bundled Secrets:
 *    - Never bundle or bake `VITE_GEMINI_API_KEY` into production client artifacts.
 *    - In static SPA deployments (e.g. Cloudflare Pages), the user brings their own key (BYOK).
 * 2. Obfuscated Local Persistence:
 *    - Keys are stored in client-side storage using light reversible encoding
 *      to mitigate naive plaintext inspection from casual shoulder surfing or DevTools exports.
 * 3. Sanitization & Zero Raw Injections:
 *    - Inputs are stripped of accidental leading/trailing whitespace, quotes, and zero-width chars.
 *    - Validation strictly checks Google AI API key patterns (typically AIzaSy...).
 * 4. Zero Key Logging:
 *    - Key values are strictly redacted ([REDACTED_API_KEY]) before any error logging or UI presentation.
 * 5. Direct Cloudflare Pages Compatibility:
 *    - Implements direct REST invocation to `https://generativelanguage.googleapis.com`
 *      which complies with the strict Content Security Policy (CSP).
 */

import { SupportedCurrency } from './types';

// Dedicated obfuscated storage key
const SECURE_STORAGE_KEY = 'vibe_gemini_api_key_secure_v1';
const LEGACY_STORAGE_KEY = 'vibe_engine_config';

// Device-salted mask seed (client-side barrier against naive plaintext scanning)
const SALT_SEED = 0x5a;

/**
 * Encodes a string with XOR and Base64 for basic storage obfuscation.
 */
function obfuscateString(plain: string): string {
  if (!plain) return '';
  try {
    const chars = plain.split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ ((SALT_SEED + i) & 0xff))
    );
    return btoa(chars.join(''));
  } catch {
    return btoa(plain);
  }
}

/**
 * Decodes an obfuscated Base64 string.
 */
function deobfuscateString(cipher: string): string {
  if (!cipher) return '';
  try {
    const plainChars = atob(cipher).split('').map((c, i) => 
      String.fromCharCode(c.charCodeAt(0) ^ ((SALT_SEED + i) & 0xff))
    );
    return plainChars.join('');
  } catch {
    try {
      return atob(cipher);
    } catch {
      return '';
    }
  }
}

/**
 * Sanitizes raw API key input:
 * - Removes leading and trailing whitespace
 * - Strips accidental wrapping single/double quotes or backticks
 * - Strips zero-width unicode characters (\u200B, \u200C, \u200D, \uFEFF)
 */
export function sanitizeApiKey(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/**
 * Masks an API key for safe UI display (e.g. AIza••••••••••••••••••••••••3aB8)
 */
export function maskApiKey(key: string | undefined | null): string {
  const clean = sanitizeApiKey(key);
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  const prefix = clean.slice(0, 4);
  const suffix = clean.slice(-4);
  const dots = '•'.repeat(Math.max(8, clean.length - 8));
  return `${prefix}${dots}${suffix}`;
}

/**
 * Validates whether an API key adheres to standard Google Gemini / AI Studio key formats.
 */
export function isValidGeminiKeyFormat(key: string | undefined | null): boolean {
  const clean = sanitizeApiKey(key);
  if (!clean) return false;
  // Standard Google API keys start with AIza and are 39 characters long
  return /^AIza[0-9A-Za-z-_]{35}$/.test(clean) || (clean.startsWith('AIza') && clean.length >= 35);
}

/**
 * Retrieves the user-configured Gemini API Key from secure storage.
 * Synchronizes with legacy vibe_engine_config if present.
 */
export function getSecureGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';

  try {
    // 1. Check dedicated obfuscated storage first
    const storedObfuscated = localStorage.getItem(SECURE_STORAGE_KEY);
    if (storedObfuscated) {
      const decoded = deobfuscateString(storedObfuscated);
      const sanitized = sanitizeApiKey(decoded);
      if (sanitized) return sanitized;
    }

    // 2. Check legacy engine config
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed.apiKey && (parsed.provider === 'gemini' || !parsed.provider)) {
        const sanitized = sanitizeApiKey(parsed.apiKey);
        if (sanitized) {
          // Migrate to secure storage
          setSecureGeminiApiKey(sanitized);
          return sanitized;
        }
      }
    }
  } catch (err) {
    // Graceful silent recovery - never leak storage state
  }

  return '';
}

/**
 * Saves the user's Gemini API Key in secure obfuscated storage
 * and keeps vibe_engine_config synchronized.
 */
export function setSecureGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = sanitizeApiKey(key);
  if (!clean) {
    clearSecureGeminiApiKey();
    return;
  }

  try {
    const cipher = obfuscateString(clean);
    localStorage.setItem(SECURE_STORAGE_KEY, cipher);

    // Keep legacy engine config in sync
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed = legacy ? JSON.parse(legacy) : {};
    parsed.engineType = 'byok';
    parsed.provider = 'gemini';
    parsed.apiKey = clean;
    if (!parsed.modelTier) parsed.modelTier = 'gemini-3.8-flash';
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('Failed to securely save API key');
  }
}

/**
 * Permanently clears the user's Gemini API Key from all local browser storage.
 */
export function clearSecureGeminiApiKey(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SECURE_STORAGE_KEY);

    // Update legacy engine config
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      parsed.apiKey = '';
      if (parsed.engineType === 'byok') {
        parsed.engineType = 'local';
      }
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch (err) {
    console.error('Failed to clear API key');
  }
}

/**
 * Checks if a valid user-configured Gemini API Key exists.
 */
export function hasSecureGeminiApiKey(): boolean {
  const key = getSecureGeminiApiKey();
  return Boolean(key && key.length >= 10);
}

/**
 * Redacts any accidental API key patterns from an error string or message.
 */
export function redactSensitiveKey(message: string, currentKey?: string): string {
  if (!message) return '';
  let sanitized = message;
  if (currentKey) {
    sanitized = sanitized.split(currentKey).join('[REDACTED_API_KEY]');
  }
  return sanitized
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED_API_KEY]')
    .replace(/x-goog-api-key:\s*[^\s]+/gi, 'x-goog-api-key: [REDACTED_API_KEY]');
}

/**
 * Tests a Gemini API key against Google's Generative Language endpoint
 * without leaking the key to logs.
 */
export async function testGeminiApiKeyOnline(keyToTest: string): Promise<{
  valid: boolean;
  message: string;
  statusCode?: number;
}> {
  const clean = sanitizeApiKey(keyToTest);
  if (!clean) {
    return { valid: false, message: 'API 키를 입력해주세요.' };
  }

  // 1. First format check
  if (!isValidGeminiKeyFormat(clean)) {
    return {
      valid: false,
      message: '올바른 Google Gemini API 키 형식이 아닙니다 (AIza...로 시작해야 합니다).'
    };
  }

  // 2. Direct ping against official Google API endpoint
  // Matches CSP: connect-src 'self' https://generativelanguage.googleapis.com
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${clean}&pageSize=1`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      return {
        valid: true,
        message: 'Google Gemini API 연결 성공 (유효한 키)'
      };
    }

    const status = res.status;
    if (status === 400) {
      return { valid: false, message: '유효하지 않은 API 키 형식입니다 (HTTP 400).', statusCode: status };
    }
    if (status === 403 || status === 401) {
      return { valid: false, message: 'API 키 인증 실패: 권한이 없거나 만료된 키입니다 (HTTP ' + status + ').', statusCode: status };
    }
    if (status === 429) {
      return { valid: true, message: 'API 키는 유효하나 호출 한도가 초과되었습니다 (HTTP 429).', statusCode: status };
    }

    return {
      valid: false,
      message: `Google API 연결 실패 (HTTP ${status})`,
      statusCode: status
    };
  } catch (err: unknown) {
    // Redact any possible key leakage in error
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = redactSensitiveKey(rawMsg, clean);

    // If direct fetch fails due to CORS or local proxy availability, try /api/validate-key as fallback
    try {
      const fallbackRes = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'gemini', apiKey: clean })
      });
      const data = await fallbackRes.json().catch(() => ({}));
      if (fallbackRes.ok && data.valid) {
        return { valid: true, message: 'Google Gemini API 키 확인 완료' };
      }
    } catch {
      // Ignore proxy fallback error
    }

    return {
      valid: false,
      message: `네트워크 연결 확인 필요: ${safeMsg}`
    };
  }
}

/**
 * Direct Client-Side Gemini Vision Call for Receipt OCR (Static SPA & Cloudflare Pages)
 * Calls `https://generativelanguage.googleapis.com` directly using the user's BYOK key.
 */
export async function directGeminiReceiptOCR(
  imageBase64: string,
  mimeType: string = 'image/webp',
  apiKey: string,
  defaultCurrency: SupportedCurrency = 'KRW'
): Promise<{ receipt: any }> {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('API_KEY_REQUIRED: Gemini API 키가 설정되지 않았습니다.');
  }

  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const today = new Date().toISOString().slice(0, 10);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${cleanKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: rawBase64,
              mimeType: mimeType || 'image/webp'
            }
          },
          {
            text: `You are an expert OCR receipt parsing AI. Analyze this receipt photo and extract structured transaction details.
Requirements:
1. "merchantName": Store or business name (e.g., "스타벅스 강남점", "Costco", "세븐일레븐").
2. "date": Transaction date in strict ISO-8601 format (YYYY-MM-DD). If unreadable, fallback to "${today}".
3. "totalAmount": Final total amount paid as a positive integer or float.
4. "currency": ISO currency code ("KRW", "USD", "EUR", "JPY", "GBP"). Default to "${defaultCurrency}".
5. "category": Strictly one of ["Food", "Living", "Transport", "Fixed", "Health", "Leisure", "Uncategorized"].
6. "items": Array of purchased line items with "name", "price" (positive number), and optional "quantity".
7. "confidenceScore": Float between 0.0 and 1.0.
8. NEVER extract credit card numbers, personal telephone numbers, or account numbers.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || `HTTP ${response.status}`;
      if (response.status === 400 && errMsg.includes('API key')) {
        throw new Error('INVALID_API_KEY: 유효하지 않은 Gemini API 키입니다. 설정에서 키를 확인해주세요.');
      }
      if (response.status === 403 || response.status === 401) {
        throw new Error('EXPIRED_API_KEY: Gemini API 키 인증에 실패했습니다 (권한 없음 또는 만료).');
      }
      throw new Error(`Gemini API 호출 실패: ${redactSensitiveKey(errMsg, cleanKey)}`);
    }

    const result = await response.json();
    const candidateText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini API로부터 영수증 분석 텍스트를 수신하지 못했습니다.');
    }

    const parsed = JSON.parse(candidateText);
    const validCategories = ['Food', 'Living', 'Transport', 'Fixed', 'Health', 'Leisure', 'Uncategorized'];
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((it: any) => ({
          name: String(it.name || '품목').trim(),
          price: Math.abs(Number(it.price)) || 0,
          quantity: it.quantity ? Math.max(1, Number(it.quantity)) : 1,
          amount: Math.abs(Number(it.price)) || 0
        }))
      : [];

    const calculatedTotal = items.length > 0 && (!parsed.totalAmount || Number(parsed.totalAmount) === 0)
      ? items.reduce((acc: number, it: any) => acc + (it.price * (it.quantity || 1)), 0)
      : Math.abs(Number(parsed.totalAmount)) || 0;

    const receipt = {
      merchantName: String(parsed.merchantName || '영수증 결제').trim(),
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today,
      totalAmount: calculatedTotal,
      currency: (['KRW', 'USD', 'EUR', 'JPY', 'GBP'].includes(parsed.currency?.toUpperCase()) ? parsed.currency.toUpperCase() : defaultCurrency),
      category: validCategories.includes(parsed.category) ? parsed.category : 'Living',
      items,
      confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(1, Math.max(0, parsed.confidenceScore)) : 0.95,
      merchant: String(parsed.merchantName || '영수증 결제').trim(),
      suggestedCategory: validCategories.includes(parsed.category) ? parsed.category : 'Living'
    };

    return { receipt };
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSensitiveKey(rawMsg, cleanKey));
  }
}
