import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Asset, AssetType, AssetCategoryType, LaunchScreenMode, SupportedCurrency, FxRates, Transaction, AssetAccount, DebtItem } from './types';
import { getSecureGeminiApiKey, sanitizeApiKey, maskApiKey } from './geminiKeyManager';
import { detectCreditCardSettlement } from './financialParser';
import { DEFAULT_FX_RATES } from './fxRates';

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
      return {
        engineType: parsed.engineType || 'byok',
        localModel: parsed.localModel || 'gemma-2b',
        provider: parsed.provider || 'gemini',
        modelTier: parsed.modelTier || 'gemini-3.8-flash',
        apiKey: secureKey
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
  const effectiveStoredKey = (cleanKey && !cleanKey.includes('•'))
    ? maskApiKey(cleanKey)
    : (cleanKey || '');
  localStorage.setItem('vibe_engine_config', JSON.stringify({
    ...config,
    apiKey: effectiveStoredKey,
    maskedApiKey: effectiveStoredKey
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
  BROKERAGE: '투자',
  BANK: '예적금',
  CRYPTO: '가상자산',
  REAL_ESTATE: '부동산',
  CASH: '현금',
  LIABILITY: '부채',
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
  Refund: '환불',
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

export const RECOMMENDED_USER_ASSETS: Asset[] = [
  { id: 'asset-default-1', name: '현대카드', type: 'CARD', billingDay: 14, enabled: true, note: '주요 신용카드' },
  { id: 'asset-default-2', name: '신한은행', type: 'BANK', enabled: true, note: '급여·생활비 계좌' },
  { id: 'asset-default-3', name: '비상금 현금', type: 'CASH', enabled: true, note: '지갑 현금' },
];

export const DEFAULT_USER_ASSETS: Asset[] = [];

export function getUserAssets(): Asset[] {
  try {
    const stored = localStorage.getItem('vibe_user_assets');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
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
  IDR: 'Rp',
  CNY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
  HKD: 'HK$',
  THB: '฿',
  VND: '₫',
  CHF: 'CHF',
  TWD: 'NT$',
  PHP: '₱',
  INR: '₹',
};

// Known ISO 4217 Currency Names for previewing & validation
export const KNOWN_CURRENCY_NAMES: Record<string, { nameKo: string; symbol: string }> = {
  KRW: { nameKo: '대한민국 원', symbol: '₩' },
  USD: { nameKo: '미국 달러', symbol: '$' },
  IDR: { nameKo: '인도네시아 루피아', symbol: 'Rp' },
  EUR: { nameKo: '유럽 유로', symbol: '€' },
  JPY: { nameKo: '일본 엔', symbol: '¥' },
  GBP: { nameKo: '영국 파운드', symbol: '£' },
  CNY: { nameKo: '중국 위안', symbol: '¥' },
  CAD: { nameKo: '캐나다 달러', symbol: 'C$' },
  AUD: { nameKo: '호주 달러', symbol: 'A$' },
  SGD: { nameKo: '싱가포르 달러', symbol: 'S$' },
  HKD: { nameKo: '홍콩 달러', symbol: 'HK$' },
  THB: { nameKo: '태국 바트', symbol: '฿' },
  VND: { nameKo: '베트남 동', symbol: '₫' },
  CHF: { nameKo: '스위스 프랑', symbol: 'CHF' },
  TWD: { nameKo: '대만 달러', symbol: 'NT$' },
  PHP: { nameKo: '필리핀 페소', symbol: '₱' },
  INR: { nameKo: '인도 루피', symbol: '₹' },
};

// Default User Active Currencies list (Single-currency minimalist default)
export const DEFAULT_ACTIVE_CURRENCIES: string[] = ['KRW'];

export function getUserActiveCurrencies(): string[] {
  try {
    const stored = localStorage.getItem('vibe_active_currencies');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c) => String(c).toUpperCase());
      }
    }
  } catch {}
  return DEFAULT_ACTIVE_CURRENCIES;
}

export function saveUserActiveCurrencies(currencies: string[]): void {
  try {
    const sanitized = Array.from(new Set(currencies.map((c) => String(c).trim().toUpperCase()))).filter(Boolean);
    localStorage.setItem('vibe_active_currencies', JSON.stringify(sanitized));
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('storage'));
      }, 0);
    }
  } catch {}
}

