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
  maskApiKey,
  encryptApiKey,
  decryptApiKey,
  sanitizeApiKey,
  isValidGeminiKeyFormat
} from '../src/geminiKeyManager';

describe('Gemini Key Manager Security Hardening (Masking & Encrypted Storage)', () => {
  const sampleKey = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';

  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Masking: maskApiKey hides sensitive key middle characters with bullet characters', () => {
    const masked = maskApiKey(sampleKey);
    expect(masked.startsWith('AIza')).toBe(true);
    expect(masked.endsWith('5P6Q')).toBe(true);
    expect(masked).toContain('••••');
    expect(masked).not.toBe(sampleKey);
  });

  it('2. Encryption & Decryption: encryptApiKey produces encrypted non-plaintext with random IV', () => {
    const cipher1 = encryptApiKey(sampleKey);
    const cipher2 = encryptApiKey(sampleKey);

    // Must be encrypted with version prefix
    expect(cipher1.startsWith('enc_v2:')).toBe(true);
    expect(cipher1).not.toContain(sampleKey);

    // Unique random IV produces different ciphertext each time
    expect(cipher1).not.toBe(cipher2);

    // Decryption recovers exact key
    expect(decryptApiKey(cipher1)).toBe(sampleKey);
    expect(decryptApiKey(cipher2)).toBe(sampleKey);
  });

  it('3. Plaintext Exposure Prevention: setSecureGeminiApiKey stores cipher and masked key only', () => {
    setSecureGeminiApiKey(sampleKey);

    // Check secure storage
    const storedSecure = localStorage.getItem('vibe_gemini_api_key_secure_v1');
    expect(storedSecure).toBeDefined();
    expect(storedSecure).not.toContain(sampleKey); // NO plaintext!

    // Check legacy storage
    const storedLegacy = localStorage.getItem('vibe_engine_config');
    expect(storedLegacy).toBeDefined();
    const parsed = JSON.parse(storedLegacy!);
    expect(parsed.apiKey).not.toBe(sampleKey); // MUST NOT BE PLAINTEXT!
    expect(parsed.apiKey).toContain('•'); // MUST BE MASKED!
    expect(parsed.maskedApiKey).toContain('•');

    // Retrieve via secure reader returns unmasked active key
    const retrieved = getSecureGeminiApiKey();
    expect(retrieved).toBe(sampleKey);
  });

  it('4. Sanitization & Validation: Handles whitespace, quotes, and format checks', () => {
    expect(sanitizeApiKey('  "AIzaSy123"  ')).toBe('AIzaSy123');
    expect(isValidGeminiKeyFormat(sampleKey)).toBe(true);
    expect(isValidGeminiKeyFormat('invalid-key')).toBe(false);
  });

  it('5. Safe Clearing: clearSecureGeminiApiKey purges both storage keys cleanly', () => {
    setSecureGeminiApiKey(sampleKey);
    expect(getSecureGeminiApiKey()).toBe(sampleKey);

    clearSecureGeminiApiKey();
    expect(getSecureGeminiApiKey()).toBe('');
    expect(localStorage.getItem('vibe_gemini_api_key_secure_v1')).toBeNull();

    const legacy = JSON.parse(localStorage.getItem('vibe_engine_config') || '{}');
    expect(legacy.apiKey).toBe('');
  });
});
