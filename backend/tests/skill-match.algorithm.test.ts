import { describe, expect, it } from 'vitest';
import {
  calculateSkillMatch,
  type MatchProfileSnap,
} from '../src/services/skill-match.algorithm.js';

function snap(partial: Partial<MatchProfileSnap> & { skills?: MatchProfileSnap['skills'] }): MatchProfileSnap {
  return {
    skills: [],
    interests: [],
    goals: [],
    availabilities: [],
    departmentId: 'dept-a',
    departmentName: 'Visual Communication',
    year: 2,
    ...partial,
  };
}

describe('calculateSkillMatch', () => {
  it('scores complementary skills + shared project goal highly', () => {
    const a = snap({
      skills: [
        { id: '1', name: 'Photography', categorySlug: 'film-photo-video', proficiency: 'ADVANCED' },
        { id: '2', name: 'Graphic Design', categorySlug: 'design-visual', proficiency: 'ADVANCED' },
      ],
      interests: [{ id: '9', name: 'Python', categorySlug: 'programming' }],
      goals: [{ slug: 'build-app', label: 'Build an app' }],
    });
    const b = snap({
      departmentId: 'dept-b',
      departmentName: 'Computer Science',
      skills: [
        { id: '3', name: 'Python', categorySlug: 'programming', proficiency: 'ADVANCED' },
        { id: '4', name: 'Artificial Intelligence', categorySlug: 'ai-data', proficiency: 'INTERMEDIATE' },
      ],
      interests: [{ id: '8', name: 'Photography', categorySlug: 'film-photo-video' }],
      goals: [{ slug: 'build-app', label: 'Build an app' }],
    });

    const result = calculateSkillMatch(a, b);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.youHelpThem).toContain('Photography');
    expect(result.theyHelpYou).toContain('Python');
    expect(result.sharedGoals).toContain('Build an app');
    expect(result.reasons.some((r) => r.type === 'project')).toBe(true);
  });

  it('does not invent a high score for empty profiles', () => {
    const result = calculateSkillMatch(snap({}), snap({ departmentId: 'dept-b' }));
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it('rewards shared goals even when technical skills do not overlap', () => {
    const a = snap({
      skills: [{ id: '1', name: 'Photography', categorySlug: 'film-photo-video', proficiency: 'EXPERT' }],
      goals: [{ slug: 'short-film', label: 'Work on a short film' }],
    });
    const b = snap({
      departmentId: 'dept-b',
      skills: [{ id: '2', name: 'Cinematography', categorySlug: 'film-photo-video', proficiency: 'ADVANCED' }],
      goals: [{ slug: 'short-film', label: 'Work on a short film' }],
    });
    const result = calculateSkillMatch(a, b);
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.sharedGoals).toEqual(['Work on a short film']);
  });
});
