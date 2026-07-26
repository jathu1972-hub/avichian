/**
 * Wipes all app data and bootstraps a single Super Admin for hierarchy testing.
 * Run from backend/: npx tsx scripts/reset-testing-environment.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { normalizeEmail, normalizeRegNo } from '@avichian/shared';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  console.info('Resetting Avichian database for production-style testing...');

  await prisma.auditLog.deleteMany();
  await prisma.loginHistory.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.session.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.hod.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();
  await prisma.studentMaster.deleteMany();
  await prisma.department.deleteMany();

  const regNo = normalizeRegNo(process.env.SUPER_ADMIN_REG_NO ?? 'SUPERADMIN');
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL ?? 'admin@avichi.edu');
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'Super@Admin2026';

  const department = await prisma.department.create({
    data: { name: 'Administration', code: 'ADMIN' },
  });

  const passwordHash = await hashPassword(password);
  const placeholderMobile = '9000000000';

  await prisma.user.create({
    data: {
      regNo,
      email,
      passwordHash,
      mobileHash: hashValue(placeholderMobile),
      mobileEnc: encryptField(placeholderMobile),
      role: 'SUPER_ADMIN',
      departmentId: department.id,
      profile: { create: { name: 'Super Admin' } },
      admin: { create: {} },
    },
  });

  console.info('Done. Only Super Admin exists.');
  console.info(`  Admin ID: ${regNo}`);
  console.info(`  Email:    ${email}`);
  console.info(`  Password: ${password}`);
  console.info('Next: login at /super-admin/login, complete MFA, then create departments and HOD.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());