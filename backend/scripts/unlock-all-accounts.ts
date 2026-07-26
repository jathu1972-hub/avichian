/**
 * Clear login lockouts for all users (development recovery).
 * Run: npx tsx scripts/unlock-all-accounts.ts
 */
import { prisma } from '../src/lib/prisma.js';

// Raw SQL so this works even if Prisma client is stale before regenerate
const result = await prisma.$executeRawUnsafe(`
  UPDATE users
  SET
    failed_login_count = 0,
    locked_until = NULL,
    last_failed_login_at = NULL
`);

console.log(`Unlocked / reset failed attempts (rows affected: ${result}).`);
await prisma.$disconnect();
