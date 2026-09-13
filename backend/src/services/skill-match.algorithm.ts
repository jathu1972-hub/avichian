/** Pure Skill Match scoring. Authoritative scores are computed on the server from real profile data. */

export const PROFICIENCY_WEIGHT: Record<string, number> = {
  BEGINNER: 1,
  INTERMEDIATE: 1.35,
  ADVANCED: 1.75,
  EXPERT: 2.15,
};

export const COLLAB_GOAL_SLUGS = new Set([
  'join-project',
  'find-teammates',
  'short-film',
  'build-app',
  'design-something',
  'build-startup',
  'cover-event',
  'participate-event',
  'freelance',
]);

export const COMPLEMENTARY_CATEGORIES: Record<string, readonly string[]> = {
  'design-visual': ['film-photo-video', 'programming', 'marketing-media'],
  'film-photo-video': ['design-visual', 'music-arts', 'marketing-media'],
  programming: ['ai-data', 'design-visual', 'business'],
  'ai-data': ['programming', 'business'],
  'marketing-media': ['design-visual', 'film-photo-video', 'business'],
  business: ['programming', 'marketing-media', 'ai-data'],
  communication: ['marketing-media', 'academic', 'business'],
  'music-arts': ['film-photo-video'],
  academic: ['communication'],
  practical: ['film-photo-video', 'design-visual'],
};

export type SkillSnap = {
  id: string;
  name: string;
  categorySlug: string;
  proficiency?: string;
};

export type GoalSnap = { slug: string; label: string };
export type AvailSnap = { slug: string; label: string };

export type MatchProfileSnap = {
  skills: SkillSnap[];
  interests: SkillSnap[];
  goals: GoalSnap[];
  availabilities: AvailSnap[];
  departmentId: string;
  departmentName: string;
  year: number | null;
};

export type MatchReason = {
  type:
    | 'project'
    | 'you_help'
    | 'they_help'
    | 'shared_goal'
    | 'shared_interest'
    | 'availability'
    | 'department'
    | 'year'
    | 'fields';
  title: string;
  youBring?: string[];
  theyBring?: string[];
  goals?: string[];
  items?: string[];
};

export type MatchBreakdown = {
  score: number;
  youHelpThem: string[];
  theyHelpYou: string[];
  sharedGoals: string[];
  sharedInterests: string[];
  sharedAvailability: string[];
  reasons: MatchReason[];
};

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function uniqueNames(items: { name: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = norm(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.name);
  }
  return out;
}

function categoriesOf(skills: SkillSnap[]): Set<string> {
  return new Set(skills.map((s) => s.categorySlug).filter(Boolean));
}

function complementaryFields(a: Set<string>, b: Set<string>): boolean {
  for (const cat of a) {
    const partners = COMPLEMENTARY_CATEGORIES[cat] ?? [];
    for (const p of partners) {
      if (b.has(p)) return true;
    }
  }
  return false;
}

