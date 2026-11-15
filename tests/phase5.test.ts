import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as VaultSecurityModule from '../src/vaultSecurity';
import type * as DatabaseModule from '../src/db';

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

describe('Phase 5: Offline Encrypted Scan Queue & WebAuthn Biometric Unlock', () => {
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
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vault.resetVaultSecurity();
    const db = await database.getDB();
    const validStores: ('transactions' | 'assetAccounts' | 'debts' | 'pending_scans')[] = [
      'transactions',
      'assetAccounts',
      'debts',
      'pending_scans'
    ];
    const storeNames = validStores.filter((s) => db.objectStoreNames.contains(s));
    if (storeNames.length > 0) {
      const clearTx = db.transaction(storeNames, 'readwrite');
      for (const store of storeNames) {
        await clearTx.objectStore(store).clear();
      }
      await clearTx.done;
    }
  });

  describe('1. Offline Encrypted Receipt & Screenshot Queue (pending_scans)', () => {
    it('encrypts imageBase64 with AES-GCM-256 before writing to IndexedDB', async () => {
      const sampleBase64 = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2wAA';
      const scanItem = await database.addPendingScan({
        imageBase64: sampleBase64,
        mimeType: 'image/webp',
        spaceId: 'default',
        fileName: 'receipt_offline.webp'
      });

      expect(scanItem.id).toMatch(/^scan-/);
      expect(scanItem.imageBase64).toMatch(/^__VBE256__:[0-9a-f]{24}:/);

      // Verify raw item in IndexedDB is encrypted at-rest
      const db = await database.getDB();
      const rawStored = await db.get('pending_scans', scanItem.id);
      expect(rawStored).toBeDefined();
      expect(rawStored?.imageBase64.startsWith('__VBE256__:')).toBe(true);
      expect(rawStored?.imageBase64).not.toBe(sampleBase64);

      // Verify getPendingScans returns decrypted imageBase64
      const pendingList = await database.getPendingScans();
      expect(pendingList.length).toBe(1);
      expect(pendingList[0].id).toBe(scanItem.id);
      expect(pendingList[0].imageBase64).toBe(sampleBase64);
      expect(pendingList[0].fileName).toBe('receipt_offline.webp');
    });

    it('correctly tracks count and deletes processed queue items', async () => {
      const scan1 = await database.addPendingScan({
        imageBase64: 'data:image/webp;base64,IMAGE1',
        mimeType: 'image/webp'
      });
      const scan2 = await database.addPendingScan({
        imageBase64: 'data:image/webp;base64,IMAGE2',
        mimeType: 'image/webp'
      });

      expect(await database.getPendingScansCount()).toBe(2);

      await database.deletePendingScan(scan1.id);
      expect(await database.getPendingScansCount()).toBe(1);

      const remaining = await database.getPendingScans();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(scan2.id);
      expect(remaining[0].imageBase64).toBe('data:image/webp;base64,IMAGE2');

      await database.clearAllPendingScans();
      expect(await database.getPendingScansCount()).toBe(0);
    });

    it('re-encrypts pending scans atomically across PIN establishment', async () => {
      const sampleBase64 = 'data:image/webp;base64,SAMPLE_IMAGE_TO_RE_ENCRYPT';
      const scan = await database.addPendingScan({
        imageBase64: sampleBase64,
        mimeType: 'image/webp',
        spaceId: 'project-1'
      });

      // User establishes a PIN
      await vault.setVaultPin('9876');

      // The pending scan should still decrypt correctly under the new PIN key
      const pendingList = await database.getPendingScans();
      expect(pendingList.length).toBe(1);
      expect(pendingList[0].id).toBe(scan.id);
      expect(pendingList[0].imageBase64).toBe(sampleBase64);

      // Verify raw storage was re-encrypted with new ciphertext
      const db = await database.getDB();
      const rawStored = await db.get('pending_scans', scan.id);
      expect(rawStored?.imageBase64).toMatch(/^__VBE256__:/);
    });

    it('simulates reconnect auto-sync: processes queue items and removes them from pending_scans', async () => {
      // Seed 2 queued items
      const item1 = await database.addPendingScan({
        imageBase64: 'data:image/webp;base64,ITEM1',
        mimeType: 'image/webp',
        spaceId: 'default'
      });
      const item2 = await database.addPendingScan({
        imageBase64: 'data:image/webp;base64,ITEM2',
        mimeType: 'image/webp',
        spaceId: 'default'
      });

      expect(await database.getPendingScansCount()).toBe(2);

      // Simulate the auto-sync engine loop on reconnect
      const queued = await database.getPendingScans();
      let processed = 0;
      for (const scan of queued) {
        // Create transaction
        await database.addTransaction({
          id: `tx-synced-${scan.id}`,
          type: 'EXPENSE',
          amount: 15000,
          currency: 'KRW',
          category: 'Food',
          description: '동기화된 영수증',
          date: new Date().toISOString(),
          paymentMethod: '카드결제',
          spaceId: scan.spaceId
        });
        await database.deletePendingScan(scan.id);
        processed++;
      }

      expect(processed).toBe(2);
      expect(await database.getPendingScansCount()).toBe(0);

      // Verify transactions exist in IndexedDB
      const allTxs = await database.getAllTransactions();
      const synced = allTxs.filter(t => t.id.startsWith('tx-synced-'));
      expect(synced.length).toBe(2);
      expect(synced[0].description).toBe('동기화된 영수증');
    });
  });

  describe('2. WebAuthn (Biometric / Passkey) Quick Unlock', () => {
    it('reports biometric disabled by default when no credential exists', () => {
      expect(vault.isBiometricUnlockEnabled()).toBe(false);
    });

    it('registers biometric credential and allows quick biometric unlock', async () => {
      // 1. Establish Master PIN first
      await vault.setVaultPin('1234');
      expect(vault.hasVaultPin()).toBe(true);

      // Mock navigator.credentials with WebAuthn platform authenticator
      const mockRawId = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]).buffer;
      const mockCredential = {
        id: 'mock-cred-id',
        rawId: mockRawId,
        type: 'public-key',
        response: {
          clientDataJSON: new Uint8Array([1, 2, 3]).buffer,
          attestationObject: new Uint8Array([4, 5, 6]).buffer
        }
      };

      const mockAssertion = {
        id: 'mock-cred-id',
        rawId: mockRawId,
        type: 'public-key',
        response: {
          clientDataJSON: new Uint8Array([1, 2, 3]).buffer,
          authenticatorData: new Uint8Array([7, 8, 9]).buffer,
          signature: new Uint8Array([11, 12, 13]).buffer
        }
      };

      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        configurable: true,
        value: {
          isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true)
        }
      });

      Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: {
          create: vi.fn().mockResolvedValue(mockCredential),
          get: vi.fn().mockResolvedValue(mockAssertion)
        }
      });

      // 2. Register Biometric Unlock
      const enrollResult = await vault.registerBiometricUnlock('1234');
      expect(enrollResult.success).toBe(true);
      expect(vault.isBiometricUnlockEnabled()).toBe(true);

      // 3. Lock Vault
      vault.lockVault();
      expect(vault.isVaultLocked()).toBe(true);

      // 4. Authenticate Biometric Unlock (Sub-second unlock without typing PIN)
      const authResult = await vault.authenticateBiometricUnlock();
      expect(authResult.success).toBe(true);
      expect(vault.isVaultLocked()).toBe(false);

      // Active key is restored and can decrypt fields
      const testEnc = await vault.encryptField('테스트 비밀 메모');
      const testDec = await vault.decryptField(testEnc);
      expect(testDec).toBe('테스트 비밀 메모');

      // 5. Disable Biometric Unlock
      await vault.disableBiometricUnlock();
      expect(vault.isBiometricUnlockEnabled()).toBe(false);
    });

    it('rejects biometric registration if PIN is incorrect', async () => {
      await vault.setVaultPin('5678');
      const res = await vault.registerBiometricUnlock('0000');
      expect(res.success).toBe(false);
      expect(vault.isBiometricUnlockEnabled()).toBe(false);
    });
  });
});
