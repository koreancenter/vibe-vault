import {
  EncryptedBackupPayload,
  UnencryptedBackupPayloadV2,
} from './types';
import {
  decryptBackupData,
  encryptBackupData,
  enforceEncryptedExport,
  EncryptBackupOptions,
} from './cryptoBackup';
import {
  applyVaultSnapshot,
  ApplyVaultSnapshotResult,
  buildVaultSnapshot,
  getOrCreateDeviceId,
  normalizeBackupPayload,
  summarizeBackupPayload,
  VaultRestoreMode,
  VaultSnapshotSummary,
} from './vaultSnapshot';

export const DRIVE_SYNC_FILENAME = 'vibe-vault-sync-v3.vibe.enc';
export const DRIVE_SYNC_MIME_TYPE = 'application/json';
const DRIVE_FILES_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const LAST_DRIVE_SYNC_STORAGE_KEY = 'vibe_last_drive_sync_at';

export type DriveSyncErrorCode =
  | 'AUTH_EXPIRED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_REMOTE_PAYLOAD'
  | 'ENCRYPTION_REQUIRED';

export class DriveSyncError extends Error {
  code: DriveSyncErrorCode;
  status?: number;

  constructor(code: DriveSyncErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'DriveSyncError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, DriveSyncError.prototype);
  }
}

export interface RemoteVaultBackupMeta {
  fileId: string;
  name: string;
  modifiedTime: string;
  sizeBytes: number;
  accountCount?: number;
  debtCount?: number;
  transactionCount?: number;
  spaceCount?: number;
  subscriptionCount?: number;
  snapshotVersion?: string;
  deviceId?: string;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function getDefaultFetch(fetchFn?: FetchLike): FetchLike {
  if (fetchFn) return fetchFn;
  if (typeof fetch !== 'undefined') return fetch.bind(globalThis);
  throw new DriveSyncError('NETWORK_ERROR', 'Fetch API is not available in this runtime.');
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDriveFileMeta(file: any): RemoteVaultBackupMeta {
  const props = (file?.appProperties && typeof file.appProperties === 'object')
    ? file.appProperties
    : {};
  return {
    fileId: String(file.id),
    name: String(file.name || DRIVE_SYNC_FILENAME),
    modifiedTime: String(file.modifiedTime || new Date().toISOString()),
    sizeBytes: parseOptionalInt(file.size) ?? 0,
    accountCount: parseOptionalInt(props.accountCount),
    debtCount: parseOptionalInt(props.debtCount),
    transactionCount: parseOptionalInt(props.transactionCount),
    spaceCount: parseOptionalInt(props.spaceCount),
    subscriptionCount: parseOptionalInt(props.subscriptionCount),
    snapshotVersion: typeof props.snapshotVersion === 'string' ? props.snapshotVersion : undefined,
    deviceId: typeof props.deviceId === 'string' ? props.deviceId : undefined,
  };
}

async function throwDriveHttpError(res: Response, fallbackMessage: string): Promise<never> {
  if (res.status === 401 || res.status === 403) {
    throw new DriveSyncError(
      'AUTH_EXPIRED',
      'Google Drive 인증이 만료되었거나 권한이 부족합니다. 다시 로그인해주세요.',
      res.status
    );
  }
  if (res.status === 404) {
    throw new DriveSyncError(
      'NOT_FOUND',
      'Google Drive에서 암호화된 볼트 백업 파일을 찾을 수 없습니다.',
      res.status
    );
  }
  if (res.status === 429) {
    throw new DriveSyncError(
      'RATE_LIMITED',
      '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      res.status
    );
  }
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ? ` (${body.error.message})` : '';
  } catch {
    // Ignore non-JSON error body
  }
  throw new DriveSyncError('NETWORK_ERROR', `${fallbackMessage}${detail}`, res.status);
}

export function getLastDriveSyncTimestamp(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_DRIVE_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastDriveSyncTimestamp(isoTimestamp: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_DRIVE_SYNC_STORAGE_KEY, isoTimestamp);
  } catch {
    // Ignore storage write failures
  }
}

/**
 * Looks up the latest encrypted vault snapshot stored inside the user's hidden Drive appDataFolder.
 */
