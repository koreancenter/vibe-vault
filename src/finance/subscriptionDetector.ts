import { Transaction, SubscriptionItem, SupportedCurrency, FxRates } from '../types';
import {
  initSubscriptionsStorage,
  loadSavedSubscriptions as loadSavedSubscriptionsFromDB,
  saveSubscriptions as saveSubscriptionsToDB,
  subscribeSavedSubscriptions,
} from '../db';
import { convertCurrency } from '../utils';
import { differenceInDays, addDays, isBefore } from 'date-fns';

// Synchronous in-memory cache for zero-latency useMemo / .filter() callers
let cachedSubscriptions: SubscriptionItem[] = [];
let hasTriggeredBackgroundHydration = false;
let cacheRevision = 0;

subscribeSavedSubscriptions((items) => {
  cacheRevision += 1;
  cachedSubscriptions = Array.isArray(items) ? items : [];
});

function ensureBackgroundHydration(): void {
  if (hasTriggeredBackgroundHydration) return;
  if (typeof indexedDB === 'undefined') return;
  hasTriggeredBackgroundHydration = true;
  const startRevision = cacheRevision;
  initSubscriptionsStorage()
    .then((hydrated) => {
      if (cacheRevision === startRevision && Array.isArray(hydrated)) {
        cacheRevision += 1;
        cachedSubscriptions = hydrated;
      }
    })
    .catch(() => {});
}

// Kick off background hydration cleanly if running in a browser/IndexedDB environment
ensureBackgroundHydration();

/**
 * Synchronously returns cached subscriptions (never a Promise).
 * Hydrates from encrypted IndexedDB asynchronously in the background.
 */
export function loadSavedSubscriptions(): SubscriptionItem[] {
  ensureBackgroundHydration();
  if (cachedSubscriptions.length === 0) {
    const fallback = loadSavedSubscriptionsFromDB();
    if (Array.isArray(fallback) && fallback.length > 0) {
      cachedSubscriptions = fallback;
    }
  }
  return Array.isArray(cachedSubscriptions) ? cachedSubscriptions : [];
}

/**
 * Updates synchronous in-memory cache immediately and persists asynchronously
 * to encrypted IndexedDB in the background.
 */
export function saveSubscriptions(items: SubscriptionItem[]): Promise<void> {
  const safeItems = Array.isArray(items) ? items : [];
  cacheRevision += 1;
  cachedSubscriptions = safeItems;
  return saveSubscriptionsToDB(safeItems).catch((err) => {
    console.error('Background subscription save failed:', err);
  });
}

export const KNOWN_SUBSCRIPTION_KEYWORDS: Record<string, { category: string; defaultCycle: number }> = {
  '넷플릭스': { category: 'Living', defaultCycle: 30 },
  'netflix': { category: 'Living', defaultCycle: 30 },
  '유튜브': { category: 'Living', defaultCycle: 30 },
  'youtube': { category: 'Living', defaultCycle: 30 },
  '스포티파이': { category: 'Living', defaultCycle: 30 },
  'spotify': { category: 'Living', defaultCycle: 30 },
  '쿠팡': { category: 'Living', defaultCycle: 30 },
  '와우멤버십': { category: 'Living', defaultCycle: 30 },
  '와우': { category: 'Living', defaultCycle: 30 },
  '애플': { category: 'Living', defaultCycle: 30 },
  'apple': { category: 'Living', defaultCycle: 30 },
  'icloud': { category: 'Living', defaultCycle: 30 },
  '디즈니': { category: 'Living', defaultCycle: 30 },
  'disney': { category: 'Living', defaultCycle: 30 },
  '티빙': { category: 'Living', defaultCycle: 30 },
  'tving': { category: 'Living', defaultCycle: 30 },
  '웨이브': { category: 'Living', defaultCycle: 30 },
  'wavve': { category: 'Living', defaultCycle: 30 },
  '멜론': { category: 'Living', defaultCycle: 30 },
  'melon': { category: 'Living', defaultCycle: 30 },
  '밀리의서재': { category: 'Living', defaultCycle: 30 },
  '네이버플러스': { category: 'Living', defaultCycle: 30 },
  'chatgpt': { category: 'Work', defaultCycle: 30 },
  'openai': { category: 'Work', defaultCycle: 30 },
  'claude': { category: 'Work', defaultCycle: 30 },
  'notion': { category: 'Work', defaultCycle: 30 },
  'github': { category: 'Work', defaultCycle: 30 },
  'figma': { category: 'Work', defaultCycle: 30 },
  'adobe': { category: 'Work', defaultCycle: 30 },
  '통신비': { category: 'Living', defaultCycle: 30 },
  'skt': { category: 'Living', defaultCycle: 30 },
  'kt': { category: 'Living', defaultCycle: 30 },
  'lgu+': { category: 'Living', defaultCycle: 30 },
  'lg유플러스': { category: 'Living', defaultCycle: 30 },
  '관리비': { category: 'Living', defaultCycle: 30 },
  '월세': { category: 'Living', defaultCycle: 30 },
  '보험료': { category: 'Living', defaultCycle: 30 },
  '정수기': { category: 'Living', defaultCycle: 30 },
  '코웨이': { category: 'Living', defaultCycle: 30 },
  'sk매직': { category: 'Living', defaultCycle: 30 },
  '헬스장': { category: 'Health', defaultCycle: 30 },
  '필라테스': { category: 'Health', defaultCycle: 30 }
};

/**
 * Normalizes merchant description for clustering
 */
