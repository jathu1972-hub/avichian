import { config } from 'dotenv';
import { resolve } from 'path';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/utils/password.js';
import { encryptField, hashValue } from '../src/utils/crypto.js';
import { normalizeEmail } from '@avichian/shared';

config({ path: resolve(process.cwd(), '../.env') });

async function main() {
  const staffId = process.env.STAFF_ID ?? 'STAFF001';
  const email = normalizeEmail(process.env.STAFF_EMAIL ?? 'staff@avichi.edu');
  const password = process.env.STAFF_PASSWORD ?? 'StaffPass1';
  const name = process.env.STAFF_NAME ?? 'Test Staff';
  const departmentName = process.env.STAFF_DEPARTMENT ?? 'Visual Communication';

  const department = await prisma.department.upsert({
    where: { name: departmentName },
    update: {},
    create: { name: departmentName },
  });

  const existing = await prisma.staff.findUnique({ where: { staffId } });
  if (existing) {
    console.info('Staff already exists:', staffId);
    return;
  }

  const mobile = '9000000001';
  const user = await prisma.user.create({
    data: {
      regNo: staffId,
      email,
      passwordHash: await hashPassword(password),
      mobileHash: hashValue(mobile),
      mobileEnc: encryptField(mobile),
      role: 'STAFF',
      departmentId: department.id,
      profile: { create: { name } },
      staff: { create: { staffId, departmentId: department.id, title: 'Faculty' } },
    },
  });

  console.info('Staff created:', staffId, user.email, 'password:', password);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());