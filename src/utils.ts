import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Asset, AssetType, AssetCategoryType, LaunchScreenMode, SupportedCurrency, FxRates, Transaction, AssetAccount, DebtItem } from './types';
import { getSecureGeminiApiKey, setSecureGeminiApiKey, sanitizeApiKey } from './geminiKeyManager';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface AIEngineConfig {
  engineType: 'local' | 'byok';
  localModel: 'gemma-2b' | 'llama3-8b';
  provider: 'gemini' | 'openai' | 'anthropic';
  modelTier: string;
  apiKey: string;
}

export type ThemeMode = 'dark';

export interface UserPreferences {
  budgetStartDay: number; // 1 to 31
  currencySymbol: string; // 'KRW', 'USD', 'EUR', 'JPY'
  stealthMode: boolean;   // blur financial amounts
  theme?: string;         // locked to 'dark'
  chartPalette?: string;  // deprecated
  autoCategorization: boolean; // toggle smart auto-categorization (default true)
  defaultLaunchScreen?: LaunchScreenMode; // 'vault' | 'insights' | 'ledger'
}

export function getAIEngineConfig(): AIEngineConfig {
  const secureKey = getSecureGeminiApiKey();

  try {
    const stored = localStorage.getItem('vibe_engine_config');
    if (stored) {
      const parsed = JSON.parse(stored);
      const effectiveKey = sanitizeApiKey(parsed.apiKey) || secureKey || '';
      return {
        engineType: parsed.engineType || 'byok',
        localModel: parsed.localModel || 'gemma-2b',
        provider: parsed.provider || 'gemini',
        modelTier: parsed.modelTier || 'gemini-3.8-flash',
        apiKey: effectiveKey
      };
    }
  } catch (e) {}
  
  return {
    engineType: 'byok',
    localModel: 'gemma-2b',
    provider: 'gemini',
    modelTier: 'gemini-3.8-flash',
    apiKey: secureKey || ''
  };
}

export function saveAIEngineConfig(config: AIEngineConfig) {
  const cleanKey = sanitizeApiKey(config.apiKey);
  if (config.provider === 'gemini') {
    if (cleanKey) {
      setSecureGeminiApiKey(cleanKey);
    }
  }
  localStorage.setItem('vibe_engine_config', JSON.stringify({
    ...config,
    apiKey: cleanKey
  }));
}

export function getEffectiveTheme(_theme?: string): 'dark' {
  return 'dark';
}

export function applyTheme(_theme?: string, _paletteId?: string | null) {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.removeAttribute('data-accent');
    body.classList.remove('bg-[#F8FAFC]', 'text-slate-900');
    body.classList.add('bg-gradient-to-b', 'from-[#0B0F17]', 'via-[#0E1524]', 'to-[#111827]', 'text-slate-100');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', '#0B0F17');
  }
}

export function getUserPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem('vibe_user_preferences');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        budgetStartDay: parsed.budgetStartDay ?? 1,
        currencySymbol: parsed.currencySymbol || 'KRW',
        stealthMode: !!parsed.stealthMode,
        theme: 'dark',
        autoCategorization: parsed.autoCategorization !== undefined ? !!parsed.autoCategorization : true,
        defaultLaunchScreen: (['vault', 'insights', 'ledger'] as const).includes(parsed.defaultLaunchScreen) ? parsed.defaultLaunchScreen : 'vault',
      };
    }
  } catch (e) {}

  return {
    budgetStartDay: 1,
    currencySymbol: 'KRW',
    stealthMode: false,
    theme: 'dark',
    autoCategorization: true,
    defaultLaunchScreen: 'vault',
  };
}

export function saveUserPreferences(prefs: UserPreferences) {
  localStorage.setItem('vibe_user_preferences', JSON.stringify(prefs));
}

export const ASSET_CATEGORY_NAMES_KO: Record<AssetCategoryType, string> = {
  BROKERAGE: '증권/투자',
  BANK: '은행/예적금',
  CRYPTO: '가상자산',
  REAL_ESTATE: '부동산/실물',
  CASH: '현금/비상금',
  LIABILITY: '부채/대출',
};

export function getAssetCategoryKo(type: AssetCategoryType): string {
  return ASSET_CATEGORY_NAMES_KO[type] || '기타 자산';
}

