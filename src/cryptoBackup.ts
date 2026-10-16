import {
  Transaction,
  EncryptedBackupPayload,
  UnencryptedBackupPayloadV2,
  CryptoBackupErrorCode
} from './types';

/**
 * ============================================================================
 * VIBE VAULT CRYPTOGRAPHIC BACKUP SUBSYSTEM (VVLT_V1 Specification)
 * ============================================================================
 * Cryptographic Decisions & Threat Mitigation:
 * 1. Key Derivation (PBKDF2-SHA-256):
 *    - Hash: SHA-256 (precludes collisions / weak digests).
 *    - Iterations: 600,000 rounds (strictly aligned with OWASP recommendations
 *      for high-entropy master key derivation to thwart GPU/ASIC brute force).
 *    - Salt: 16 cryptographically secure pseudo-random bytes (128 bits) per export.
 * 2. Authenticated Encryption (AES-GCM-256):
 *    - Key Size: 256 bits for quantum-resistant symmetric confidentiality.
 *    - IV / Nonce: 12 bytes (96 bits) unique per operation; never reused.
 *    - Authentication Tag: 128 bits (explicit tagLength: 128) ensuring cryptographic
 *      integrity and tamper-evidence (AEAD).
 * 3. Tamper-Evident Binary & Armored Envelope:
 *    - Magic Bytes: "VVLT_V1" (7 ASCII bytes) + 1 byte Algorithm ID (0x01).
 *    - 4 bytes big-endian iteration counter + 16-byte salt + 12-byte IV.
 *    - Strict fail-closed error handling with typed classification.
 * ============================================================================
 */

export const MAGIC_HEADER = 'VVLT_V1'; // 7 ASCII bytes
export const ALGORITHM_ID_PBKDF2_SHA256_AES256GCM = 0x01; // 1 byte
export const SALT_BYTE_LENGTH = 16; // 128 bits
export const IV_BYTE_LENGTH = 12; // 96 bits (standard optimal GCM nonce)
export const TAG_BIT_LENGTH = 128; // 128-bit MAC tag
export const BINARY_HEADER_BYTE_LENGTH = 40; // 7(magic) + 1(algo) + 4(iter) + 16(salt) + 12(iv)
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
export const MIN_PBKDF2_ITERATIONS = 600_000;

/**
 * Typed Cryptographic Backup Error
 */
export class CryptoBackupError extends Error {
  code: CryptoBackupErrorCode;

  constructor(code: CryptoBackupErrorCode, message: string) {
    super(message);
    this.name = 'CryptoBackupError';
    this.code = code;
    Object.setPrototypeOf(this, CryptoBackupError.prototype);
  }
}

/**
 * Platform-independent Web Crypto resolver (Node.js & Browsers)
 */
function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'Web Crypto API is not supported in this runtime.');
}

function getSubtle(): SubtleCrypto {
  const c = getCrypto();
  if (!c.subtle) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'SubtleCrypto is not available.');
  }
  return c.subtle;
}

/**
 * Universal Byte / Hex / Base64 conversion helpers
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBuffer(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '올바르지 않은 16진수(Hex) 형식입니다.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new CryptoBackupError('CORRUPTED_PAYLOAD', '16진수 데이터에 유효하지 않은 문자가 포함되어 있습니다.');
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  if (typeof base64 !== 'string' || base64.trim().length === 0) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'Base64 페이로드가 비어 있거나 올바르지 않습니다.');
  }
  try {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(base64, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const binary = globalThis.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'Base64 디코딩에 실패했습니다.');
  }
}

/**
 * Derives a 256-bit AES-GCM key using PBKDF2-SHA-256
 */
