import { prisma } from '../lib/prisma.js';
import { seedSkillCatalog } from '../services/skill-catalog.seed.js';

const result = await seedSkillCatalog();
console.log(`Skill catalog ready: ${result.categories} categories, ${result.skills} skills`);
await prisma.$disconnect();
