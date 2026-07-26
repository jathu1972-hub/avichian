import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: {
      regNo: true,
      email: true,
      mfaEnabled: true,
      accountStatus: true,
      failedLoginCount: true,
      admin: { select: { id: true } },
    },
  });
  console.log(JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());