export function getCurrencySymbol(code: string): string {
  const upper = String(code || '').toUpperCase();
  return CURRENCY_SYMBOLS[upper] || KNOWN_CURRENCY_NAMES[upper]?.symbol || upper;
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

export { DEFAULT_FX_RATES };

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: FxRates = DEFAULT_FX_RATES
): number {
  const fromCode = fromCurrency.toUpperCase();
  const toCode = toCurrency.toUpperCase();
  if (fromCode === toCode) return amount;

  const fromRate = fxRates.rates[fromCode];
  const toRate = fxRates.rates[toCode];
  if (!fromRate || !toRate) {
    throw new RangeError(`Exchange rate unavailable for ${!fromRate ? fromCode : toCode}.`);
  }

  // Rates are target units per KRW, so divide into KRW before converting to target.
  const amountInBase = amount / fromRate;
  const converted = amountInBase * toRate;

  // Rounding: KRW, JPY, IDR, VND integers, others 2 decimals
  if (toCurrency === 'KRW' || toCurrency === 'JPY' || toCurrency === 'IDR' || toCurrency === 'VND') {
    return Math.round(converted);
  }
  return Math.round(converted * 100) / 100;
}

export interface DualCurrencyDisplay {
  secondaryCurrency: string;
  secondaryFormatted: string;
  rateText: string;
}

/**
 * Returns dual-currency comparison data for hero balances.
 * Calculates secondary equivalent and human-readable FX rate sub-line.
 * e.g., Primary: Rp 15,816,800 -> "≈ ₩1,360,000 · 환율 1 KRW = 11.63 IDR"
 */
