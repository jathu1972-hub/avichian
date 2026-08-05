/**
 * End-to-end: Super Admin creates student → login reg+pw → login email+pw → reset → login new pw
 * Run: npx tsx scripts/e2e-student-auth.ts
 */
import { prisma } from '../src/lib/prisma.js';
import { verifyPassword } from '../src/utils/password.js';
import { createStudentAccount, resetStudentPassword } from '../src/services/super-admin/students.service.js';
import { createSuperAdminAccount } from '../src/services/super-admin/admins.service.js';
import { loginWithPassword, loginSuperAdmin } from '../src/services/auth.service.js';
import { repairAdminRoles } from '../src/services/super-admin/admins.service.js';

async function main() {
  console.log('--- repair admin roles ---');
  console.log(await repairAdminRoles());

  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
  });
  const dept = await prisma.department.findFirst();
  if (!admin || !dept) throw new Error('Need SUPER_ADMIN + department');

  const stamp = String(Date.now()).slice(-6);
  const regNo = `25E2E${stamp}`.slice(0, 12);
  const password = `Test@${stamp.slice(0, 4)}x1`;
  const email = `${regNo.toLowerCase()}@avichi.edu`;

  console.log('--- create student ---', { regNo, password });
  const created = await createStudentAccount(
    {
      regNo,
      name: 'E2E Test Student',
      email,
      mobile: null,
      departmentId: dept.id,
      year: 2,
      section: 'A',
      password,
      confirmPassword: password,
      status: 'ACTIVE',
    },
    admin.id,
    { ipAddress: '127.0.0.1' },
  );
  console.log('created', created);

  const row = await prisma.user.findUnique({ where: { id: created.id } });
  if (!row) throw new Error('User not in DB');
  const hashOk = await verifyPassword(password, row.passwordHash);
  if (!hashOk) throw new Error('Password hash verification failed');
  if (row.passwordHash === password) throw new Error('Password stored in plain text!');
  console.log('hash ok, bcrypt prefix', row.passwordHash.slice(0, 7));

  const login1 = await loginWithPassword({ regNo, password }, { ipAddress: '127.0.0.1' });
  if (!('accessToken' in login1)) throw new Error('Login by regNo failed');
  console.log('login regNo OK', login1.user.regNo, login1.user.role);

  const login2 = await loginWithPassword({ regNo: email, password }, { ipAddress: '127.0.0.1' });
  if (!('accessToken' in login2)) throw new Error('Login by email failed');
  console.log('login email OK');

  const newPw = `New@${stamp.slice(0, 4)}y2`;
  await resetStudentPassword(created.id, newPw, admin.id, { ipAddress: '127.0.0.1' }, newPw);
  const login3 = await loginWithPassword({ regNo, password: newPw }, { ipAddress: '127.0.0.1' });
  if (!('accessToken' in login3)) throw new Error('Login after reset failed');
  console.log('login after reset OK');

  try {
    await loginWithPassword({ regNo, password }, { ipAddress: '127.0.0.1' });
    throw new Error('Old password should fail');
  } catch (e) {
    console.log('old password rejected OK', e instanceof Error ? e.message : e);
  }

  const empId = `SA${stamp}`.slice(0, 12);
  const adminPw = `Adm@${stamp.slice(0, 4)}z9`;
  const newAdmin = await createSuperAdminAccount(
    {
      name: 'E2E Super Admin',
      employeeId: empId,
      email: `e2eadmin${stamp}@avichi.edu`,
      password: adminPw,
      confirmPassword: adminPw,
    },
    admin.id,
    { ipAddress: '127.0.0.1' },
  );
  console.log('super admin created', newAdmin);

  const saLogin = await loginSuperAdmin(
    {
      adminId: empId,
      email: `e2eadmin${stamp}@avichi.edu`,
      password: adminPw,
    },
    { ipAddress: '127.0.0.1' },
  );
  if (!('accessToken' in saLogin) && !('mfaRequired' in saLogin) && !('mfaSetupRequired' in saLogin)) {
    throw new Error('Super admin login failed');
  }
  console.log('super admin login OK', saLogin);

  // cleanup
  await prisma.session.deleteMany({
    where: { userId: { in: [created.id, newAdmin.id] } },
  });
  await prisma.loginHistory.deleteMany({
    where: { userId: { in: [created.id, newAdmin.id] } },
  });
  await prisma.auditLog.deleteMany({
    where: { resourceId: { in: [created.id, newAdmin.id] } },
  });
  await prisma.profile.deleteMany({ where: { userId: { in: [created.id, newAdmin.id] } } });
  await prisma.admin.deleteMany({ where: { userId: newAdmin.id } });
  await prisma.user.deleteMany({ where: { id: { in: [created.id, newAdmin.id] } } });
  await prisma.studentMaster.deleteMany({ where: { regNo } });

  console.log('--- ALL E2E CHECKS PASSED ---');
}

main()
  .catch((e) => {
    console.error('E2E FAILED', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
