import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionItem } from '../src/types';

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  };
};

let dbModule: typeof import('../src/db');
let saveSubscriptions: typeof import('../src/db').saveSubscriptions;
let loadSavedSubscriptions: typeof import('../src/db').loadSavedSubscriptions;
let initSubscriptionsStorage: typeof import('../src/db').initSubscriptionsStorage;
let STORAGE_KEY_SUBSCRIPTIONS: string;
let VAULT_METADATA_SUBSCRIPTIONS_KEY: string;
let getDB: typeof import('../src/db').getDB;

describe('Phase 1: Subscriptions Encrypted Storage & Migration', () => {
  const sampleSubscriptions: SubscriptionItem[] = [
    {
      id: 'sub-netflix',
      merchant: '넷플릭스',
      amount: 17000,
      currency: 'KRW',
      category: 'Fixed',
      cycleDays: 30,
      lastBillingDate: '2026-09-01T00:00:00.000Z',
      nextBillingDate: '2026-10-01T00:00:00.000Z',
      dDay: 5,
      confidence: 1.0,
      occurrencesCount: 3,
      isActive: true
    }
  ];

  beforeAll(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createLocalStorageMock()
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createLocalStorageMock()
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.assign(globalThis, {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });

    dbModule = await import('../src/db');
    saveSubscriptions = dbModule.saveSubscriptions;
    loadSavedSubscriptions = dbModule.loadSavedSubscriptions;
    initSubscriptionsStorage = dbModule.initSubscriptionsStorage;
    STORAGE_KEY_SUBSCRIPTIONS = dbModule.STORAGE_KEY_SUBSCRIPTIONS;
    VAULT_METADATA_SUBSCRIPTIONS_KEY = dbModule.VAULT_METADATA_SUBSCRIPTIONS_KEY;
    getDB = dbModule.getDB;
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy plaintext localStorage subscriptions to encrypted IndexedDB and deletes localStorage key', async () => {
    // Seed plaintext localStorage as if legacy version was used
    localStorage.setItem(STORAGE_KEY_SUBSCRIPTIONS, JSON.stringify(sampleSubscriptions));
    expect(localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS)).not.toBeNull();

    // Trigger migration
    const loaded = await initSubscriptionsStorage();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].merchant).toBe('넷플릭스');

    // Verify plaintext localStorage was deleted
    expect(localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS)).toBeNull();

    // Verify record in IndexedDB vaultMetadata is encrypted (not raw JSON)
    const db = await getDB();
    const stored = await db.get('vaultMetadata', VAULT_METADATA_SUBSCRIPTIONS_KEY);
    expect(stored).toBeDefined();
    expect(typeof stored).toBe('string');
    // AES-GCM encrypted field starts with cipher prefix or hex:base64
    expect(stored?.includes('넷플릭스')).toBe(false);
  });

  it('saves new subscriptions directly to encrypted IndexedDB and removes any legacy localStorage key', async () => {
    localStorage.setItem(STORAGE_KEY_SUBSCRIPTIONS, 'legacy-data');

    await saveSubscriptions(sampleSubscriptions);

    // localStorage key must be purged
    expect(localStorage.getItem(STORAGE_KEY_SUBSCRIPTIONS)).toBeNull();

    // Synchronous memory cache returns subscriptions
    const memoryLoaded = loadSavedSubscriptions();
    expect(memoryLoaded).toHaveLength(1);
    expect(memoryLoaded[0].merchant).toBe('넷플릭스');

    // IndexedDB record is encrypted
    const db = await getDB();
    const stored = await db.get('vaultMetadata', VAULT_METADATA_SUBSCRIPTIONS_KEY);
    expect(stored).toBeDefined();
    expect(stored?.includes('넷플릭스')).toBe(false);
  });

  it('always returns synchronous arrays from subscriptionDetector and safely handles invalid dates or cycleDays <= 0', async () => {
    const detector = await import('../src/finance/subscriptionDetector');

    const loadedSync = detector.loadSavedSubscriptions();
    expect(Array.isArray(loadedSync)).toBe(true);
    expect(loadedSync instanceof Promise).toBe(false);

    await detector.saveSubscriptions([
      {
        id: 'sub-manual-bad-cycle',
        merchant: 'Corrupted Cycle Manual Sub',
        amount: 9900,
        currency: 'KRW',
        category: 'Living',
        cycleDays: 0,
        lastBillingDate: 'invalid-date',
        nextBillingDate: 'invalid-date',
        dDay: 0,
        confidence: 1,
        occurrencesCount: 1,
        isActive: true,
        isManual: true,
      },
    ]);

    const detected = detector.detectSubscriptions([
      {
        id: 'tx-sub-1',
        type: 'EXPENSE',
        amount: 17000,
        currency: 'KRW',
        category: 'Living',
        description: '넷플릭스 정기결제',
        date: new Date().toISOString(),
        paymentMethod: '카드',
      },
    ]);

    expect(Array.isArray(detected)).toBe(true);
    expect(detected instanceof Promise).toBe(false);
    expect(detected.some((s) => s.id === 'sub-manual-bad-cycle')).toBe(true);
    expect(detected.some((s) => s.merchant.includes('넷플릭스'))).toBe(true);
  });

  it('closeDBConnection safely resets cached IndexedDB instance and reopen works cleanly', async () => {
    dbModule.closeDBConnection();
    const reopened = await dbModule.getDB();
    expect(reopened.objectStoreNames.contains('pending_scans')).toBe(true);
    expect(reopened.objectStoreNames.contains('transactions')).toBe(true);
    expect(await dbModule.getPendingScansCount()).toBe(0);
  });
});

