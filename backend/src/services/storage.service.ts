import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

export type UploadPurpose =
  | 'profile'
  | 'cover'
  | 'post_image'
  | 'post_video'
  | 'story_image'
  | 'story_video'
  | 'document';

/** Production limits: images 20MB · videos (posts/stories/reels) 100MB */
const LIMITS: Record<UploadPurpose, number> = {
  profile: 10 * 1024 * 1024,
  cover: 10 * 1024 * 1024,
  post_image: 20 * 1024 * 1024,
  story_image: 20 * 1024 * 1024,
  post_video: 100 * 1024 * 1024,
  story_video: 100 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/pjpeg',
]);
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
]);
const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const PURPOSE_MIMES: Record<UploadPurpose, Set<string>> = {
  profile: IMAGE_MIMES,
  cover: IMAGE_MIMES,
  post_image: IMAGE_MIMES,
  story_image: IMAGE_MIMES,
  post_video: VIDEO_MIMES,
  story_video: VIDEO_MIMES,
  document: DOCUMENT_MIMES,
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/x-m4v': '.m4v',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
};

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

const LOCAL_UPLOAD_ROOT = join(process.cwd(), 'uploads');

let s3Client: S3Client | null = null;

function isR2Configured(): boolean {
  return Boolean(
    (env.r2AccountId || env.r2Endpoint) &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2BucketName &&
      env.r2PublicUrl,
  );
}

function getS3(): S3Client {
  if (!s3Client) {
    const endpoint =
      env.r2Endpoint ||
      (env.r2AccountId ? `https://${env.r2AccountId}.r2.cloudflarestorage.com` : undefined);
    if (!endpoint) {
      throw new Error('R2_ENDPOINT or R2_ACCOUNT_ID is required when using Cloudflare R2');
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: env.r2AccessKeyId!,
        secretAccessKey: env.r2SecretAccessKey!,
      },
    });
  }
  return s3Client;
}

export function maxBytesForPurpose(purpose: UploadPurpose): number {
  return LIMITS[purpose];
}

export function isVideoPurpose(purpose: UploadPurpose): boolean {
  return purpose === 'post_video' || purpose === 'story_video';
}

/** Normalize browser MIME quirks and empty types via extension. */
export function normalizeMimeType(mimeType: string | undefined, originalName?: string): string {
  let mime = (mimeType || '').toLowerCase().trim();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (mime === 'video/x-m4v') mime = 'video/mp4';

  const ext = originalName ? extname(originalName).toLowerCase() : '';
  // File extension wins for common video containers (phones often send wrong MIME)
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';

  if (mime && mime !== 'application/octet-stream') return mime;
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
  return mime || 'application/octet-stream';
}

/**
 * Detect browser-hostile video codecs (HEVC/H.265 only → black video + audio in Chrome).
 * Returns an error message or null if OK.
 */
export function detectUnplayableVideoCodec(buffer: Buffer): string | null {
  // Sample ftyp + early boxes (first 256KB is enough for most MP4s)
  const n = Math.min(buffer.length, 256 * 1024);
  const sample = buffer.subarray(0, n).toString('latin1');
  const hasHevc = /hvc1|hev1|dvh1|dvhe/.test(sample);
  const hasAvc = /avc1|avc3|avcC/.test(sample);
  const hasVp9 = /vp09|vp9/.test(sample);
  const hasAv1 = /av01/.test(sample);
  if (hasHevc && !hasAvc && !hasVp9 && !hasAv1) {
    return (
      'This video uses HEVC/H.265, which most browsers cannot display (black screen with sound). ' +
      'Please re-export as MP4 with H.264 video + AAC audio, or WebM (VP8/VP9).'
    );
  }
  return null;
}

