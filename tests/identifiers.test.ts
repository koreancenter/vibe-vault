import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSecureId } from '../src/identifiers';

describe('secure ID generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the requested prefix to a UUID-shaped cryptographic ID', () => {
    expect(generateSecureId('record')).toMatch(
      /^record-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates distinct IDs for separate records', () => {
    expect(generateSecureId('record')).not.toBe(generateSecureId('record'));
  });

  it('uses secure random bytes when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    expect(generateSecureId('record')).toBe(`record-${'ab'.repeat(16)}`);
  });

  it('fails explicitly when secure random bytes are unavailable', () => {
    vi.stubGlobal('crypto', {});
    expect(() => generateSecureId('record')).toThrow(/secure ID generation is unavailable/);
  });
});
