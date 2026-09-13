/**
 * Ensure protected rootadmin Super Admin exists.
 * npx tsx scripts/ensure-root-super-admin.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { ensureRootSuperAdmin } from '../src/services/super-admin/admins.service.js';
import { prisma } from '../src/lib/prisma.js';

config({ path: resolve(process.cwd(), '.env.prod-seed') });
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../.env') });

const result = await ensureRootSuperAdmin();
console.info(result);
await prisma.$disconnect();
