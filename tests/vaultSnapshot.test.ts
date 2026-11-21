import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetAccount,
  DebtItem,
  LedgerSpace,
  SubscriptionItem,
  Transaction,
  UnencryptedBackupPayloadV2,
  VaultSnapshotV3,
} from '../src/types';

const createStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
};

let dbModule: typeof import('../src/db');
let cryptoBackup: typeof import('../src/cryptoBackup');
let vaultSnapshot: typeof import('../src/vaultSnapshot');
let utilsModule: typeof import('../src/utils');
let dispatchEventSpy: ReturnType<typeof vi.fn>;

const makeAccount = (overrides: Partial<AssetAccount> = {}): AssetAccount => ({
  id: 'acc-1',
  institution: '토스증권',
  accountName: '해외주식 계좌',
  assetType: 'BROKERAGE',
  currentBalance: 15000000,
  currency: 'KRW',
  lastUpdated: '2026-11-20T10:00:00.000Z',
  holdings: [
    { name: 'Vanguard S&P 500 (VOO)', quantity: 10, valuation: 7500000, currency: 'KRW', profitRate: 12.4 },
  ],
  ...overrides,
});

const makeDebt = (overrides: Partial<DebtItem> = {}): DebtItem => ({
  id: 'debt-1',
  name: '카카오뱅크 신용대출',
  type: 'LOAN_PAYABLE',
  counterpartyOrBank: '카카오뱅크',
  originalPrincipal: 30000000,
  remainingPrincipal: 22000000,
  currency: 'KRW',
  interestRateAnnual: 4.5,
  lastUpdated: '2026-11-20T10:00:00.000Z',
  isActive: true,
  ...overrides,
});

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  type: 'EXPENSE',
  amount: 18500,
  currency: 'KRW',
  category: 'Food',
  subCategory: 'Dining',
  description: '점심 라멘',
  date: '2026-11-20T12:30:00.000Z',
  paymentMethod: '현대카드',
  ...overrides,
});

