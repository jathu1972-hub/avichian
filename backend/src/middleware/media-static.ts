import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname, normalize } from 'path';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { getLocalUploadRoot } from '../services/storage.service.js';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

function contentTypeFor(filePath: string, dbMime?: string | null): string {
  const ext = extname(filePath).toLowerCase();
  // Prefer extension for video containers — browsers need video/mp4 for .mp4 (not octet-stream)
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (dbMime && dbMime !== 'application/octet-stream') {
    if (dbMime === 'video/x-m4v') return 'video/mp4';
    return dbMime;
  }
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/**
 * Serve local uploads with correct Content-Type and HTTP Range (206) support.
 * Path: /api/media/<storageKey...>
 */
export async function serveLocalMedia(req: Request, res: Response, next: NextFunction) {
  try {
    // req.path is relative to mount point /api/media
    const raw = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (!raw || raw.includes('..')) {
      res.status(400).json({ success: false, error: 'Invalid media path' });
      return;
    }

    const root = getLocalUploadRoot();
    const fullPath = normalize(join(root, raw));
    if (!fullPath.startsWith(normalize(root))) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    if (!existsSync(fullPath)) {
      res.status(404).json({ success: false, error: 'Media not found' });
      return;
    }

    const stat = statSync(fullPath);
    if (!stat.isFile()) {
      res.status(404).json({ success: false, error: 'Media not found' });
      return;
    }

    // Prefer MIME stored on MediaAsset when key matches
    let dbMime: string | null = null;
    try {
      const asset = await prisma.mediaAsset.findFirst({
        where: { storageKey: raw },
        select: { fileType: true },
      });
      dbMime = asset?.fileType ?? null;
    } catch {
      /* ignore lookup failures */
    }

    const contentType = contentTypeFor(fullPath, dbMime);
    const size = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=604800');

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
        return;
      }
      end = Math.min(end, size - 1);
      const chunk = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(chunk));
      createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(size));
    res.status(200);
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
}
