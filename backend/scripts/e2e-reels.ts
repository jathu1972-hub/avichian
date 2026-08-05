import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { storeUpload } from '../src/services/storage.service.js';
import {
  createReel,
  getReelById,
  listReels,
  toggleReelLike,
} from '../src/services/reels.service.js';

async function main() {
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT', accountStatus: 'ACTIVE', deletedAt: null },
  });
  if (!student) throw new Error('No student');

  const testPath = join(process.cwd(), 'uploads', 'test.mp4');
  if (!existsSync(testPath)) throw new Error('Need uploads/test.mp4');

  const buffer = readFileSync(testPath);
  const stored = await storeUpload({
    purpose: 'post_video',
    buffer,
    mimeType: 'video/mp4',
    originalName: 'test.mp4',
    userId: student.id,
  });

  const reel = await createReel(student.id, {
    mediaUrl: stored.url,
    mediaMimeType: stored.mimeType,
    caption: 'E2E reel — production player',
    visibility: 'PUBLIC',
  });
  console.log('created', reel.id, reel.mediaUrl);

  const list = await listReels(student.id, student.departmentId, { limit: 10 });
  if (!list.items.some((r) => r.id === reel.id)) throw new Error('missing from list');
  console.log('list', list.items.length, 'nextCursor', list.nextCursor);

  const one = await getReelById(student.id, student.departmentId, reel.id);
  console.log('getById', one.id, one.mediaMimeType);

  const like = await toggleReelLike(student.id, reel.id);
  console.log('like', like);

  console.log('--- REELS E2E PASSED ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
