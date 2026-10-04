import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'Vibe Vault',
          short_name: 'VibeVault',
          description: 'A privacy-first, local-encrypted asset vault and multi-brokerage portfolio dashboard (with built-in daily expense ledger)',
          theme_color: '#0B0F17',
          background_color: '#0B0F17',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Task 1: Restrict precaching strictly to static build assets
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Automatically evict and purge legacy/deprecated cache buckets on version upgrade
          cleanupOutdatedCaches: true,
          // Clients claim immediately on activation so security rules take effect without manual reloads
          clientsClaim: true,
          skipWaiting: true,
          // Navigate fallback strictly points to the static entry shell without retaining sensitive query params
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\/.*/i,
            /^\/vibevault\/api\/.*/i,
            /\.[a-zA-Z0-9]+$/, // Don't fallback for static files with explicit extensions
          ],
          // Ignore URL parameters that might leak tokens or ephemeral state from navigation fallback matching
          ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^token$/, /^key$/, /^auth$/],
          // Security Hardening: Explicitly exclude dynamic, user-generated, or sensitive data routes
          runtimeCaching: [
            // 1. Google Fonts stylesheets (Static, public typography)
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 2. Google Fonts web font binaries (Static WOFF2 files)
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // 3. SECURITY RULE: AI Endpoints (Google Generative Language / Gemini)
            // MUST be NetworkOnly. Under NO circumstances may AI multimodal payloads, financial prompts,
            // or OCR extraction responses be cached in CacheStorage.
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
            },
            // 4. SECURITY RULE: Backend API routes (/api/* and /vibevault/api/*)
            // Financial balance changes, parsed transactions, receipts, or keys MUST NEVER be stored in CacheStorage.
            {
              urlPattern: /^(?:https?:\/\/[^/]+)?(?:\/vibevault)?\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            // 5. SECURITY RULE: Local blobs and object URLs (blob:*)
            // Object URLs generated from encrypted backups, receipt canvas downscaling, or local files
            // must never be touched by Service Worker runtime caching.
            {
              urlPattern: /^blob:.*/i,
              handler: 'NetworkOnly',
            },
            // 6. SECURITY RULE: Backup export and download paths
            {
              urlPattern: /.*(?:backup|export|download|vault-lock).*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      target: 'esnext',
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('date-fns') || id.includes('idb')) {
                return 'vendor-utils';
              }
              if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
                return 'vendor-charts';
              }
            }
          },
        },
      },
    },
  };
});
