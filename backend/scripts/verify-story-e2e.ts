import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { signAccessToken } from '../src/utils/jwt.js';

const app = createApp();

async function main() {
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error('no department');

  const regNo = `E2${Date.now().toString().slice(-8)}`;
  const user = await prisma.user.create({
    data: {
      regNo,
      email: `${regNo.toLowerCase()}@avichi.edu`,
      passwordHash: await hashPassword('TestPass1'),
      mobileHash: hashValue(`9${Date.now().toString().slice(-9)}`),
      mobileEnc: encryptField('9876543210'),
      role: 'STUDENT',
      departmentId: dept.id,
      accountStatus: 'ACTIVE',
      profile: { create: { name: 'E2E STORY', year: 1 } },
    },
  });

  const token = signAccessToken({
    sub: user.id,
    regNo: user.regNo,
    role: 'STUDENT',
    departmentId: dept.id,
  });

  const csrfRes = await request(app).get('/api/csrf-token');
  const csrf = csrfRes.body.data.csrfToken as string;
  const cookie = csrfRes.headers['set-cookie'] as string[];

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  console.log('1. Multipart POST /api/stories/upload');
  const create = await request(app)
    .post('/api/stories/upload')
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Token', csrf)
    .set('Cookie', cookie)
    .field('caption', 'e2e caption')
    .attach('file', png, { filename: 'story.png', contentType: 'image/png' });

  console.log('   status', create.status, create.body?.error ?? '');
  if (create.status !== 201 || !create.body?.data?.id) {
    throw new Error(`Create failed: ${JSON.stringify(create.body)}`);
  }
  const storyId = create.body.data.id as string;
  console.log('2. Story id', storyId, 'mediaUrl', create.body.data.mediaUrl);

  const db = await prisma.story.findUnique({ where: { id: storyId } });
  console.log('3. PostgreSQL row', db ? {
    id: db.id,
    userId: db.userId,
    mediaType: db.mediaType,
    visibility: db.visibility,
    mediaUrl: db.mediaUrl,
    expiresAt: db.expiresAt,
  } : null);
  if (!db) throw new Error('Story missing from PostgreSQL');

  console.log('4. GET /api/stories');
  const list = await request(app)
    .get('/api/stories')
    .set('Authorization', `Bearer ${token}`)
    .set('Cookie', cookie);

  console.log('   status', list.status);
  const groups = list.body?.data ?? [];
  const mine = groups.find((g: { user: { isMe: boolean } }) => g.user.isMe);
  console.log('5. Groups', groups.length, 'mine stories', mine?.stories?.length);
  if (!mine?.stories?.some((s: { id: string }) => s.id === storyId)) {
    throw new Error('Created story not returned by GET /stories');
  }

  // media reachable
  const mediaPath = create.body.data.mediaUrl as string;
  if (mediaPath.startsWith('/api/media/')) {
    const media = await request(app).get(mediaPath);
    console.log('6. Media GET', media.status, media.headers['content-type']);
    if (media.status !== 200) throw new Error('mediaUrl not reachable');
  }

  await prisma.story.deleteMany({ where: { userId: user.id } });
  await prisma.mediaAsset.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log('PASS end-to-end story upload → DB → list → media');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
