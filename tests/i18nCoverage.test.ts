import { describe, it, expect } from 'vitest';
import { translations } from '../src/i18n';
import { getCategoryLabel, getPaymentMethodLabel } from '../src/utils';
import {
  getOnboardingProgress,
  getActiveContextNudge,
  getQuickTryPrompts,
  getQuickTryInsightQuery,
  type OnboardingSnapshot,
} from '../src/onboardingGuide';

const HANGUL_RE = /[가-힣]/;

describe('KO + EN i18n coverage & Hangul leak guard', () => {
  it('translations.en contains no stray Hangul except the native Korean language option label', () => {
    const enEntries = Object.entries(translations.en);
    const leaked = enEntries.filter(([key, value]) => {
      if (key === 'lang_ko') return false;
      return HANGUL_RE.test(value);
    });
    expect(leaked).toEqual([]);
  });

  it('getCategoryLabel returns clean English without Hangul when language is en', () => {
    const categories = [
      'Food',
      'Transport',
      'Shopping',
      'Health',
      'Fixed',
      'Investment',
      'Leisure',
      'Education',
      'Other',
      'Uncategorized',
    ];
    for (const cat of categories) {
      const label = getCategoryLabel(cat, undefined, 'en');
      expect(label.length).toBeGreaterThan(0);
      expect(HANGUL_RE.test(label)).toBe(false);
    }

    const subCategories = ['급여', '식비', '외식', '교통', '쇼핑', '주거', '통신', '구독'];
    for (const sub of subCategories) {
      const label = getCategoryLabel('Food', sub, 'en');
      expect(HANGUL_RE.test(label)).toBe(false);
    }
  });

  it('getPaymentMethodLabel returns clean English without Hangul when language is en', () => {
    const methods = ['카드', '신용카드', '체크카드', '통장', '계좌', '계좌이체', '현금', '토스', '카카오페이', '카드/현금'];
    for (const m of methods) {
      const label = getPaymentMethodLabel(m, 'EXPENSE', 'en');
      expect(label.length).toBeGreaterThan(0);
      expect(HANGUL_RE.test(label)).toBe(false);
    }
    expect(getPaymentMethodLabel(undefined, 'INCOME', 'en')).toBe('Bank Account');
  });

  it('onboarding nudges and quick-try prompts contain no Hangul in English mode', () => {
    const promptsEn = getQuickTryPrompts('en');
    expect(promptsEn.length).toBeGreaterThan(0);
    for (const p of promptsEn) {
      expect(HANGUL_RE.test(p.label)).toBe(false);
      expect(HANGUL_RE.test(p.text)).toBe(false);
    }
    expect(HANGUL_RE.test(getQuickTryInsightQuery('en'))).toBe(false);

    const makeSnapshot = (overrides: Partial<OnboardingSnapshot>): OnboardingSnapshot => ({
      accountCount: 0,
      transactionCount: 2,
      hasRunQuery: false,
      isGuestMode: false,
      activeTab: 'vault',
      checklistDismissed: true,
      dismissedNudges: [],
      language: 'en',
      ...overrides,
    });

    const snapVault = makeSnapshot({ activeTab: 'vault', accountCount: 0, transactionCount: 2 });
    const nudgeVault = getActiveContextNudge(snapVault, getOnboardingProgress(snapVault));
    expect(nudgeVault).not.toBeNull();
    expect(HANGUL_RE.test(nudgeVault!.message)).toBe(false);
    expect(HANGUL_RE.test(nudgeVault!.actionLabel)).toBe(false);

    const snapInsights = makeSnapshot({ activeTab: 'insights', accountCount: 0, transactionCount: 2 });
    const nudgeInsights = getActiveContextNudge(snapInsights, getOnboardingProgress(snapInsights));
    expect(nudgeInsights).not.toBeNull();
    expect(HANGUL_RE.test(nudgeInsights!.message)).toBe(false);
    expect(HANGUL_RE.test(nudgeInsights!.actionLabel)).toBe(false);

    const snapLedger = makeSnapshot({ activeTab: 'ledger', accountCount: 1, transactionCount: 0 });
    const nudgeLedger = getActiveContextNudge(snapLedger, getOnboardingProgress(snapLedger));
    expect(nudgeLedger).not.toBeNull();
    expect(HANGUL_RE.test(nudgeLedger!.message)).toBe(false);
    expect(HANGUL_RE.test(nudgeLedger!.actionLabel)).toBe(false);

    const snapGuest = makeSnapshot({
      activeTab: 'vault',
      accountCount: 1,
      transactionCount: 2,
      isGuestMode: true,
    });
    const nudgeGuest = getActiveContextNudge(snapGuest, getOnboardingProgress(snapGuest));
    expect(nudgeGuest).not.toBeNull();
    expect(HANGUL_RE.test(nudgeGuest!.message)).toBe(false);
    expect(HANGUL_RE.test(nudgeGuest!.actionLabel)).toBe(false);
  });
});
