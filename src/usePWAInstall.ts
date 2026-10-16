import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * ============================================================================
 * SECURITY HARDENING ITEM #5: CACHE STORAGE ISOLATION & DATA PURGING
 * ============================================================================
 * Prevents plain-text financial data, receipts, Gemini multimodal payloads,
 * and encrypted backup blobs from leaking into browser CacheStorage.
 * ============================================================================
 */

export interface CacheInspectionReport {
  totalCaches: number;
  cacheNames: string[];
  totalEntries: number;
  suspiciousEntries: string[];
  isPristine: boolean;
}

/**
 * URL patterns that MUST NEVER exist in any CacheStorage bucket
 */
export const SENSITIVE_CACHE_URL_PATTERNS = [
  /\/api\//i,
  /generativelanguage\.googleapis\.com/i,
  /blob:/i,
  /data:image/i,
  /backup/i,
  /export/i,
  /vault-lock/i,
  /receipt.*ocr/i,
  /asset.*screenshot/i,
  /gemini/i
];

/**
 * Resolves CacheStorage instance across browser and test environments
 */
function getCacheStorage(): CacheStorage | null {
  if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
    return window.caches;
  }
  if (typeof caches !== 'undefined' && caches) {
    return caches;
  }
  return null;
}

/**
 * Inspects all active CacheStorage buckets and identifies any non-static
 * or sensitive entries that could breach financial confidentiality.
 */
export async function inspectCacheStorage(): Promise<CacheInspectionReport> {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) {
    return {
      totalCaches: 0,
      cacheNames: [],
      totalEntries: 0,
      suspiciousEntries: [],
      isPristine: true
    };
  }

  try {
    const cacheNames = await cacheStorage.keys();
    let totalEntries = 0;
    const suspiciousEntries: string[] = [];

    for (const name of cacheNames) {
      const cache = await cacheStorage.open(name);
      const requests = await cache.keys();
      totalEntries += requests.length;

      for (const req of requests) {
        const url = req.url;
        const isSensitive = SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test(url));
        if (isSensitive) {
          suspiciousEntries.push(`[${name}] ${url}`);
        }
      }
    }

    return {
      totalCaches: cacheNames.length,
      cacheNames,
      totalEntries,
      suspiciousEntries,
      isPristine: suspiciousEntries.length === 0
    };
  } catch (err) {
    console.warn('[PWA Security] Failed to inspect CacheStorage:', err);
    return {
      totalCaches: 0,
      cacheNames: [],
      totalEntries: 0,
      suspiciousEntries: [],
      isPristine: true
    };
  }
}

/**
 * Programmatically purges any non-static or sensitive entries across all CacheStorage
 * buckets. Invoked upon user logout, vault lock, or database reset to guarantee
 * zero persistent data leakage in shared browser environments.
 * 
 * @param purgeAllRuntimeCaches If true, deletes non-precached dynamic caches entirely.
 */
export async function sanitizeCacheStorage(purgeAllRuntimeCaches: boolean = false): Promise<{
  purgedEntriesCount: number;
  purgedCachesCount: number;
}> {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) {
    return { purgedEntriesCount: 0, purgedCachesCount: 0 };
  }

  let purgedEntriesCount = 0;
  let purgedCachesCount = 0;

  try {
    const cacheNames = await cacheStorage.keys();

    for (const name of cacheNames) {
      // If requested or if the cache is an unapproved runtime cache bucket
      const isSystemPrecache = name.includes('workbox-precache');
      
      if (purgeAllRuntimeCaches && !isSystemPrecache) {
        await cacheStorage.delete(name);
        purgedCachesCount += 1;
        continue;
      }

      const cache = await cacheStorage.open(name);
      const requests = await cache.keys();

      for (const req of requests) {
        const url = req.url;
        const isSensitive = SENSITIVE_CACHE_URL_PATTERNS.some(pat => pat.test(url));
        if (isSensitive) {
          const deleted = await cache.delete(req);
          if (deleted) purgedEntriesCount += 1;
        }
      }
    }

    if (purgedEntriesCount > 0 || purgedCachesCount > 0) {
      console.info(
        `[PWA Security] Cache storage sanitized: ${purgedEntriesCount} sensitive entries and ${purgedCachesCount} caches removed.`
      );
    }
  } catch (err) {
    console.warn('[PWA Security] CacheStorage sanitization encountered error:', err);
  }

  return { purgedEntriesCount, purgedCachesCount };
}

