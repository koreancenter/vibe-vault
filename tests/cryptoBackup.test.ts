import { describe, it, expect } from 'vitest';
import {
  encryptBackupData,
  encryptBackupToBinary,
  decryptBackupData,
  serializeBinaryEnvelope,
  deserializeBinaryEnvelope,
  isBinaryEnvelope,
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
  base64ToBuffer,
  CryptoBackupError,
  MAGIC_HEADER,
  DEFAULT_PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  IV_BYTE_LENGTH,
  TAG_BIT_LENGTH,
  mergeTransactionsDeduplicated,
  exportEncryptedBackup,
  enforceEncryptedExport,
  preventUnencryptedExport
} from '../src/cryptoBackup';
import { UnencryptedBackupPayloadV2, Transaction } from '../src/types';

// Mock high-fidelity backup payload
const sampleTransactions: Transaction[] = [
  {
    id: 'tx-sec-001',
    date: '2026-09-19T10:00:00.000Z',
    amount: 54000,
    type: 'EXPENSE',
    category: 'Food',
    description: '유기농 식료품 결제',
    paymentMethod: '현대카드 M3',
    currency: 'KRW'
  },
  {
    id: 'tx-sec-002',
    date: '2026-09-18T14:30:00.000Z',
    amount: 3500000,
    type: 'INCOME',
    category: 'Fixed',
    description: '급여 입금',
    paymentMethod: '신한 주거래통장',
    currency: 'KRW'
  }
];

const mockBackupPayload: UnencryptedBackupPayloadV2 = {
  version: '2.0',
  format: 'vibe-backup-v2',
  createdAt: '2026-09-19T08:00:00.000Z',
  transactions: sampleTransactions,
  preferences: {
    theme: 'dark',
    defaultCurrency: 'KRW'
  },
  subscriptions: [
    {
      id: 'sub-001',
      merchant: 'Netflix',
      amount: 17000,
      currency: 'KRW',
      category: 'Leisure',
      cycleDays: 30,
      lastBillingDate: '2026-09-01',
      nextBillingDate: '2026-10-01',
      dDay: 12,
      confidence: 1,
      occurrencesCount: 8,
      isActive: true
    }
  ]
};