export function resolveUploadPurpose(
  purpose: string | undefined,
  mimeType: string,
): UploadPurpose {
  const normalized = (purpose ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (normalized && normalized in LIMITS) {
    return normalized as UploadPurpose;
  }
  if (DOCUMENT_MIMES.has(mimeType)) return 'document';
  if (VIDEO_MIMES.has(mimeType)) return 'story_video';
  return 'story_image';
}

export function validateUploadFile(params: {
  purpose: UploadPurpose;
  mimeType: string;
  size: number;
  originalName?: string;
  buffer?: Buffer;
}): { mimeType: string; extension: string } {
  const mime = normalizeMimeType(params.mimeType, params.originalName);
  const allowed = PURPOSE_MIMES[params.purpose];

  if (!allowed.has(mime)) {
    throw new AppError(
      400,
      `Unsupported file type "${mime || 'unknown'}" for ${params.purpose}. Allowed: ${[...allowed].join(', ')}`,
      'INVALID_MIME',
    );
  }

  const max = LIMITS[params.purpose];
  if (params.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    throw new AppError(
      400,
      `File too large. Maximum for ${params.purpose} is ${mb}MB.`,
      'FILE_TOO_LARGE',
    );
  }

  if (params.size <= 0) {
    throw new AppError(400, 'Empty file is not allowed', 'EMPTY_FILE');
  }

  if (params.buffer && mime.startsWith('video/')) {
    const codecError = detectUnplayableVideoCodec(params.buffer);
    if (codecError) {
      throw new AppError(400, codecError, 'UNSUPPORTED_CODEC');
    }
  }

  const fromName = params.originalName ? extname(params.originalName).toLowerCase() : '';
  // Prefer .mp4 extension for video/mp4 so Content-Type sniffing is reliable
  let extension = EXT_BY_MIME[mime] ?? (fromName || '.bin');
  if (mime === 'video/mp4' && (fromName === '.mp4' || fromName === '.m4v' || !fromName)) {
    extension = '.mp4';
  }

  return { mimeType: mime, extension };
}

function publicLocalUrl(key: string): string {
  const path = `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;
  // Absolute URL in production so Netlify frontends can load media from the API host
  if (env.publicApiUrl && (env.isProduction || process.env.FORCE_ABSOLUTE_MEDIA_URL === 'true')) {
    return `${env.publicApiUrl.replace(/\/$/, '')}${path}`;
  }
  return path;
}

async function storeLocal(key: string, buffer: Buffer): Promise<string> {
  const fullPath = join(LOCAL_UPLOAD_ROOT, key);
  const dir = join(fullPath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await pipeline(Readable.from(buffer), createWriteStream(fullPath));
  return publicLocalUrl(key);
}

async function storeR2(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  await getS3().send(
    new PutObjectCommand({
      Bucket: env.r2BucketName!,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      ContentDisposition: 'inline',
    }),
  );
  const base = env.r2PublicUrl!.replace(/\/$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export async function storeUpload(params: {
  purpose: UploadPurpose;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  userId: string;
}): Promise<{
  id: string;
  url: string;
  mediaUrl: string;
  key: string;
  mimeType: string;
  size: number;
  fileSize: number;
  fileName: string;
  purpose: UploadPurpose;
  storage: 'r2' | 'local';
  duration: number | null;
  createdAt: Date;
}> {
  const { mimeType, extension } = validateUploadFile({
    purpose: params.purpose,
    mimeType: params.mimeType,
    size: params.buffer.length,
    originalName: params.originalName,
    buffer: params.buffer,
  });

  const folder = params.purpose.split('_').join('-');
  const key = `${folder}/${params.userId}/${randomUUID()}${extension}`;
  const fileName =
    params.originalName?.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180) ||
    `${params.purpose}${extension}`;

  let url: string;
  let storage: 'r2' | 'local';

  try {
    if (isR2Configured()) {
      url = await storeR2(key, params.buffer, mimeType);
      storage = 'r2';
    } else {
      url = await storeLocal(key, params.buffer);
      storage = 'local';
    }
  } catch (err) {
    console.error('[upload] storage write failed', {
      purpose: params.purpose,
      userId: params.userId,
      key,
      error: err instanceof Error ? err.message : err,
    });
    throw new AppError(
      500,
      storageErrorMessage(err),
      'STORAGE_ERROR',
    );
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      userId: params.userId,
      fileName,
      fileType: mimeType,
      fileSize: params.buffer.length,
      purpose: params.purpose,
      storageKey: key,
      storageUrl: url,
      storageBackend: storage,
    },
  });

  console.info('[upload] stored', {
    id: asset.id,
    userId: params.userId,
    purpose: params.purpose,
    size: params.buffer.length,
    mimeType,
    storage,
    url,
  });

  return {
    id: asset.id,
    url,
    mediaUrl: url,
    key,
    mimeType,
    size: params.buffer.length,
    fileSize: params.buffer.length,
    fileName,
    purpose: params.purpose,
    storage,
    duration: null as number | null,
    createdAt: asset.createdAt,
  };
}

function storageErrorMessage(err: unknown): string {
  if (!isR2Configured()) {
    return 'Failed to save file to local storage. Check backend/uploads permissions.';
  }
  const msg = err instanceof Error ? err.message : 'Unknown storage error';
  return `Failed to upload to object storage: ${msg}`;
}

export function getLocalUploadRoot(): string {
  if (!existsSync(LOCAL_UPLOAD_ROOT)) {
    mkdirSync(LOCAL_UPLOAD_ROOT, { recursive: true });
    console.info('[upload] created local storage directory', LOCAL_UPLOAD_ROOT);
  }
  return LOCAL_UPLOAD_ROOT;
}

/** Call once at process start so first upload never fails on missing folder */
export function ensureUploadStorageReady(): void {
  getLocalUploadRoot();
}
