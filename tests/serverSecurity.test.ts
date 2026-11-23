import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  consumeAiRequest,
  isAllowedOrigin,
  isLocalHostname,
  isSameLocalOrigin,
  isValidEngineConfig,
  isValidImageInput,
  isValidTextInput,
  resolveGeminiApiKey,
} from '../src/serverSecurity';

describe('local server security guards', () => {
  it('allows local Ollama and WebLLM endpoints in Content-Security-Policy connect-src', () => {
    expect(CONTENT_SECURITY_POLICY).toContain('http://localhost:*');
    expect(CONTENT_SECURITY_POLICY).toContain('http://127.0.0.1:*');
    expect(CONTENT_SECURITY_POLICY).toContain('ws://localhost:*');
    expect(CONTENT_SECURITY_POLICY).toContain('ws://127.0.0.1:*');
    expect(CONTENT_SECURITY_POLICY).toContain('https://generativelanguage.googleapis.com');
  });

  it('enforces strict Cloudflare Pages production security headers and CSP in public/_headers', () => {
    const headersFile = readFileSync(path.resolve(process.cwd(), 'public/_headers'), 'utf8');
    expect(headersFile).toContain('X-Content-Type-Options: nosniff');
    expect(headersFile).toContain('X-Frame-Options: DENY');
    expect(headersFile).toContain('Referrer-Policy: strict-origin-when-cross-origin');

    const cspLine = headersFile
      .split('\n')
      .find((line) => line.trim().startsWith('Content-Security-Policy:'));
    expect(cspLine).toBeDefined();
    expect(cspLine).toContain("frame-ancestors 'none'");
    expect(cspLine).toContain('https://generativelanguage.googleapis.com');
    expect(cspLine).toContain('https://huggingface.co');
    expect(cspLine).toContain('https://*.huggingface.co');
    expect(cspLine).toContain('http://localhost:*');
    expect(cspLine).toContain('http://127.0.0.1:*');

    // No leftover Firebase, Google Drive OAuth, or dev-only WebSocket origins
    expect(cspLine).not.toMatch(/firebase|firebaseio|accounts\.google\.com|apis\.google\.com|drive\.googleapis\.com|oauth2/i);
    expect(cspLine).not.toContain('ws://localhost:*');
    expect(cspLine).not.toContain('ws://127.0.0.1:*');
  });
  it('accepts only loopback hostnames and matching local origins', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('public.example')).toBe(false);
    expect(isSameLocalOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
    expect(isSameLocalOrigin('https://attacker.example', 'localhost:3000')).toBe(false);
    expect(isSameLocalOrigin('https://evil-localhost.com', 'localhost:3000')).toBe(false);
    expect(isSameLocalOrigin('https://localhost.attacker.com', 'localhost:3000')).toBe(false);
    expect(isSameLocalOrigin(undefined, 'localhost:3000')).toBe(true);
  });

  it('allows matching host, x-forwarded-host, local hosts, and AI Studio usercontent.goog origins strictly', () => {
    expect(isAllowedOrigin(undefined, '127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://app-123.scf.usercontent.goog', '127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://preview.usercontent.goog', 'localhost:3000')).toBe(true);
    expect(isAllowedOrigin('https://vibevault.pages.dev', '127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil-pages.dev', 'localhost:3000')).toBe(false);
    expect(isAllowedOrigin('https://custom.example.com', '127.0.0.1:3000', 'custom.example.com, proxy.internal')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000', '127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil-usercontent.goog', 'localhost:3000')).toBe(false);
    expect(isAllowedOrigin('https://usercontent.goog.evil.com', 'localhost:3000')).toBe(false);
    expect(isAllowedOrigin('javascript://app.usercontent.goog', 'localhost:3000')).toBe(false);
    expect(isAllowedOrigin('https://attacker.example', 'localhost:3000', 'different.example')).toBe(false);
  });

  it('validates engine configuration and bounded text inputs', () => {
    expect(isValidEngineConfig({ engineType: 'local', provider: 'gemini', apiKey: '' })).toBe(true);
    expect(isValidEngineConfig({ engineType: 'byok', provider: 'openai', apiKey: 'key' })).toBe(true);
    expect(isValidEngineConfig({ engineType: 'byok', apiKey: 'key' })).toBe(false);
    expect(isValidEngineConfig({ engineType: 'remote', apiKey: 'key' })).toBe(false);
    expect(isValidEngineConfig({ engineType: 'byok', apiKey: 'k'.repeat(513) })).toBe(false);
    expect(isValidTextInput('식비 12,000원')).toBe(true);
    expect(isValidTextInput('   ')).toBe(false);
    expect(isValidTextInput({ text: 'not a string' })).toBe(false);
    expect(isValidTextInput('x'.repeat(20_001))).toBe(false);
  });

  it('does not route local or non-Gemini selections through a configured Gemini key', () => {
    expect(resolveGeminiApiKey(undefined, 'server-key')).toBe('server-key');
    expect(resolveGeminiApiKey({ engineType: 'local' }, 'server-key')).toBeUndefined();
    expect(resolveGeminiApiKey({
      engineType: 'byok',
      provider: 'openai',
      apiKey: 'client-key',
    }, 'server-key')).toBeUndefined();
    expect(resolveGeminiApiKey({ provider: 'openai', apiKey: 'client-key' }, 'server-key')).toBeUndefined();
    expect(resolveGeminiApiKey({
      engineType: 'byok',
      provider: 'gemini',
      apiKey: 'client-key',
    }, 'server-key')).toBe('client-key');
  });

  it('accepts bounded base64 images only for supported MIME types', () => {
    expect(isValidImageInput('YWJj', 'image/webp')).toBe(true);
    expect(isValidImageInput('data:image/jpeg;base64,YWJj', 'image/jpeg')).toBe(true);
    expect(isValidImageInput('data:image/png;base64,YWJj', 'image/jpeg')).toBe(false);
    expect(isValidImageInput('not base64!', 'image/webp')).toBe(false);
    expect(isValidImageInput('YWJj', 'image/svg+xml')).toBe(false);
  });

  it('limits AI requests per client within a fixed window', () => {
    const client = `test-client-${Date.now()}`;
    for (let count = 0; count < 20; count += 1) {
      expect(consumeAiRequest(client, 1_000).allowed).toBe(true);
    }
    expect(consumeAiRequest(client, 1_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(consumeAiRequest(client, 61_000).allowed).toBe(true);
  });

  it('prunes expired rate-limit buckets when tracking many distinct clients', () => {
    const baseTime = 2_000_000;
    for (let i = 0; i < 64; i += 1) {
      expect(consumeAiRequest(`burst-client-${i}`, baseTime).allowed).toBe(true);
    }
    // After window expiry, fresh clients and returning clients are both allowed cleanly
    expect(consumeAiRequest('burst-client-0', baseTime + 65_000).allowed).toBe(true);
    expect(consumeAiRequest('burst-client-new', baseTime + 65_000).allowed).toBe(true);
  });
});
