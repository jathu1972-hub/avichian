import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { csrfProtection, issueCsrfToken } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { superAdminRouter } from './routes/super-admin.routes.js';
import { profileRouter } from './routes/profile.routes.js';
import { mfaRouter } from './routes/mfa.routes.js';
import { postsRouter } from './routes/posts.routes.js';
import { storiesRouter } from './routes/stories.routes.js';
import { friendsRouter } from './routes/friends.routes.js';
import { searchRouter } from './routes/search.routes.js';
import { studentRouter } from './routes/student.routes.js';
import { chatRouter } from './routes/chat.routes.js';
import { callRouter } from './routes/call.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { campusRouter } from './routes/campus.routes.js';
import { uploadsRouter } from './routes/uploads.routes.js';
import { reelsRouter } from './routes/reels.routes.js';
import { eventsRouter } from './routes/events.routes.js';
import { communitiesRouter } from './routes/communities.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { safetyRouter } from './routes/safety.routes.js';
import { serveLocalMedia } from './middleware/media-static.js';

/** Allow LAN phone/tablet access in development (Vite --host). */
function isDevNetworkOrigin(origin: string): boolean {
  if (env.isProduction) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    const isPrivate =
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);
    const isPortalPort = ['5173', '5174'].includes(port);
    return (isLoopback || isPrivate) && isPortalPort;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      hsts: env.isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      contentSecurityPolicy: env.isProduction ? undefined : false,
      // Allow <video>/<img> to load same-site media URLs without CORP blocking
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Never throw — throwing breaks preflight and surfaces as browser "Failed to fetch"
        if (!origin || env.frontendUrls.includes(origin) || isDevNetworkOrigin(origin)) {
          callback(null, true);
          return;
        }
        console.warn('[CORS] blocked origin:', origin, '| allowed:', env.frontendUrls.join(', '));
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-CSRF-Token',
        'X-Requested-With',
        'Accept',
      ],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
      maxAge: 86400,
    }),
  );

  // Large JSON only for legacy data-URI payloads; prefer multipart /api/uploads.
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch (err) {
      console.error('[health] database check failed', err);
    }
    const ok = database === 'connected';
    const time = new Date().toISOString();
    // Keep both shapes: nested `data` (app convention) + flat fields for probes
    res.status(ok ? 200 : 503).json({
      success: ok,
      status: ok ? 'ok' : 'degraded',
      database,
      server: 'running',
      time,
      data: {
        status: ok ? 'ok' : 'degraded',
        database,
        server: 'running',
        service: 'avichian-api',
        time,
      },
    });
  });

  app.get('/api/csrf-token', (req, res) => {
    const token = issueCsrfToken(req, res);
    res.json({ success: true, data: { csrfToken: token } });
  });

  // Local media: correct Content-Type + HTTP Range (206) for seeking / progressive play
  app.use('/api/media', (req, res, next) => {
    void serveLocalMedia(req, res, next);
  });

  app.use('/api/auth', csrfProtection, authRouter);
  app.use('/api/admin', csrfProtection, adminRouter);
  app.use('/api/super-admin', csrfProtection, superAdminRouter);
  app.use('/api/profile', csrfProtection, profileRouter);
  app.use('/api/mfa', csrfProtection, mfaRouter);
  app.use('/api/uploads', csrfProtection, uploadsRouter);
  app.use('/api/upload', csrfProtection, uploadsRouter); // alias
  app.use('/api/posts', csrfProtection, postsRouter);
  app.use('/api/stories', csrfProtection, storiesRouter);
  app.use('/api/reels', csrfProtection, reelsRouter);
  app.use('/api/friends', csrfProtection, friendsRouter);
  app.use('/api/search', csrfProtection, searchRouter);
  app.use('/api/student', csrfProtection, studentRouter);
  app.use('/api/events', csrfProtection, eventsRouter);
  app.use('/api/communities', csrfProtection, communitiesRouter);
  app.use('/api/settings', csrfProtection, settingsRouter);
  app.use('/api/safety', csrfProtection, safetyRouter);
  app.use('/api/campus', csrfProtection, campusRouter);
  app.use('/api/chat', csrfProtection, chatRouter);
  app.use('/api/chats', csrfProtection, chatRouter); // alias
  app.use('/api/calls', csrfProtection, callRouter);
  app.use('/api/notifications', csrfProtection, notificationRouter);

  // Always JSON for unknown /api routes — never fall through to a host HTML page from this app
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      error: `API route not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    });
  });

  app.use(errorHandler);

  return app;
}