export interface CategoryItem {
  key: string;
  nameKo: string;
  iconName?: string;
  emoji: string;
}

export const STANDARD_CATEGORIES: CategoryItem[] = [
  { key: 'Food', nameKo: '식비', emoji: '🍽️' },
  { key: 'Living', nameKo: '생활/쇼핑', emoji: '🛍️' },
  { key: 'Transport', nameKo: '교통', emoji: '🚌' },
  { key: 'Fixed', nameKo: '고정지출', emoji: '🏠' },
  { key: 'Health', nameKo: '의료/건강', emoji: '💊' },
  { key: 'Leisure', nameKo: '문화/여가', emoji: '🎬' },
  { key: 'Uncategorized', nameKo: '미분류', emoji: '❓' },
];

export const CATEGORY_NAMES_KO: Record<string, string> = {
  Food: '식비',
  Fixed: '고정지출',
  Living: '생활/쇼핑',
  Transport: '교통',
  Health: '의료/건강',
  Leisure: '문화/여가',
  Income: '급여/수입',
  Salary: '급여',
  Uncategorized: '미분류',
};

// Clean Korean subcategory translations to eliminate redundant English labels
export const SUBCATEGORY_NAMES_KO: Record<string, string> = {
  // Food
  Dining: '외식',
  Cafe: '카페/디저트',
  Delivery: '배달',
  Grocery: '장보기/마트',
  // Living
  Shopping: '쇼핑',
  'Daily Supplies': '생필품',
  Fashion: '패션/뷰티',
  Convenience: '편의점',
  General: '생활',
  // Transport
  'Public Transport': '대중교통',
  Taxi: '택시/모빌리티',
  Vehicle: '차량/주유',
  // Fixed
  Salary: '급여',
  Subscription: '구독',
  Subscriptions: '구독',
  Utilities: '공과금/관리비',
  Finance: '금융/보험',
  Savings: '적금/저축',
  Rent: '월세',
  // Health
  Medical: '병원/약국',
  Fitness: '운동/피트니스',
  // Leisure
  Entertainment: '문화/여가',
  Travel: '여행/숙박',
  Hobbies: '도서/취미',
};

export function getCategoryKo(category: string, subCategory?: string): string {
  // If transaction category is income or salary, display clean Korean label
  if (category === 'Income' || category === 'Salary' || subCategory === 'Salary') {
    return '급여';
  }

  const baseKo = CATEGORY_NAMES_KO[category] || category;

  if (!subCategory) {
    return baseKo;
  }

  // If subCategory has a dedicated Korean translation, check if it duplicates base
  const subKo = SUBCATEGORY_NAMES_KO[subCategory] || subCategory;

  // Avoid repetitive combinations like "문화/여가 · 문화/여가" or "식비 · 식비"
  if (subKo === baseKo || subCategory.toLowerCase() === category.toLowerCase()) {
    return baseKo;
  }

  // Handle specific clean overrides
  if (category === 'Leisure' && subCategory === 'Travel') {
    return '여행/숙박';
  }
  if (category === 'Leisure' && subCategory === 'Entertainment') {
    return '문화/여가';
  }
  if (category === 'Food' && subCategory === 'Dining') {
    return '식비';
  }
  if (category === 'Living' && (subCategory === 'Shopping' || subCategory === 'General')) {
    return '생활/쇼핑';
  }
  if (category === 'Transport' && subCategory === 'Public Transport') {
    return '교통';
  }

  return `${baseKo} · ${subKo}`;
}

export const TRANSACTION_TYPE_KO: Record<string, string> = {
  ALL: '전체',
  EXPENSE: '지출',
  INCOME: '수입',
  TRANSFER: '이체',
  SETTLEMENT: '정산',
};

export function getTransactionTypeKo(type: string): string {
  return TRANSACTION_TYPE_KO[type] || type;
}

