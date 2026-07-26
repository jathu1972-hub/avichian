import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();

async function q(sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.info('OK:', sql.slice(0, 80));
  } catch (e) {
    console.warn('Skip:', sql.slice(0, 60), e instanceof Error ? e.message.slice(0, 120) : e);
  }
}

async function main() {
  await q(`UPDATE users SET role = 'STAFF' WHERE role::text = 'HOD'`);
  await q(`DROP TABLE IF EXISTS hod CASCADE`);

  // Cleanup failed partial migration
  await q(`DROP TYPE IF EXISTS "UserRole_old" CASCADE`);

  // Check current enum labels
  const labels = await prisma.$queryRawUnsafe<Array<{ enumlabel: string }>>(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'UserRole' ORDER BY enumsortorder`,
  );
  console.info('Current UserRole labels:', labels.map((l) => l.enumlabel).join(', '));

  if (labels.some((l) => l.enumlabel === 'HOD')) {
    await q(`ALTER TABLE users ALTER COLUMN role DROP DEFAULT`);
    await q(`ALTER TABLE student_master ALTER COLUMN role DROP DEFAULT`);
    await q(`CREATE TYPE "UserRole_new" AS ENUM ('STUDENT', 'STAFF', 'SUPER_ADMIN')`);
    await q(
      `ALTER TABLE users ALTER COLUMN role TYPE "UserRole_new" USING (CASE WHEN role::text = 'HOD' THEN 'STAFF' ELSE role::text END)::"UserRole_new"`,
    );
    await q(
      `ALTER TABLE student_master ALTER COLUMN role TYPE "UserRole_new" USING (CASE WHEN role::text = 'HOD' THEN 'STAFF' ELSE role::text END)::"UserRole_new"`,
    );
    await q(`DROP TYPE "UserRole"`);
    await q(`ALTER TYPE "UserRole_new" RENAME TO "UserRole"`);
    await q(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'STUDENT'::"UserRole"`);
    await q(`ALTER TABLE student_master ALTER COLUMN role SET DEFAULT 'STUDENT'::"UserRole"`);
  }

  console.info('Done');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
