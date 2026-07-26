import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { decryptField } from '../src/utils/crypto.js';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const master = await prisma.studentMaster.findUnique({
    where: { regNo: '25VCM05' },
    include: { department: true },
  });
  const user = await prisma.user.findUnique({
    where: { regNo: '25VCM05' },
    include: { profile: true },
  });

  console.log('Master:', master ? `${master.name} | ${master.email} | ${decryptField(master.mobileEnc)}` : 'NONE');
  console.log('User:', user ? `${user.profile?.name} | registered` : 'NONE');
}

main().finally(() => prisma.$disconnect());