export function getPaymentMethodKo(method?: string, transactionType?: string): string {
  if (!method) {
    return transactionType === 'INCOME' ? '통장' : '';
  }
  const trimmed = method.trim();
  // Income payment methods should always reflect account/bank (통장/계좌), never card
  if (transactionType === 'INCOME') {
    if (/^(?:card|카드|check\s*card|체크카드|신용카드|credit\s*card)$/i.test(trimmed)) {
      return '통장';
    }
    if (/^(?:계좌이체|계좌|통장|bank\s*transfer|무통장)$/i.test(trimmed)) {
      return '통장';
    }
  }

  // Payment method translations
  if (/^(?:card|신용카드|카드결제)$/i.test(trimmed)) {
    return '카드';
  }
  if (/^check\s*card$/i.test(trimmed)) {
    return '체크카드';
  }
  if (/^credit\s*card$/i.test(trimmed)) {
    return '신용카드';
  }
  if (/^bank\s*transfer$/i.test(trimmed)) {
    return '계좌이체';
  }
  if (/^cash$/i.test(trimmed)) {
    return '현금';
  }

  return trimmed;
}

export const DEFAULT_USER_ASSETS: Asset[] = [
  { id: 'asset-default-1', name: '현대카드', type: 'CARD', billingDay: 14, enabled: true, note: '주요 신용카드' },
  { id: 'asset-default-2', name: '신한은행', type: 'BANK', enabled: true, note: '급여·생활비 계좌' },
  { id: 'asset-default-3', name: '비상금 현금', type: 'CASH', enabled: true, note: '지갑 현금' },
];

export function getUserAssets(): Asset[] {
  try {
    const stored = localStorage.getItem('vibe_user_assets');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return DEFAULT_USER_ASSETS;
}

export function saveUserAssets(assets: Asset[]): void {
  localStorage.setItem('vibe_user_assets', JSON.stringify(assets));
}

export const ASSET_TYPE_KO: Record<AssetType, string> = {
  CARD: '신용/체크카드',
  BANK: '계좌/통장',
  CASH: '현금',
  OTHER: '기타 자산',
};

export function getAssetTypeKo(type: AssetType): string {
  return ASSET_TYPE_KO[type] || type;
}

export interface CurrencyMeta {
  code: SupportedCurrency;
  symbol: string;
  nameKo: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'KRW', symbol: '₩', nameKo: '대한민국 원', flag: '🇰🇷' },
  { code: 'USD', symbol: '$', nameKo: '미국 달러', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', nameKo: '유럽 유로', flag: '🇪🇺' },
  { code: 'JPY', symbol: '¥', nameKo: '일본 엔', flag: '🇯🇵' },
  { code: 'GBP', symbol: '£', nameKo: '영국 파운드', flag: '🇬🇧' },
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  KRW: '₩',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
};

export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code;
}