export async function deriveKey(
  passphrase: string,
  saltBytes: Uint8Array,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length === 0) {
    throw new CryptoBackupError('EMPTY_PASSPHRASE', '비밀번호를 입력해주세요.');
  }
  if (saltBytes.length < SALT_BYTE_LENGTH) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', `솔트 크기가 부족합니다 (${saltBytes.length} 바이트).`);
  }

  const subtle = getSubtle();
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);

  // Import raw password as key material for derivation
  const keyMaterial = await subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive AES-GCM 256-bit key
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Serializes raw cryptographic components into a tamper-evident binary envelope:
 * [0..6]:   "VVLT_V1" (7 bytes)
 * [7]:      Algorithm ID = 0x01 (1 byte)
 * [8..11]:  Iterations (4 bytes Uint32 BE)
 * [12..27]: Salt (16 bytes)
 * [28..39]: IV (12 bytes)
 * [40..]:   Ciphertext + 16-byte Auth Tag
 */
export function serializeBinaryEnvelope(
  iterations: number,
  salt: Uint8Array,
  iv: Uint8Array,
  ciphertextWithTag: Uint8Array
): Uint8Array {
  if (salt.length !== SALT_BYTE_LENGTH) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '솔트 크기가 16바이트가 아닙니다.');
  }
  if (iv.length !== IV_BYTE_LENGTH) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'IV 크기가 12바이트가 아닙니다.');
  }
  if (ciphertextWithTag.length < 16) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '암호문이 너무 짧습니다 (인증 태그 포함 최소 16바이트).');
  }

  const totalLength = BINARY_HEADER_BYTE_LENGTH + ciphertextWithTag.length;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // Magic bytes "VVLT_V1"
  const magicBytes = new TextEncoder().encode(MAGIC_HEADER);
  buffer.set(magicBytes, 0);

  // Algorithm ID
  view.setUint8(7, ALGORITHM_ID_PBKDF2_SHA256_AES256GCM);

  // Iterations count (Uint32 big-endian)
  view.setUint32(8, iterations, false);

  // Salt (16 bytes)
  buffer.set(salt, 12);

  // IV (12 bytes)
  buffer.set(iv, 28);

  // Ciphertext with trailing 128-bit authentication tag
  buffer.set(ciphertextWithTag, BINARY_HEADER_BYTE_LENGTH);

  return buffer;
}

export interface DeserializedBinaryEnvelope {
  magic: string;
  algorithmId: number;
  iterations: number;
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertextWithTag: Uint8Array;
}

/**
 * Validates and parses a raw binary envelope
 */
export function deserializeBinaryEnvelope(data: Uint8Array | ArrayBuffer): DeserializedBinaryEnvelope {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  if (bytes.length < BINARY_HEADER_BYTE_LENGTH + 16) {
    throw new CryptoBackupError(
      'CORRUPTED_PAYLOAD',
      `백업 데이터 크기가 유효 헤더 크기보다 작습니다 (${bytes.length} 바이트).`
    );
  }

  const magicText = new TextDecoder('ascii').decode(bytes.subarray(0, 7));
  if (magicText !== MAGIC_HEADER) {
    throw new CryptoBackupError(
      'UNSUPPORTED_VERSION',
      `지원하지 않는 백업 파일 포맷이거나 서명이 일치하지 않습니다. (Found: ${magicText})`
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const algorithmId = view.getUint8(7);
  if (algorithmId !== ALGORITHM_ID_PBKDF2_SHA256_AES256GCM) {
    throw new CryptoBackupError(
      'UNSUPPORTED_VERSION',
      `지원하지 않는 암호화 알고리즘 식별자입니다: 0x${algorithmId.toString(16)}`
    );
  }

  const iterations = view.getUint32(8, false);
  if (iterations < 1000) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', `비정상적인 KDF 반복 횟수입니다: ${iterations}`);
  }

  const salt = bytes.slice(12, 28);
  const iv = bytes.slice(28, 40);
  const ciphertextWithTag = bytes.slice(BINARY_HEADER_BYTE_LENGTH);

  return {
    magic: magicText,
    algorithmId,
    iterations,
    salt,
    iv,
    ciphertextWithTag
  };
}

/**
 * Checks if binary buffer begins with VVLT_V1 magic header
 */
export function isBinaryEnvelope(data: Uint8Array | ArrayBuffer): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 7) return false;
  const magic = new TextDecoder('ascii').decode(bytes.subarray(0, 7));
  return magic === MAGIC_HEADER;
}

