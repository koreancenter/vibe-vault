import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetAccount, DebtItem, LedgerSpace, Transaction } from '../src/types';
import type { FetchLike } from '../src/googleDriveSync';

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
let driveSync: typeof import('../src/googleDriveSync');
let cryptoBackup: typeof import('../src/cryptoBackup');

const makeAccount = (overrides: Partial<AssetAccount> = {}): AssetAccount => ({
  id: 'acc-drive-1',
  institution: '토스증권',
  accountName: '미국주식 포트폴리오',
  assetType: 'BROKERAGE',
  currentBalance: 24000000,
  currency: 'KRW',
  lastUpdated: '2026-11-21T08:00:00.000Z',
  ...overrides,
});

const makeDebt = (overrides: Partial<DebtItem> = {}): DebtItem => ({
  id: 'debt-drive-1',
  name: '신한은행 마이너스통장',
  type: 'CREDIT_LINE',
  counterpartyOrBank: '신한은행',
  originalPrincipal: 10000000,
  remainingPrincipal: 4000000,
  currency: 'KRW',
  lastUpdated: '2026-11-21T08:00:00.000Z',
  isActive: true,
  ...overrides,
});

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-drive-1',
  type: 'EXPENSE',
  amount: 32000,
  currency: 'KRW',
  category: 'Food',
  subCategory: 'Dining',
  description: '성수동 브런치 비밀메모',
  date: '2026-11-21T09:00:00.000Z',
  paymentMethod: '현대카드',
  ...overrides,
});

const makeSpace = (overrides: Partial<LedgerSpace> = {}): LedgerSpace => ({
  id: 'space-osaka',
  name: '오사카 출장',
  currency: 'JPY',
  createdAt: '2026-11-10T00:00:00.000Z',
  ...overrides,
});

interface MockDriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
  appProperties: Record<string, string>;
  content: string;
}