export function calculateSkillMatch(viewer: MatchProfileSnap, other: MatchProfileSnap): MatchBreakdown {
  const viewerInterestKeys = new Set(viewer.interests.map((s) => norm(s.name)));
  const otherInterestKeys = new Set(other.interests.map((s) => norm(s.name)));
  const viewerSkillKeys = new Set(viewer.skills.map((s) => norm(s.name)));
  const otherSkillKeys = new Set(other.skills.map((s) => norm(s.name)));

  const youHelpSkills = viewer.skills.filter((s) => otherInterestKeys.has(norm(s.name)));
  const theyHelpSkills = other.skills.filter((s) => viewerInterestKeys.has(norm(s.name)));
  const youHelpThem = uniqueNames(youHelpSkills);
  const theyHelpYou = uniqueNames(theyHelpSkills);

  const viewerHasSignal =
    viewer.skills.length + viewer.interests.length + viewer.goals.length > 0;
  const otherHasSignal =
    other.skills.length + other.interests.length + other.goals.length > 0;
  if (!viewerHasSignal || !otherHasSignal) {
    return {
      score: 0,
      youHelpThem: [],
      theyHelpYou: [],
      sharedGoals: [],
      sharedInterests: [],
      sharedAvailability: [],
      reasons: [],
    };
  }

  let youHelpPts = 0;
  for (const skill of youHelpSkills) {
    youHelpPts += 7 * (PROFICIENCY_WEIGHT[skill.proficiency ?? 'BEGINNER'] ?? 1);
  }
  let theyHelpPts = 0;
  for (const skill of theyHelpSkills) {
    theyHelpPts += 7 * (PROFICIENCY_WEIGHT[skill.proficiency ?? 'BEGINNER'] ?? 1);
  }

  const sharedInterestSkills = viewer.interests.filter((s) =>
    other.interests.some((o) => norm(o.name) === norm(s.name)),
  );
  const sharedInterests = uniqueNames(sharedInterestSkills);

  const sharedGoalRows = viewer.goals.filter((g) => other.goals.some((o) => o.slug === g.slug));
  const sharedGoals = sharedGoalRows.map((g) => g.label);
  const collabShared = sharedGoalRows.filter((g) => COLLAB_GOAL_SLUGS.has(g.slug));

  const sharedAvailRows = viewer.availabilities.filter((a) =>
    other.availabilities.some((o) => o.slug === a.slug),
  );
  const sharedAvailability = sharedAvailRows.map((a) => a.label);

  const viewerCats = categoriesOf(viewer.skills);
  const otherCats = categoriesOf(other.skills);
  const fieldsComplement = complementaryFields(viewerCats, otherCats);

  const identicalSkills = [...viewerSkillKeys].filter((k) => otherSkillKeys.has(k)).length;

  let projectPts = 0;
  if (collabShared.length && viewer.skills.length && other.skills.length) {
    const littleOverlap = identicalSkills === 0;
    if (littleOverlap || fieldsComplement || youHelpThem.length || theyHelpYou.length) {
      projectPts = Math.min(16, 10 + collabShared.length * 3);
    }
  }

  const sharedGoalPts = Math.min(18, sharedGoalRows.length * 8);
  const interestPts = Math.min(8, sharedInterests.length * 2.5);
  const youHelpScore = Math.min(26, youHelpPts);
  const theyHelpScore = Math.min(26, theyHelpPts);

  let availPts = Math.min(6, sharedAvailRows.length * 2);
  const viewerTeach = viewer.availabilities.some((a) => a.slug === 'teaching' || a.slug === 'mentoring');
  const otherLearn = other.availabilities.some((a) => a.slug === 'learning');
  const otherTeach = other.availabilities.some((a) => a.slug === 'teaching' || a.slug === 'mentoring');
  const viewerLearn = viewer.availabilities.some((a) => a.slug === 'learning');
  if ((viewerTeach && otherLearn) || (otherTeach && viewerLearn)) {
    availPts = Math.min(8, availPts + 2);
  }

  const deptPts = viewer.departmentId && viewer.departmentId === other.departmentId ? 3 : 0;
  let yearPts = 0;
  if (viewer.year && other.year) {
    const diff = Math.abs(viewer.year - other.year);
    if (diff === 0) yearPts = 2;
    else if (diff === 1) yearPts = 1;
  }

  const identicalPts = Math.min(4, identicalSkills * 1.2);
  const fieldPts = fieldsComplement && identicalSkills === 0 ? 5 : fieldsComplement ? 2 : 0;

  const raw =
    youHelpScore +
    theyHelpScore +
    sharedGoalPts +
    projectPts +
    interestPts +
    availPts +
    deptPts +
    yearPts +
    identicalPts +
    fieldPts;

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const reasons: MatchReason[] = [];

  if (projectPts >= 8 && collabShared.length) {
    reasons.push({
      type: 'project',
      title: 'Strong project compatibility',
      youBring: uniqueNames(viewer.skills).slice(0, 6),
      theyBring: uniqueNames(other.skills).slice(0, 6),
      goals: collabShared.map((g) => g.label),
    });
  }

  if (youHelpThem.length) {
    reasons.push({
      type: 'you_help',
      title: 'You can help them',
      items: youHelpThem,
    });
  }

  if (theyHelpYou.length) {
    reasons.push({
      type: 'they_help',
      title: 'They can help you',
      items: theyHelpYou,
    });
  }

  if (sharedGoals.length && projectPts < 8) {
    reasons.push({
      type: 'shared_goal',
      title: sharedGoals.length === 1 ? 'Shared goal' : 'Shared goals',
      goals: sharedGoals,
    });
  } else if (sharedGoals.length && projectPts >= 8 && !reasons.some((r) => r.type === 'project')) {
    reasons.push({
      type: 'shared_goal',
      title: 'Shared goal',
      goals: sharedGoals,
    });
  }

  if (sharedInterests.length) {
    reasons.push({
      type: 'shared_interest',
      title: 'Shared interests',
      items: sharedInterests,
    });
  }

  if (sharedAvailability.length || (viewerTeach && otherLearn) || (otherTeach && viewerLearn)) {
    const items = [...sharedAvailability];
    if (viewerTeach && otherLearn && !items.includes('Teaching')) items.push('Teaching ↔ Learning');
    if (otherTeach && viewerLearn && !items.includes('Learning')) items.push('Learning ↔ Teaching');
    reasons.push({
      type: 'availability',
      title: 'Available to collaborate',
      items,
    });
  }

  if (fieldsComplement) {
    reasons.push({
      type: 'fields',
      title: 'Complementary fields',
      youBring: [...viewerCats],
      theyBring: [...otherCats],
    });
  }

  if (deptPts > 0 && viewer.departmentName) {
    reasons.push({
      type: 'department',
      title: 'Same department',
      items: [viewer.departmentName],
    });
  }

  if (yearPts === 2 && viewer.year) {
    reasons.push({
      type: 'year',
      title: 'Same year',
      items: [yearLabel(viewer.year)],
    });
  }

  return {
    score,
    youHelpThem,
    theyHelpYou,
    sharedGoals,
    sharedInterests,
    sharedAvailability,
    reasons,
  };
}

export function yearLabel(year: number | null | undefined): string {
  if (!year || year < 1) return '';
  const suffixes = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
  const prefix = suffixes[year] ?? `${year}th`;
  return `${prefix} Year`;
}

export function relevanceScore(matchScore: number, lastActiveAt: Date | null): number {
  if (!lastActiveAt) return matchScore * 0.7;
  const days = (Date.now() - lastActiveAt.getTime()) / 86_400_000;
  const recency = days <= 1 ? 1 : days <= 7 ? 0.75 : days <= 30 ? 0.45 : 0.2;
  return matchScore * 0.72 + recency * 28;
}
