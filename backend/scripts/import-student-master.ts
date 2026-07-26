import { config } from 'dotenv';
import { resolve } from 'path';
import { importStudentMasterFromFile } from '../src/services/student-master.service.js';
import { prisma } from '../src/lib/prisma.js';

config({ path: resolve(process.cwd(), '../.env') });

const seedPath = resolve(process.cwd(), '../seed-data/student_master.json');
const result = await importStudentMasterFromFile(seedPath);
console.info('Import complete:', result);
await prisma.$disconnect();