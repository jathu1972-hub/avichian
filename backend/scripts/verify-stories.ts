import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { signAccessToken } from '../src/utils/jwt.js';
import { storeUpload } from '../src/services/storage.service.js';

const app = createApp();

async function main() {
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error('no department');

  const regNo = `ST${Date.now().toString().slice(-8)}`;
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
      profile: { create: { name: 'STORY TEST', year: 1 } },
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

  // Image story
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const imgUp = await storeUpload({
    purpose: 'story_image',
    buffer: png,
    mimeType: 'image/png',
    originalName: 's.png',
    userId: user.id,
  });

  const imgStory = await request(app)
    .post('/api/stories')
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Token', csrf)
    .set('Cookie', cookie)
    .send({ mediaUrl: imgUp.url, caption: 'jpg test', mediaType: 'IMAGE' });

  console.log('IMAGE STORY', imgStory.status, imgStory.body?.data?.mediaType, imgStory.body?.data?.id);

  // Fake mp4 bytes are fine for record + list (player will error in browser)
  const vidUp = await storeUpload({
    purpose: 'story_video',
    buffer: Buffer.from('fake-mp4-content-for-metadata-test'),
    mimeType: 'video/mp4',
    originalName: 's.mp4',
    userId: user.id,
  });

  const vidStory = await request(app)
    .post('/api/stories')
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Token', csrf)
    .set('Cookie', cookie)
    .send({ mediaUrl: vidUp.url, caption: 'video test', mediaType: 'VIDEO', mimeType: 'video/mp4' });

  console.log('VIDEO STORY', vidStory.status, vidStory.body?.data?.mediaType, vidStory.body?.data?.mediaUrl);

  const list = await request(app)
    .get('/api/stories')
    .set('Authorization', `Bearer ${token}`)
    .set('Cookie', cookie);

  console.log('LIST STATUS', list.status);
  const groups = list.body?.data ?? [];
  const mine = groups.find((g: { user: { isMe: boolean } }) => g.user.isMe);
  console.log('MY GROUP STORIES', mine?.stories?.length, mine?.stories?.map((s: { mediaType: string }) => s.mediaType));

  if (!mine || mine.stories.length < 2) {
    throw new Error('Expected own stories in list');
  }
  if (!mine.stories.some((s: { mediaType: string }) => s.mediaType === 'VIDEO')) {
    throw new Error('Expected VIDEO mediaType in list');
  }

  // DB check
  const rows = await prisma.story.findMany({ where: { userId: user.id } });
  console.log(
    'DB ROWS',
    rows.map((r) => ({
      id: r.id,
      mediaType: r.mediaType,
      mediaUrl: r.mediaUrl.slice(0, 40),
      expiresAt: r.expiresAt,
    })),
  );

  await prisma.story.deleteMany({ where: { userId: user.id } });
  await prisma.mediaAsset.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log('PASS stories visible + mediaType');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
