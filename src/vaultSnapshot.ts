import {
  Asset,
  AssetAccount,
  DebtItem,
  EncryptedBackupPayload,
  LedgerSpace,
  SubscriptionItem,
  Transaction,
  UnencryptedBackupPayloadV2,
  VaultSnapshotV3,
} from './types';
import {
  DEFAULT_SPACE,
  getAllAssetAccounts,
  getAllDebts,
  getAllTransactions,
  getSavedSubscriptionsAsync,
  getSpaces,
  notifyVaultDataChanged,
  replaceAllAssetAccounts,
  replaceAllDebts,
  replaceAllSpaces,
  replaceAllTransactions,
  saveSubscriptions,
} from './db';
import { mergeTransactionsDeduplicated } from './cryptoBackup';
import {
  applyTheme,
  getCategoryBudgets,
  getUserActiveCurrencies,
  getUserAssets,
  getUserPreferences,
  saveCategoryBudgets,
  saveUserActiveCurrencies,
  saveUserAssets,
  saveUserPreferences,
  UserPreferences,
} from './utils';
import { applySeasonTheme } from './seasonTheme';
import { generateSecureId } from './identifiers';

export const VAULT_SNAPSHOT_VERSION = '3.0' as const;
export const VAULT_SNAPSHOT_FORMAT = 'vibe-backup-v3' as const;

const DEVICE_ID_STORAGE_KEY = 'vibe_device_id';
const CARD_RECONCILE_OFFSETS_KEY = 'vibe_card_reconcile_offsets';

export type VaultRestoreMode = 'merge' | 'overwrite';

export interface CollectionMergeStats {
  added: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface VaultMergeStats {
  mode: VaultRestoreMode;
  transactions: CollectionMergeStats;
  assetAccounts: CollectionMergeStats;
  debts: CollectionMergeStats;
  spaces: CollectionMergeStats;
  subscriptions: CollectionMergeStats;
  assets: CollectionMergeStats;
  preferencesApplied: boolean;
}

export interface VaultSnapshotSummary {
  version: string;
  format: string;
  createdAt?: string;
  deviceId?: string;
  transactionCount: number;
  accountCount: number;
  debtCount: number;
  spaceCount: number;
  customSpaceCount: number;
  subscriptionCount: number;
  assetTagCount: number;
  hasPreferences: boolean;
  hasAnyData: boolean;
}

export interface ApplyVaultSnapshotResult {
  snapshot: VaultSnapshotV3;
  stats: VaultMergeStats;
  appliedPreferences?: UserPreferences;
}

/**
 * Generates or retrieves a non-PII local device identifier for multi-device sync provenance.
 */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return 'device-ephemeral';
  }
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      return existing;
    }
    const created = generateSecureId('dev');
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return 'device-ephemeral';
  }
}

function readCardReconcileOffsets(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CARD_RECONCILE_OFFSETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        clean[key] = value;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeCardReconcileOffsets(offsets: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CARD_RECONCILE_OFFSETS_KEY, JSON.stringify(offsets));
  } catch {
    // Ignore storage quota errors
  }
}

