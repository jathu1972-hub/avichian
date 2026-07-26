import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { verifyPassword } from '../src/utils/password.js';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    include: { admin: true, profile: true },
    orderBy: { regNo: 'asc' },
  });
  console.log('SUPER_ADMIN count:', users.length);
  for (const u of users) {
    const passwordOk = await verifyPassword('Admin@12345', u.passwordHash);
    console.log({
      regNo: u.regNo,
      email: u.email,
      status: u.accountStatus,
      hasAdmin: Boolean(u.admin),
      mfaEnabled: u.mfaEnabled,
      passwordOk,
      lockedUntil: u.lockedUntil,
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