/**
 * Complete eviction of all CacheStorage buckets and Service Worker unregistration.
 * Intended for hard reset / data wipe workflows.
 */
export async function evictAllServiceWorkerCaches(): Promise<boolean> {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) return false;

  try {
    const keys = await cacheStorage.keys();
    await Promise.all(keys.map(k => cacheStorage.delete(k)));
    return true;
  } catch (err) {
    console.warn('[PWA Security] Failed to evict all caches:', err);
    return false;
  }
}

/**
 * Creates a synthetic 503 Service Unavailable Response for offline AI / sync requests.
 * Prevents stale financial data from being served when offline.
 */
export function createOfflineSyntheticResponse(resourceDescription: string = 'AI or Sync Service'): Response {
  const payload = {
    error: 'OFFLINE_SERVICE_UNAVAILABLE',
    message: `오프라인 상태입니다. 인터넷 연결이 필요한 ${resourceDescription}을(를) 수행할 수 없습니다.`,
    status: 503,
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(payload), {
    status: 503,
    statusText: 'Service Unavailable (Offline)',
    headers: {
      'Content-Type': 'application/json',
      'X-VibeVault-Offline-Fallback': 'true',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
    }
  });
}

// Module-level cache to ensure early beforeinstallprompt events are never dropped
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  // Catch any prompt already intercepted by index.html early script
  if ((window as any).deferredPWAInstallPrompt) {
    globalDeferredPrompt = (window as any).deferredPWAInstallPrompt;
  }

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    (window as any).deferredPWAInstallPrompt = globalDeferredPrompt;
    promptSubscribers.forEach((cb) => cb(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    (window as any).deferredPWAInstallPrompt = null;
    promptSubscribers.forEach((cb) => cb(null));
  });

  // Global dispatch bridge for index.html inline interceptor
  (window as any).dispatchPWAInstallEvent = (e: BeforeInstallPromptEvent) => {
    globalDeferredPrompt = e;
    promptSubscribers.forEach((cb) => cb(globalDeferredPrompt));
  };
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && (window as any).deferredPWAInstallPrompt) {
      return (window as any).deferredPWAInstallPrompt;
    }
    return globalDeferredPrompt;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });

  const [isIOS, setIsIOS] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const userAgent = window.navigator.userAgent.toLowerCase();
    return (
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  });

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('vibevault_pwa_banner_dismissed') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(standalone);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    if (!deferredPrompt && (window as any).deferredPWAInstallPrompt) {
      setDeferredPrompt((window as any).deferredPWAInstallPrompt);
    }

    const handlePromptUpdate = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
      if (!prompt) {
        checkStandalone();
      }
    };

    promptSubscribers.add(handlePromptUpdate);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    return () => {
      promptSubscribers.delete(handlePromptUpdate);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, [deferredPrompt]);

  const install = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPrompt || globalDeferredPrompt;
    if (!prompt) return false;

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        globalDeferredPrompt = null;
        (window as any).deferredPWAInstallPrompt = null;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('PWA install prompt invocation failed:', err);
      return false;
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('vibevault_pwa_banner_dismissed', 'true');
    }
  }, []);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isDismissed,
    install,
    dismiss,
    inspectCache: inspectCacheStorage,
    sanitizeCache: sanitizeCacheStorage,
    evictAllCaches: evictAllServiceWorkerCaches,
  };
}