function createMockDriveServer() {
  let storedFile: MockDriveFile | null = null;
  let lastUploadBody = '';
  let lastUploadMethod = '';
  let lastUploadUrl = '';

  const parseMultipart = (body: string): { metadata: any; content: string } => {
    const firstLineEnd = body.indexOf('\r\n');
    const boundary = body.slice(0, firstLineEnd);
    const parts = body.split(boundary).slice(1, -1);
    const extractBody = (part: string) => {
      const idx = part.indexOf('\r\n\r\n');
      return part.slice(idx + 4).replace(/\r\n$/, '');
    };
    return {
      metadata: JSON.parse(extractBody(parts[0])),
      content: extractBody(parts[1]),
    };
  };

  const fetchMock: FetchLike = async (input, init) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 });
    }

    // List files in appDataFolder
    if (method === 'GET' && url.includes('/drive/v3/files?')) {
      expect(url).toContain('spaces=appDataFolder');
      return new Response(
        JSON.stringify({
          files: storedFile
            ? [
                {
                  id: storedFile.id,
                  name: storedFile.name,
                  modifiedTime: storedFile.modifiedTime,
                  size: storedFile.size,
                  appProperties: storedFile.appProperties,
                },
              ]
            : [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Download media
    if (method === 'GET' && url.includes('alt=media')) {
      if (!storedFile) {
        return new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 });
      }
      return new Response(storedFile.content, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create or Update multipart
    if ((method === 'POST' || method === 'PATCH') && url.includes('/upload/drive/v3/files')) {
      lastUploadMethod = method;
      lastUploadUrl = url;
      lastUploadBody = String(init?.body || '');
      const { metadata, content } = parseMultipart(lastUploadBody);

      storedFile = {
        id: storedFile?.id || 'drive-file-e2ee-001',
        name: metadata.name,
        modifiedTime: new Date().toISOString(),
        size: String(content.length),
        appProperties: metadata.appProperties || {},
        content,
      };

      return new Response(
        JSON.stringify({
          id: storedFile.id,
          name: storedFile.name,
          modifiedTime: storedFile.modifiedTime,
          size: storedFile.size,
          appProperties: storedFile.appProperties,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Delete file
    if (method === 'DELETE' && url.includes('/drive/v3/files/')) {
      storedFile = null;
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ error: { message: 'Unhandled mock route' } }), { status: 400 });
  };

  return {
    fetchMock,
    getStoredFile: () => storedFile,
    getLastUpload: () => ({ method: lastUploadMethod, url: lastUploadUrl, body: lastUploadBody }),
  };
}

describe('Google Drive appDataFolder Zero-Knowledge E2EE Sync', () => {
  beforeAll(async () => {
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
        dispatchEvent: vi.fn(),
      }),
    });

    dbModule = await import('../src/db');
    driveSync = await import('../src/googleDriveSync');
    cryptoBackup = await import('../src/cryptoBackup');
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await dbModule.replaceAllTransactions([]);
    await dbModule.replaceAllAssetAccounts([]);
    await dbModule.replaceAllDebts([]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }]);
    await dbModule.saveSubscriptions([]);
  });

  it('rejects unencrypted plaintext uploads before making any network request (Zero-Knowledge guarantee)', async () => {
    const fetchSpy = vi.fn();
    const plaintextAttempt = {
      version: '3.0',
      format: 'vibe-backup-v3',
      createdAt: new Date().toISOString(),
      transactions: [makeTx()],
    } as any;

    await expect(
      driveSync.uploadEncryptedVaultPayload('valid-token', plaintextAttempt, null, undefined, fetchSpy)
    ).rejects.toMatchObject({
      name: 'DriveSyncError',
      code: 'ENCRYPTION_REQUIRED',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('converges Desktop and Mobile vaults cleanly via two-way E2EE smart sync without leaking plaintext', async () => {
    const mockDrive = createMockDriveServer();
    const passphrase = 'MyCrossDeviceVaultKey!2026';

    // 1. Desktop seeds account, debt, space, and transaction -> pushes to Drive
    await dbModule.replaceAllAssetAccounts([makeAccount()]);
    await dbModule.replaceAllDebts([makeDebt()]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }, makeSpace()]);
    await dbModule.replaceAllTransactions([makeTx()]);

    const pushRes = await driveSync.syncPushToGoogleDrive('token-desktop', passphrase, null, {
      iterations: 10_000,
      fetchFn: mockDrive.fetchMock,
    });

    expect(pushRes.remoteMeta.fileId).toBe('drive-file-e2ee-001');
    expect(pushRes.remoteMeta.accountCount).toBe(1);
    expect(pushRes.remoteMeta.debtCount).toBe(1);
    expect(pushRes.remoteMeta.transactionCount).toBe(1);
    expect(pushRes.remoteMeta.spaceCount).toBe(2);

    // Verify ZERO plaintext leaked into Drive upload payload (neither description nor institution)
    const upload1 = mockDrive.getLastUpload();
    expect(upload1.method).toBe('POST');
    expect(upload1.body).toContain('"parents":["appDataFolder"]');
    expect(upload1.body).toContain('"cipher":"AES-GCM-256"');
    expect(upload1.body).not.toContain('성수동 브런치 비밀메모');
    expect(upload1.body).not.toContain('토스증권');
    expect(upload1.body).not.toContain('24000000');

    // 2. Simulate Mobile device starting with its own offline data (different account + transaction)
    await dbModule.replaceAllAssetAccounts([
      makeAccount({
        id: 'acc-mobile-cash',
        institution: '카카오뱅크',
        accountName: '모바일 생활비',
        assetType: 'BANK',
        currentBalance: 1850000,
        lastUpdated: '2026-11-21T11:00:00.000Z',
      }),
    ]);
    await dbModule.replaceAllDebts([]);
    await dbModule.replaceAllSpaces([{ ...dbModule.DEFAULT_SPACE }]);
    await dbModule.replaceAllTransactions([
      makeTx({
        id: 'tx-mobile-coffee',
        amount: 6500,
        description: '공항 라떼',
        date: '2026-11-21T11:30:00.000Z',
      }),
    ]);

    // 3. Mobile runs Two-Way Smart Sync -> downloads Desktop backup, merges, re-encrypts, PATCHes Drive
    const twoWay = await driveSync.syncTwoWaySmartMergeWithGoogleDrive(
      'token-mobile',
      passphrase,
      null,
      {
        iterations: 10_000,
        fetchFn: mockDrive.fetchMock,
      }
    );

    expect(twoWay.createdInitialRemote).toBe(false);
    expect(twoWay.finalSummary.accountCount).toBe(2);
    expect(twoWay.finalSummary.debtCount).toBe(1);
    expect(twoWay.finalSummary.transactionCount).toBe(2);
    expect(twoWay.finalSummary.spaceCount).toBe(2);
    expect(mockDrive.getLastUpload().method).toBe('PATCH');

    // Verify local Mobile IndexedDB now has unified records from BOTH devices
    const [accounts, debts, txs, spaces] = await Promise.all([
      dbModule.getAllAssetAccounts(),
      dbModule.getAllDebts(),
      dbModule.getAllTransactions(),
      dbModule.getSpaces(),
    ]);
    expect(accounts).toHaveLength(2);
    expect(debts).toHaveLength(1);
    expect(txs).toHaveLength(2);
    expect(spaces).toHaveLength(2);

    // 4. Verify wrong passphrase fails closed on pull
    await expect(
      driveSync.syncPullAndPreviewFromGoogleDrive(
        'token-mobile',
        twoWay.remoteMeta.fileId,
        'WrongPassphrase',
        mockDrive.fetchMock
      )
    ).rejects.toBeInstanceOf(cryptoBackup.CryptoBackupError);

    // 5. Verify deleting remote cloud backup removes it from Drive
    await driveSync.deleteRemoteVaultBackup('token-mobile', twoWay.remoteMeta.fileId, mockDrive.fetchMock);
    const afterDelete = await driveSync.findRemoteVaultBackup('token-mobile', mockDrive.fetchMock);
    expect(afterDelete).toBeNull();
  });

  it('classifies HTTP 401/403 as DriveSyncError AUTH_EXPIRED', async () => {
    const expiredFetch: FetchLike = async () =>
      new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 });

    await expect(
      driveSync.findRemoteVaultBackup('expired-token', expiredFetch)
    ).rejects.toMatchObject({
      name: 'DriveSyncError',
      code: 'AUTH_EXPIRED',
      status: 401,
    });
  });
});
