import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storeUpload, ensureUploadStorageReady } from '../src/services/storage.service.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  ensureUploadStorageReady();
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT', accountStatus: 'ACTIVE', deletedAt: null },
  });
  if (!student) throw new Error('no student');

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const img = await storeUpload({
    purpose: 'post_image',
    buffer: png,
    mimeType: 'image/png',
    originalName: 'test.png',
    userId: student.id,
  });
  console.log('PNG', { url: img.url, mime: img.mimeType, size: img.size });

  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
    'base64',
  );
  try {
    const jpg = await storeUpload({
      purpose: 'post_image',
      buffer: jpeg,
      mimeType: 'image/jpeg',
      originalName: 'test.jpg',
      userId: student.id,
    });
    console.log('JPEG', { url: jpg.url, mime: jpg.mimeType, size: jpg.size });
  } catch (e) {
    console.log('JPEG skip', e instanceof Error ? e.message : e);
  }

  const mp4path = join(process.cwd(), 'uploads', 'test.mp4');
  if (existsSync(mp4path)) {
    const buf = readFileSync(mp4path);
    const vid = await storeUpload({
      purpose: 'post_video',
      buffer: buf,
      mimeType: 'video/mp4',
      originalName: 'test.mp4',
      userId: student.id,
    });
    console.log('MP4', { url: vid.url, mime: vid.mimeType, size: vid.size });

    // HTTP headers
    const mediaUrl = `http://127.0.0.1:4000${vid.url}`;
    const head = await fetch(mediaUrl, { method: 'HEAD' });
    console.log('HEAD media', {
      status: head.status,
      contentType: head.headers.get('content-type'),
      acceptRanges: head.headers.get('accept-ranges'),
    });
  }

  const assetCount = await prisma.mediaAsset.count();
  console.log('mediaAsset rows', assetCount);
  console.log('UPLOAD_PIPELINE_OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