function parseTimestampMs(iso?: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeKeyPart(value?: string): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Safely normalizes any decrypted backup (v3, v2, or legacy transaction array)
 * into a structured UnencryptedBackupPayloadV2-compatible object.
 */
export function normalizeBackupPayload(raw: unknown): UnencryptedBackupPayloadV2 | null {
  if (!raw) return null;

  // Legacy v1 format: bare Transaction[] array
  if (Array.isArray(raw)) {
    const validTxs = raw.filter(
      (item): item is Transaction =>
        Boolean(item && typeof item === 'object' && 'amount' in item && 'date' in item)
    );
    return {
      version: '2.0',
      format: 'vibe-backup-v2',
      createdAt: new Date().toISOString(),
      transactions: validTxs,
    };
  }

  if (typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const hasRecognizedField =
    Array.isArray(obj.transactions) ||
    Array.isArray(obj.assetAccounts) ||
    Array.isArray(obj.debts) ||
    Array.isArray(obj.spaces) ||
    Array.isArray(obj.subscriptions) ||
    Array.isArray(obj.assets) ||
    (obj.preferences !== undefined && typeof obj.preferences === 'object' && obj.preferences !== null);

  if (!hasRecognizedField) return null;

  const isV3 = obj.version === '3.0' || obj.format === VAULT_SNAPSHOT_FORMAT;

  const cleanOffsets = (input: unknown): Record<string, number> | undefined => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        result[k] = v;
      }
    }
    return result;
  };

  return {
    version: isV3 ? '3.0' : '2.0',
    format: isV3 ? VAULT_SNAPSHOT_FORMAT : 'vibe-backup-v2',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    deviceId: typeof obj.deviceId === 'string' ? obj.deviceId : undefined,
    transactions: Array.isArray(obj.transactions) ? (obj.transactions as Transaction[]) : [],
    preferences:
      obj.preferences && typeof obj.preferences === 'object' && !Array.isArray(obj.preferences)
        ? (obj.preferences as Record<string, any>)
        : undefined,
    subscriptions: Array.isArray(obj.subscriptions) ? (obj.subscriptions as SubscriptionItem[]) : undefined,
    assets: Array.isArray(obj.assets) ? (obj.assets as Asset[]) : undefined,
    assetAccounts: Array.isArray(obj.assetAccounts) ? (obj.assetAccounts as AssetAccount[]) : undefined,
    debts: Array.isArray(obj.debts) ? (obj.debts as DebtItem[]) : undefined,
    spaces: Array.isArray(obj.spaces) ? (obj.spaces as LedgerSpace[]) : undefined,
    activeCurrencies: Array.isArray(obj.activeCurrencies)
      ? obj.activeCurrencies.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : undefined,
    categoryBudgets: cleanOffsets(obj.categoryBudgets),
    cardReconcileOffsets: cleanOffsets(obj.cardReconcileOffsets),
  };
}

/**
 * Summarizes the contents of a normalized (or raw) backup payload for UI previews and validation.
 */
export function summarizeBackupPayload(raw: unknown): VaultSnapshotSummary {
  const normalized = normalizeBackupPayload(raw);
  if (!normalized) {
    return {
      version: 'unknown',
      format: 'unknown',
      transactionCount: 0,
      accountCount: 0,
      debtCount: 0,
      spaceCount: 0,
      customSpaceCount: 0,
      subscriptionCount: 0,
      assetTagCount: 0,
      hasPreferences: false,
      hasAnyData: false,
    };
  }

  const transactionCount = normalized.transactions.length;
  const accountCount = normalized.assetAccounts?.length ?? 0;
  const debtCount = normalized.debts?.length ?? 0;
  const spaceCount = normalized.spaces?.length ?? 0;
  const customSpaceCount = (normalized.spaces || []).filter((s) => s.id !== 'default').length;
  const subscriptionCount = normalized.subscriptions?.length ?? 0;
  const assetTagCount = normalized.assets?.length ?? 0;
  const hasPreferences = Boolean(
    normalized.preferences && Object.keys(normalized.preferences).length > 0
  );

  const hasAnyData =
    transactionCount > 0 ||
    accountCount > 0 ||
    debtCount > 0 ||
    customSpaceCount > 0 ||
    subscriptionCount > 0 ||
    assetTagCount > 0 ||
    hasPreferences;

  return {
    version: normalized.version,
    format: normalized.format,
    createdAt: normalized.createdAt,
    deviceId: normalized.deviceId,
    transactionCount,
    accountCount,
    debtCount,
    spaceCount,
    customSpaceCount,
    subscriptionCount,
    assetTagCount,
    hasPreferences,
    hasAnyData,
  };
}

/**
 * Captures the complete user vault state across IndexedDB stores and preferences into a v3 snapshot.
 */
export async function buildVaultSnapshot(): Promise<VaultSnapshotV3> {
  const [transactions, assetAccounts, debts, spaces, subscriptions] = await Promise.all([
    getAllTransactions(),
    getAllAssetAccounts(),
    getAllDebts(),
    getSpaces(),
    getSavedSubscriptionsAsync(),
  ]);

  const preferences = getUserPreferences();
  const assets = getUserAssets();
  const activeCurrencies = getUserActiveCurrencies();
  const categoryBudgets = getCategoryBudgets();
  const cardReconcileOffsets = readCardReconcileOffsets();

  return {
    version: VAULT_SNAPSHOT_VERSION,
    format: VAULT_SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    deviceId: getOrCreateDeviceId(),
    transactions,
    assetAccounts,
    debts,
    spaces,
    subscriptions,
    assets,
    preferences,
    activeCurrencies,
    categoryBudgets,
    cardReconcileOffsets,
  };
}

