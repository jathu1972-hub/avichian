import { prisma } from '../src/lib/prisma.js';
import { verifyPassword } from '../src/utils/password.js';
import { loginWithPassword } from '../src/services/auth.service.js';

async function main() {
  const candidates = [
    'Tmp@test123A1',
    'ChangeMe2025!',
    'Admin@123',
    'Student@123',
    'Abc@2026',
    'Password1',
    'password',
  ];
  const users = await prisma.user.findMany({
    where: { role: 'STUDENT', deletedAt: null },
    take: 8,
    orderBy: { createdAt: 'desc' },
  });

  for (const u of users) {
    const matches: string[] = [];
    for (const p of candidates) {
      if (await verifyPassword(p, u.passwordHash)) matches.push(p);
    }
    console.log({
      regNo: u.regNo,
      email: u.email,
      status: u.accountStatus,
      role: u.role,
      matches,
    });
  }

  // Full login path for newest student — try brute common
  const newest = users[0];
  if (newest) {
    for (const p of candidates) {
      try {
        const r = await loginWithPassword(
          { regNo: newest.regNo, password: p },
          { ipAddress: '127.0.0.1' },
        );
        if ('accessToken' in r) {
          console.log('LOGIN_OK', newest.regNo, p, (r as { user: { role: string } }).user.role);
          break;
        }
        console.log('LOGIN_PARTIAL', newest.regNo, p, r);
      } catch (e) {
        console.log('LOGIN_FAIL', newest.regNo, p, e instanceof Error ? e.message : e);
      }
    }
  }

  // Create via service and login immediately
  const { createStudentAccount } = await import('../src/services/super-admin/students.service.js');
  const dept = await prisma.department.findFirst();
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!dept || !admin) {
    console.log('missing dept/admin');
    return;
  }

  const regNo = `25TST${String(Date.now()).slice(-4)}`;
  const password = 'BlueSky#91x';
  try {
    const created = await createStudentAccount(
      {
        regNo,
        name: 'Test Login Student',
        email: `${regNo.toLowerCase()}@avichi.edu`,
        mobile: '9876543210',
        departmentId: dept.id,
        year: 2,
        password,
      },
      admin.id,
      { ipAddress: '127.0.0.1' },
    );
    console.log('CREATED', created);

    const login = await loginWithPassword(
      { regNo, password },
      { ipAddress: '127.0.0.1' },
    );
    console.log(
      'LOGIN_AFTER_CREATE',
      'accessToken' in login,
      'user' in login ? (login as { user: { regNo: string; role: string } }).user : login,
    );

    const emailLogin = await loginWithPassword(
      { regNo: `${regNo.toLowerCase()}@avichi.edu`, password },
      { ipAddress: '127.0.0.1' },
    );
    console.log('EMAIL_LOGIN', 'accessToken' in emailLogin);

    // cleanup
    await prisma.session.deleteMany({ where: { userId: created.id } });
    await prisma.loginHistory.deleteMany({ where: { userId: created.id } });
    await prisma.auditLog.deleteMany({ where: { resourceId: created.id } });
    await prisma.profile.deleteMany({ where: { userId: created.id } });
    await prisma.user.delete({ where: { id: created.id } });
    await prisma.studentMaster.deleteMany({ where: { regNo } });
  } catch (e) {
    console.error('CREATE_OR_LOGIN_ERROR', e);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