export function formatCurrency(amount: number, currency: string = 'KRW'): string {
  const symbol = getCurrencySymbol(currency);
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  const formattedVal = (currency === 'KRW' || currency === 'JPY')
    ? Math.round(absVal).toLocaleString()
    : absVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${isNegative ? '-' : ''}${symbol}${formattedVal}`;
}

// Default Fallback FX Rates table (KRW base)
export const DEFAULT_FX_RATES: FxRates = {
  base: 'KRW',
  rates: {
    KRW: 1,
    USD: 0.00075, // 1 KRW ≈ 0.00075 USD (or 1 USD ≈ 1,333 KRW)
    EUR: 0.00069, // 1 KRW ≈ 0.00069 EUR (or 1 EUR ≈ 1,450 KRW)
    JPY: 0.113,   // 1 KRW ≈ 0.113 JPY (or 100 JPY ≈ 885 KRW)
    GBP: 0.00058, // 1 KRW ≈ 0.00058 GBP (or 1 GBP ≈ 1,720 KRW)
  },
  updatedAt: new Date().toISOString(),
};

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: FxRates = DEFAULT_FX_RATES
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const fromRate = fxRates.rates[fromCurrency] || 1;
  const toRate = fxRates.rates[toCurrency] || 1;

  // Since rates are relative to base (KRW)
  // amount in base = amount / fromRate
  // amount in target = (amount / fromRate) * toRate
  const amountInBase = fromRate === 0 ? amount : amount / fromRate;
  const converted = amountInBase * toRate;

  // Rounding: KRW and JPY integers, USD/EUR/GBP 2 decimals
  if (toCurrency === 'KRW' || toCurrency === 'JPY') {
    return Math.round(converted);
  }
  return Math.round(converted * 100) / 100;
}

export const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {
  Food: 600000,
  Living: 400000,
  Transport: 150000,
  Fixed: 500000,
  Leisure: 200000,
};

export function getCategoryBudgets(): Record<string, number> {
  try {
    const stored = localStorage.getItem('vibe_category_budgets');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (e) {}

  return DEFAULT_CATEGORY_BUDGETS;
}

export function saveCategoryBudgets(budgets: Record<string, number>): void {
  localStorage.setItem('vibe_category_budgets', JSON.stringify(budgets));
}

/**
 * Strict Input Sanitization & XSS Mitigation
 * Strips HTML tags, script payloads, dangerous URI protocols, and ASCII/Unicode control characters.
 */
export function sanitizeTextInput(input: unknown, maxLength: number = 500): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  // 1. Unicode Normalization (NFKC) to resolve homoglyphs and zero-width confusables
  try {
    str = str.normalize('NFKC');
  } catch {}

  // 2. Strip control characters (\u0000-\u0008, \u000B, \u000C, \u000E-\u001F, \u007F-\u009F)
  // Preserve newline (\n) and tab (\t)
  str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');

  // 3. Strip HTML/XML tags and potential markup injections
  str = str.replace(/<[^>]*>?/gm, '');

  // 4. Strip dangerous pseudo-protocols and script execution strings
  str = str.replace(/javascript:/gi, '')
           .replace(/data:text\/html/gi, '')
           .replace(/vbscript:/gi, '')
           .replace(/on\w+\s*=/gi, '');

  // 5. Trim and enforce length bound
  str = str.trim();
  if (maxLength > 0 && str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str;
}

export function sanitizeTransactionInput<T extends Partial<Transaction>>(tx: T): T {
  return {
    ...tx,
    description: tx.description !== undefined ? sanitizeTextInput(tx.description, 300) : tx.description,
    category: tx.category !== undefined ? sanitizeTextInput(tx.category, 50) : tx.category,
    subCategory: tx.subCategory !== undefined ? sanitizeTextInput(tx.subCategory, 50) : tx.subCategory,
    paymentMethod: tx.paymentMethod !== undefined ? sanitizeTextInput(tx.paymentMethod, 100) : tx.paymentMethod
  };
}

export function sanitizeAssetAccountInput<T extends Partial<AssetAccount>>(acc: T): T {
  return {
    ...acc,
    accountName: acc.accountName !== undefined ? sanitizeTextInput(acc.accountName, 100) : acc.accountName,
    institution: acc.institution !== undefined ? sanitizeTextInput(acc.institution, 100) : acc.institution,
    accountNumberMasked: acc.accountNumberMasked !== undefined ? sanitizeTextInput(acc.accountNumberMasked, 100) : acc.accountNumberMasked,
    note: acc.note !== undefined ? sanitizeTextInput(acc.note, 500) : acc.note
  };
}

export function sanitizeDebtItemInput<T extends Partial<DebtItem>>(debt: T): T {
  return {
    ...debt,
    name: debt.name !== undefined ? sanitizeTextInput(debt.name, 100) : debt.name,
    counterpartyOrBank: debt.counterpartyOrBank !== undefined ? sanitizeTextInput(debt.counterpartyOrBank, 100) : debt.counterpartyOrBank,
    notes: debt.notes !== undefined ? sanitizeTextInput(debt.notes, 500) : debt.notes
  };
}

// Security Hardening Item #4: Image Upload Pipeline Hardening & Memory Leak / XSS Mitigation
export {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  BANNED_EXTENSIONS,
  MAX_RAW_IMAGE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  DEFAULT_COMPRESSION_QUALITY,
  ImageSanitizationError,
  validateImageFile,
  sanitizeAndProcessImage,
  calculateTargetDimensions,
  verifyImageMagicBytes,
  containsSvgOrHtmlSignatures,
  extractImageFileFromClipboard,
  extractImageFileFromDataTransfer
} from './imageSanitizer';
export type {
  AllowedImageMimeType,
  ImageSanitizationErrorCode,
  ImageValidationResult,
  SanitizationOptions,
  SanitizedImageMetadata,
  SanitizedImageOutput
} from './imageSanitizer';



