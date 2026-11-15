import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  CONTENT_SECURITY_POLICY,
  consumeAiRequest,
  isAllowedOrigin,
} from './src/serverSecurity';
import { createApiRouter } from './src/server/apiRouter';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  const HOST = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  app.disable('x-powered-by');

  // Security headers & CORS mitigation
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);

    const origin = req.get('origin');
    if (origin && !isAllowedOrigin(origin, req.get('host'), req.get('x-forwarded-host'))) {
      return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    }
    if (req.path.startsWith('/api/') || req.path.startsWith('/vibevault/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // Legacy subpath alias rewriting
  app.use((req, res, next) => {
    if (req.url.startsWith('/vibevault/api/')) {
      req.url = req.url.replace('/vibevault/api/', '/api/');
    }
    next();
  });

  // Rate limiting for AI endpoints
  const aiEndpoints = new Set([
    '/api/parse-receipt',
    '/api/parse-asset-screenshot',
    '/api/parse',
    '/api/parse-assets',
    '/api/validate-key',
    '/api/query-intent',
  ]);
  app.use((req, res, next) => {
    if (req.method !== 'POST' || !aiEndpoints.has(req.path)) return next();

    const result = consumeAiRequest(req.socket.remoteAddress ?? 'unknown');
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ error: 'Too many AI requests. Please try again shortly.' });
    }
    next();
  });

  app.use(express.json({ limit: '8mb', strict: true }));
  app.use((req, res, next) => {
    if (
      req.method === 'POST'
      && aiEndpoints.has(req.path)
      && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }
    next();
  });

  // Mount API router
  app.use('/api', createApiRouter());

  // Error handling middleware
  const requestErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    console.error('Request processing error:', err instanceof Error ? err.name : 'Unknown error');
    return res.status(500).json({ error: 'Request could not be processed.' });
  };

  // Vite development middleware or static asset serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.get(['/vibevault', '/vibevault/'], (req, res) => {
      res.redirect('/');
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('/vibevault', express.static(distPath));
    app.get(['/vibevault', '/vibevault/*'], (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(requestErrorHandler);

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