export async function findRemoteVaultBackup(
  accessToken: string,
  fetchFn?: FetchLike
): Promise<RemoteVaultBackupMeta | null> {
  const fetcher = getDefaultFetch(fetchFn);
  const query = `name='${DRIVE_SYNC_FILENAME}' and trashed=false`;
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: query,
    fields: 'files(id,name,modifiedTime,size,appProperties)',
    orderBy: 'modifiedTime desc',
    pageSize: '5',
  });

  const res = await fetcher(`${DRIVE_FILES_API_BASE}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    await throwDriveHttpError(res, 'Google Drive 백업 조회에 실패했습니다.');
  }

  const data = await res.json();
  const files = Array.isArray(data?.files) ? data.files : [];
  if (files.length === 0) return null;

  return parseDriveFileMeta(files[0]);
}

/**
 * Downloads the encrypted vault payload from Google Drive appDataFolder.
 * Verifies the downloaded file is a valid AES-GCM-256 encrypted envelope.
 */
export async function downloadRemoteVaultPayload(
  accessToken: string,
  fileId: string,
  fetchFn?: FetchLike
): Promise<EncryptedBackupPayload> {
  const fetcher = getDefaultFetch(fetchFn);
  const res = await fetcher(`${DRIVE_FILES_API_BASE}/${encodeURIComponent(fileId)}?alt=media`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    await throwDriveHttpError(res, 'Google Drive 백업 다운로드에 실패했습니다.');
  }

  let parsed: any;
  try {
    parsed = await res.json();
  } catch {
    throw new DriveSyncError(
      'INVALID_REMOTE_PAYLOAD',
      '다운로드한 클라우드 백업이 유효한 JSON 암호화 형식이 아닙니다.'
    );
  }

  try {
    enforceEncryptedExport(parsed);
  } catch {
    throw new DriveSyncError(
      'INVALID_REMOTE_PAYLOAD',
      '클라우드 백업이 AES-GCM-256 암호화 규격(VVLT_V1)과 일치하지 않습니다.'
    );
  }

  return parsed as EncryptedBackupPayload;
}

/**
 * Builds a multipart/related HTTP body for Google Drive v3 create/update requests.
 */
export function buildDriveMultipartBody(
  metadata: Record<string, unknown>,
  contentJson: string,
  boundary: string
): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${DRIVE_SYNC_MIME_TYPE}`,
    '',
    contentJson,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/**
 * Uploads an already AES-GCM-256 encrypted backup payload to Google Drive appDataFolder.
 * Enforces Zero-Knowledge: rejects any plaintext payload before sending network traffic.
 */
export async function uploadEncryptedVaultPayload(
  accessToken: string,
  encryptedPayload: EncryptedBackupPayload,
  existingFileId: string | null,
  summaryMeta?: Partial<VaultSnapshotSummary>,
  fetchFn?: FetchLike
): Promise<RemoteVaultBackupMeta> {
  try {
    enforceEncryptedExport(encryptedPayload);
  } catch (err: any) {
    throw new DriveSyncError(
      'ENCRYPTION_REQUIRED',
      err?.message || 'AES-GCM-256 암호화된 데이터만 Google Drive에 업로드할 수 있습니다.'
    );
  }

  const fetcher = getDefaultFetch(fetchFn);
  const boundary = `vibe_vault_e2ee_${Date.now().toString(36)}`;

  // Non-PII summary counts only — zero financial amounts, names, or descriptions in metadata.
  const appProperties: Record<string, string> = {
    snapshotVersion: summaryMeta?.version || '3.0',
    accountCount: String(summaryMeta?.accountCount ?? encryptedPayload.meta?.accountCount ?? 0),
    debtCount: String(summaryMeta?.debtCount ?? encryptedPayload.meta?.debtCount ?? 0),
    transactionCount: String(summaryMeta?.transactionCount ?? encryptedPayload.meta?.transactionCount ?? 0),
    spaceCount: String(summaryMeta?.spaceCount ?? encryptedPayload.meta?.spaceCount ?? 0),
    subscriptionCount: String(summaryMeta?.subscriptionCount ?? encryptedPayload.meta?.subscriptionCount ?? 0),
    deviceId: summaryMeta?.deviceId || getOrCreateDeviceId(),
  };

  const metadata: Record<string, unknown> = existingFileId
    ? {
        name: DRIVE_SYNC_FILENAME,
        mimeType: DRIVE_SYNC_MIME_TYPE,
        appProperties,
      }
    : {
        name: DRIVE_SYNC_FILENAME,
        parents: ['appDataFolder'],
        mimeType: DRIVE_SYNC_MIME_TYPE,
        appProperties,
      };

  const body = buildDriveMultipartBody(metadata, JSON.stringify(encryptedPayload), boundary);
  const url = existingFileId
    ? `${DRIVE_UPLOAD_API_BASE}/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`
    : `${DRIVE_UPLOAD_API_BASE}?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties`;

  const res = await fetcher(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    await throwDriveHttpError(res, 'Google Drive 암호화 백업 업로드에 실패했습니다.');
  }

  const saved = await res.json();
  const meta = parseDriveFileMeta(saved);
  setLastDriveSyncTimestamp(meta.modifiedTime);
  return meta;
}

/**
 * Permanently deletes the encrypted vault backup file from Google Drive appDataFolder.
 */
export async function deleteRemoteVaultBackup(
  accessToken: string,
  fileId: string,
  fetchFn?: FetchLike
): Promise<void> {
  const fetcher = getDefaultFetch(fetchFn);
  const res = await fetcher(`${DRIVE_FILES_API_BASE}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 204 && res.status !== 404) {
    await throwDriveHttpError(res, 'Google Drive 백업 삭제에 실패했습니다.');
  }
}

/**
 * Encrypts the current local Vault v3 snapshot with AES-GCM-256 and uploads it to Google Drive.
 */
export async function syncPushToGoogleDrive(
  accessToken: string,
  passphrase: string,
  existingFileId: string | null,
  options?: EncryptBackupOptions & { fetchFn?: FetchLike }
): Promise<{
  remoteMeta: RemoteVaultBackupMeta;
  summary: VaultSnapshotSummary;
}> {
  const snapshot = await buildVaultSnapshot();
  const summary = summarizeBackupPayload(snapshot);
  const encrypted = await encryptBackupData(snapshot, passphrase, {
    appName: options?.appName || 'Vibe Vault Pro',
    iterations: options?.iterations,
  });

  const remoteMeta = await uploadEncryptedVaultPayload(
    accessToken,
    encrypted,
    existingFileId,
    summary,
    options?.fetchFn
  );

  return { remoteMeta, summary };
}

/**
 * Downloads and decrypts the remote Google Drive vault backup for preview before applying.
 */
export async function syncPullAndPreviewFromGoogleDrive(
  accessToken: string,
  fileId: string,
  passphrase: string,
  fetchFn?: FetchLike
): Promise<{
  payload: UnencryptedBackupPayloadV2;
  summary: VaultSnapshotSummary;
}> {
  const encrypted = await downloadRemoteVaultPayload(accessToken, fileId, fetchFn);
  const decrypted = await decryptBackupData(encrypted, passphrase);
  const normalized = normalizeBackupPayload(decrypted);
  if (!normalized) {
    throw new DriveSyncError(
      'INVALID_REMOTE_PAYLOAD',
      '복호화된 백업에서 유효한 볼트 데이터를 찾을 수 없습니다.'
    );
  }
  const summary = summarizeBackupPayload(normalized);
  return { payload: normalized, summary };
}

/**
 * Applies a downloaded & decrypted remote snapshot locally using Smart Merge or Full Overwrite.
 */
export async function applyRemoteVaultSnapshot(
  payload: UnencryptedBackupPayloadV2,
  mode: VaultRestoreMode
): Promise<ApplyVaultSnapshotResult> {
  const result = await applyVaultSnapshot(payload, mode);
  setLastDriveSyncTimestamp(new Date().toISOString());
  return result;
}

/**
 * Performs a Zero-Knowledge Two-Way Smart Sync:
 * 1. If a remote Drive backup exists: downloads -> decrypts -> smart-merges into local vault.
 * 2. Re-encrypts the unified local snapshot with AES-GCM-256 -> uploads back to Drive.
 * Both mobile and desktop converge cleanly without duplicating accounts, debts, spaces, or transactions.
 */
export async function syncTwoWaySmartMergeWithGoogleDrive(
  accessToken: string,
  passphrase: string,
  existingFileId: string | null,
  options?: EncryptBackupOptions & { fetchFn?: FetchLike }
): Promise<{
  remoteMeta: RemoteVaultBackupMeta;
  mergeResult?: ApplyVaultSnapshotResult;
  finalSummary: VaultSnapshotSummary;
  createdInitialRemote: boolean;
}> {
  const fetchFn = options?.fetchFn;
  let targetFileId = existingFileId;

  if (!targetFileId) {
    const discovered = await findRemoteVaultBackup(accessToken, fetchFn);
    targetFileId = discovered?.fileId ?? null;
  }

  let mergeResult: ApplyVaultSnapshotResult | undefined;
  let createdInitialRemote = false;

  if (targetFileId) {
    const { payload: remotePayload } = await syncPullAndPreviewFromGoogleDrive(
      accessToken,
      targetFileId,
      passphrase,
      fetchFn
    );
    mergeResult = await applyVaultSnapshot(remotePayload, 'merge');
  } else {
    createdInitialRemote = true;
  }

  const unifiedSnapshot = await buildVaultSnapshot();
  const finalSummary = summarizeBackupPayload(unifiedSnapshot);
  const encryptedUnified = await encryptBackupData(unifiedSnapshot, passphrase, {
    appName: options?.appName || 'Vibe Vault Pro',
    iterations: options?.iterations,
  });

  const remoteMeta = await uploadEncryptedVaultPayload(
    accessToken,
    encryptedUnified,
    targetFileId,
    finalSummary,
    fetchFn
  );

  return {
    remoteMeta,
    mergeResult,
    finalSummary,
    createdInitialRemote,
  };
}
