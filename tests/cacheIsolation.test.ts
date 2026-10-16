import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SENSITIVE_CACHE_URL_PATTERNS,
  inspectCacheStorage,
  sanitizeCacheStorage,
  evictAllServiceWorkerCaches,
  createOfflineSyntheticResponse
} from '../src/usePWAInstall';

describe('Service Worker Cache Isolation & Sensitive Data Pollution Prevention (Item #5)', () => {
  describe('Sensitive URL Regex Patterns', () => {
    it('correctly matches backend API endpoints', () => {
      const apiUrls = [
        'https://example.com/api/parse-receipt',
        'https://example.com/vibevault/api/parse-asset-screenshot',
        '/api/health'
      ];
      for (const url of apiUrls) {
        const matches = SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test(url));
        expect(matches).toBe(true);
      }
    });

    it('correctly matches Gemini / Google Generative Language endpoints', () => {
      const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
      const matches = SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test(geminiUrl));
      expect(matches).toBe(true);
    });

    it('correctly matches blob URLs and image data URLs', () => {
      expect(SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test('blob:https://example.com/123-abc'))).toBe(true);
      expect(SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test('data:image/webp;base64,xxxx'))).toBe(true);
    });

    it('correctly matches backup and export paths', () => {
      expect(SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test('https://example.com/backup-export.enc'))).toBe(true);
      expect(SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test('/vault-lock'))).toBe(true);
    });

    it('does not flag authentic static build assets', () => {
      const staticUrls = [
        'https://example.com/assets/index.js',
        'https://example.com/assets/index.css',
        'https://example.com/vibevault/index.html',
        'https://example.com/icons/icon-192x192.png',
        'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans',
        'https://fonts.gstatic.com/s/plusjakartasans/v8/L0x5DF4xlVNK-PEXtlKwheW6.woff2'
      ];
      for (const url of staticUrls) {
        const matches = SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test(url));
        expect(matches).toBe(false);
      }
    });
  });

  describe('Offline Synthetic 503 Response', () => {
    it('creates a compliant 503 response without caching headers', async () => {
      const res = createOfflineSyntheticResponse('Gemini AI Scanner');
      expect(res.status).toBe(503);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('X-VibeVault-Offline-Fallback')).toBe('true');

      const body = await res.json();
      expect(body.error).toBe('OFFLINE_SERVICE_UNAVAILABLE');
      expect(body.message).toContain('Gemini AI Scanner');
      expect(body.status).toBe(503);
    });
  });

  describe('CacheStorage Sanitization Mock Tests', () => {
    let mockCachesMap: Map<string, Map<string, Response>>;

    beforeEach(() => {
      mockCachesMap = new Map();

      const fakeCaches = {
        keys: vi.fn(async () => Array.from(mockCachesMap.keys())),
        open: vi.fn(async (cacheName: string) => {
          if (!mockCachesMap.has(cacheName)) {
            mockCachesMap.set(cacheName, new Map());
          }
          const store = mockCachesMap.get(cacheName)!;

          return {
            keys: vi.fn(async () => Array.from(store.keys()).map(url => ({ url }))),
            match: vi.fn(async (req: { url: string } | string) => {
              const u = typeof req === 'string' ? req : req.url;
              return store.get(u) || null;
            }),
            put: vi.fn(async (req: { url: string } | string, res: Response) => {
              const u = typeof req === 'string' ? req : req.url;
              store.set(u, res);
            }),
            delete: vi.fn(async (req: { url: string } | string) => {
              const u = typeof req === 'string' ? req : req.url;
              return store.delete(u);
            })
          };
        }),
        delete: vi.fn(async (cacheName: string) => {
          return mockCachesMap.delete(cacheName);
        })
      };

      // Attach fake caches to global window
      (globalThis as unknown as { caches: typeof fakeCaches }).caches = fakeCaches;
    });

    it('identifies sensitive entries and reports pristine state correctly', async () => {
      const staticStore = new Map<string, Response>();
      staticStore.set('https://example.com/assets/app.js', new Response('console.log(1)'));
      staticStore.set('https://example.com/vibevault/index.html', new Response('<!DOCTYPE html>'));
      mockCachesMap.set('workbox-precache-v2', staticStore);

      const dynamicStore = new Map<string, Response>();
      dynamicStore.set('https://example.com/api/parse-receipt', new Response('{"total": 50000}'));
      mockCachesMap.set('runtime-cache', dynamicStore);

      const report = await inspectCacheStorage();
      expect(report.isPristine).toBe(false);
      expect(report.totalEntries).toBe(3);
      expect(report.suspiciousEntries.length).toBe(1);
      expect(report.suspiciousEntries[0]).toContain('/api/parse-receipt');
    });

    it('sanitizes sensitive entries without deleting static precache assets', async () => {
      const staticStore = new Map<string, Response>();
      staticStore.set('https://example.com/assets/app.js', new Response('console.log(1)'));
      mockCachesMap.set('workbox-precache-v2', staticStore);

      const dynamicStore = new Map<string, Response>();
      dynamicStore.set('https://example.com/api/parse-receipt', new Response('{"total": 50000}'));
      mockCachesMap.set('runtime-cache', dynamicStore);

      const result = await sanitizeCacheStorage(false);
      expect(result.purgedEntriesCount).toBe(1);

      const postReport = await inspectCacheStorage();
      expect(postReport.isPristine).toBe(true);
      expect(postReport.totalEntries).toBe(1);
    });

    it('completely evicts all caches on full wipe', async () => {
      mockCachesMap.set('cache-1', new Map());
      mockCachesMap.set('cache-2', new Map());

      const success = await evictAllServiceWorkerCaches();
      expect(success).toBe(true);
      expect(mockCachesMap.size).toBe(0);
    });
  });
});
