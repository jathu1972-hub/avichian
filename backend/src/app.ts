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
import { getLocalUploadRoot } from './services/storage.service.js';

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
        if (!origin || env.frontendUrls.includes(origin) || isDevNetworkOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    }),
  );

  // Large JSON only for legacy data-URI payloads; prefer multipart /api/uploads.
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', service: 'avichian-api' } });
  });

  app.get('/api/csrf-token', (req, res) => {
    const token = issueCsrfToken(req, res);
    res.json({ success: true, data: { csrfToken: token } });
  });

  // Local object storage fallback (when R2 is not configured)
  app.use(
    '/api/media',
    express.static(getLocalUploadRoot(), {
      fallthrough: false,
      maxAge: env.isProduction ? '7d' : 0,
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Accept-Ranges', 'bytes');
        const lower = filePath.toLowerCase();
        if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) {
          res.setHeader('Content-Type', 'video/mp4');
        } else if (lower.endsWith('.webm')) {
          res.setHeader('Content-Type', 'video/webm');
        } else if (lower.endsWith('.mov')) {
          res.setHeader('Content-Type', 'video/quicktime');
        } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (lower.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (lower.endsWith('.webp')) {
          res.setHeader('Content-Type', 'image/webp');
        }
        // Allow media to play in <video>/<img> from the SPA origin
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

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
  app.use('/api/campus', csrfProtection, campusRouter);
  app.use('/api/chat', csrfProtection, chatRouter);
  app.use('/api/calls', csrfProtection, callRouter);
  app.use('/api/notifications', csrfProtection, notificationRouter);

  app.use(errorHandler);

  return app;
}