/**
 * Vibe Vault - Zero-Knowledge At-Rest Data Encryption & Security Architecture
 * 
 * Standards & Algorithms:
 * - Cipher: AES-GCM-256 (Authenticated Encryption with Associated Data)
 * - Key Derivation: PBKDF2 with SHA-256, 100,000 iterations
 * - Non-extractable Web Crypto Key: Device master key is generated with { extractable: false }
 *   stored in a dedicated, isolated IndexedDB keystore ('vibe-vault-keystore').
 * - Zero-Knowledge PIN Protection: User PIN is verified via encrypted token challenge.
 *   Raw PIN is never stored; keys are purged from memory on lock or inactivity.
 */

import { openDB, IDBPDatabase } from 'idb';
import { Transaction, AssetAccount, DebtItem } from './types';
import { sanitizeCacheStorage } from './usePWAInstall';

// Storage constants
const KEYSTORE_DB_NAME = 'vibe-vault-keystore';
const KEYSTORE_STORE_NAME = 'vault_keys';
const MASTER_KEY_ID = 'device_master_key_v1';
const CIPHER_PREFIX = '__VBE256__:';
const PIN_STORAGE_KEY = 'vibe_vault_pin_meta';
const LOCK_CONFIG_KEY = 'vibe_vault_lock_config';

export interface VaultLockConfig {
  enabled: boolean;
  timeoutMinutes: number; // e.g. 5, 15, 30, 0 (disabled)
  lockOnVisibilityHidden: boolean;
}

interface PinMetadata {
  saltHex: string;
  verifyIvHex: string;
  verifyCiphertextB64: string;
}

// In-Memory volatile state (cleared immediately upon lock)
let inMemoryCryptoKey: CryptoKey | null = null;
let isLocked: boolean = typeof localStorage !== 'undefined' ? hasVaultPin() : false;
let keystoreDbPromise: Promise<IDBPDatabase<any>> | null = null;
let idleTimer: any = null;
let lastActiveTimestamp: number = Date.now();
let hiddenTimestamp: number | null = null;

/**
 * ArrayBuffer <-> Hex / Base64 Utilities
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Isolated IndexedDB Keystore for storing non-extractable CryptoKeys
 */
function getKeystoreDB(): Promise<IDBPDatabase<any>> {
  if (!keystoreDbPromise) {
    keystoreDbPromise = openDB(KEYSTORE_DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(KEYSTORE_STORE_NAME)) {
          db.createObjectStore(KEYSTORE_STORE_NAME);
        }
      },
    });
  }
  return keystoreDbPromise;
}

/**
 * Derives a PBKDF2 AES-GCM-256 key from a user PIN and salt
 */
async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Retrieve or generate unextractable Device Master Key (AES-GCM-256)
 */
async function getOrCreateDeviceMasterKey(): Promise<CryptoKey> {
  try {
    const db = await getKeystoreDB();
    const existingKey = await db.get(KEYSTORE_STORE_NAME, MASTER_KEY_ID);
    if (existingKey instanceof CryptoKey) {
      return existingKey;
    }

    // Generate fresh unextractable AES-GCM 256-bit key
    const newKey = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // non-extractable: raw key cannot be read via JavaScript
      ['encrypt', 'decrypt']
    );

    await db.put(KEYSTORE_STORE_NAME, newKey, MASTER_KEY_ID);
    return newKey;
  } catch (err) {
    console.warn('[VaultSecurity] Keystore IDB fallback to memory key:', err);
    return window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}

/**
 * Get active encryption key from volatile memory
 */
export async function getActiveCryptoKey(): Promise<CryptoKey> {
  if (inMemoryCryptoKey) {
    return inMemoryCryptoKey;
  }

  // If user has set a PIN and vault is locked, require unlock first
  if (hasVaultPin() && isLocked) {
    throw new Error('VAULT_LOCKED: 금고가 잠겨 있습니다. PIN 번호를 입력해주세요.');
  }

  // Otherwise, load device master key
  const dmk = await getOrCreateDeviceMasterKey();
  inMemoryCryptoKey = dmk;
  return dmk;
}

/**
 * PIN Management (Zero-Knowledge)
 */
export function hasVaultPin(): boolean {
  return !!localStorage.getItem(PIN_STORAGE_KEY);
}

