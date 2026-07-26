import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { importStudentMasterFromPayload } from '../src/services/student-master.service.js';
import { csrfHeaders, getCsrfToken, TEST_PASSWORD, TEST_STUDENT } from './helpers/test-utils.js';
import { hashPassword } from '../src/utils/password.js';
import { generateOtp } from '../src/utils/crypto.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

const TEST_STUDENT_B = {
  name: 'JOHN SMITH',
  reg_no: '25VCM98',
  mobile: '9876543211',
  email: 'johnsmith@avichi.edu',
  department: 'Visual Communication',
  year: 2025,
  role: 'student',
  verified: true,
} as const;

async function registerStudent(
  app: ReturnType<typeof createApp>,
  csrf: string,
  student: typeof TEST_STUDENT,
) {
  await request(app)
    .post('/api/auth/register/otp')
    .set(csrfHeaders(csrf))
    .send({
      regNo: student.reg_no,
      name: student.name,
      mobile: student.mobile,
      email: student.email,
      department: student.department,
    });

  const otp = generateOtp(6);
  await prisma.otpCode.create({
    data: {
      regNo: student.reg_no,
      mobile: student.mobile,
      email: student.email,
      codeHash: await hashPassword(otp),
      purpose: 'REGISTRATION',
      channel: 'SMS',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const completeRes = await request(app)
    .post('/api/auth/register/complete')
    .set(csrfHeaders(csrf))
    .send({
      regNo: student.reg_no,
      otp,
      password: TEST_PASSWORD,
    });

  expect(completeRes.status).toBe(200);
  return completeRes.body.data.accessToken as string;
}

describeIfDb('Social API', () => {
  const app = createApp();
  let csrf: string;
  let tokenA: string;
  let tokenB: string;
  let userBId: string;

  beforeAll(async () => {
    csrf = await getCsrfToken(app);
  });

  beforeEach(async () => {
    await prisma.postLike.deleteMany();
    await prisma.post.deleteMany();
    await prisma.story.deleteMany();
    await prisma.friendRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.loginHistory.deleteMany();
    await prisma.otpCode.deleteMany();
    await prisma.session.deleteMany();
    await prisma.admin.deleteMany();
    await prisma.hod.deleteMany();
    await prisma.staff.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.studentMaster.deleteMany();
    await prisma.department.deleteMany();

    await importStudentMasterFromPayload([TEST_STUDENT, TEST_STUDENT_B]);
    csrf = await getCsrfToken(app);

    tokenA = await registerStudent(app, csrf, TEST_STUDENT);
    tokenB = await registerStudent(app, csrf, TEST_STUDENT_B);

    const userB = await prisma.user.findUnique({ where: { regNo: TEST_STUDENT_B.reg_no } });
    userBId = userB!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a post and returns it in the feed', async () => {
    const createRes = await request(app)
      .post('/api/posts')
      .set({ ...csrfHeaders(csrf), Authorization: `Bearer ${tokenA}` })
      .send({ caption: 'Hello campus', visibility: 'PUBLIC' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.caption).toBe('Hello campus');

    const feedRes = await request(app)
      .get('/api/posts/feed')
      .set({ Authorization: `Bearer ${tokenA}` });

    expect(feedRes.status).toBe(200);
    expect(feedRes.body.data.posts).toHaveLength(1);
  });

  it('sends and accepts friend requests', async () => {
    const sendRes = await request(app)
      .post('/api/friends/requests')
      .set({ ...csrfHeaders(csrf), Authorization: `Bearer ${tokenA}` })
      .send({ receiverId: userBId });

    expect(sendRes.status).toBe(201);

    const incomingRes = await request(app)
      .get('/api/friends/requests')
      .set({ Authorization: `Bearer ${tokenB}` });

    expect(incomingRes.body.data.incoming).toHaveLength(1);

    const acceptRes = await request(app)
      .post(`/api/friends/requests/${incomingRes.body.data.incoming[0].id}/accept`)
      .set({ ...csrfHeaders(csrf), Authorization: `Bearer ${tokenB}` });

    expect(acceptRes.status).toBe(200);

    const friendsRes = await request(app)
      .get('/api/friends')
      .set({ Authorization: `Bearer ${tokenA}` });

    expect(friendsRes.body.data).toHaveLength(1);
    expect(friendsRes.body.data[0].regNo).toBe(TEST_STUDENT_B.reg_no);
  });

  it('searches students by reg no', async () => {
    const searchRes = await request(app)
      .get('/api/search/students?q=25VCM98')
      .set({ Authorization: `Bearer ${tokenA}` });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data[0].regNo).toBe(TEST_STUDENT_B.reg_no);
  });

  it('creates a story visible in the stories list', async () => {
    const createRes = await request(app)
      .post('/api/stories')
      .set({ ...csrfHeaders(csrf), Authorization: `Bearer ${tokenA}` })
      .send({ mediaUrl: 'https://example.com/story.jpg', caption: 'Campus day' });

    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/stories')
      .set({ Authorization: `Bearer ${tokenA}` });

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((g: { user: { regNo: string } }) => g.user.regNo === TEST_STUDENT.reg_no)).toBe(
      true,
    );
  });
});