import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const admins = await p.user.findMany({
  where: { role: 'SUPER_ADMIN', deletedAt: null },
  select: {
    id: true,
    regNo: true,
    email: true,
    role: true,
    accountStatus: true,
    forcePasswordChange: true,
    admin: { select: { username: true, isRoot: true, permissions: true } },
  },
  take: 15,
});
console.log(JSON.stringify(admins, null, 2));
await p.$disconnect();