export interface EncryptBackupOptions {
  iterations?: number;
  appName?: string;
}

/**
 * Encrypts backup data into both an armored JSON payload and binary envelope
 * Hardened with PBKDF2-SHA-256 (600,000 iterations default) and AES-GCM-256 (tagLength: 128)
 */
export async function encryptBackupData(
  payload: UnencryptedBackupPayloadV2,
  passphrase: string,
  options?: EncryptBackupOptions
): Promise<EncryptedBackupPayload> {
  const trimmedPass = passphrase ? passphrase.trim() : '';
  if (!trimmedPass) {
    throw new CryptoBackupError('EMPTY_PASSPHRASE', '암호화할 비밀번호를 입력해주세요.');
  }

  const crypto = getCrypto();
  const subtle = getSubtle();
  const iterations = options?.iterations ?? DEFAULT_PBKDF2_ITERATIONS;

  if (iterations < 1000) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '반복 횟수가 너무 낮습니다.');
  }

  // 1. Generate cryptographically secure 16-byte salt and unique 12-byte IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  // 2. Derive key via PBKDF2-SHA-256
  const key = await deriveKey(trimmedPass, salt, iterations);

  // 3. Serialize JSON plaintext
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));

  // 4. Authenticated Encryption with AES-GCM-256 (Explicit 128-bit MAC tag)
  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: TAG_BIT_LENGTH
    },
    key,
    plaintextBytes
  );

  const ciphertextWithTag = new Uint8Array(ciphertextBuffer);

  // 5. Build tamper-evident binary envelope
  const binaryEnvelope = serializeBinaryEnvelope(iterations, salt, iv, ciphertextWithTag);

  // Key verification commitment to distinguish invalid passphrase vs tampered ciphertext
  const keyVerifierBytes = await subtle.digest(
    'SHA-256',
    enc.encode(`${trimmedPass}:${bufferToHex(salt)}`)
  );
  const keyVerifier = bufferToHex(keyVerifierBytes);

  return {
    version: MAGIC_HEADER,
    format: 'vibe-vault-encrypted-v1',
    kdf: 'PBKDF2-SHA-256',
    cipher: 'AES-GCM-256',
    iterations,
    tagLength: TAG_BIT_LENGTH,
    magic: MAGIC_HEADER,
    salt: bufferToHex(salt),
    iv: bufferToHex(iv),
    ciphertext: bufferToBase64(ciphertextWithTag),
    rawBinaryBase64: bufferToBase64(binaryEnvelope),
    createdAt: new Date().toISOString(),
    keyVerifier,
    meta: {
      transactionCount: payload.transactions?.length || 0,
      appName: options?.appName || 'Vibe Vault Pro',
      envelope: 'armored-json',
      keyVerifier
    }
  };
}

/**
 * Convenience helper to encrypt directly to a raw binary Uint8Array blob
 */
export async function encryptBackupToBinary(
  payload: UnencryptedBackupPayloadV2,
  passphrase: string,
  options?: EncryptBackupOptions
): Promise<Uint8Array> {
  const armored = await encryptBackupData(payload, passphrase, options);
  const salt = hexToBuffer(armored.salt);
  const iv = hexToBuffer(armored.iv);
  const ciphertext = base64ToBuffer(armored.ciphertext);
  return serializeBinaryEnvelope(armored.iterations, salt, iv, ciphertext);
}

export interface EncryptedExportResult {
  filename: string;
  dataUrl: string;
  encryptedPayload: EncryptedBackupPayload;
}

/**
 * Enforces encrypted export in cryptoBackup.ts using AES-GCM, preventing unencrypted plaintext financial leaks.
 * Strictly requires a non-empty master passphrase.
 * If passphrase is empty or missing, throws a typed CryptoBackupError('EMPTY_PASSPHRASE').
 */
