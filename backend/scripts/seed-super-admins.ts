/**
 * Seed Super Admin team accounts.
 * Run from backend/: npx tsx scripts/seed-super-admins.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { normalizeEmail, normalizeRegNo } from '@avichian/shared';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';

config({ path: resolve(process.cwd(), '../.env') });

const SUPER_ADMINS = [
  { employeeId: 'SA001', email: 'admin1@avichian.edu', password: 'Admin@12345', name: 'Super Admin 1' },
  { employeeId: 'SA002', email: 'admin2@avichian.edu', password: 'Admin@12345', name: 'Super Admin 2' },
  { employeeId: 'SA003', email: 'admin3@avichian.edu', password: 'Admin@12345', name: 'Super Admin 3' },
  { employeeId: 'SA004', email: 'admin4@avichian.edu', password: 'Admin@12345', name: 'Super Admin 4' },
  { employeeId: 'SA005', email: 'admin5@avichian.edu', password: 'Admin@12345', name: 'Super Admin 5' },
] as const;

async function main() {
  const department = await prisma.department.upsert({
    where: { name: 'Administration' },
    update: {},
    create: { name: 'Administration', code: 'ADMIN' },
  });

  for (let i = 0; i < SUPER_ADMINS.length; i++) {
    const row = SUPER_ADMINS[i]!;
    const regNo = normalizeRegNo(row.employeeId);
    const email = normalizeEmail(row.email);
    // Unique placeholder mobiles (required unique mobileHash)
    const mobile = `90000000${String(10 + i).padStart(2, '0')}`;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ regNo }, { email }] },
      include: { admin: true },
    });

    if (existing) {
      const passwordHash = await hashPassword(row.password);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          regNo,
          email,
          passwordHash,
          role: 'SUPER_ADMIN',
          accountStatus: 'ACTIVE',
          failedLoginCount: 0,
          lockedUntil: null,
          departmentId: department.id,
          profile: {
            upsert: {
              create: { name: row.name },
              update: { name: row.name },
            },
          },
          admin: existing.admin ? undefined : { create: {} },
        },
      });
      console.info('Updated Super Admin:', regNo, email);
      continue;
    }

    const passwordHash = await hashPassword(row.password);
    await prisma.user.create({
      data: {
        regNo,
        email,
        passwordHash,
        mobileHash: hashValue(mobile),
        mobileEnc: encryptField(mobile),
        role: 'SUPER_ADMIN',
        departmentId: department.id,
        profile: { create: { name: row.name } },
        admin: { create: {} },
      },
    });
    console.info('Created Super Admin:', regNo, email);
  }

  console.info('Done. Login at http://localhost:5174/login');
  console.info('Admin ID = Employee ID (e.g. SA001), Email + Password from table.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
