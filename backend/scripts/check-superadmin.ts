import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ role: 'SUPER_ADMIN' }, { regNo: 'SUPERADMIN' }] },
    include: { admin: true, profile: true },
  });
  console.log(
    'found',
    users.map((u) => ({
      regNo: u.regNo,
      email: u.email,
      role: u.role,
      hasAdmin: Boolean(u.admin),
    })),
  );

  // Ensure login works with env credentials
  const regNo = process.env.SUPER_ADMIN_REG_NO ?? 'SUPERADMIN';
  const email = process.env.SUPER_ADMIN_EMAIL ?? 'admin@avichi.edu';
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'Super@Admin2026';

  let user = await prisma.user.findFirst({
    where: { regNo },
    include: { admin: true },
  });

  const passwordHash = await hashPassword(password);

  if (!user) {
    // Need a department for FK - pick any
    const dept = await prisma.department.findFirst();
    if (!dept) throw new Error('No department — seed DB first');
    user = await prisma.user.create({
      data: {
        regNo,
        email,
        role: 'SUPER_ADMIN',
        passwordHash,
        departmentId: dept.id,
        profile: { create: { name: 'Super Admin' } },
        admin: { create: {} },
      },
      include: { admin: true },
    });
    console.log('created super admin', user.regNo);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        role: 'SUPER_ADMIN',
        passwordHash,
        admin: user.admin ? undefined : { create: {} },
      },
      include: { admin: true },
    });
    console.log('updated super admin', user.regNo, user.email);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
