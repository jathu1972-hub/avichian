/**
 * End-to-end: store test.mp4 → create post → verify URL headers → cleanup optional
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { storeUpload } from '../src/services/storage.service.js';
import { createPost } from '../src/services/posts.service.js';

async function main() {
  const testPath = join(process.cwd(), 'uploads', 'test.mp4');
  if (!existsSync(testPath)) {
    throw new Error(`Missing ${testPath} — download a sample H.264 mp4 first`);
  }
  const buffer = readFileSync(testPath);
  console.log('test.mp4 size', buffer.length);

  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT', accountStatus: 'ACTIVE', deletedAt: null },
  });
  if (!student) throw new Error('No student user');

  const stored = await storeUpload({
    purpose: 'post_video',
    buffer,
    mimeType: 'video/mp4',
    originalName: 'test.mp4',
    userId: student.id,
  });
  console.log('stored', {
    url: stored.url,
    mimeType: stored.mimeType,
    size: stored.size,
    storage: stored.storage,
  });

  if (stored.mimeType !== 'video/mp4') {
    throw new Error(`Expected video/mp4 got ${stored.mimeType}`);
  }
  if (stored.size < 10000) throw new Error('Stored file too small');

  const post = await createPost(student.id, {
    caption: 'E2E video post — test.mp4',
    mediaUrl: stored.url,
    mediaMimeType: stored.mimeType,
    visibility: 'PUBLIC',
  });
  console.log('post', {
    id: post.id,
    mediaUrl: post.mediaUrl,
    mediaMimeType: post.mediaMimeType,
  });

  const row = await prisma.post.findUnique({ where: { id: post.id } });
  if (!row?.mediaUrl) throw new Error('DB missing mediaUrl');
  if (row.mediaMimeType !== 'video/mp4') {
    console.warn('mediaMimeType in DB:', row.mediaMimeType);
  }

  // Asset record
  const asset = await prisma.mediaAsset.findFirst({
    where: { storageUrl: stored.url },
  });
  console.log('mediaAsset', asset ? { fileType: asset.fileType, fileSize: asset.fileSize } : null);

  // HTTP headers against local API
  const base = process.env.PUBLIC_API_URL || 'http://127.0.0.1:4000';
  const mediaPath = stored.url.startsWith('http')
    ? stored.url
    : `${base}${stored.url.startsWith('/') ? '' : '/'}${stored.url}`;

  const full = await fetch(mediaPath, { method: 'HEAD' });
  console.log('HEAD', {
    status: full.status,
    contentType: full.headers.get('content-type'),
    acceptRanges: full.headers.get('accept-ranges'),
    contentDisposition: full.headers.get('content-disposition'),
    contentLength: full.headers.get('content-length'),
  });
  if (!full.headers.get('content-type')?.includes('video/mp4')) {
    throw new Error(`Bad Content-Type: ${full.headers.get('content-type')}`);
  }
  if (full.headers.get('accept-ranges') !== 'bytes') {
    throw new Error('Missing Accept-Ranges: bytes');
  }

  const range = await fetch(mediaPath, {
    headers: { Range: 'bytes=0-1023' },
  });
  console.log('RANGE', {
    status: range.status,
    contentRange: range.headers.get('content-range'),
    contentType: range.headers.get('content-type'),
  });
  if (range.status !== 206) throw new Error(`Expected 206 got ${range.status}`);

  console.log('--- VIDEO POST E2E PASSED ---');
  console.log('Feed should show post', post.id, 'with playable video + audio');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
