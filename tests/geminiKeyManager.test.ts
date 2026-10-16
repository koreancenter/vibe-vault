import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

// Lightweight localStorage in-memory mock for Node test environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createLocalStorageMock();
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import {
  setSecureGeminiApiKey,
  getSecureGeminiApiKey,
  clearSecureGeminiApiKey,
  clearInMemoryApiKey,
  getInMemoryApiKey,
  setInMemoryApiKey,
  maskApiKey,
  decryptApiKey,
  loadSecureGeminiApiKey,
  sanitizeApiKey,
  isValidGeminiKeyFormat,
  ENCRYPTED_STORAGE_KEY,
  SECURE_STORAGE_KEY
} from '../src/geminiKeyManager';

describe('Gemini Key Manager Security Hardening (Masking & Encrypted Storage)', () => {
  const sampleKey = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';

  beforeEach(() => {
    localStorage.clear();
    clearInMemoryApiKey();
  });

  it('1. Masking: maskApiKey hides sensitive key middle characters with bullet characters', () => {
    const masked = maskApiKey(sampleKey);
    expect(masked.startsWith('AIza')).toBe(true);
    expect(masked.endsWith('5P6Q')).toBe(true);
    expect(masked).toContain('••••');
    expect(masked).not.toBe(sampleKey);
  });

  it('2. Legacy obfuscation is decoded only for migration', () => {
    const iv = new Uint8Array(16);
    const plain = new TextEncoder().encode(sampleKey);
    const cipher = Array.from(plain, (byte, i) => {
      const roundKey = ((0x5a * (i + 1)) ^ iv[i % iv.length] ^ 0xa5) & 0xff;
      return (byte ^ roundKey).toString(16).padStart(2, '0');
    }).join('');
    const encoded = `enc_v2:${'00'.repeat(16)}:${cipher}`;
    expect(decryptApiKey(encoded)).toBe(sampleKey);
  });

  it('3. Plaintext Exposure Prevention: only authenticated ciphertext and a masked key are persisted', async () => {
    await setSecureGeminiApiKey(sampleKey);

    const storedEncrypted = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
    expect(storedEncrypted?.startsWith('__VBE256__:')).toBe(true);
    expect(storedEncrypted).not.toContain(sampleKey);
    expect(localStorage.getItem(SECURE_STORAGE_KEY)).toBeNull();

    expect(localStorage.getItem('vibe_gemini_api_key')).toBeNull();

    const storedLegacy = localStorage.getItem('vibe_engine_config');
    expect(storedLegacy).toBeDefined();
    const parsed = JSON.parse(storedLegacy!);
    expect(parsed.apiKey).not.toBe(sampleKey);
    expect(parsed.apiKey).toContain('•');
    expect(parsed.maskedApiKey).toContain('•');

    const retrieved = getSecureGeminiApiKey();
    expect(retrieved).toBe(sampleKey);
    expect(getInMemoryApiKey()).toBe(sampleKey);
  });

  it('4. Legacy stored keys migrate to AES-GCM and remove weak duplicate storage', async () => {
    const encoded = btoa(sampleKey.split('').map((char, i) =>
      String.fromCharCode(char.charCodeAt(0) ^ ((0x5a + i) & 0xff))
    ).join(''));
    localStorage.setItem(SECURE_STORAGE_KEY, encoded);

    await expect(loadSecureGeminiApiKey()).resolves.toBe(sampleKey);
    expect(localStorage.getItem(ENCRYPTED_STORAGE_KEY)?.startsWith('__VBE256__:')).toBe(true);
    expect(localStorage.getItem(SECURE_STORAGE_KEY)).toBeNull();
  });

  it('migrates an unmasked legacy engine key before exposing it to callers', async () => {
    localStorage.setItem('vibe_engine_config', JSON.stringify({
      provider: 'gemini',
      apiKey: sampleKey
    }));

    await expect(loadSecureGeminiApiKey()).resolves.toBe(sampleKey);
    expect(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).toMatch(/^__VBE256__:/);
    expect(localStorage.getItem('vibe_gemini_api_key_secure_v1')).toBeNull();
    const config = JSON.parse(localStorage.getItem('vibe_engine_config') || '{}');
    expect(config.apiKey).not.toBe(sampleKey);
    expect(config.apiKey).toContain('•');
  });

  it('5. Sanitization & Validation: Handles whitespace, quotes, and format checks', () => {
    expect(sanitizeApiKey('  "AIzaSy123"  ')).toBe('AIzaSy123');
    expect(isValidGeminiKeyFormat(sampleKey)).toBe(true);
    expect(isValidGeminiKeyFormat('invalid-key')).toBe(false);
  });

  it('6. Safe Clearing: clearSecureGeminiApiKey purges all stored copies cleanly', async () => {
    await setSecureGeminiApiKey(sampleKey);
    expect(getSecureGeminiApiKey()).toBe(sampleKey);

    clearSecureGeminiApiKey();
    expect(getSecureGeminiApiKey()).toBe('');
    expect(getInMemoryApiKey()).toBeNull();
    expect(localStorage.getItem('vibe_gemini_api_key_secure_v1')).toBeNull();
    expect(localStorage.getItem(ENCRYPTED_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('vibe_gemini_api_key')).toBeNull();

    const legacy = JSON.parse(localStorage.getItem('vibe_engine_config') || '{}');
    expect(legacy.apiKey).toBe('');
  });

  it('7. In-Memory Isolation: clearInMemoryApiKey purges key from memory on lock', async () => {
    await setSecureGeminiApiKey(sampleKey);
    expect(getInMemoryApiKey()).toBe(sampleKey);

    // Immediately purge memory
    clearInMemoryApiKey();
    expect(getInMemoryApiKey()).toBeNull();
  });
});
