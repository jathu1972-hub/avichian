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

describeIfDb('Auth API', () => {
  const app = createApp();
  let csrf: string;

  beforeAll(async () => {
    csrf = await getCsrfToken(app);
  });

  beforeEach(async () => {
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

    await importStudentMasterFromPayload([TEST_STUDENT]);
    csrf = await getCsrfToken(app);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects registration when student not in master database', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .set(csrfHeaders(csrf))
      .send({
        regNo: '99VCM99',
        name: 'UNKNOWN STUDENT',
        mobile: '9000000001',
        email: 'unknown@avichi.edu',
        department: 'Visual Communication',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Student not found');
  });

  it('rejects registration with wrong department', async () => {
    const res = await request(app)
      .post('/api/auth/register/verify')
      .set(csrfHeaders(csrf))
      .send({
        regNo: TEST_STUDENT.reg_no,
        name: TEST_STUDENT.name,
        mobile: TEST_STUDENT.mobile,
        email: TEST_STUDENT.email,
        department: 'Computer Science',
      });

    expect(res.status).toBe(404);
  });

  it('rejects registration with invalid OTP', async () => {
    await request(app)
      .post('/api/auth/register/otp')
      .set(csrfHeaders(csrf))
      .send({
        regNo: TEST_STUDENT.reg_no,
        name: TEST_STUDENT.name,
        mobile: TEST_STUDENT.mobile,
        email: TEST_STUDENT.email,
        department: TEST_STUDENT.department,
      });

    const res = await request(app)
      .post('/api/auth/register/complete')
      .set(csrfHeaders(csrf))
      .send({
        regNo: TEST_STUDENT.reg_no,
        otp: '000000',
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid or expired OTP/i);
  });

  it('completes registration with valid OTP', async () => {
    const code = generateOtp(6);
    await prisma.otpCode.create({
      data: {
        regNo: TEST_STUDENT.reg_no,
        mobile: TEST_STUDENT.mobile,
        email: TEST_STUDENT.email,
        codeHash: await hashPassword(code),
        purpose: 'REGISTRATION',
        channel: 'SMS',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const { registerComplete } = await import('../src/services/auth.service.js');
    const session = await registerComplete(
      { regNo: TEST_STUDENT.reg_no, otp: code, password: TEST_PASSWORD },
      { ipAddress: '127.0.0.1' },
    );

    expect(session.accessToken).toBeDefined();
    expect(session.user.regNo).toBe(TEST_STUDENT.reg_no);
  });

  it('locks account after repeated failed logins', async () => {
    const code = generateOtp(6);
    await prisma.otpCode.create({
      data: {
        regNo: TEST_STUDENT.reg_no,
        codeHash: await hashPassword(code),
        purpose: 'REGISTRATION',
        channel: 'SMS',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    const { registerComplete } = await import('../src/services/auth.service.js');
    await registerComplete(
      { regNo: TEST_STUDENT.reg_no, otp: code, password: TEST_PASSWORD },
      {},
    );

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .set(csrfHeaders(csrf))
        .send({ regNo: TEST_STUDENT.reg_no, password: 'WrongPass1' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .set(csrfHeaders(csrf))
      .send({ regNo: TEST_STUDENT.reg_no, password: 'WrongPass1' });

    expect(res.status).toBe(423);
  });

  it('rejects suspended accounts', async () => {
    const code = generateOtp(6);
    await prisma.otpCode.create({
      data: {
        regNo: TEST_STUDENT.reg_no,
        codeHash: await hashPassword(code),
        purpose: 'REGISTRATION',
        channel: 'SMS',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    const { registerComplete } = await import('../src/services/auth.service.js');
    await registerComplete(
      { regNo: TEST_STUDENT.reg_no, otp: code, password: TEST_PASSWORD },
      {},
    );

    await prisma.user.update({
      where: { regNo: TEST_STUDENT.reg_no },
      data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .set(csrfHeaders(csrf))
      .send({ regNo: TEST_STUDENT.reg_no, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  it('student OTP login requires reg number lookup then matching mobile', async () => {
    const code = generateOtp(6);
    await prisma.otpCode.create({
      data: {
        regNo: TEST_STUDENT.reg_no,
        codeHash: await hashPassword(code),
        purpose: 'REGISTRATION',
        channel: 'SMS',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    const { registerComplete } = await import('../src/services/auth.service.js');
    await registerComplete(
      { regNo: TEST_STUDENT.reg_no, otp: code, password: TEST_PASSWORD },
      {},
    );

    const lookup = await request(app)
      .post('/api/auth/login/student/lookup')
      .set(csrfHeaders(csrf))
      .send({ regNo: TEST_STUDENT.reg_no });
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.registered).toBe(true);

    const wrongMobile = await request(app)
      .post('/api/auth/login/student/otp/request')
      .set(csrfHeaders(csrf))
      .send({ regNo: TEST_STUDENT.reg_no, mobile: '9000000001' });
    expect(wrongMobile.status).toBe(403);
    expect(wrongMobile.body.error).toMatch(/not registered for this student/i);

    const otpReq = await request(app)
      .post('/api/auth/login/student/otp/request')
      .set(csrfHeaders(csrf))
      .send({ regNo: TEST_STUDENT.reg_no, mobile: TEST_STUDENT.mobile });
    expect(otpReq.status).toBe(200);
  });

  it('rejects requests without CSRF token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ regNo: TEST_STUDENT.reg_no, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('rejects invalid refresh token', async () => {
    const { token, cookie } = JSON.parse(csrf) as { token: string; cookie?: string };
    const cookies = [cookie, 'refresh_token=invalid-token'].filter(Boolean).join('; ');
    const res = await request(app)
      .post('/api/auth/refresh')
      .set({ 'X-CSRF-Token': token, Cookie: cookies });

    expect(res.status).toBe(401);
  });
});