/**
 * Deduplicating timestamp-aware merge for AssetAccount collections.
 */
export function mergeAssetAccounts(
  existingList: AssetAccount[],
  incomingList: AssetAccount[] | undefined,
  mode: VaultRestoreMode = 'merge'
): { items: AssetAccount[]; stats: CollectionMergeStats } {
  if (mode === 'overwrite') {
    const next = incomingList ? [...incomingList] : [];
    return {
      items: next,
      stats: { added: next.length, updated: 0, skipped: 0, total: next.length },
    };
  }

  if (!incomingList || incomingList.length === 0) {
    return {
      items: [...existingList],
      stats: { added: 0, updated: 0, skipped: 0, total: existingList.length },
    };
  }

  const result = [...existingList];
  const byId = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  const makeFingerprint = (acc: AssetAccount): string =>
    `${normalizeKeyPart(acc.institution)}::${normalizeKeyPart(acc.accountName)}::${(acc.currency || 'KRW').toUpperCase()}`;

  result.forEach((acc, index) => {
    byId.set(acc.id, index);
    byFingerprint.set(makeFingerprint(acc), index);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    const fp = makeFingerprint(incoming);
    const matchIndex = byId.has(incoming.id)
      ? byId.get(incoming.id)!
      : byFingerprint.has(fp)
        ? byFingerprint.get(fp)!
        : -1;

    if (matchIndex >= 0) {
      const current = result[matchIndex];
      const currentTs = parseTimestampMs(current.lastUpdated);
      const incomingTs = parseTimestampMs(incoming.lastUpdated);

      if (incomingTs >= currentTs) {
        result[matchIndex] = {
          ...current,
          ...incoming,
          id: current.id,
          holdings: incoming.holdings && incoming.holdings.length > 0 ? incoming.holdings : current.holdings,
        };
        updated++;
      } else {
        skipped++;
      }
    } else {
      const nextIndex = result.length;
      result.push(incoming);
      byId.set(incoming.id, nextIndex);
      byFingerprint.set(fp, nextIndex);
      added++;
    }
  }

  return {
    items: result,
    stats: { added, updated, skipped, total: result.length },
  };
}

/**
 * Deduplicating timestamp-aware merge for DebtItem collections.
 */
export function mergeDebts(
  existingList: DebtItem[],
  incomingList: DebtItem[] | undefined,
  mode: VaultRestoreMode = 'merge'
): { items: DebtItem[]; stats: CollectionMergeStats } {
  if (mode === 'overwrite') {
    const next = incomingList ? [...incomingList] : [];
    return {
      items: next,
      stats: { added: next.length, updated: 0, skipped: 0, total: next.length },
    };
  }

  if (!incomingList || incomingList.length === 0) {
    return {
      items: [...existingList],
      stats: { added: 0, updated: 0, skipped: 0, total: existingList.length },
    };
  }

  const result = [...existingList];
  const byId = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  const makeFingerprint = (debt: DebtItem): string =>
    `${debt.type}::${normalizeKeyPart(debt.counterpartyOrBank)}::${normalizeKeyPart(debt.name)}`;

  result.forEach((debt, index) => {
    byId.set(debt.id, index);
    byFingerprint.set(makeFingerprint(debt), index);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    const fp = makeFingerprint(incoming);
    const matchIndex = byId.has(incoming.id)
      ? byId.get(incoming.id)!
      : byFingerprint.has(fp)
        ? byFingerprint.get(fp)!
        : -1;

    if (matchIndex >= 0) {
      const current = result[matchIndex];
      const currentTs = parseTimestampMs(current.lastUpdated);
      const incomingTs = parseTimestampMs(incoming.lastUpdated);

      if (incomingTs >= currentTs) {
        result[matchIndex] = {
          ...current,
          ...incoming,
          id: current.id,
        };
        updated++;
      } else {
        skipped++;
      }
    } else {
      const nextIndex = result.length;
      result.push(incoming);
      byId.set(incoming.id, nextIndex);
      byFingerprint.set(fp, nextIndex);
      added++;
    }
  }

  return {
    items: result,
    stats: { added, updated, skipped, total: result.length },
  };
}

/**
 * Deduplicating merge for Multi-Ledger Spaces (always preserving 'default').
 */
export function mergeSpaces(
  existingList: LedgerSpace[],
  incomingList: LedgerSpace[] | undefined,
  mode: VaultRestoreMode = 'merge'
): { items: LedgerSpace[]; stats: CollectionMergeStats } {
  const ensureDefault = (list: LedgerSpace[]): LedgerSpace[] => {
    if (list.some((s) => s.id === 'default')) return list;
    return [{ ...DEFAULT_SPACE, createdAt: new Date().toISOString() }, ...list];
  };

  if (mode === 'overwrite') {
    const next = ensureDefault(incomingList ? [...incomingList] : []);
    return {
      items: next,
      stats: { added: next.length, updated: 0, skipped: 0, total: next.length },
    };
  }

  if (!incomingList || incomingList.length === 0) {
    const preserved = ensureDefault([...existingList]);
    return {
      items: preserved,
      stats: { added: 0, updated: 0, skipped: 0, total: preserved.length },
    };
  }

  const result = ensureDefault([...existingList]);
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();

  result.forEach((sp, index) => {
    byId.set(sp.id, index);
    if (sp.id !== 'default') {
      byName.set(normalizeKeyPart(sp.name), index);
    }
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    if (incoming.id === 'default') {
      const idx = byId.get('default');
      if (idx !== undefined) {
        result[idx] = { ...result[idx], ...incoming, id: 'default' };
        skipped++;
      }
      continue;
    }

    const nameKey = normalizeKeyPart(incoming.name);
    const matchIndex = byId.has(incoming.id)
      ? byId.get(incoming.id)!
      : byName.has(nameKey)
        ? byName.get(nameKey)!
        : -1;

    if (matchIndex >= 0) {
      result[matchIndex] = { ...result[matchIndex], ...incoming, id: result[matchIndex].id };
      updated++;
    } else {
      const nextIndex = result.length;
      result.push(incoming);
      byId.set(incoming.id, nextIndex);
      byName.set(nameKey, nextIndex);
      added++;
    }
  }

  return {
    items: result,
    stats: { added, updated, skipped, total: result.length },
  };
}

/**
 * Deduplicating merge for SubscriptionItem collections.
 */
export function mergeSubscriptions(
  existingList: SubscriptionItem[],
  incomingList: SubscriptionItem[] | undefined,
  mode: VaultRestoreMode = 'merge'
): { items: SubscriptionItem[]; stats: CollectionMergeStats } {
  if (mode === 'overwrite') {
    const next = incomingList ? [...incomingList] : [];
    return {
      items: next,
      stats: { added: next.length, updated: 0, skipped: 0, total: next.length },
    };
  }

  if (!incomingList || incomingList.length === 0) {
    return {
      items: [...existingList],
      stats: { added: 0, updated: 0, skipped: 0, total: existingList.length },
    };
  }

  const result = [...existingList];
  const byId = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  const makeFingerprint = (sub: SubscriptionItem): string =>
    `${normalizeKeyPart(sub.merchant)}::${sub.cycleDays}::${(sub.currency || 'KRW').toUpperCase()}`;

  result.forEach((sub, index) => {
    byId.set(sub.id, index);
    byFingerprint.set(makeFingerprint(sub), index);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    const fp = makeFingerprint(incoming);
    const matchIndex = byId.has(incoming.id)
      ? byId.get(incoming.id)!
      : byFingerprint.has(fp)
        ? byFingerprint.get(fp)!
        : -1;

    if (matchIndex >= 0) {
      const current = result[matchIndex];
      const currentTs = parseTimestampMs(current.lastBillingDate);
      const incomingTs = parseTimestampMs(incoming.lastBillingDate);
      if (incomingTs >= currentTs) {
        result[matchIndex] = { ...current, ...incoming, id: current.id };
        updated++;
      } else {
        skipped++;
      }
    } else {
      const nextIndex = result.length;
      result.push(incoming);
      byId.set(incoming.id, nextIndex);
      byFingerprint.set(fp, nextIndex);
      added++;
    }
  }

  return {
    items: result,
    stats: { added, updated, skipped, total: result.length },
  };
}

/**
 * Deduplicating merge for legacy Asset tags (vibe_user_assets).
 */
export function mergeLegacyAssets(
  existingList: Asset[],
  incomingList: Asset[] | undefined,
  mode: VaultRestoreMode = 'merge'
): { items: Asset[]; stats: CollectionMergeStats } {
  if (mode === 'overwrite') {
    const next = incomingList ? [...incomingList] : [];
    return {
      items: next,
      stats: { added: next.length, updated: 0, skipped: 0, total: next.length },
    };
  }

  if (!incomingList || incomingList.length === 0) {
    return {
      items: [...existingList],
      stats: { added: 0, updated: 0, skipped: 0, total: existingList.length },
    };
  }

  const result = [...existingList];
  const byId = new Map<string, number>();
  const byFingerprint = new Map<string, number>();

  const makeFingerprint = (asset: Asset): string =>
    `${asset.type}::${normalizeKeyPart(asset.name)}`;

  result.forEach((asset, index) => {
    byId.set(asset.id, index);
    byFingerprint.set(makeFingerprint(asset), index);
  });

  let added = 0;
  let updated = 0;

  for (const incoming of incomingList) {
    if (!incoming || !incoming.id) continue;
    const fp = makeFingerprint(incoming);
    const matchIndex = byId.has(incoming.id)
      ? byId.get(incoming.id)!
      : byFingerprint.has(fp)
        ? byFingerprint.get(fp)!
        : -1;

    if (matchIndex >= 0) {
      result[matchIndex] = { ...result[matchIndex], ...incoming, id: result[matchIndex].id };
      updated++;
    } else {
      const nextIndex = result.length;
      result.push(incoming);
      byId.set(incoming.id, nextIndex);
      byFingerprint.set(fp, nextIndex);
      added++;
    }
  }

  return {
    items: result,
    stats: { added, updated, skipped: 0, total: result.length },
  };
}

/**
 * Pure, deterministic multi-device snapshot merger.
 * Reusable for both manual `.vibe.enc` transfers and automated cloud E2EE sync.
 */
export function mergeVaultSnapshots(
  current: VaultSnapshotV3,
  incoming: UnencryptedBackupPayloadV2,
  mode: VaultRestoreMode = 'merge'
): { snapshot: VaultSnapshotV3; stats: VaultMergeStats } {
  const txMerge = mergeTransactionsDeduplicated(
    current.transactions || [],
    incoming.transactions || [],
    mode
  );

  // Backward compatibility: v2 payloads omit assetAccounts/debts/spaces.
  // In 'merge' mode, undefined incoming collections preserve local data intact.
  const accountsMerge = mergeAssetAccounts(current.assetAccounts || [], incoming.assetAccounts, mode);
  const debtsMerge = mergeDebts(current.debts || [], incoming.debts, mode);
  const spacesMerge = mergeSpaces(current.spaces || [], incoming.spaces, mode);
  const subsMerge = mergeSubscriptions(current.subscriptions || [], incoming.subscriptions, mode);
  const assetsMerge = mergeLegacyAssets(current.assets || [], incoming.assets, mode);

  const mergedCurrencies =
    mode === 'overwrite'
      ? (incoming.activeCurrencies && incoming.activeCurrencies.length > 0
          ? incoming.activeCurrencies
          : current.activeCurrencies)
      : Array.from(new Set([...(current.activeCurrencies || ['KRW']), ...(incoming.activeCurrencies || [])]));

  const mergedBudgets: Record<string, number> =
    mode === 'overwrite'
      ? { ...(incoming.categoryBudgets || {}) }
      : { ...(current.categoryBudgets || {}), ...(incoming.categoryBudgets || {}) };

  const mergedOffsets: Record<string, number> =
    mode === 'overwrite'
      ? { ...(incoming.cardReconcileOffsets || {}) }
      : { ...(current.cardReconcileOffsets || {}), ...(incoming.cardReconcileOffsets || {}) };

  const mergedPreferences =
    incoming.preferences && Object.keys(incoming.preferences).length > 0
      ? mode === 'overwrite'
        ? { ...incoming.preferences }
        : { ...(current.preferences || {}), ...incoming.preferences }
      : current.preferences;

  const snapshot: VaultSnapshotV3 = {
    version: VAULT_SNAPSHOT_VERSION,
    format: VAULT_SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    deviceId: current.deviceId,
    transactions: txMerge.finalTransactions,
    assetAccounts: accountsMerge.items,
    debts: debtsMerge.items,
    spaces: spacesMerge.items,
    subscriptions: subsMerge.items,
    assets: assetsMerge.items,
    preferences: mergedPreferences,
    activeCurrencies: mergedCurrencies.length > 0 ? mergedCurrencies : ['KRW'],
    categoryBudgets: mergedBudgets,
    cardReconcileOffsets: mergedOffsets,
  };

  return {
    snapshot,
    stats: {
      mode,
      transactions: {
        added: txMerge.addedCount,
        updated: txMerge.updatedCount,
        skipped: txMerge.skippedCount,
        total: txMerge.finalTransactions.length,
      },
      assetAccounts: accountsMerge.stats,
      debts: debtsMerge.stats,
      spaces: spacesMerge.stats,
      subscriptions: subsMerge.stats,
      assets: assetsMerge.stats,
      preferencesApplied: Boolean(incoming.preferences && Object.keys(incoming.preferences).length > 0),
    },
  };
}

/**
 * Merges or overwrites an incoming backup snapshot into local IndexedDB + preferences atomically.
 */
export async function applyVaultSnapshot(
  incomingRaw: unknown,
  mode: VaultRestoreMode = 'merge'
): Promise<ApplyVaultSnapshotResult> {
  const normalized = normalizeBackupPayload(incomingRaw);
  if (!normalized) {
    throw new Error('유효한 백업 스냅샷 형식이 아닙니다.');
  }

  const current = await buildVaultSnapshot();
  const { snapshot, stats } = mergeVaultSnapshots(current, normalized, mode);

  // Persist IndexedDB collections
  await replaceAllTransactions(snapshot.transactions);

  if (mode === 'overwrite' || normalized.assetAccounts !== undefined) {
    await replaceAllAssetAccounts(snapshot.assetAccounts);
  }

  if (mode === 'overwrite' || normalized.debts !== undefined) {
    await replaceAllDebts(snapshot.debts);
  }

  if (mode === 'overwrite' || normalized.spaces !== undefined) {
    await replaceAllSpaces(snapshot.spaces);
  }

  if (mode === 'overwrite' || normalized.subscriptions !== undefined) {
    await saveSubscriptions(snapshot.subscriptions);
  }

  // Persist local preferences & auxiliary maps
  if (mode === 'overwrite' || normalized.assets !== undefined) {
    saveUserAssets(snapshot.assets);
  }

  if (mode === 'overwrite' || normalized.activeCurrencies !== undefined) {
    saveUserActiveCurrencies(snapshot.activeCurrencies);
  }

  if (mode === 'overwrite' || normalized.categoryBudgets !== undefined) {
    saveCategoryBudgets(snapshot.categoryBudgets);
  }

  if (mode === 'overwrite' || normalized.cardReconcileOffsets !== undefined) {
    writeCardReconcileOffsets(snapshot.cardReconcileOffsets);
  }

  let appliedPreferences: UserPreferences | undefined;
  if (snapshot.preferences && stats.preferencesApplied) {
    const nextPrefs = {
      ...getUserPreferences(),
      ...snapshot.preferences,
    } as UserPreferences;
    saveUserPreferences(nextPrefs);
    if (nextPrefs.theme) {
      applyTheme(nextPrefs.theme);
    }
    if (nextPrefs.seasonTheme) {
      applySeasonTheme(nextPrefs.seasonTheme);
    }
    appliedPreferences = nextPrefs;
  }

  notifyVaultDataChanged('backup_restored');

  return {
    snapshot,
    stats,
    appliedPreferences,
  };
}

/**
 * Checks whether the current browser supports Web Share API file sharing (mobile iOS/Android, Safari/macOS).
 */
export function canShareBackupFile(): boolean {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File(['{}'], 'probe.vibe.enc', { type: 'application/json' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Downloads an encrypted `.vibe.enc` payload via Blob URL (safe for large multi-account snapshots).
 */
export function triggerEncryptedBackupDownload(
  filename: string,
  encryptedPayload: EncryptedBackupPayload
): void {
  const jsonStr = JSON.stringify(encryptedPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 1500);
}

/**
 * Shares an encrypted `.vibe.enc` file via the OS Share Sheet (AirDrop, iCloud Drive, Google Drive, KakaoTalk).
 */
export async function shareEncryptedBackupFile(
  filename: string,
  encryptedPayload: EncryptedBackupPayload,
  options?: { title?: string; text?: string }
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareBackupFile()) return 'unsupported';

  const jsonStr = JSON.stringify(encryptedPayload, null, 2);
  const file = new File([jsonStr], filename, { type: 'application/json' });

  try {
    await navigator.share({
      files: [file],
      title: options?.title || 'Vibe Vault Encrypted Backup',
      text: options?.text || 'AES-GCM-256 encrypted vault snapshot (.vibe.enc)',
    });
    return 'shared';
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
      return 'cancelled';
    }
    throw err;
  }
}
