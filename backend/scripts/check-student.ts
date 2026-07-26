import { prisma } from '../src/lib/prisma.js';

const regNo = process.argv[2] ?? '25VCM01';

const master = await prisma.studentMaster.findUnique({
  where: { regNo },
  include: { department: true, user: { select: { id: true, regNo: true } } },
});

const user = await prisma.user.findUnique({ where: { regNo } });
const total = await prisma.studentMaster.count();

console.log('regNo:', regNo);
console.log('master:', master);
console.log('user:', user);
console.log('total master records:', total);

await prisma.$disconnect();