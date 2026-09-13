import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const r = await p.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_name='admins' ORDER BY 1`,
);
console.log(r.map((x) => x.column_name).join(', '));
await p.$disconnect();