export function getDualCurrencyComparison(
  amount: number,
  primaryCurrency: string,
  fxRates: FxRates = DEFAULT_FX_RATES,
  customSecondaryCurrency?: string
): DualCurrencyDisplay | null {
  const primary = (primaryCurrency || 'KRW').toUpperCase();

  // Determine secondary currency
  let secondary = customSecondaryCurrency?.toUpperCase();
  if (!secondary) {
    if (primary !== 'KRW') {
      secondary = 'KRW';
    } else {
      const activeList = getUserActiveCurrencies();
      secondary = activeList.find((c) => c !== primary) || 'USD';
    }
  }

  if (primary === secondary) return null;

  const secondaryAmount = convertCurrency(amount, primary, secondary, fxRates);
  const secondarySym = getCurrencySymbol(secondary);

  const isIntCurrency = secondary === 'KRW' || secondary === 'JPY' || secondary === 'IDR' || secondary === 'VND';
  const secondaryFormatted = isIntCurrency
    ? `${secondarySym}${Math.round(secondaryAmount).toLocaleString()}`
    : `${secondarySym}${secondaryAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Determine rate string (e.g. "1 KRW = 11.63 IDR" or "1 USD = 1,333 KRW")
  const oneSecondaryInPrimary = convertCurrency(1, secondary, primary, fxRates);
  const onePrimaryInSecondary = convertCurrency(1, primary, secondary, fxRates);

  let rateText = '';
  if (oneSecondaryInPrimary >= 1) {
    const rateVal = oneSecondaryInPrimary >= 100
      ? Number(oneSecondaryInPrimary.toFixed(2)).toLocaleString()
      : Number(oneSecondaryInPrimary.toFixed(2)).toString();
    rateText = `1 ${secondary} = ${rateVal} ${primary}`;
  } else {
    const rateVal = onePrimaryInSecondary >= 100
      ? Number(onePrimaryInSecondary.toFixed(2)).toLocaleString()
      : Number(onePrimaryInSecondary.toFixed(2)).toString();
    rateText = `1 ${primary} = ${rateVal} ${secondary}`;
  }

  return {
    secondaryCurrency: secondary,
    secondaryFormatted,
    rateText,
  };
}

export interface FinancialAggregates {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

/**
 * Calculates total unlinked credit card running liabilities from transactions.
 * Matches user configured CARD assets, accounts, or card payment methods in transactions.
 */
export function computeCreditCardLiabilities(
  accounts: AssetAccount[] = [],
  transactions: Transaction[] = [],
  baseCurrency: SupportedCurrency = 'KRW',
  fxRates: FxRates = DEFAULT_FX_RATES
): number {
  if (!transactions || transactions.length === 0) return 0;

  const userAssets = getUserAssets();
  const cardMap = new Map<string, { id?: string; name: string; billingDay?: number; accountId?: string }>();

  // 1. User configured CARD assets
  const cardAssets = userAssets.filter((a) => a.type === 'CARD');
  for (const ca of cardAssets) {
    cardMap.set(ca.name.trim(), {
      id: ca.id,
      name: ca.name.trim(),
      billingDay: ca.billingDay,
    });
  }

  // 2. Accounts with LIABILITY or card in name
  for (const acc of accounts) {
    if (acc.assetType === 'LIABILITY' || /카드|card/i.test(acc.institution) || /카드|card/i.test(acc.accountName)) {
      const name = (acc.institution || acc.accountName).trim();
      if (!cardMap.has(name)) {
        cardMap.set(name, {
          id: acc.id,
          name: name,
          accountId: acc.id,
        });
      } else {
        const existing = cardMap.get(name)!;
        existing.accountId = acc.id;
      }
    }
  }

  // 3. Transactions with card payment methods
  for (const tx of transactions) {
    const method = (tx.paymentMethod || '').trim();
    if (method && /카드|card/i.test(method) && !/체크카드/i.test(method)) {
      if (!cardMap.has(method)) {
        cardMap.set(method, {
          name: method,
        });
      }
    }
  }

  // 4. Default fallback if nothing exists yet
  if (cardMap.size === 0) {
    const rec = RECOMMENDED_USER_ASSETS.find((a) => a.type === 'CARD');
    if (rec) {
      cardMap.set(rec.name, { id: rec.id, name: rec.name, billingDay: rec.billingDay });
    }
  }

  const isMatchingCard = (txMethodOrDesc?: string, targetCardName?: string): boolean => {
    if (!txMethodOrDesc || !targetCardName) return false;
    const t = txMethodOrDesc.toLowerCase().replace(/[\s\-_]/g, '');
    const c = targetCardName.toLowerCase().replace(/[\s\-_]/g, '');
    if (t === c) return true;
    if (t.includes(c) || c.includes(t)) return true;
    const baseCard = c.replace(/카드|card|신용카드|creditcard/gi, '');
    const baseTx = t.replace(/카드|card|신용카드|creditcard/gi, '');
    if (baseCard.length >= 2 && (t.includes(baseCard) || baseTx.includes(baseCard))) {
      return true;
    }
    return false;
  };

  const isCardSettlementTx = (tx: Transaction): boolean => {
    if (tx.subCategory === '카드대금 납부' || tx.subCategory === '카드대금') return true;
    if (tx.type === 'TRANSFER' && detectCreditCardSettlement(tx.description || '') !== null) return true;
    return false;
  };

  let reconcileOffsets: Record<string, number> = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vibe_card_reconcile_offsets') : null;
    if (raw) reconcileOffsets = JSON.parse(raw);
  } catch {}

  let unlinkedCardLiability = 0;

  for (const card of cardMap.values()) {
    let totalExpenses = 0;
    let totalPayments = 0;
    let totalRefunds = 0;

    for (const t of transactions) {
      const amt = convertCurrency(t.amount, t.currency || 'KRW', baseCurrency, fxRates);

      if (t.type === 'EXPENSE' && isMatchingCard(t.paymentMethod, card.name)) {
        totalExpenses += amt;
      }

      if (t.type === 'TRANSFER' && isCardSettlementTx(t)) {
        if (isMatchingCard(t.paymentMethod, card.name) || isMatchingCard(t.description, card.name) || cardMap.size === 1) {
          totalPayments += amt;
        }
      }

      if (t.type === 'SETTLEMENT' && isMatchingCard(t.paymentMethod, card.name)) {
        totalRefunds += amt;
      }
    }

    const offset = reconcileOffsets[card.name] || 0;
    const rawRunningBalance = totalExpenses - totalPayments - totalRefunds;
    const unpaidLiability = Math.max(0, rawRunningBalance + offset);

    const isAccountMapped = accounts.some((a) => a.id === card.accountId && a.assetType === 'LIABILITY');
    if (!isAccountMapped) {
      unlinkedCardLiability += unpaidLiability;
    }
  }

  return Math.round(unlinkedCardLiability);
}

/**
 * Unified Net Worth & Asset Computation:
 * Shared accounting formula across VaultOverview and Insights
 * Handles overdraft accounts dynamically without double-counting:
 * - Positive balance: counts towards liquid cash assets
 * - Negative balance: overdraft loan utilized (dynamic liability)
 * Consistently includes unpaid credit card liabilities when provided or computed from transactions.
 */
export function computeFinancialAggregates(
  accounts: AssetAccount[],
  debts: DebtItem[] = [],
  baseCurrency: SupportedCurrency = 'KRW',
  fxRates: FxRates = DEFAULT_FX_RATES,
  transactionsOrOptions?: Transaction[] | { transactions?: Transaction[]; unpaidCreditCardLiability?: number } | number
): FinancialAggregates {
  let grossAssets = 0;
  let dynamicLiabilities = 0;

  for (const acc of accounts) {
    const balanceInBase = convertCurrency(acc.currentBalance, acc.currency || 'KRW', baseCurrency, fxRates);

    if (acc.assetType === 'LIABILITY') {
      dynamicLiabilities += Math.abs(balanceInBase);
    } else if (acc.isOverdraft || balanceInBase < 0) {
      if (balanceInBase >= 0) {
        // Positive balance: counts towards liquid cash assets
        grossAssets += balanceInBase;
      } else {
        // Negative balance: overdraft loan utilized (dynamic liability)
        dynamicLiabilities += Math.abs(balanceInBase);
      }
    } else {
      grossAssets += Math.max(0, balanceInBase);
    }
  }

  // Active debts from debts store
  for (const debt of debts) {
    if (!debt.isActive) continue;
    const debtInBase = convertCurrency(debt.remainingPrincipal, debt.currency || 'KRW', baseCurrency, fxRates);
    if (debt.type === 'LOAN_RECEIVABLE') {
      grossAssets += debtInBase; // Receivables count as assets
    } else {
      dynamicLiabilities += debtInBase;
    }
  }

  // Credit card unpaid liability (harmonized across Vault & Insights)
  let cardLiability = 0;
  if (typeof transactionsOrOptions === 'number') {
    cardLiability = transactionsOrOptions;
  } else if (Array.isArray(transactionsOrOptions)) {
    cardLiability = computeCreditCardLiabilities(accounts, transactionsOrOptions, baseCurrency, fxRates);
  } else if (transactionsOrOptions && typeof transactionsOrOptions === 'object') {
    if (typeof transactionsOrOptions.unpaidCreditCardLiability === 'number') {
      cardLiability = transactionsOrOptions.unpaidCreditCardLiability;
    } else if (transactionsOrOptions.transactions) {
      cardLiability = computeCreditCardLiabilities(accounts, transactionsOrOptions.transactions, baseCurrency, fxRates);
    }
  }

  dynamicLiabilities += cardLiability;

  const netWorth = grossAssets - dynamicLiabilities;

  return {
    totalAssets: Math.round(grossAssets),
    totalLiabilities: Math.round(dynamicLiabilities),
    netWorth: Math.round(netWorth),
  };
}

// Permanent Quiet Luxury Dark Palette Constants
export const LUXURY_CATEGORY_COLORS: Record<string, string> = {
  Food: '#38bdf8',          // Refined Muted Sage Emerald
  Fixed: '#818cf8',         // Muted Indigo
  Living: '#fbbf24',        // Warm Amber
  Transport: '#38bdf8',     // Soft Sky Cyan
  Health: '#f472b6',        // Muted Rose Pink
  Leisure: '#c084fc',       // Soft Lavender
  Uncategorized: '#94a3b8', // Refined Slate
};

export const RECOMMENDED_CATEGORY_BUDGETS: Record<string, number> = {
  Food: 600000,
  Living: 400000,
  Transport: 150000,
  Fixed: 500000,
  Leisure: 200000,
};

export const DEFAULT_CATEGORY_BUDGETS: Record<string, number> = {};

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
