import { Router } from 'express';
import multer from 'multer';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { AppError } from '../utils/errors.js';
import {
  maxBytesForPurpose,
  normalizeMimeType,
  resolveUploadPurpose,
  storeUpload,
  type UploadPurpose,
} from '../services/storage.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
    files: 1,
    fields: 10,
  },
});

export const uploadsRouter = Router();

uploadsRouter.use(authenticate, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

function multerSingle(req: AuthRequest, res: import('express').Response, next: import('express').NextFunction) {
  // Accept common field names used by clients
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'media', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'document', maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      console.error('[upload] multer error', {
        code: err.code,
        field: err.field,
        message: err.message,
        path: req.originalUrl,
      });
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            413,
            'File too large. Maximum upload size is 500MB for videos, 100MB for documents, 20MB for images.',
            'FILE_TOO_LARGE',
          ),
        );
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        next(
          new AppError(
            400,
            `Unexpected file field "${err.field}". Use field name "file".`,
            'UNEXPECTED_FIELD',
          ),
        );
        return;
      }
      next(new AppError(400, err.message, 'UPLOAD_ERROR'));
      return;
    }
    if (err) {
      console.error('[upload] middleware error', err);
      next(err);
      return;
    }
    next();
  });
}

function pickFile(req: AuthRequest): Express.Multer.File | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!files) return req.file;
  for (const key of ['file', 'media', 'image', 'photo', 'video', 'document']) {
    if (files[key]?.[0]) return files[key][0];
  }
  return undefined;
}

async function handleUpload(req: AuthRequest, res: import('express').Response, next: import('express').NextFunction) {
  try {
    console.info('[upload] incoming', {
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.id,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      purpose: req.body?.purpose,
      hasAuth: Boolean(req.headers.authorization),
    });

    const file = pickFile(req);
    if (!file) {
      console.error('[upload] no file in request', {
        bodyKeys: Object.keys(req.body ?? {}),
        files: req.files ? Object.keys(req.files as object) : null,
      });
      throw new AppError(
        400,
        'No file uploaded. Send multipart/form-data with field name "file".',
        'NO_FILE',
      );
    }

    const mimeType = normalizeMimeType(file.mimetype, file.originalname);
    const purpose = resolveUploadPurpose(
      typeof req.body?.purpose === 'string' ? req.body.purpose : undefined,
      mimeType,
    );

    const max = maxBytesForPurpose(purpose);
    if (file.size > max) {
      const mb = Math.round(max / (1024 * 1024));
      throw new AppError(400, `File too large. Maximum for ${purpose} is ${mb}MB.`, 'FILE_TOO_LARGE');
    }

    console.info('[upload] multer ok', {
      originalName: file.originalname,
      mimetype: file.mimetype,
      normalizedMime: mimeType,
      size: file.size,
      purpose,
    });

    const result = await storeUpload({
      purpose: purpose as UploadPurpose,
      buffer: file.buffer,
      mimeType,
      originalName: file.originalname,
      userId: req.user!.id,
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        url: result.url,
        storageUrl: result.url,
        key: result.key,
        mimeType: result.mimeType,
        fileType: result.mimeType,
        size: result.size,
        fileSize: result.size,
        fileName: result.fileName,
        purpose: result.purpose,
        storage: result.storage,
        uploadedBy: req.user!.id,
        createdAt: result.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[upload] failed', error instanceof Error ? error.message : error);
    next(error);
  }
}

// Canonical + alias paths
uploadsRouter.post('/', multerSingle, handleUpload);
uploadsRouter.post('/file', multerSingle, handleUpload);