export async function exportEncryptedBackup(
  payload: UnencryptedBackupPayloadV2,
  passphrase: string,
  options?: EncryptBackupOptions
): Promise<EncryptedExportResult> {
  const trimmed = passphrase ? passphrase.trim() : '';
  if (!trimmed) {
    throw new CryptoBackupError(
      'EMPTY_PASSPHRASE',
      '금융 데이터 보안 정책: 평문 유출 방지를 위해 AES-GCM 암호화 비밀번호가 반드시 필요합니다.'
    );
  }

  const encrypted = await encryptBackupData(payload, trimmed, options);
  const jsonStr = JSON.stringify(encrypted, null, 2);
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `vibe-vault-backup-encrypted-${dateStr}.vibe.enc`;

  return {
    filename,
    dataUrl,
    encryptedPayload: encrypted
  };
}

/**
 * Strict policy validator: Enforces that any exported payload MUST be authenticated and encrypted using AES-GCM-256.
 * Rejects unencrypted payloads or attempts to leak plaintext financial records.
 */
export function enforceEncryptedExport(
  data: EncryptedBackupPayload | UnencryptedBackupPayloadV2
): data is EncryptedBackupPayload {
  if (!data || typeof data !== 'object') {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '유효하지 않은 백업 데이터 객체입니다.');
  }

  const isEncrypted =
    ('ciphertext' in data && typeof (data as any).ciphertext === 'string' && (data as any).ciphertext.length > 0) &&
    ('cipher' in data && (data as any).cipher === 'AES-GCM-256') &&
    ('magic' in data && (data as any).magic === MAGIC_HEADER);

  if (!isEncrypted) {
    throw new CryptoBackupError(
      'CORRUPTED_PAYLOAD',
      'UNENCRYPTED_EXPORT_REJECTED: 금융 데이터 평문 유출을 방지하기 위해 오직 AES-GCM 암호화된 백업만 허용됩니다.'
    );
  }

  return true;
}

/**
 * Security Assertion: Permanently prevents unencrypted plaintext exports.
 */
export function preventUnencryptedExport(): never {
  throw new CryptoBackupError(
    'CORRUPTED_PAYLOAD',
    'UNENCRYPTED_EXPORT_BLOCKED: 평문 금융 데이터 내보내기는 차단되었습니다. AES-GCM 암호화를 사용하십시오.'
  );
}

/**
 * Universal Resilient Decryptor:
 * Accepts:
 *  - Uint8Array / ArrayBuffer (Binary .enc file)
 *  - EncryptedBackupPayload (Armored JSON object)
 *  - string (JSON string, raw binary base64, or text)
 *
 * Implements strict format validation, version checking, and fail-closed MAC tag verification.
 */
