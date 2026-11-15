import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  detectBrowserLanguage, 
  resolveInitialLanguage, 
  translations, 
  DEFAULT_CURRENCY_BY_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LanguageCode
} from '../src/i18n';

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  };
};

describe('i18n System Architecture', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createLocalStorageMock()
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Language Resolution Hierarchy', () => {
    it('Tier 1: uses saved localStorage language preference when present', () => {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ja');
      expect(resolveInitialLanguage()).toBe('ja');

      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'eu');
      expect(resolveInitialLanguage()).toBe('eu');

      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ko');
      expect(resolveInitialLanguage()).toBe('ko');

      localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
      expect(resolveInitialLanguage()).toBe('en');
    });

    it('Tier 2: detects Korean browser locales correctly', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { languages: ['ko-KR', 'ko', 'en-US'], language: 'ko-KR' }
      });
      expect(detectBrowserLanguage()).toBe('ko');
      expect(resolveInitialLanguage()).toBe('ko');
    });

    it('Tier 2: detects Japanese browser locales correctly', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { languages: ['ja-JP', 'ja'], language: 'ja-JP' }
      });
      expect(detectBrowserLanguage()).toBe('ja');
      expect(resolveInitialLanguage()).toBe('ja');
    });

    it('Tier 2: detects European regional browser locales (de, fr, es, it, nl, pt) correctly', () => {
      const euroLocales = ['de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'pt-PT'];
      for (const loc of euroLocales) {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: { languages: [loc], language: loc }
        });
        expect(detectBrowserLanguage()).toBe('eu');
      }
    });

    it('Tier 3: falls back to global English for other locales', () => {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { languages: ['zh-CN', 'ar-SA'], language: 'zh-CN' }
      });
      expect(detectBrowserLanguage()).toBe('en');
      expect(resolveInitialLanguage()).toBe('en');
    });
  });

  describe('Currency Synchronization by Region', () => {
    it('maps locales to the expected default base currencies', () => {
      expect(DEFAULT_CURRENCY_BY_LANGUAGE.ko).toBe('KRW');
      expect(DEFAULT_CURRENCY_BY_LANGUAGE.en).toBe('USD');
      expect(DEFAULT_CURRENCY_BY_LANGUAGE.ja).toBe('JPY');
      expect(DEFAULT_CURRENCY_BY_LANGUAGE.eu).toBe('EUR');
    });
  });

  describe('Translation Keys and Completeness', () => {
    const requiredKeys = [
      'vault',
      'insights',
      'ledger',
      'placeholder_vault',
      'placeholder_insights',
      'placeholder_ledger',
      'filter_all',
      'filter_expense',
      'filter_income',
      'filter_transfer',
      'filter_settlement',
      'net_worth',
      'total_assets',
      'total_liabilities',
      'savings_rate',
      'burn_rate',
      'runway_months',
      'emergency_cushion',
      'edit',
      'delete',
      'save',
      'cancel',
      'close',
      'print_report',
      'export_csv',
      'lock_vault',
      'reset_all',
      'cat_food',
      'cat_cafe',
      'cat_dining',
      'cat_living',
      'cat_transport',
      'cat_fixed',
      'cat_health',
      'cat_leisure',
      'cat_uncategorized',
      'tab_smart_assets',
      'tab_monthly_budget',
      'tab_subscriptions',
      'tab_ai_engine',
      'tab_preferences',
      'tab_privacy_data',
    ] as const;

    const locales: LanguageCode[] = ['ko', 'en', 'ja', 'eu'];

    locales.forEach((locale) => {
      it(`contains all core UI keys for locale '${locale}'`, () => {
        const dict = translations[locale];
        expect(dict).toBeDefined();
        for (const key of requiredKeys) {
          expect((dict as any)[key], `Missing key "${key}" in locale "${locale}"`).toBeDefined();
          expect(typeof (dict as any)[key]).toBe('string');
        }
      });
    });

    it('has distinctive omnibar placeholder texts for each tab across all 4 locales', () => {
      expect(translations.ko.placeholder_vault).toContain('신한');
      expect(translations.en.placeholder_vault).toContain('Chase');
      expect(translations.ja.placeholder_vault).toContain('三井住友');
      expect(translations.eu.placeholder_vault).toContain('BNP');

      expect(translations.ko.placeholder_insights).toContain('환차익');
      expect(translations.en.placeholder_insights).toContain('FX');
      expect(translations.ja.placeholder_insights).toContain('為替差益');
      expect(translations.eu.placeholder_insights).toContain('FX return');

      expect(translations.ko.placeholder_ledger).toContain('점심');
      expect(translations.en.placeholder_ledger).toContain('Lunch');
      expect(translations.ja.placeholder_ledger).toContain('ランチ');
      expect(translations.eu.placeholder_ledger).toContain('Lunch €15');
    });
  });
});
