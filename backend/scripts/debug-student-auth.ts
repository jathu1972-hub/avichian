import { prisma } from '../src/lib/prisma.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { normalizeRegNo } from '@avichian/shared';

async function main() {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', deletedAt: null },
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      regNo: true,
      email: true,
      passwordHash: true,
      accountStatus: true,
      forcePasswordChange: true,
      role: true,
      mobileHash: true,
      createdAt: true,
    },
  });

  console.log(
    'recent students',
    students.map((s) => ({
      regNo: s.regNo,
      email: s.email,
      status: s.accountStatus,
      force: s.forcePasswordChange,
      hashPrefix: s.passwordHash?.slice(0, 25),
      hashLen: s.passwordHash?.length,
      sameAsFirst: students[0] ? s.passwordHash === students[0].passwordHash : false,
    })),
  );

  const hashes = await prisma.user.groupBy({
    by: ['passwordHash'],
    where: { role: 'STUDENT', deletedAt: null },
    _count: true,
    orderBy: { _count: { passwordHash: 'desc' } },
    take: 5,
  });
  console.log(
    'top password hash counts',
    hashes.map((h) => ({ count: h._count, prefix: h.passwordHash.slice(0, 25) })),
  );

  // Simulate create + login
  const dept = await prisma.department.findFirst();
  if (!dept) {
    console.error('No department');
    return;
  }

  const regNo = `T${Date.now().toString().slice(-8)}`;
  const password = 'Abc@2026x';
  const passwordHash = await hashPassword(password);
  const email = `${regNo.toLowerCase()}@avichi.edu`;
  const mobileHash = `test_${regNo}`;

  const user = await prisma.user.create({
    data: {
      regNo: normalizeRegNo(regNo),
      email,
      passwordHash,
      mobileHash,
      mobileEnc: 'test',
      role: 'STUDENT',
      departmentId: dept.id,
      accountStatus: 'ACTIVE',
      forcePasswordChange: false,
      profile: { create: { name: 'TEST STUDENT', year: 1, privacy: 'PUBLIC' } },
    },
  });

  const found = await prisma.user.findFirst({
    where: { regNo: normalizeRegNo(regNo), deletedAt: null },
  });
  const ok = found ? await verifyPassword(password, found.passwordHash) : false;
  console.log({ created: user.regNo, found: !!found, passwordOk: ok });

  await prisma.profile.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
