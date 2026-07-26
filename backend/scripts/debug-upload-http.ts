import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { signAccessToken } from '../src/utils/jwt.js';

const app = createApp();

async function main() {
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error('no dept');
  const regNo = `UP${Date.now().toString().slice(-8)}`;
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
      profile: { create: { name: 'UPLOAD TEST', year: 1 } },
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

  const buf = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const up = await request(app)
    .post('/api/uploads')
    .set('Authorization', `Bearer ${token}`)
    .set('X-CSRF-Token', csrf)
    .set('Cookie', cookie)
    .field('purpose', 'story_image')
    .attach('file', buf, { filename: 't.png', contentType: 'image/png' });

  console.log('UPLOAD', up.status, JSON.stringify(up.body, null, 2));

  if (up.body?.data?.url) {
    const story = await request(app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', cookie)
      .send({ mediaUrl: up.body.data.url, caption: 'test' });
    console.log('STORY', story.status, JSON.stringify(story.body, null, 2));

    const post = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', cookie)
      .send({ mediaUrl: up.body.data.url, caption: 'post test' });
    console.log('POST', post.status, JSON.stringify(post.body, null, 2));

    const profile = await request(app)
      .patch('/api/profile/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', cookie)
      .send({ profilePhotoUrl: up.body.data.url });
    console.log('PROFILE', profile.status, JSON.stringify(profile.body, null, 2));
  }

  await prisma.story.deleteMany({ where: { userId: user.id } });
  await prisma.post.deleteMany({ where: { authorId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
