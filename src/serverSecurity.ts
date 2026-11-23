const MAX_TEXT_LENGTH = 20_000;
const MAX_IMAGE_BASE64_LENGTH = 7 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_RATE_LIMIT_ENTRIES = 5_000;

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com https://huggingface.co https://*.huggingface.co https://cloudflareinsights.com http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; img-src 'self' data: blob:; worker-src 'self' blob:;";

interface RateLimitWindow {
  startedAt: number;
  requestCount: number;
}

const rateLimitWindows = new Map<string, RateLimitWindow>();

export function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function isSameLocalOrigin(origin: string | undefined, requestHost: string): boolean {
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    return (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:')
      && isLocalHostname(parsedOrigin.hostname)
      && parsedOrigin.host.toLowerCase() === requestHost.toLowerCase();
  } catch {
    return false;
  }
}

export function isAllowedOrigin(
  origin: string | undefined,
  hostHeader: string | undefined,
  forwardedHostHeader?: string | undefined,
): boolean {
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
      return false;
    }

    const originHost = parsedOrigin.host.toLowerCase();
    const originHostname = parsedOrigin.hostname.toLowerCase();
    const host = (hostHeader || '').trim().toLowerCase();
    const forwardedHost = (forwardedHostHeader || '').split(',')[0]?.trim().toLowerCase() || '';

    if (host && originHost === host) return true;
    if (forwardedHost && originHost === forwardedHost) return true;
    if (originHostname.endsWith('.usercontent.goog')) return true;
    if (originHostname.endsWith('.pages.dev')) return true;
    if (isLocalHostname(originHostname)) return true;

    return false;
  } catch {
    return false;
  }
}

export function isValidEngineConfig(config: unknown): boolean {
  if (config === undefined || config === null) return true;
  if (typeof config !== 'object' || Array.isArray(config)) return false;

  const value = config as Record<string, unknown>;
  if (value.engineType !== undefined && value.engineType !== 'local' && value.engineType !== 'byok') {
    return false;
  }
  if (
    value.provider !== undefined
    && value.provider !== 'gemini'
    && value.provider !== 'openai'
    && value.provider !== 'anthropic'
  ) {
    return false;
  }
  if (value.engineType === 'byok' && value.provider === undefined) return false;
  if (value.apiKey !== undefined && (
    typeof value.apiKey !== 'string'
    || value.apiKey.length > 512
  )) {
    return false;
  }

  return true;
}

export function resolveGeminiApiKey(
  config: unknown,
  serverApiKey: string | undefined,
): string | undefined {
  if (config === undefined || config === null) return serverApiKey;
  if (typeof config !== 'object' || Array.isArray(config)) return undefined;

  const value = config as Record<string, unknown>;
  if (value.engineType === 'local') return undefined;
  if (value.provider !== undefined && value.provider !== 'gemini') return undefined;
  if (value.engineType === 'byok' && value.provider !== 'gemini') return undefined;
  return value.provider === 'gemini'
    && typeof value.apiKey === 'string'
    && value.apiKey.length > 0
    ? value.apiKey
    : serverApiKey;
}

export function isValidTextInput(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAX_TEXT_LENGTH;
}

export function isValidImageInput(image: unknown, mimeType: unknown): boolean {
  if (typeof image !== 'string' || image.length === 0 || image.length > MAX_IMAGE_BASE64_LENGTH) {
    return false;
  }

  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
    return false;
  }

  const match = image.match(/^(?:data:(image\/(?:jpeg|png|webp));base64,)?([A-Za-z0-9+/]+={0,2})$/);
  if (!match || (match[1] && match[1] !== mimeType)) return false;
  return match[2].length % 4 === 0;
}

function pruneExpiredRateLimits(now: number): void {
  for (const [key, entry] of rateLimitWindows.entries()) {
    if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitWindows.delete(key);
    }
  }
  if (rateLimitWindows.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = rateLimitWindows.keys().next().value;
    if (oldestKey !== undefined) {
      rateLimitWindows.delete(oldestKey);
    }
  }
}

export function consumeAiRequest(
  clientAddress: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const currentWindow = rateLimitWindows.get(clientAddress);
  if (!currentWindow || now - currentWindow.startedAt >= RATE_LIMIT_WINDOW_MS) {
    if (rateLimitWindows.size >= MAX_RATE_LIMIT_ENTRIES) {
      pruneExpiredRateLimits(now);
    }
    rateLimitWindows.set(clientAddress, { startedAt: now, requestCount: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (currentWindow.requestCount >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - currentWindow.startedAt)) / 1000,
    );
    return { allowed: false, retryAfterSeconds };
  }

  currentWindow.requestCount += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
