import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const user = await prisma.user.findUnique({ where: { regNo: 'SUPERADMIN' } });
  if (!user) {
    console.info('No SUPERADMIN account to rename');
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { regNo: 'ADMIN001' },
  });
  console.info('Renamed SUPERADMIN -> ADMIN001');
}

main().finally(() => prisma.$disconnect());