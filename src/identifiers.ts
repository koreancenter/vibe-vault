export function generateSecureId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error('Cryptographically secure ID generation is unavailable.');
  }

  let value: string;
  if (typeof cryptoApi.randomUUID === 'function') {
    value = cryptoApi.randomUUID();
  } else {
    if (typeof cryptoApi.getRandomValues !== 'function') {
      throw new Error('Cryptographically secure ID generation is unavailable.');
    }
    value = Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (byte) => (
      byte.toString(16).padStart(2, '0')
    )).join('');
  }

  return `${prefix}-${value}`;
}
