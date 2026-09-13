import { prisma } from '../lib/prisma.js';
import { SKILL_AVAILABILITIES, SKILL_CATEGORIES, SKILL_GOALS, skillSlug } from '../data/skill-catalog.js';

export async function seedSkillCatalog(): Promise<{ categories: number; skills: number }> {
  for (const cat of SKILL_CATEGORIES) {
    const category = await prisma.skillCategory.upsert({
      where: { slug: cat.slug },
      create: { slug: cat.slug, name: cat.name, sortOrder: cat.sortOrder },
      update: { name: cat.name, sortOrder: cat.sortOrder },
    });
    let i = 0;
    for (const name of cat.skills) {
      i += 1;
      const slug = skillSlug(cat.slug, name);
      await prisma.skill.upsert({
        where: { categoryId_slug: { categoryId: category.id, slug } },
        create: { categoryId: category.id, name, slug, sortOrder: i },
        update: { name, sortOrder: i },
      });
    }
  }
  for (const g of SKILL_GOALS) {
    await prisma.skillGoalCatalog.upsert({
      where: { slug: g.slug },
      create: g,
      update: { label: g.label, sortOrder: g.sortOrder },
    });
  }
  for (const a of SKILL_AVAILABILITIES) {
    await prisma.skillAvailabilityCatalog.upsert({
      where: { slug: a.slug },
      create: a,
      update: { label: a.label, sortOrder: a.sortOrder },
    });
  }
  const skills = await prisma.skill.count();
  return { categories: SKILL_CATEGORIES.length, skills };
}

let ensurePromise: Promise<void> | null = null;

/** Idempotent — fills an empty catalog on first Skill Match request (local + production). */
export async function ensureSkillCatalog(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const skills = await prisma.skill.count();
      const goals = await prisma.skillGoalCatalog.count();
      if (skills < 500 || goals < SKILL_GOALS.length) {
        await seedSkillCatalog();
      }
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}