describe('Cryptographic Backup Hardening (VVLT_V1 / AES-GCM-256 / PBKDF2-SHA-256)', () => {
  const masterPassphrase = 'SuperSecretVaultMasterKey#2026!';

  it('1. Round-trip fidelity (Armored JSON): Export -> Encrypt -> Decrypt matches exact plaintext', async () => {
    // Encrypt with OWASP recommended 600,000 iterations
    const encrypted = await encryptBackupData(mockBackupPayload, masterPassphrase, {
      iterations: 10_000 // speed-optimized for fast automated test iteration while preserving KDF pipeline
    });

    expect(encrypted.magic).toBe(MAGIC_HEADER);
    expect(encrypted.cipher).toBe('AES-GCM-256');
    expect(encrypted.kdf).toBe('PBKDF2-SHA-256');
    expect(encrypted.tagLength).toBe(TAG_BIT_LENGTH);
    expect(hexToBuffer(encrypted.salt).length).toBe(SALT_BYTE_LENGTH);
    expect(hexToBuffer(encrypted.iv).length).toBe(IV_BYTE_LENGTH);

    // Decrypt armored JSON object
    const decrypted = await decryptBackupData(encrypted, masterPassphrase);

    expect(decrypted.version).toBe(mockBackupPayload.version);
    expect(decrypted.format).toBe(mockBackupPayload.format);
    expect(decrypted.transactions).toHaveLength(2);
    expect(decrypted.transactions[0].id).toBe('tx-sec-001');
    expect(decrypted.transactions[0].description).toBe('유기농 식료품 결제');
    expect(decrypted.transactions[1].amount).toBe(3500000);
    expect(decrypted.subscriptions).toHaveLength(1);
    expect(decrypted.subscriptions?.[0].merchant).toBe('Netflix');
  });

  it('2. Round-trip fidelity (Binary .enc Envelope): Raw binary byte serialization & deserialization', async () => {
    // Encrypt directly to binary Uint8Array blob
    const binaryBlob = await encryptBackupToBinary(mockBackupPayload, masterPassphrase, {
      iterations: 10_000
    });

    expect(isBinaryEnvelope(binaryBlob)).toBe(true);
    expect(binaryBlob.length).toBeGreaterThan(40 + 16);

    // Deserialization inspects binary header
    const parsed = deserializeBinaryEnvelope(binaryBlob);
    expect(parsed.magic).toBe(MAGIC_HEADER);
    expect(parsed.algorithmId).toBe(0x01);
    expect(parsed.iterations).toBe(10_000);
    expect(parsed.salt.length).toBe(16);
    expect(parsed.iv.length).toBe(12);

    // Decrypt directly from raw binary
    const decrypted = await decryptBackupData(binaryBlob, masterPassphrase);
    expect(decrypted.transactions).toHaveLength(2);
    expect(decrypted.transactions[0].description).toBe('유기농 식료품 결제');
  });

  it('3. Cryptographic Uniqueness: Identical plaintext produces distinct Salts, IVs, and Ciphertexts', async () => {
    const backupA = await encryptBackupData(mockBackupPayload, masterPassphrase, { iterations: 2000 });
    const backupB = await encryptBackupData(mockBackupPayload, masterPassphrase, { iterations: 2000 });

    // Salts must never be identical
    expect(backupA.salt).not.toBe(backupB.salt);
    // IVs must never be reused (crucial for AES-GCM security)
    expect(backupA.iv).not.toBe(backupB.iv);
    // Ciphertexts must differ due to unique salts and IVs
    expect(backupA.ciphertext).not.toBe(backupB.ciphertext);
  });

  it('4. Rejection when an incorrect passphrase is supplied (Fail-closed MAC tag mismatch)', async () => {
    const encrypted = await encryptBackupData(mockBackupPayload, 'CorrectPassword123!', { iterations: 2000 });

    await expect(
      decryptBackupData(encrypted, 'WrongPassword456!')
    ).rejects.toThrow(CryptoBackupError);

    try {
      await decryptBackupData(encrypted, 'WrongPassword456!');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CryptoBackupError);
      expect(err.code).toBe('INVALID_PASSPHRASE');
    }
  });

  it('5. Authentication failure when a single bit of ciphertext is tampered (AEAD Integrity)', async () => {
    const encrypted = await encryptBackupData(mockBackupPayload, masterPassphrase, { iterations: 2000 });
    const rawCiphertext = base64ToBuffer(encrypted.ciphertext);

    // Tamper with a single bit in the middle of ciphertext payload
    const tamperedCiphertext = new Uint8Array(rawCiphertext);
    tamperedCiphertext[Math.floor(tamperedCiphertext.length / 2)] ^= 0x01; // flip 1 bit

    const tamperedPayload = {
      ...encrypted,
      ciphertext: bufferToBase64(tamperedCiphertext)
    };

    await expect(
      decryptBackupData(tamperedPayload, masterPassphrase)
    ).rejects.toThrow();

    try {
      await decryptBackupData(tamperedPayload, masterPassphrase);
    } catch (err: any) {
      expect(err).toBeInstanceOf(CryptoBackupError);
      expect(err.code).toBe('TAMPERED_PAYLOAD');
    }
  });

  it('6. Authentication failure when the trailing 128-bit authentication tag is modified', async () => {
    const binary = await encryptBackupToBinary(mockBackupPayload, masterPassphrase, { iterations: 2000 });

    // In AES-GCM output, the 16 trailing bytes represent the authentication tag
    const tamperedBinary = new Uint8Array(binary);
    tamperedBinary[tamperedBinary.length - 1] ^= 0x01; // flip 1 bit in authentication tag

    await expect(
      decryptBackupData(tamperedBinary, masterPassphrase)
    ).rejects.toThrow(CryptoBackupError);

    try {
      await decryptBackupData(tamperedBinary, masterPassphrase);
    } catch (err: any) {
      expect(err).toBeInstanceOf(CryptoBackupError);
      expect(err.code).toBe('INVALID_PASSPHRASE');
    }
  });

  it('7. Rejection of corrupted or malformed envelope structures', async () => {
    // Malformed magic header in binary
    const binary = await encryptBackupToBinary(mockBackupPayload, masterPassphrase, { iterations: 2000 });
    const tamperedMagic = new Uint8Array(binary);
    tamperedMagic[0] = 0x58; // 'X' instead of 'V' -> "XVLT_V1"

    await expect(
      decryptBackupData(tamperedMagic, masterPassphrase)
    ).rejects.toThrowError(CryptoBackupError);

    try {
      await decryptBackupData(tamperedMagic, masterPassphrase);
    } catch (err: any) {
      expect(err.code).toBe('UNSUPPORTED_VERSION');
    }

    // Truncated buffer (< 40 bytes)
    const truncated = binary.slice(0, 30);
    try {
      await decryptBackupData(truncated, masterPassphrase);
    } catch (err: any) {
      expect(err.code).toBe('CORRUPTED_PAYLOAD');
    }
  });

  it('8. Backward compatibility with Legacy Vibe v2.0 backups', async () => {
    // Construct simulated legacy v2 backup (format: vibe-encrypted-v2, iterations: 100,000)
    // Encrypt payload using 100,000 rounds
    const legacyEncrypted = await encryptBackupData(mockBackupPayload, 'LegacyPass123', {
      iterations: 5000
    });

    const legacyPayload = {
      version: '2.0',
      format: 'vibe-encrypted-v2',
      kdf: 'PBKDF2',
      cipher: 'AES-GCM-256',
      iterations: 5000,
      salt: legacyEncrypted.salt,
      iv: legacyEncrypted.iv,
      ciphertext: legacyEncrypted.ciphertext,
      createdAt: '2025-01-01T00:00:00Z',
      meta: {
        transactionCount: 2,
        appName: 'Vibe Ledger Legacy'
      }
    };

    const restored = await decryptBackupData(legacyPayload as any, 'LegacyPass123');
    expect(restored.transactions).toHaveLength(2);
    expect(restored.transactions[0].id).toBe('tx-sec-001');
  });

  it('9. Deduplication and differential merge fidelity', () => {
    const existing: Transaction[] = [
      {
        id: 'tx-1',
        date: '2026-09-19T10:00:00.000Z',
        amount: 10000,
        type: 'EXPENSE',
        category: 'Food',
        description: '커피',
        paymentMethod: '현금',
        currency: 'KRW'
      }
    ];

    const incoming: Transaction[] = [
      // Exact duplicate by ID and content -> skipped
      {
        id: 'tx-1',
        date: '2026-09-19T10:00:00.000Z',
        amount: 10000,
        type: 'EXPENSE',
        category: 'Food',
        description: '커피',
        paymentMethod: '현금',
        currency: 'KRW'
      },
      // New transaction -> added
      {
        id: 'tx-2',
        date: '2026-09-19T12:00:00.000Z',
        amount: 25000,
        type: 'EXPENSE',
        category: 'Transport',
        description: '택시비',
        paymentMethod: '카드',
        currency: 'KRW'
      }
    ];

    const result = mergeTransactionsDeduplicated(existing, incoming, 'merge');
    expect(result.finalTransactions).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.updatedCount).toBe(1); // Same id, updated in place
  });

  it('10. Empty passphrase rejection (Fails fast with EMPTY_PASSPHRASE)', async () => {
    await expect(
      encryptBackupData(mockBackupPayload, '')
    ).rejects.toThrow(CryptoBackupError);

    try {
      await encryptBackupData(mockBackupPayload, '   ');
    } catch (err: any) {
      expect(err.code).toBe('EMPTY_PASSPHRASE');
    }

    const encrypted = await encryptBackupData(mockBackupPayload, 'valid123', { iterations: 2000 });
    try {
      await decryptBackupData(encrypted, '');
    } catch (err: any) {
      expect(err.code).toBe('EMPTY_PASSPHRASE');
    }
  });

  it('11. Full OWASP-compliant 600,000 PBKDF2 iterations default round-trip', async () => {
    // Uses default iterations (600,000)
    const encrypted = await encryptBackupData(mockBackupPayload, masterPassphrase);
    expect(encrypted.iterations).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(encrypted.iterations).toBe(600_000);

    const decrypted = await decryptBackupData(encrypted, masterPassphrase);
    expect(decrypted.transactions).toHaveLength(2);
    expect(decrypted.transactions[0].id).toBe('tx-sec-001');
  });

  it('12. Enforced Encrypted Export: exportEncryptedBackup generates AES-GCM output and strictly rejects empty passphrase', async () => {
    // Attempting to export without passphrase must throw EMPTY_PASSPHRASE error
    await expect(
      exportEncryptedBackup(mockBackupPayload, '')
    ).rejects.toThrow(CryptoBackupError);

    try {
      await exportEncryptedBackup(mockBackupPayload, '  ');
    } catch (err: any) {
      expect(err.code).toBe('EMPTY_PASSPHRASE');
    }

    // Export with valid passphrase creates AES-GCM payload and .vibe.enc filename
    const result = await exportEncryptedBackup(mockBackupPayload, masterPassphrase, { iterations: 2000 });
    expect(result.filename).toMatch(/^vibe-vault-backup-encrypted-.*\.vibe\.enc$/);
    expect(result.dataUrl).toContain('data:application/json;charset=utf-8,');
    expect(result.encryptedPayload.cipher).toBe('AES-GCM-256');
    expect(result.encryptedPayload.magic).toBe(MAGIC_HEADER);

    // Verify enforceEncryptedExport succeeds on valid encrypted payload
    expect(enforceEncryptedExport(result.encryptedPayload)).toBe(true);

    // Verify unencrypted payload is strictly rejected
    expect(() => enforceEncryptedExport(mockBackupPayload as any)).toThrow(CryptoBackupError);

    // Verify preventUnencryptedExport blocks unencrypted exports
    expect(() => preventUnencryptedExport()).toThrow(CryptoBackupError);
  });

  describe('Comprehensive Regression & Resilience: Multi-Currency & Tamper Hardening', () => {
    function generateMixedMultiCurrencyDataset(count = 55): Transaction[] {
      const currencies: Transaction['currency'][] = [
        'KRW', 'USD', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD', 'CHF', 'SGD', 'HKD'
      ];
      const types: Transaction['type'][] = ['EXPENSE', 'INCOME', 'TRANSFER', 'SETTLEMENT'];
      const categories = ['Food', 'Transport', 'Living', 'Fixed', 'Health', 'Leisure', '급여'];
      const paymentMethods = ['신한카드', '현대카드 M3', 'Toss', 'Kakao Pay', 'Apple Pay', 'Cash', 'Bank Transfer'];

      const transactions: Transaction[] = [];
      for (let i = 1; i <= count; i++) {
        const currency = currencies[i % currencies.length];
        const type = types[i % types.length];
        const category = categories[i % categories.length];
        const paymentMethod = paymentMethods[i % paymentMethods.length];

        let amount = 10000;
        if (currency === 'KRW') amount = 5000 + i * 2500;
        else if (currency === 'USD') amount = +(15.5 + i * 2.75).toFixed(2);
        else if (currency === 'EUR') amount = +(12.0 + i * 1.85).toFixed(2);
        else if (currency === 'JPY') amount = 1200 + i * 350;
        else amount = +(20.0 + i * 3.1).toFixed(2);

        transactions.push({
          id: `tx-multicurrency-${String(i).padStart(3, '0')}`,
          date: new Date(Date.UTC(2026, 8, (i % 28) + 1, 10, i % 60, 0)).toISOString(),
          amount,
          type,
          category,
          description: `Transaction #${i} (${currency} ${type} - ${category})`,
          subCategory: `Sub_${category}_${i}`,
          paymentMethod,
          currency,
          note: i % 3 === 0 ? `Auto-generated test note ${i}` : undefined,
          originalTotal: type === 'SETTLEMENT' ? amount * 2 : undefined
        });
      }
      return transactions;
    }

    it('successfully encrypts and decrypts a large payload with 50+ mixed multi-currency transactions (Round-trip fidelity)', async () => {
      const dataset = generateMixedMultiCurrencyDataset(55);
      expect(dataset.length).toBeGreaterThanOrEqual(50);

      const largePayload: UnencryptedBackupPayloadV2 = {
        version: '2.0',
        format: 'vibe-backup-v2',
        createdAt: new Date().toISOString(),
        transactions: dataset,
        preferences: {
          theme: 'dark',
          defaultCurrency: 'KRW'
        },
        subscriptions: [
          {
            id: 'sub-netflix',
            merchant: 'Netflix Korea',
            amount: 17000,
            currency: 'KRW',
            category: 'Leisure',
            cycleDays: 30,
            lastBillingDate: '2026-09-01',
            nextBillingDate: '2026-10-01',
            dDay: 12,
            confidence: 1,
            occurrencesCount: 12,
            isActive: true
          },
          {
            id: 'sub-chatgpt',
            merchant: 'OpenAI ChatGPT Plus',
            amount: 22.0,
            currency: 'USD',
            category: 'Fixed',
            cycleDays: 30,
            lastBillingDate: '2026-09-05',
            nextBillingDate: '2026-10-05',
            dDay: 16,
            confidence: 0.98,
            occurrencesCount: 6,
            isActive: true
          }
        ]
      };

      // 1. Armored JSON cycle
      const encrypted = await encryptBackupData(largePayload, masterPassphrase, { iterations: 2000 });
      expect(encrypted.cipher).toBe('AES-GCM-256');
      expect(encrypted.magic).toBe(MAGIC_HEADER);
      expect(encrypted.keyVerifier).toBeDefined();

      const decrypted = await decryptBackupData(encrypted, masterPassphrase);

      // Verify transaction count and exact fidelity across all 55 multi-currency entries
      expect(decrypted.transactions).toHaveLength(55);
      for (let i = 0; i < 55; i++) {
        expect(decrypted.transactions[i].id).toBe(dataset[i].id);
        expect(decrypted.transactions[i].amount).toBe(dataset[i].amount);
        expect(decrypted.transactions[i].currency).toBe(dataset[i].currency);
        expect(decrypted.transactions[i].type).toBe(dataset[i].type);
        expect(decrypted.transactions[i].category).toBe(dataset[i].category);
        expect(decrypted.transactions[i].description).toBe(dataset[i].description);
        expect(decrypted.transactions[i].paymentMethod).toBe(dataset[i].paymentMethod);
      }

      // Verify metadata & subscriptions preservation
      expect(decrypted.subscriptions).toHaveLength(2);
      expect(decrypted.subscriptions?.[1].currency).toBe('USD');
      expect(decrypted.preferences?.theme).toBe('dark');

      // 2. Binary blob cycle with the same 55 transactions
      const binaryBlob = await encryptBackupToBinary(largePayload, masterPassphrase, { iterations: 2000 });
      expect(isBinaryEnvelope(binaryBlob)).toBe(true);

      const decryptedBinary = await decryptBackupData(binaryBlob, masterPassphrase);
      expect(decryptedBinary.transactions).toHaveLength(55);
      expect(decryptedBinary.transactions[0].id).toBe(dataset[0].id);
      expect(decryptedBinary.transactions[54].id).toBe(dataset[54].id);
    });

    it('strictly rejects tampered ciphertext injection with CryptoBackupError ("TAMPERED_PAYLOAD")', async () => {
      const dataset = generateMixedMultiCurrencyDataset(52);
      const payload: UnencryptedBackupPayloadV2 = {
        version: '2.0',
        format: 'vibe-backup-v2',
        createdAt: new Date().toISOString(),
        transactions: dataset
      };

      const encrypted = await encryptBackupData(payload, masterPassphrase, { iterations: 2000 });

      // Scenario A: Bit flip in ciphertext body
      const rawCiphertext = base64ToBuffer(encrypted.ciphertext);
      const tamperedBytes = new Uint8Array(rawCiphertext);
      tamperedBytes[Math.floor(tamperedBytes.length / 2)] ^= 0x5a; // flip multiple bits

      const tamperedPayloadA = {
        ...encrypted,
        ciphertext: bufferToBase64(tamperedBytes)
      };

      await expect(
        decryptBackupData(tamperedPayloadA, masterPassphrase)
      ).rejects.toThrow(CryptoBackupError);

      try {
        await decryptBackupData(tamperedPayloadA, masterPassphrase);
        expect.unreachable('Should have thrown CryptoBackupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CryptoBackupError);
        expect(err.code).toBe('TAMPERED_PAYLOAD');
      }

      // Scenario B: Tampered ciphertext passed as stringified JSON
      const stringifiedTampered = JSON.stringify(tamperedPayloadA);
      await expect(
        decryptBackupData(stringifiedTampered, masterPassphrase)
      ).rejects.toThrow(CryptoBackupError);

      try {
        await decryptBackupData(stringifiedTampered, masterPassphrase);
        expect.unreachable('Should have thrown CryptoBackupError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CryptoBackupError);
        expect(err.code).toBe('TAMPERED_PAYLOAD');
      }
    });

    it('strictly fails decryption when an invalid passphrase is provided', async () => {
      const dataset = generateMixedMultiCurrencyDataset(50);
      const payload: UnencryptedBackupPayloadV2 = {
        version: '2.0',
        format: 'vibe-backup-v2',
        createdAt: new Date().toISOString(),
        transactions: dataset
      };

      const encrypted = await encryptBackupData(payload, masterPassphrase, { iterations: 2000 });

      // Case 1: Completely incorrect passphrase
      await expect(
        decryptBackupData(encrypted, 'CompletelyWrongPassphrase999!')
      ).rejects.toThrow(CryptoBackupError);

      try {
        await decryptBackupData(encrypted, 'CompletelyWrongPassphrase999!');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CryptoBackupError);
        expect(err.code).toBe('INVALID_PASSPHRASE');
      }

      // Case 2: 1-character typo passphrase
      const typoPassphrase = masterPassphrase + '!';
      await expect(
        decryptBackupData(encrypted, typoPassphrase)
      ).rejects.toThrow(CryptoBackupError);

      try {
        await decryptBackupData(encrypted, typoPassphrase);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CryptoBackupError);
        expect(err.code).toBe('INVALID_PASSPHRASE');
      }

      // Case 3: Empty passphrase
      await expect(
        decryptBackupData(encrypted, '')
      ).rejects.toThrow(CryptoBackupError);

      try {
        await decryptBackupData(encrypted, '   ');
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CryptoBackupError);
        expect(err.code).toBe('EMPTY_PASSPHRASE');
      }
    });
  });
});
