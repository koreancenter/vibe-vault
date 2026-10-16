import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as VaultSecurityModule from '../src/vaultSecurity';
import type * as DatabaseModule from '../src/db';
import type * as GeminiKeyManagerModule from '../src/geminiKeyManager';

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear()
  };
};

let vault: typeof VaultSecurityModule;
let database: typeof DatabaseModule;
let keyManager: typeof GeminiKeyManagerModule;

describe('Vault field encryption and key rotation', () => {
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

    vault = await import('../src/vaultSecurity');
    database = await import('../src/db');
    keyManager = await import('../src/geminiKeyManager');
  });

  it('fails closed and atomically migrates financial records and API keys across PIN transitions', async () => {
    const db = await database.getDB();
    const clearTx = db.transaction(
      ['transactions', 'assetAccounts', 'debts', 'vaultMetadata'],
      'readwrite'
    );
    await Promise.all([
      clearTx.objectStore('transactions').clear(),
      clearTx.objectStore('assetAccounts').clear(),
      clearTx.objectStore('debts').clear(),
      clearTx.objectStore('vaultMetadata').clear()
    ]);
    await clearTx.done;

    const deviceKey = await vault.getDeviceMasterKey();
    const invalidEncryptKey = await window.crypto.subtle.importKey(
      'raw',
      new Uint8Array(32),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    await expect(vault.encryptFieldWithKey('sensitive value', invalidEncryptKey)).rejects.toThrow();

    const originalTransaction = {
      id: 'rotation-test-transaction',
      type: 'EXPENSE' as const,
      amount: 1234,
      currency: 'KRW',
      category: 'Food',
      description: '원문 거래 내역',
      paymentMethod: '개인 카드',
      date: '2026-10-15T00:00:00.000Z'
    };
    await database.addTransaction(originalTransaction);
    const originalAccount = {
      id: 'rotation-test-account',
      institution: '테스트 은행',
      accountName: '생활 계좌',
      assetType: 'BANK' as const,
      currentBalance: 5000,
      currency: 'KRW',
      lastUpdated: '2026-10-15T00:00:00.000Z',
      accountNumberMasked: '***1234',
      note: '계좌 비고'
    };
    const originalDebt = {
      id: 'rotation-test-debt',
      name: '테스트 대출',
      type: 'LOAN_PAYABLE' as const,
      counterpartyOrBank: '테스트 은행',
      originalPrincipal: 10000,
      remainingPrincipal: 8000,
      currency: 'KRW',
      lastUpdated: '2026-10-15T00:00:00.000Z',
      isActive: true
    };
    await database.saveAssetAccount(originalAccount);
    await database.saveDebt(originalDebt);
    const encryptedBeforeRotation = await db.get('transactions', originalTransaction.id);
    expect(encryptedBeforeRotation?.description).toMatch(/^__VBE256__:/);

    const targetKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const originalPut = IDBObjectStore.prototype.put;
    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      const request = originalPut.call(this, value, key);
      if (this.name === 'vaultMetadata' && key === 'active-key-id' && value === 'interrupted') {
        this.transaction.abort();
      }
      return request;
    });

    await expect(
      database.migrateVaultDataKey(targetKey, 'interrupted', [deviceKey])
    ).rejects.toThrow();
    putSpy.mockRestore();

    expect(await db.get('vaultMetadata', 'active-key-id')).toBeUndefined();
    expect(await database.getAllTransactions()).toMatchObject([
      { id: originalTransaction.id, description: originalTransaction.description }
    ]);
    expect(await database.getAllAssetAccounts()).toMatchObject([
      { id: originalAccount.id, note: originalAccount.note }
    ]);
    expect(await database.getAllDebts()).toMatchObject([
      { id: originalDebt.id, name: originalDebt.name }
    ]);

    const sampleKey = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';
    await keyManager.setSecureGeminiApiKey(sampleKey);
    await vault.setVaultPin('1234');
    expect(await database.getAllTransactions()).toMatchObject([
      { id: originalTransaction.id, description: originalTransaction.description }
    ]);
    expect(await database.getAllAssetAccounts()).toMatchObject([
      { id: originalAccount.id, note: originalAccount.note }
    ]);
    expect(await database.getAllDebts()).toMatchObject([
      { id: originalDebt.id, name: originalDebt.name }
    ]);
    expect(localStorage.getItem(keyManager.ENCRYPTED_STORAGE_KEY)).toMatch(/^__VBE256__:/);
    expect(localStorage.getItem(keyManager.SECURE_STORAGE_KEY)).toBeNull();

    vault.lockVault();
    await expect(database.addTransaction({
      ...originalTransaction,
      id: 'locked-write'
    })).rejects.toThrow(/VAULT_LOCKED/);
    expect(await db.get('transactions', 'locked-write')).toBeUndefined();
    expect((await vault.unlockVault('0000')).success).toBe(false);
    expect((await vault.unlockVault('1234')).success).toBe(true);
    expect(keyManager.getSecureGeminiApiKey()).toBe(sampleKey);
    expect(await database.getAllTransactions()).toMatchObject([
      { id: originalTransaction.id, description: originalTransaction.description }
    ]);
    expect(await database.getAllAssetAccounts()).toMatchObject([
      { id: originalAccount.id, note: originalAccount.note }
    ]);
    expect(await database.getAllDebts()).toMatchObject([
      { id: originalDebt.id, name: originalDebt.name }
    ]);

    expect(await vault.removeVaultPin('1234')).toBe(true);
    expect(await database.getAllTransactions()).toMatchObject([
      { id: originalTransaction.id, description: originalTransaction.description }
    ]);
    expect(await database.getAllAssetAccounts()).toMatchObject([
      { id: originalAccount.id, note: originalAccount.note }
    ]);
    expect(await database.getAllDebts()).toMatchObject([
      { id: originalDebt.id, name: originalDebt.name }
    ]);
    expect(localStorage.getItem(keyManager.ENCRYPTED_STORAGE_KEY)).toMatch(/^__VBE256__:/);
    keyManager.clearInMemoryApiKey();
    expect((await vault.unlockVault()).success).toBe(true);
    expect(keyManager.getSecureGeminiApiKey()).toBe(sampleKey);

    await database.addTransaction({
      ...originalTransaction,
      id: 'guest-volatile-transaction'
    });
    vault.lockVault();
    await vi.waitFor(async () => {
      expect(await db.get('transactions', 'guest-volatile-transaction')).toBeUndefined();
    });
    expect(await database.getAllTransactions()).toEqual([]);
    expect(await database.getAllAssetAccounts()).toEqual([]);
    expect(await database.getAllDebts()).toEqual([]);
    expect(keyManager.getSecureGeminiApiKey()).toBe('');
  });
});
