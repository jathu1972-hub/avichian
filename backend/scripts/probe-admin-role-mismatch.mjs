import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const withAdminNotRole = await p.user.findMany({
  where: { admin: { isNot: null }, NOT: { role: 'SUPER_ADMIN' }, deletedAt: null },
  select: { id: true, regNo: true, role: true, admin: { select: { username: true } } },
});
const superWithoutAdmin = await p.user.findMany({
  where: { role: 'SUPER_ADMIN', admin: null, deletedAt: null },
  select: { id: true, regNo: true, role: true },
});
console.log('admin row but role!=SUPER_ADMIN', withAdminNotRole);
console.log('SUPER_ADMIN role but no admin row', superWithoutAdmin);
await p.$disconnect();