export async function decryptBackupData(
  input: EncryptedBackupPayload | Uint8Array | ArrayBuffer | string,
  passphrase: string
): Promise<UnencryptedBackupPayloadV2> {
  const trimmedPass = passphrase ? passphrase.trim() : '';
  if (!trimmedPass) {
    throw new CryptoBackupError('EMPTY_PASSPHRASE', '복호화 비밀번호를 입력해주세요.');
  }

  const subtle = getSubtle();
  let saltBytes: Uint8Array;
  let ivBytes: Uint8Array;
  let ciphertextBytes: Uint8Array;
  let iterations = DEFAULT_PBKDF2_ITERATIONS;

  // 1. Resolve and validate input envelope
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const parsed = deserializeBinaryEnvelope(bytes);
    saltBytes = parsed.salt;
    ivBytes = parsed.iv;
    ciphertextBytes = parsed.ciphertextWithTag;
    iterations = parsed.iterations;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    // Check if it is a stringified JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed) as EncryptedBackupPayload;
        return await decryptBackupData(json, trimmedPass);
      } catch (e: any) {
        if (e instanceof CryptoBackupError) throw e;
        throw new CryptoBackupError('CORRUPTED_PAYLOAD', '백업 JSON 형식이 올바르지 않습니다.');
      }
    }

    // Check if it is raw base64 of binary envelope
    try {
      const bytes = base64ToBuffer(trimmed);
      if (isBinaryEnvelope(bytes)) {
        return await decryptBackupData(bytes, trimmedPass);
      }
    } catch {
      // Not base64 binary envelope, continue to error
    }

    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '인식할 수 없는 백업 데이터 문자열입니다.');
  } else if (typeof input === 'object' && input !== null) {
    // If explicit ciphertext/salt/iv are present, validate and use them
    if (!input.ciphertext && input.rawBinaryBase64) {
      try {
        const rawBuf = base64ToBuffer(input.rawBinaryBase64);
        if (isBinaryEnvelope(rawBuf)) {
          return await decryptBackupData(rawBuf, trimmedPass);
        }
      } catch {
        // Fallback to field extraction below
      }
    }

    // Format & Version Validation
    const format = input.format || '';
    const version = input.version || '';
    const isHardenedV1 = format === 'vibe-vault-encrypted-v1' || version === MAGIC_HEADER || input.magic === MAGIC_HEADER;
    const isLegacyV2 = format === 'vibe-encrypted-v2' || version === '2.0';

    if (!isHardenedV1 && !isLegacyV2) {
      throw new CryptoBackupError(
        'UNSUPPORTED_VERSION',
        `지원하지 않는 백업 파일 포맷입니다 (Format: ${format}, Version: ${version}).`
      );
    }

    if (!input.salt || !input.iv || !input.ciphertext) {
      throw new CryptoBackupError('CORRUPTED_PAYLOAD', '필수 암호화 메타데이터(salt, iv, ciphertext)가 누락되었습니다.');
    }

    try {
      saltBytes = hexToBuffer(input.salt);
      ivBytes = hexToBuffer(input.iv);
      ciphertextBytes = base64ToBuffer(input.ciphertext);
    } catch (e: any) {
      if (e instanceof CryptoBackupError) throw e;
      throw new CryptoBackupError('CORRUPTED_PAYLOAD', '암호화 필드 디코딩에 실패했습니다.');
    }

    iterations = input.iterations || (isLegacyV2 ? 100_000 : DEFAULT_PBKDF2_ITERATIONS);

    // Consistency check: If both ciphertext and rawBinaryBase64 are present, verify they match
    if (input.ciphertext && input.rawBinaryBase64) {
      try {
        const rawBuf = base64ToBuffer(input.rawBinaryBase64);
        if (isBinaryEnvelope(rawBuf) && rawBuf.length >= BINARY_HEADER_BYTE_LENGTH + 16) {
          const binaryCiphertext = rawBuf.subarray(BINARY_HEADER_BYTE_LENGTH);
          const givenCiphertext = base64ToBuffer(input.ciphertext);
          if (
            binaryCiphertext.length !== givenCiphertext.length ||
            !binaryCiphertext.every((b, idx) => b === givenCiphertext[idx])
          ) {
            throw new CryptoBackupError(
              'TAMPERED_PAYLOAD',
              '암호문 페이로드와 바이너리 엔벨로프가 일치하지 않아 데이터 변조가 감지되었습니다.'
            );
          }
        }
      } catch (e: any) {
        if (e instanceof CryptoBackupError) throw e;
      }
    }
  } else {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '유효하지 않은 백업 입력입니다.');
  }

  // Sanity checks on cryptographic components
  if (saltBytes.length < 8) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '솔트 길이가 유효하지 않습니다.');
  }
  if (ivBytes.length < 12) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', 'IV(초기화 벡터) 길이가 유효하지 않습니다.');
  }
  if (ciphertextBytes.length < 16) {
    throw new CryptoBackupError('CORRUPTED_PAYLOAD', '암호문이 손상되었거나 인증 태그가 누락되었습니다.');
  }

  // 1.5. Validate passphrase against keyVerifier if present in payload
  let isPassphraseVerified = false;
  const expectedVerifier = (typeof input === 'object' && input !== null)
    ? ((input as any).keyVerifier || (input as any).meta?.keyVerifier)
    : undefined;

  if (expectedVerifier) {
    const enc = new TextEncoder();
    const candidateVerifierBytes = await subtle.digest(
      'SHA-256',
      enc.encode(`${trimmedPass}:${bufferToHex(saltBytes)}`)
    );
    const candidateVerifier = bufferToHex(candidateVerifierBytes);
    if (candidateVerifier !== expectedVerifier) {
      throw new CryptoBackupError('INVALID_PASSPHRASE', '비밀번호가 올바르지 않습니다.');
    }
    isPassphraseVerified = true;
  }

  // 2. Key Derivation with PBKDF2-SHA-256
  const key = await deriveKey(trimmedPass, saltBytes, iterations);

  // 3. Authenticated Decryption with AES-GCM
  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes,
        tagLength: TAG_BIT_LENGTH
      },
      key,
      ciphertextBytes
    );
  } catch {
    // AEAD MAC tag mismatch triggers OperationError upon wrong password or tampered ciphertext
    if (isPassphraseVerified) {
      throw new CryptoBackupError(
        'TAMPERED_PAYLOAD',
        '암호화된 데이터가 변조되어 무결성 검증에 실패했습니다 (TAMPERED_PAYLOAD).'
      );
    }
    throw new CryptoBackupError(
      'INVALID_PASSPHRASE',
      '비밀번호가 올바르지 않거나 데이터가 변조되어 인증 태그 검증에 실패했습니다.'
    );
  }

  // 4. Parse decrypted JSON
  try {
    const dec = new TextDecoder();
    const jsonStr = dec.decode(decryptedBuffer);
    return JSON.parse(jsonStr) as UnencryptedBackupPayloadV2;
  } catch {
    throw new CryptoBackupError(
      'CORRUPTED_PAYLOAD',
      '복호화된 데이터가 유효한 JSON 백업 형식이 아닙니다.'
    );
  }
}