const makeSpace = (overrides: Partial<LedgerSpace> = {}): LedgerSpace => ({
  id: 'space-tokyo',
  name: '도쿄 여행',
  currency: 'JPY',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const makeSub = (overrides: Partial<SubscriptionItem> = {}): SubscriptionItem => ({
  id: 'sub-1',
  merchant: 'Netflix',
  amount: 17000,
  currency: 'KRW',
  category: 'Fixed',
  cycleDays: 30,
  lastBillingDate: '2026-11-01T00:00:00.000Z',
  nextBillingDate: '2026-12-01T00:00:00.000Z',
  dDay: 10,
  confidence: 1,
  occurrencesCount: 6,
  isActive: true,
  ...overrides,
});

describe('Vault Snapshot v3 & Cross-Device Smart Merge', () => {
  beforeAll(async () => {
    dispatchEventSpy = vi.fn();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.assign(globalThis, {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: dispatchEventSpy,
      }),
    });

    dbModule = await import('../src/db');
    cryptoBackup = await import('../src/cryptoBackup');
    vaultSnapshot = await import('../src/vaultSnapshot');
    utilsModule = await import('../src/utils');
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    dispatchEventSpy.mockClear();
    await dbModule.replaceAllTransactions([]);
    await dbModule.replaceAllAssetAccounts([]);
    await dbModule.replaceAllDebts([]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }]);
    await dbModule.saveSubscriptions([]);
  });

  it('normalizes and validates accounts-only backups (transactions empty) without rejecting them', () => {
    const accountsOnlyPayload: UnencryptedBackupPayloadV2 = {
      version: '3.0',
      format: 'vibe-backup-v3',
      createdAt: '2026-11-21T00:00:00.000Z',
      transactions: [],
      assetAccounts: [makeAccount()],
      debts: [],
      spaces: [{ ...dbModule.DEFAULT_SPACE }],
    };

    const summary = vaultSnapshot.summarizeBackupPayload(accountsOnlyPayload);
    expect(summary.hasAnyData).toBe(true);
    expect(summary.accountCount).toBe(1);
    expect(summary.transactionCount).toBe(0);

    const emptySummary = vaultSnapshot.summarizeBackupPayload({ foo: 'bar' });
    expect(emptySummary.hasAnyData).toBe(false);
  });

  it('merges accounts, debts, spaces, subscriptions, and transactions across two devices without duplicates', () => {
    const deviceA: VaultSnapshotV3 = {
      version: '3.0',
      format: 'vibe-backup-v3',
      createdAt: '2026-11-20T10:00:00.000Z',
      deviceId: 'dev-desktop',
      transactions: [
        makeTx({ id: 'tx-shared', amount: 15000, description: '스타벅스', date: '2026-11-20T09:00:00.000Z' }),
        makeTx({ id: 'tx-desktop-only', amount: 42000, description: '교보문고', date: '2026-11-20T14:00:00.000Z' }),
      ],
      assetAccounts: [
        makeAccount({
          id: 'acc-toss-desktop',
          institution: '토스증권',
          accountName: '해외주식 계좌',
          currentBalance: 15000000,
          lastUpdated: '2026-11-20T08:00:00.000Z',
        }),
        makeAccount({
          id: 'acc-kb',
          institution: 'KB국민은행',
          accountName: '생활비 통장',
          assetType: 'BANK',
          currentBalance: 3200000,
          lastUpdated: '2026-11-20T18:00:00.000Z',
        }),
      ],
      debts: [
        makeDebt({ id: 'debt-1', remainingPrincipal: 22000000, lastUpdated: '2026-11-20T08:00:00.000Z' }),
      ],
      spaces: [{ ...dbModule.DEFAULT_SPACE }, makeSpace({ id: 'space-tokyo', name: '도쿄 여행' })],
      subscriptions: [makeSub({ id: 'sub-netflix', merchant: 'Netflix', amount: 17000 })],
      assets: [{ id: 'a1', name: '현대카드', type: 'CARD', enabled: true }],
      preferences: { currencySymbol: 'KRW', seasonTheme: 'winter' },
      activeCurrencies: ['KRW'],
      categoryBudgets: { Food: 500000 },
      cardReconcileOffsets: { '현대카드': 120000 },
    };

    const deviceB: UnencryptedBackupPayloadV2 = {
      version: '3.0',
      format: 'vibe-backup-v3',
      createdAt: '2026-11-21T10:00:00.000Z',
      deviceId: 'dev-mobile',
      transactions: [
        // Same fingerprint as tx-shared on deviceA (different ID) -> should skip duplicate
        makeTx({ id: 'tx-mobile-dup', amount: 15000, description: '스타벅스', date: '2026-11-20T09:00:10.000Z' }),
        // Brand-new mobile transaction -> should add
        makeTx({ id: 'tx-mobile-new', amount: 9500, description: '편의점 야식', date: '2026-11-21T22:10:00.000Z' }),
      ],
      assetAccounts: [
        // Same institution+accountName with newer lastUpdated -> should update balance & keep holdings
        makeAccount({
          id: 'acc-toss-mobile',
          institution: '토스증권',
          accountName: '해외주식 계좌',
          currentBalance: 16200000,
          lastUpdated: '2026-11-21T09:00:00.000Z',
          holdings: undefined,
        }),
        // Older timestamp for KB -> should keep desktop's newer 3,200,000 balance
        makeAccount({
          id: 'acc-kb',
          institution: 'KB국민은행',
          accountName: '생활비 통장',
          assetType: 'BANK',
          currentBalance: 2900000,
          lastUpdated: '2026-11-19T12:00:00.000Z',
        }),
        // Brand-new mobile account -> should add
        makeAccount({
          id: 'acc-upbit',
          institution: '업비트',
          accountName: '비트코인',
          assetType: 'CRYPTO',
          currentBalance: 4500000,
          lastUpdated: '2026-11-21T09:00:00.000Z',
        }),
      ],
      debts: [
        // Newer principal after monthly repayment
        makeDebt({ id: 'debt-1', remainingPrincipal: 21000000, lastUpdated: '2026-11-21T09:00:00.000Z' }),
      ],
      spaces: [
        { ...dbModule.DEFAULT_SPACE },
        makeSpace({ id: 'space-tokyo-dup', name: '도쿄 여행' }),
        makeSpace({ id: 'space-jeju', name: '제주 워케이션', currency: 'KRW' }),
      ],
      subscriptions: [
        makeSub({ id: 'sub-spotify', merchant: 'Spotify', amount: 10900 }),
      ],
      assets: [{ id: 'a2', name: '토스카드', type: 'CARD', enabled: true }],
      preferences: { seasonTheme: 'autumn' },
      activeCurrencies: ['KRW', 'USD'],
      categoryBudgets: { Living: 300000 },
      cardReconcileOffsets: { '삼성카드': 50000 },
    };

    const { snapshot, stats } = vaultSnapshot.mergeVaultSnapshots(deviceA, deviceB, 'merge');

    // Transactions: 2 existing + 1 new (1 duplicate skipped)
    expect(snapshot.transactions).toHaveLength(3);
    expect(stats.transactions.added).toBe(1);
    expect(stats.transactions.skipped).toBe(1);

    // Accounts: 3 unique accounts (Toss updated to 16.2M preserving holdings, KB kept at 3.2M, Upbit added)
    expect(snapshot.assetAccounts).toHaveLength(3);
    const toss = snapshot.assetAccounts.find((a) => a.institution === '토스증권');
    const kb = snapshot.assetAccounts.find((a) => a.institution === 'KB국민은행');
    expect(toss?.currentBalance).toBe(16200000);
    expect(toss?.holdings).toHaveLength(1);
    expect(kb?.currentBalance).toBe(3200000);
    expect(stats.assetAccounts.added).toBe(1);
    expect(stats.assetAccounts.updated).toBe(1);
    expect(stats.assetAccounts.skipped).toBe(1);

    // Debts: updated to newer 21,000,000 remaining principal
    expect(snapshot.debts).toHaveLength(1);
    expect(snapshot.debts[0].remainingPrincipal).toBe(21000000);

    // Spaces: default + 도쿄 여행 (deduped by name) + 제주 워케이션
    expect(snapshot.spaces).toHaveLength(3);
    expect(snapshot.spaces.some((s) => s.id === 'default')).toBe(true);
    expect(snapshot.spaces.some((s) => s.name === '제주 워케이션')).toBe(true);

    // Subscriptions, currencies, budgets, offsets merged cleanly
    expect(snapshot.subscriptions).toHaveLength(2);
    expect(snapshot.activeCurrencies).toEqual(['KRW', 'USD']);
    expect(snapshot.categoryBudgets).toEqual({ Food: 500000, Living: 300000 });
    expect(snapshot.cardReconcileOffsets).toEqual({ '현대카드': 120000, '삼성카드': 50000 });
    expect(snapshot.preferences?.seasonTheme).toBe('autumn');
  });

  it('preserves local accounts, debts, and spaces when merging a legacy v2 backup', () => {
    const current: VaultSnapshotV3 = {
      version: '3.0',
      format: 'vibe-backup-v3',
      createdAt: '2026-11-21T00:00:00.000Z',
      transactions: [makeTx({ id: 'tx-local' })],
      assetAccounts: [makeAccount()],
      debts: [makeDebt()],
      spaces: [{ ...dbModule.DEFAULT_SPACE }, makeSpace()],
      subscriptions: [makeSub()],
      assets: [],
      preferences: { seasonTheme: 'spring' },
      activeCurrencies: ['KRW', 'JPY'],
      categoryBudgets: { Food: 400000 },
      cardReconcileOffsets: {},
    };

    const legacyV2: UnencryptedBackupPayloadV2 = {
      version: '2.0',
      format: 'vibe-backup-v2',
      createdAt: '2026-10-01T00:00:00.000Z',
      transactions: [makeTx({ id: 'tx-old', description: '이전 달 카페', date: '2026-10-01T09:00:00.000Z' })],
    };

    const { snapshot } = vaultSnapshot.mergeVaultSnapshots(current, legacyV2, 'merge');
    expect(snapshot.transactions).toHaveLength(2);
    expect(snapshot.assetAccounts).toHaveLength(1);
    expect(snapshot.debts).toHaveLength(1);
    expect(snapshot.spaces).toHaveLength(2);
    expect(snapshot.subscriptions).toHaveLength(1);
    expect(snapshot.activeCurrencies).toEqual(['KRW', 'JPY']);
  });

  it('completes full IndexedDB build -> AES-GCM-256 encrypt -> decrypt -> applyVaultSnapshot round-trip', async () => {
    // Seed Device 1 state in IndexedDB & localStorage
    await dbModule.replaceAllAssetAccounts([makeAccount()]);
    await dbModule.replaceAllDebts([makeDebt()]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }, makeSpace()]);
    await dbModule.replaceAllTransactions([makeTx()]);
    await dbModule.saveSubscriptions([makeSub()]);
    utilsModule.saveUserPreferences({
      ...utilsModule.getUserPreferences(),
      currencySymbol: 'USD',
      seasonTheme: 'summer',
      budgetStartDay: 15,
    });
    utilsModule.saveUserActiveCurrencies(['KRW', 'USD', 'JPY']);
    utilsModule.saveCategoryBudgets({ Food: 650000 });
    localStorage.setItem('vibe_card_reconcile_offsets', JSON.stringify({ '현대카드': 88000 }));

    // 1. Export full v3 snapshot & encrypt with VVLT_V1
    const exportedSnapshot = await vaultSnapshot.buildVaultSnapshot();
    expect(exportedSnapshot.version).toBe('3.0');
    expect(exportedSnapshot.format).toBe('vibe-backup-v3');
    expect(exportedSnapshot.assetAccounts).toHaveLength(1);
    expect(exportedSnapshot.debts).toHaveLength(1);
    expect(exportedSnapshot.spaces).toHaveLength(2);

    const encrypted = await cryptoBackup.encryptBackupData(exportedSnapshot, 'VaultSyncPass#2026', {
      iterations: 10_000,
    });
    expect(encrypted.meta.accountCount).toBe(1);
    expect(encrypted.meta.debtCount).toBe(1);
    expect(encrypted.meta.spaceCount).toBe(2);
    expect(encrypted.meta.transactionCount).toBe(1);
    expect(encrypted.meta.snapshotFormat).toBe('vibe-backup-v3');

    // 2. Simulate wiping Device 2 to an empty vault
    await dbModule.replaceAllAssetAccounts([]);
    await dbModule.replaceAllDebts([]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }]);
    await dbModule.replaceAllTransactions([]);
    await dbModule.saveSubscriptions([]);
    localStorage.clear();

    // 3. Decrypt on Device 2 & restore
    const decrypted = await cryptoBackup.decryptBackupData(encrypted, 'VaultSyncPass#2026');
    const result = await vaultSnapshot.applyVaultSnapshot(decrypted, 'overwrite');

    expect(result.stats.assetAccounts.total).toBe(1);
    expect(result.stats.debts.total).toBe(1);
    expect(result.stats.transactions.total).toBe(1);
    expect(result.stats.spaces.total).toBe(2);

    // 4. Verify IndexedDB + localStorage state on Device 2
    const [accounts, debts, txs, spaces, subs] = await Promise.all([
      dbModule.getAllAssetAccounts(),
      dbModule.getAllDebts(),
      dbModule.getAllTransactions(),
      dbModule.getSpaces(),
      dbModule.getSavedSubscriptionsAsync(),
    ]);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].institution).toBe('토스증권');
    expect(accounts[0].holdings?.[0].name).toBe('Vanguard S&P 500 (VOO)');
    expect(accounts[0].holdings?.[0].valuation).toBe(7500000);
    expect(debts).toHaveLength(1);
    expect(debts[0].remainingPrincipal).toBe(22000000);
    expect(txs).toHaveLength(1);
    expect(txs[0].description).toBe('점심 라멘');
    expect(spaces).toHaveLength(2);
    expect(spaces.some((s) => s.name === '도쿄 여행')).toBe(true);
    expect(subs).toHaveLength(1);

    const restoredPrefs = utilsModule.getUserPreferences();
    expect(restoredPrefs.currencySymbol).toBe('USD');
    expect(restoredPrefs.seasonTheme).toBe('summer');
    expect(restoredPrefs.budgetStartDay).toBe(15);
    expect(utilsModule.getUserActiveCurrencies()).toEqual(['KRW', 'USD', 'JPY']);
    expect(utilsModule.getCategoryBudgets()).toEqual({ Food: 650000 });
    expect(JSON.parse(localStorage.getItem('vibe_card_reconcile_offsets') || '{}')).toEqual({
      '현대카드': 88000,
    });

    // Confirm vault change broadcast fired so live UI screens reload automatically
    expect(dispatchEventSpy).toHaveBeenCalled();
  });
});
