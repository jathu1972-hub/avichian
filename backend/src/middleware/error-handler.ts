import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // body-parser / raw-body when JSON or form payload exceeds limit
  const status = (err as { status?: number; statusCode?: number; type?: string }).status
    ?? (err as { statusCode?: number }).statusCode;
  if (
    status === 413 ||
    err.message?.toLowerCase().includes('request entity too large') ||
    (err as { type?: string }).type === 'entity.too.large'
  ) {
    res.status(413).json({
      success: false,
      error:
        'Upload too large. Limits: images 20MB · videos / stories / reels 100MB. Use POST /api/uploads with multipart field "file".',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  // Multer / busboy unexpected errors
  if (err.name === 'MulterError' || (err as { code?: string }).code?.startsWith?.('LIMIT_')) {
    res.status(400).json({
      success: false,
      error: err.message || 'Upload rejected',
      code: (err as { code?: string }).code || 'UPLOAD_ERROR',
    });
    return;
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    error: env.isProduction
      ? 'Internal server error during upload. Check API logs.'
      : err.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}