/**
 * Smart Differential Merge Utility
 * Merges imported transactions with existing records, deduplicating by ID or timestamp+amount+description.
 */
export function mergeTransactionsDeduplicated(
  existingList: Transaction[],
  incomingList: Transaction[],
  mode: 'merge' | 'overwrite' = 'merge'
): {
  finalTransactions: Transaction[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
} {
  if (mode === 'overwrite') {
    return {
      finalTransactions: incomingList,
      addedCount: incomingList.length,
      updatedCount: 0,
      skippedCount: 0
    };
  }

  const existingMap = new Map<string, Transaction>();
  const contentFingerprints = new Set<string>();

  for (const t of existingList) {
    existingMap.set(t.id, t);
    // Fingerprint: date_minute + amount + description
    const dateMinute = t.date ? t.date.substring(0, 16) : '';
    const fp = `${dateMinute}_${t.amount}_${t.description.trim().toLowerCase()}`;
    contentFingerprints.add(fp);
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const resultList = [...existingList];

  for (const incoming of incomingList) {
    if (existingMap.has(incoming.id)) {
      // Update existing item
      const idx = resultList.findIndex(t => t.id === incoming.id);
      if (idx >= 0) {
        resultList[idx] = incoming;
        updatedCount++;
      }
    } else {
      const incomingMinute = incoming.date ? incoming.date.substring(0, 16) : '';
      const fp = `${incomingMinute}_${incoming.amount}_${incoming.description.trim().toLowerCase()}`;
      if (contentFingerprints.has(fp)) {
        // Skip duplicate identical transaction
        skippedCount++;
      } else {
        resultList.push(incoming);
        contentFingerprints.add(fp);
        addedCount++;
      }
    }
  }

  // Sort newest first
  resultList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    finalTransactions: resultList,
    addedCount,
    updatedCount,
    skippedCount
  };
}
