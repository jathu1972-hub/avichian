import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import {
  registerComplete,
  registerVerify,
  studentLoginLookup,
  studentLoginOtpRequest,
  studentLoginOtpVerify,
} from '../src/services/auth.service.js';
import { hashPassword } from '../src/utils/password.js';
import { generateOtp } from '../src/utils/crypto.js';

config({ path: resolve(process.cwd(), '../.env') });

const REG_NO = '25VCM05';
const MOBILE = '9629771369';
const NAME = 'JATHURSHAN J';
const EMAIL = 'jathurshanj@avichi.edu';
const DEPT = 'Visual Communication';
const PASSWORD = 'Avichi2025';

async function ensureRegistered() {
  const existing = await prisma.user.findUnique({ where: { regNo: REG_NO } });
  if (existing) return;

  const code = generateOtp(6);
  await registerVerify({ regNo: REG_NO, name: NAME, mobile: MOBILE, email: EMAIL, department: DEPT });
  await prisma.otpCode.create({
    data: {
      regNo: REG_NO,
      mobile: MOBILE,
      email: EMAIL,
      codeHash: await hashPassword(code),
      purpose: 'REGISTRATION',
      channel: 'SMS',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });
  await registerComplete({ regNo: REG_NO, otp: code, password: PASSWORD }, {});
  console.log('Registered', NAME, 'for login OTP test.');
}

async function main() {
  await ensureRegistered();

  console.log('\n=== OTP LOGIN TEST: 9629771369 ===\n');

  const lookup = await studentLoginLookup({ regNo: REG_NO });
  console.log('Step 1 — Student found:', lookup.name, '| hint:', lookup.mobileHint);

  console.log('\nStep 2 — Sending OTP (watch for [OTP:LOGIN:SMS] line below):');
  const send = await studentLoginOtpRequest({ regNo: REG_NO, mobile: MOBILE }, {});
  console.log('  Status:', send.message);

  const latest = await prisma.otpCode.findFirst({
    where: { regNo: REG_NO, mobile: MOBILE, purpose: 'LOGIN', usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) throw new Error('No OTP created');

  // Dev test helper: set a known OTP for verification demo
  const testCode = '482916';
  await prisma.otpCode.update({
    where: { id: latest.id },
    data: { codeHash: await hashPassword(testCode), attempts: 0 },
  });

  console.log('\n--- OTP FOR 9629771369 ---');
  console.log(`  ${testCode}`);
  console.log('  Valid for 5 minutes\n');

  const session = await studentLoginOtpVerify(
    { regNo: REG_NO, mobile: MOBILE, otp: testCode },
    { ipAddress: '127.0.0.1' },
  );

  if ('accessToken' in session) {
    console.log('Step 3 — OTP verified: LOGIN SUCCESS');
    console.log(`  User: ${session.user.name} (${session.user.regNo})`);
  }
}

main()
  .catch((err) => {
    console.error('FAILED:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());