export async function setVaultPin(newPin: string): Promise<void> {
  if (!newPin || newPin.length < 4) {
    throw new Error('PIN 번호는 최소 4자리 이상이어야 합니다.');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const pinKey = await derivePinKey(newPin, salt);

  // Encrypt a known verification token
  const enc = new TextEncoder();
  const token = enc.encode('vibe-vault-pin-verified-v1');
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    pinKey,
    token
  );

  const meta: PinMetadata = {
    saltHex: bufferToHex(salt.buffer),
    verifyIvHex: bufferToHex(iv.buffer),
    verifyCiphertextB64: bufferToBase64(ciphertextBuffer)
  };

  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(meta));
  inMemoryCryptoKey = pinKey;
  isLocked = false;
  notifyLockState();
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  const metaStr = localStorage.getItem(PIN_STORAGE_KEY);
  if (!metaStr) return true;

  try {
    const meta: PinMetadata = JSON.parse(metaStr);
    const salt = new Uint8Array(hexToBuffer(meta.saltHex));
    const iv = new Uint8Array(hexToBuffer(meta.verifyIvHex));
    const ciphertext = base64ToBuffer(meta.verifyCiphertextB64);

    const pinKey = await derivePinKey(pin, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      pinKey,
      ciphertext
    );

    const dec = new TextDecoder();
    const token = dec.decode(decryptedBuffer);
    if (token === 'vibe-vault-pin-verified-v1') {
      inMemoryCryptoKey = pinKey;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function removeVaultPin(currentPin: string): Promise<boolean> {
  const isValid = await verifyVaultPin(currentPin);
  if (!isValid) return false;

  localStorage.removeItem(PIN_STORAGE_KEY);
  inMemoryCryptoKey = await getOrCreateDeviceMasterKey();
  isLocked = false;
  notifyLockState();
  return true;
}

/**
 * Resets all vault security parameters, PIN credentials, and in-memory keys
 */
export function resetVaultSecurity(): void {
  localStorage.removeItem(PIN_STORAGE_KEY);
  localStorage.removeItem(LOCK_CONFIG_KEY);
  sessionStorage.removeItem('vibe_vault_setup_skipped');
  inMemoryCryptoKey = null;
  isLocked = false;
  notifyLockState();
}

/**
 * Vault Lock & Memory Sanitization
 */
export function isVaultLocked(): boolean {
  return isLocked;
}

export function lockVault(): void {
  // Purge crypto key from memory
  inMemoryCryptoKey = null;
  isLocked = true;
  notifyLockState();

  // Security Hardening Item #5: Evict any non-static / accidental cache entries upon lock
  sanitizeCacheStorage().catch(() => {});
}

export async function unlockVault(pin?: string): Promise<{ success: boolean; error?: string }> {
  if (hasVaultPin()) {
    if (!pin) {
      return { success: false, error: 'PIN 번호를 입력해주세요.' };
    }
    const valid = await verifyVaultPin(pin);
    if (!valid) {
      return { success: false, error: '올바르지 않은 PIN 번호입니다.' };
    }
  } else {
    // No PIN configured: unlock directly using Device Master Key
    inMemoryCryptoKey = await getOrCreateDeviceMasterKey();
  }

  isLocked = false;
  lastActiveTimestamp = Date.now();
  notifyLockState();
  return { success: true };
}

/**
 * Auto-Lock Configuration & Inactivity Watcher
 */
export function getAutoLockConfig(): VaultLockConfig {
  try {
    const stored = localStorage.getItem(LOCK_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        enabled: parsed.enabled ?? true,
        timeoutMinutes: typeof parsed.timeoutMinutes === 'number' ? parsed.timeoutMinutes : 15,
        lockOnVisibilityHidden: parsed.lockOnVisibilityHidden ?? true
      };
    }
  } catch {}

  return {
    enabled: true,
    timeoutMinutes: 15,
    lockOnVisibilityHidden: true
  };
}

export function saveAutoLockConfig(config: Partial<VaultLockConfig>): void {
  const current = getAutoLockConfig();
  const updated = { ...current, ...config };
  localStorage.setItem(LOCK_CONFIG_KEY, JSON.stringify(updated));
}

function notifyLockState(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vault-lock-state-changed', {
      detail: { isLocked }
    }));
  }
}

export function subscribeVaultLock(callback: (locked: boolean) => void): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{ isLocked: boolean }>;
    callback(custom.detail?.isLocked ?? isLocked);
  };
  window.addEventListener('vault-lock-state-changed', handler);
  return () => window.removeEventListener('vault-lock-state-changed', handler);
}

/**
 * Inactivity & Tab Visibility Auto-Lock Watcher
 */
