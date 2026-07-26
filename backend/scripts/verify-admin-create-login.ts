/**
 * Verifies Super-Admin-created students can log in immediately via Users table.
 * Run: npx tsx scripts/verify-admin-create-login.ts
 */
import { createStudentAccount } from '../src/services/super-admin/students.service.js';
import { loginWithPassword } from '../src/services/auth.service.js';
import { prisma } from '../src/lib/prisma.js';
import { normalizeRegNo } from '@avichian/shared';

async function main() {
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error('Seed a department first');

  const regNo = normalizeRegNo(`ADM${Date.now().toString().slice(-7)}`);
  const password = 'AdminCreate1';

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  const adminId = admin?.id ?? 'system';

  const created = await createStudentAccount(
    {
      regNo,
      name: 'ADMIN CREATED STUDENT',
      email: `${regNo.toLowerCase()}@avichi.edu`,
      mobile: '9876501234',
      departmentId: dept.id,
      year: 1,
      password,
    },
    adminId,
    {},
  );

  console.log('Created:', created);

  const row = await prisma.user.findUnique({
    where: { regNo },
    select: { id: true, regNo: true, accountStatus: true, role: true, studentMasterId: true },
  });
  console.log('DB user:', row);
  if (!row || row.accountStatus !== 'ACTIVE') throw new Error('User not ACTIVE in PostgreSQL');

  const byReg = await loginWithPassword({ regNo, password }, {});
  if (!('accessToken' in byReg)) throw new Error('Login by regNo failed');
  console.log('Login by regNo OK, JWT length', byReg.accessToken.length);

  const byEmail = await loginWithPassword(
    { regNo: `${regNo.toLowerCase()}@avichi.edu`, password },
    {},
  );
  if (!('accessToken' in byEmail)) throw new Error('Login by email failed');
  console.log('Login by email OK');

  await prisma.user.delete({ where: { id: created.id } });
  await prisma.studentMaster.deleteMany({ where: { regNo } });
  console.log('PASS: admin create → PostgreSQL user → immediate login');
}

main()
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
