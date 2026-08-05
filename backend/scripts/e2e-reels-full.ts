import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma.js';
import {
  addReelComment,
  createReelWithFiles,
  listReels,
  listSavedReels,
  toggleReelLike,
  toggleSaveReel,
  toggleCommentLike,
  adminListReels,
} from '../src/services/reels.service.js';

async function main() {
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT', accountStatus: 'ACTIVE', deletedAt: null },
  });
  if (!student) throw new Error('No student');
  const path = join(process.cwd(), 'uploads', 'test.mp4');
  if (!existsSync(path)) throw new Error('Need test.mp4');

  const buf = readFileSync(path);
  const reel = await createReelWithFiles(
    student.id,
    {
      video: {
        buffer: buf,
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
        size: buf.length,
      },
    },
    {
      caption: 'Full reels E2E #campus #fest',
      hashtags: '#campus #fest',
      audioName: 'Campus beats',
      durationSec: 15,
      visibility: 'PUBLIC',
    },
  );
  console.log('created', reel.id, reel.hashtags, reel.audioName);

  const like = await toggleReelLike(student.id, reel.id);
  console.log('like', like);

  const save = await toggleSaveReel(student.id, reel.id);
  console.log('save', save);

  const comment = await addReelComment(student.id, reel.id, 'Great reel!');
  console.log('comment', comment.id);

  const cl = await toggleCommentLike(student.id, comment.id);
  console.log('comment like', cl);

  const list = await listReels(student.id, student.departmentId, { search: 'fest' });
  console.log(
    'search',
    list.items.map((r) => r.caption),
  );

  const saved = await listSavedReels(student.id);
  console.log('saved count', saved.length);

  const admin = await adminListReels({});
  console.log('admin reels', admin.length);

  console.log('--- FULL REELS E2E PASSED ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
