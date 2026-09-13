/**
 * Production seed: import Student Master + create login accounts.
 *
 * Usage (from backend/):
 *   set env from Railway, then:
 *   npx tsx scripts/seed-production-students.ts
 *
 * Default password for all seeded students: Student@2026
 * (forcePasswordChange = true → change on first login)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { prisma } from '../src/lib/prisma.js';
import { importStudentMasterFromFile } from '../src/services/student-master.service.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { normalizeEmail, normalizeMobile, normalizeName, normalizeRegNo } from '@avichian/shared';

// Prefer explicit prod seed file, then backend/.env, then monorepo .env
config({ path: resolve(process.cwd(), '.env.prod-seed') });
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../.env') });

const DEFAULT_PASSWORD = process.env.SEED_STUDENT_PASSWORD ?? 'Student@2026';
const SEED_PATH = resolve(process.cwd(), '../seed-data/student_master.json');

async function ensureSuperAdminPassword() {
  const regNo = normalizeRegNo(process.env.SUPER_ADMIN_REG_NO ?? 'ADMIN001');
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL ?? 'admin@avichi.edu');
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) {
    console.warn('SUPER_ADMIN_PASSWORD not set — skipping admin password repair');
    return;
  }

  const user = await prisma.user.findFirst({
    where: { regNo, deletedAt: null },
    include: { admin: true },
  });
  if (!user) {
    console.warn('Super Admin not found — run seed:admin first');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'SUPER_ADMIN',
      accountStatus: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
      forcePasswordChange: false,
    },
  });
  if (!user.admin) {
    await prisma.admin.create({ data: { userId: user.id } });
  }
  console.info('Super Admin password confirmed for', regNo, email);
}

async function createStudentFromMaster(regNoRaw: string, usedMobileHashes: Set<string>) {
  const regNo = normalizeRegNo(regNoRaw);
  const master = await prisma.studentMaster.findUnique({
    where: { regNo },
    include: { department: true, user: true },
  });
  if (!master) {
    return { regNo, status: 'no_master' as const };
  }
  if (master.user && !master.user.deletedAt) {
    // Reset password so login works even if account already exists
    await prisma.user.update({
      where: { id: master.user.id },
      data: {
        passwordHash: await hashPassword(DEFAULT_PASSWORD),
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
        forcePasswordChange: true,
      },
    });
    return { regNo, status: 'password_reset' as const };
  }

  let mobileHash = master.mobileHash;
  let mobileEnc = master.mobileEnc;
  if (usedMobileHashes.has(mobileHash)) {
    // Seed data has duplicate mobiles — keep unique mobileHash for schema
    const synthetic = normalizeMobile(
      String(9000000000 + (usedMobileHashes.size % 99999999)).padStart(10, '0'),
    );
    mobileHash = hashValue(synthetic);
    mobileEnc = encryptField(synthetic);
    console.warn(`  ${regNo}: duplicate mobile — using unique synthetic mobile for DB only`);
  }
  usedMobileHashes.add(mobileHash);

  // Soft-delete conflicts on unique fields
  const soft = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ regNo }, { email: master.email }, { mobileHash }],
    },
  });
  for (const row of soft) {
    await prisma.user.update({
      where: { id: row.id },
      data: {
        studentMasterId: null,
        email: `deleted+${row.id.slice(0, 8)}@invalid.local`,
        mobileHash: `deleted_${row.id}`,
        regNo: `DEL${row.id.replace(/-/g, '').slice(0, 9)}`.slice(0, 12),
      },
    });
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        regNo,
        email: master.email,
        passwordHash,
        mobileHash,
        mobileEnc,
        role: 'STUDENT',
        departmentId: master.departmentId,
        studentMasterId: master.id,
        accountStatus: 'ACTIVE',
        forcePasswordChange: true,
        failedLoginCount: 0,
        lockedUntil: null,
        profile: {
          create: {
            name: normalizeName(master.name),
            year: master.year,
            section: master.section,
            privacy: 'PUBLIC',
          },
        },
      },
    });
    await tx.studentMaster.update({
      where: { id: master.id },
      data: { accountCreated: true },
    });
  });

  return { regNo, status: 'created' as const };
}

async function main() {
  console.info('=== AVICHIAN production student seed ===');
  console.info('Database host:', (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@'));

  await ensureSuperAdminPassword();

  console.info('Importing student master from', SEED_PATH);
  const importResult = await importStudentMasterFromFile(SEED_PATH);
  console.info('Master import:', importResult);

  const raw = await readFile(SEED_PATH, 'utf-8');
  const data = JSON.parse(raw) as { students?: { reg_no: string }[] };
  const regNos = (data.students ?? []).map((s) => s.reg_no);

  // Track mobile hashes already in DB + new ones
  const existing = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { mobileHash: true },
  });
  const usedMobileHashes = new Set(existing.map((u) => u.mobileHash));

  let created = 0;
  let reset = 0;
  let skipped = 0;

  for (const reg of regNos) {
    const result = await createStudentFromMaster(reg, usedMobileHashes);
    if (result.status === 'created') {
      created += 1;
      console.info('  +', result.regNo);
    } else if (result.status === 'password_reset') {
      reset += 1;
      console.info('  ~', result.regNo, '(password reset)');
    } else {
      skipped += 1;
      console.info('  ?', result.regNo, result.status);
    }
  }

  const counts = {
    users: await prisma.user.count(),
    students: await prisma.user.count({ where: { role: 'STUDENT', deletedAt: null } }),
    master: await prisma.studentMaster.count(),
  };

  console.info('---');
  console.info('Created:', created, 'Password reset:', reset, 'Skipped:', skipped);
  console.info('Totals:', counts);
  console.info('Student login password (all seeded):', DEFAULT_PASSWORD);
  console.info('Example: regNo 25VCM01 / password', DEFAULT_PASSWORD);
  console.info('Super Admin: ADMIN001 + admin@avichi.edu + SUPER_ADMIN_PASSWORD from env');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
