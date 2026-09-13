import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const u = await p.user.findFirst({
  where: { role: 'STUDENT', lastLoginAt: { not: null }, forcePasswordChange: false },
  select: { regNo: true, email: true },
});
console.log('ok', u);
await p.$disconnect();