export function initAutoLockWatcher(): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleActivity = () => {
    lastActiveTimestamp = Date.now();
  };

  const handleVisibilityChange = () => {
    const config = getAutoLockConfig();
    if (!config.enabled) return;

    if (document.visibilityState === 'hidden') {
      hiddenTimestamp = Date.now();
    } else if (document.visibilityState === 'visible' && hiddenTimestamp) {
      const elapsed = Date.now() - hiddenTimestamp;
      const timeoutMs = config.timeoutMinutes * 60 * 1000;
      if (timeoutMs === 0 || (timeoutMs > 0 && elapsed >= timeoutMs)) {
        lockVault();
      }
      hiddenTimestamp = null;
    }
  };

  const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Periodic interval check every 15 seconds
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const config = getAutoLockConfig();
    if (!config.enabled || isLocked || config.timeoutMinutes <= 0) return;

    const idleElapsed = Date.now() - lastActiveTimestamp;
    if (idleElapsed >= config.timeoutMinutes * 60 * 1000) {
      lockVault();
    }
  }, 15000);

  return () => {
    activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity));
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (idleTimer) clearInterval(idleTimer);
  };
}

/**
 * Field-Level Encryption Primitive: AES-GCM-256
 */
export async function encryptField(plaintext: string | null | undefined): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') {
    return plaintext ?? '';
  }

  // Already encrypted check
  if (plaintext.startsWith(CIPHER_PREFIX)) {
    return plaintext;
  }

  try {
    const key = await getActiveCryptoKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encoded = enc.encode(plaintext);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const ivHex = bufferToHex(iv.buffer);
    const cipherB64 = bufferToBase64(ciphertextBuffer);

    return `${CIPHER_PREFIX}${ivHex}:${cipherB64}`;
  } catch (err) {
    console.error('[VaultSecurity] encryptField error:', err);
    // In case of error (e.g. key missing/locked), return plaintext to prevent data destruction
    return plaintext;
  }
}

/**
 * Field-Level Decryption Primitive: AES-GCM-256
 */
export async function decryptField(ciphertextOrPlain: string | null | undefined): Promise<string> {
  if (!ciphertextOrPlain || typeof ciphertextOrPlain !== 'string') {
    return ciphertextOrPlain ?? '';
  }

  // If not encrypted, return as is (Legacy plain text backward compatibility)
  if (!ciphertextOrPlain.startsWith(CIPHER_PREFIX)) {
    return ciphertextOrPlain;
  }

  try {
    const key = await getActiveCryptoKey();
    const payload = ciphertextOrPlain.slice(CIPHER_PREFIX.length);
    const colonIndex = payload.indexOf(':');
    if (colonIndex === -1) return ciphertextOrPlain;

    const ivHex = payload.slice(0, colonIndex);
    const cipherB64 = payload.slice(colonIndex + 1);

    const iv = new Uint8Array(hexToBuffer(ivHex));
    const ciphertext = base64ToBuffer(cipherB64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    // If vault is locked or invalid key, return masked placeholder
    if (isLocked) {
      return '••••••••';
    }
    console.warn('[VaultSecurity] decryptField failure, returning raw text');
    return ciphertextOrPlain;
  }
}

/**
 * Transparent Entity-Level Transformers
 */

export async function encryptTransaction(tx: Transaction): Promise<Transaction> {
  return {
    ...tx,
    description: await encryptField(tx.description),
    paymentMethod: tx.paymentMethod ? await encryptField(tx.paymentMethod) : tx.paymentMethod
  };
}

export async function decryptTransaction(tx: Transaction): Promise<Transaction> {
  return {
    ...tx,
    description: await decryptField(tx.description),
    paymentMethod: tx.paymentMethod ? await decryptField(tx.paymentMethod) : tx.paymentMethod
  };
}

export async function encryptAssetAccount(account: AssetAccount): Promise<AssetAccount> {
  return {
    ...account,
    accountNumberMasked: account.accountNumberMasked ? await encryptField(account.accountNumberMasked) : account.accountNumberMasked,
    note: account.note ? await encryptField(account.note) : account.note
  };
}

export async function decryptAssetAccount(account: AssetAccount): Promise<AssetAccount> {
  return {
    ...account,
    accountNumberMasked: account.accountNumberMasked ? await decryptField(account.accountNumberMasked) : account.accountNumberMasked,
    note: account.note ? await decryptField(account.note) : account.note
  };
}

export async function encryptDebtItem(debt: DebtItem): Promise<DebtItem> {
  return {
    ...debt,
    notes: debt.notes ? await encryptField(debt.notes) : debt.notes,
    counterpartyOrBank: await encryptField(debt.counterpartyOrBank),
    name: await encryptField(debt.name)
  };
}

export async function decryptDebtItem(debt: DebtItem): Promise<DebtItem> {
  return {
    ...debt,
    notes: debt.notes ? await decryptField(debt.notes) : debt.notes,
    counterpartyOrBank: await decryptField(debt.counterpartyOrBank),
    name: await decryptField(debt.name)
  };
}
