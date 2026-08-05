import { prisma } from '../src/lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      regNo: true,
      email: true,
      role: true,
      accountStatus: true,
      admin: { select: { id: true } },
    },
    orderBy: { role: 'asc' },
  });
  for (const u of users) {
    console.log(`${u.role.padEnd(12)} ${u.regNo.padEnd(12)} ${u.email} ${u.accountStatus}${u.admin ? ' [admin row]' : ''}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