function normalizeMerchantKey(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[0-9]/g, '') // remove numbers
    .replace(/정기|결제|자동|이체|승인|출금|구독|멤버십|플랜/g, '')
    .replace(/[^\w\sㄱ-ㅎ가-힣]/g, '')
    .trim();
}

function advanceNextBillingDate(startDate: Date, cycleDays: number, now: Date): Date {
  const safeStart = Number.isNaN(startDate.getTime()) ? now : startDate;
  const safeCycle = Math.max(1, Math.floor(Number(cycleDays) || 30));
  let nextBilling = addDays(safeStart, safeCycle);
  let guard = 0;
  while (isBefore(nextBilling, now) && differenceInDays(now, nextBilling) > 3 && guard < 1200) {
    nextBilling = addDays(nextBilling, safeCycle);
    guard += 1;
  }
  return nextBilling;
}

/**
 * Autonomous Subscription Detector
 * Analyzes transaction histories to identify recurring periodic payments (28-32 days).
 * Guaranteed synchronous return of SubscriptionItem[].
 */
export function detectSubscriptions(
  transactions: Transaction[],
  targetCurrency: SupportedCurrency = 'KRW',
  fxRates?: FxRates
): SubscriptionItem[] {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const savedItems = loadSavedSubscriptions();
  const savedMap = new Map(savedItems.map(s => [s.id, s]));

  // Filter only expenses
  const expenses = safeTransactions.filter(t => t && t.type === 'EXPENSE' && t.amount > 0);

  // Group by normalized merchant key
  const groups: Record<string, Transaction[]> = {};

  for (const t of expenses) {
    const key = normalizeMerchantKey(t.description || t.category || '');
    if (!key || key.length < 2) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const detected: SubscriptionItem[] = [];
  const now = new Date();

  for (const [key, txList] of Object.entries(groups)) {
    // Sort chronologically ascending
    const sorted = [...txList].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Check if matches known keywords or has multiple occurrences
    let isKnown = false;
    let defaultCategory = sorted[sorted.length - 1].category || 'Living';

    for (const [kw, info] of Object.entries(KNOWN_SUBSCRIPTION_KEYWORDS)) {
      if (key.includes(kw) || sorted.some(t => (t.description || '').toLowerCase().includes(kw))) {
        isKnown = true;
        defaultCategory = info.category;
        break;
      }
    }

    let isRecurring = false;
    let avgInterval = 30;
    let confidence = 0.5;

    if (sorted.length >= 2) {
      // Calculate intervals between consecutive payments
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1].date);
        const d2 = new Date(sorted[i].date);
        if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) continue;
        const diff = Math.abs(differenceInDays(d2, d1));
        if (diff >= 20 && diff <= 45) {
          intervals.push(diff);
        }
      }

      if (intervals.length > 0) {
        avgInterval = Math.max(
          1,
          Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        );
        isRecurring = true;
        confidence = Math.min(0.95, 0.6 + intervals.length * 0.1);
      }
    }

    // If known keyword with at least 1 payment, qualify as subscription
    if (isKnown && !isRecurring) {
      isRecurring = true;
      confidence = 0.85;
      avgInterval = 30;
    }

    if (isRecurring) {
      const latestTx = sorted[sorted.length - 1];
      const lastBilling = new Date(latestTx.date);
      const nextBilling = advanceNextBillingDate(lastBilling, avgInterval, now);

      const dDay = differenceInDays(nextBilling, now);
      const subId = `sub_${key.replace(/\s+/g, '_')}`;

      // Check if user has saved overrides for this subscription
      const existing = savedMap.get(subId);

      const normalizedAmount = fxRates 
        ? convertCurrency(latestTx.amount, latestTx.currency || 'KRW', targetCurrency, fxRates)
        : latestTx.amount;

      detected.push({
        id: subId,
        merchant: existing?.merchant || latestTx.description || key,
        amount: existing?.amount ?? Math.round(normalizedAmount),
        currency: targetCurrency,
        category: existing?.category || defaultCategory,
        cycleDays: existing?.cycleDays || avgInterval,
        lastBillingDate: Number.isNaN(lastBilling.getTime()) ? now.toISOString() : latestTx.date,
        nextBillingDate: nextBilling.toISOString(),
        dDay,
        confidence,
        occurrencesCount: sorted.length,
        isActive: existing?.isActive !== false,
        isManual: false,
        notes: existing?.notes
      });
    }
  }

  // Also include manual subscriptions created by user
  for (const saved of savedItems) {
    if (saved && saved.isManual && !detected.some(d => d.id === saved.id)) {
      const cycle = Math.max(1, Math.floor(Number(saved.cycleDays) || 30));
      const lastBilling = new Date(saved.lastBillingDate);
      const safeLastBilling = Number.isNaN(lastBilling.getTime()) ? now : lastBilling;
      const initialNext = saved.nextBillingDate
        ? new Date(saved.nextBillingDate)
        : addDays(safeLastBilling, cycle);
      const safeInitialNext = Number.isNaN(initialNext.getTime()) ? addDays(safeLastBilling, cycle) : initialNext;

      let nextBilling = safeInitialNext;
      let guard = 0;
      while (isBefore(nextBilling, now) && differenceInDays(now, nextBilling) > 3 && guard < 1200) {
        nextBilling = addDays(nextBilling, cycle);
        guard += 1;
      }

      const dDay = differenceInDays(nextBilling, now);
      detected.push({
        ...saved,
        dDay,
        nextBillingDate: nextBilling.toISOString()
      });
    }
  }

  // Sort by upcoming D-Day ascending (soonest renewals first)
  return detected.sort((a, b) => a.dDay - b.dDay);
}

