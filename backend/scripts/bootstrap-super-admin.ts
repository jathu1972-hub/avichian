/**
 * One-time bootstrap for Super Admin account.
 * Run: npx tsx scripts/bootstrap-super-admin.ts
 *
 * Requires SUPER_ADMIN_* env vars in .env
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { normalizeEmail, normalizeRegNo } from '@avichian/shared';

config({ path: resolve(process.cwd(), '../.env') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const regNo = normalizeRegNo(process.env.SUPER_ADMIN_REG_NO ?? 'ADMIN001');
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL ?? 'admin@avichi.edu');
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!password || password === 'CHANGE_ME_on_first_run') {
    throw new Error('Set SUPER_ADMIN_PASSWORD in .env before running bootstrap');
  }

  const department = await prisma.department.upsert({
    where: { name: 'Administration' },
    update: {},
    create: { name: 'Administration', code: 'ADMIN' },
  });

  const existing = await prisma.user.findUnique({ where: { regNo } });
  if (existing) {
    console.info('Super Admin already exists:', regNo);
    return;
  }

  const passwordHash = await hashPassword(password);
  const placeholderMobile = '9000000000';

  const user = await prisma.user.create({
    data: {
      regNo,
      email,
      passwordHash,
      mobileHash: hashValue(placeholderMobile),
      mobileEnc: encryptField(placeholderMobile),
      role: 'SUPER_ADMIN',
      departmentId: department.id,
      profile: { create: { name: 'Super Admin' } },
      admin: {
        create: {
          username: regNo.toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin',
          employeeId: regNo,
          permissions: {
            studentManagement: true,
            communityManagement: true,
            events: true,
            moderation: true,
            reports: true,
            settings: true,
            superAdminManagement: true,
            announcements: true,
            passwordReset: true,
          },
          isRoot: true,
        },
      },
    },
  });

  console.info('Super Admin created:', user.regNo, user.email);
  // Ensure protected rootadmin account exists as well
  try {
    const { ensureRootSuperAdmin } = await import('../src/services/super-admin/admins.service.js');
    const root = await ensureRootSuperAdmin({ password });
    console.info('Root Super Admin:', root);
  } catch (e) {
    console.warn('ensureRootSuperAdmin skipped:', e);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());