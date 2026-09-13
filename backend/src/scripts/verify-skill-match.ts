/**
 * Manual Skill Match QA against real PostgreSQL users (25CALL01 / 25CALL02).
 * Does not create fake students. Restores prior Skill Match rows after the run.
 */
import { prisma } from '../lib/prisma.js';
import {
  acceptSkillConnect,
  declineSkillConnect,
  discoverMatches,
  getCatalog,
  getMatchProfile,
  saveMySkillMatch,
  sendSkillConnect,
} from '../services/skill-match.service.js';

async function main() {
  const catalog = await getCatalog();
  if (catalog.categories.length !== 10) {
    throw new Error(`Expected 10 categories, got ${catalog.categories.length}`);
  }
  const skillCount = catalog.categories.reduce((n, c) => n + c.skills.length, 0);
  if (skillCount !== 500) {
    throw new Error(`Expected 500 skills, got ${skillCount}`);
  }

  const a = await prisma.user.findUnique({ where: { regNo: '25CALL01' } });
  const b = await prisma.user.findUnique({ where: { regNo: '25CALL02' } });
  if (!a || !b) {
    throw new Error('Real test students 25CALL01 / 25CALL02 not found');
  }
  if (!a.lastLoginAt || !b.lastLoginAt || a.forcePasswordChange || b.forcePasswordChange) {
    throw new Error('Test students are not activated');
  }

  const photo = catalog.categories.find((c) => c.slug === 'film-photo-video')!;
  const design = catalog.categories.find((c) => c.slug === 'design-visual')!;
  const prog = catalog.categories.find((c) => c.slug === 'programming')!;
  const ai = catalog.categories.find((c) => c.slug === 'ai-data')!;
  const photography = photo.skills.find((s) => s.name === 'Photography')!;
  const graphic = design.skills.find((s) => s.name === 'Graphic Design')!;
  const python = prog.skills.find((s) => s.name === 'Python')!;
  const aiSkill = ai.skills.find((s) => s.name === 'Artificial Intelligence')!;
  const buildApp = catalog.goals.find((g) => g.slug === 'build-app')!;
  const teamwork = catalog.availabilities.find((x) => x.slug === 'teamwork')!;

  await saveMySkillMatch(a.id, {
    skills: [
      { skillId: photography.id, proficiency: 'ADVANCED' },
      { skillId: graphic.id, proficiency: 'ADVANCED' },
    ],
    interestIds: [python.id, aiSkill.id],
    goalIds: [buildApp.id],
    availabilityIds: [teamwork.id],
    visibility: 'CAMPUS',
  });
  await saveMySkillMatch(b.id, {
    skills: [
      { skillId: python.id, proficiency: 'ADVANCED' },
      { skillId: aiSkill.id, proficiency: 'INTERMEDIATE' },
    ],
    interestIds: [photography.id],
    goalIds: [buildApp.id],
    availabilityIds: [teamwork.id],
    visibility: 'CAMPUS',
  });

  const discovered = await discoverMatches(a.id, { sort: 'best', limit: 12 });
  const hit = discovered.items.find((item) => item.id === b.id);
  if (!hit) throw new Error('25CALL02 not in 25CALL01 discovery results');
  if (hit.matchScore === null || hit.matchScore < 50) {
    throw new Error(`Match score too low or missing: ${hit.matchScore}`);
  }
  if (!hit.youHelpThem.includes('Photography')) {
    throw new Error(`Expected Photography in youHelpThem, got ${hit.youHelpThem.join(',')}`);
  }
  if (!hit.theyHelpYou.includes('Python')) {
    throw new Error(`Expected Python in theyHelpYou, got ${hit.theyHelpYou.join(',')}`);
  }
  if (!hit.sharedGoals.includes('Build an app')) {
    throw new Error(`Expected shared goal, got ${hit.sharedGoals.join(',')}`);
  }

  const profile = await getMatchProfile(a.id, b.id);
  if (profile.matchScore !== hit.matchScore) {
    throw new Error('Discover score and profile score differ');
  }

  // Clean leftover requests so connect can be tested
  await prisma.skillMatchRequest.deleteMany({
    where: {
      OR: [
        { senderId: a.id, receiverId: b.id },
        { senderId: b.id, receiverId: a.id },
      ],
    },
  });

  const sent = await sendSkillConnect(a.id, b.id);
  if (sent.connectionState !== 'request_sent' && sent.connectionState !== 'connected') {
    throw new Error(`Unexpected connect state ${sent.connectionState}`);
  }

  if (sent.connectionState === 'request_sent' && sent.requestId) {
    const declined = await declineSkillConnect(b.id, sent.requestId);
    if (!declined.ok) throw new Error('Decline failed');
    const sentAgain = await sendSkillConnect(a.id, b.id);
    if (sentAgain.connectionState !== 'request_sent' || !sentAgain.requestId) {
      throw new Error('Re-send after decline failed');
    }
    const accepted = await acceptSkillConnect(b.id, sentAgain.requestId);
    if (accepted.connectionState !== 'connected') {
      throw new Error('Accept did not connect');
    }
    try {
      await sendSkillConnect(a.id, b.id);
      throw new Error('Duplicate connect should have failed');
    } catch (err) {
      if (!(err instanceof Error) || !/already connected/i.test(err.message)) {
        throw err;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogSkills: skillCount,
        matchScore: hit.matchScore,
        youHelpThem: hit.youHelpThem,
        theyHelpYou: hit.theyHelpYou,
        sharedGoals: hit.sharedGoals,
        reasons: hit.reasons.map((r) => r.title),
        connectionState: 'connected',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
