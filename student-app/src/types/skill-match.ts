export type SkillProficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type SkillMatchVisibility = 'CAMPUS' | 'CONNECTED' | 'HIDDEN';
export type ConnectionState =
  | 'connect'
  | 'request_sent'
  | 'request_received'
  | 'connected'
  | 'blocked'
  | 'unavailable';

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

export type SkillGroup = {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  skills: Array<{ id: string; name: string; proficiency: SkillProficiency }>;
};

export type SkillMatchCard = {
  id: string;
  name: string;
  regNo: string;
  department: string;
  year: number | null;
  yearLabel: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  online: boolean;
  lastActiveAt: string | null;
  visibility: SkillMatchVisibility;
  isSelf?: boolean;
  ready?: boolean;
  skills: SkillGroup[];
  interests: Array<{ id: string; name: string; categoryName: string }>;
  goals: Array<{ id: string; slug: string; label: string }>;
  availabilities: Array<{ id: string; slug: string; label: string }>;
  matchScore: number | null;
  youHelpThem: string[];
  theyHelpYou: string[];
  sharedGoals: string[];
  reasons: MatchReason[];
  connectionState: ConnectionState;
  requestId: string | null;
  canMessage: boolean;
  canCall: boolean;
};

export type SkillCatalog = {
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    skills: Array<{ id: string; name: string; slug: string }>;
  }>;
  goals: Array<{ id: string; slug: string; label: string }>;
  availabilities: Array<{ id: string; slug: string; label: string }>;
  departments: Array<{ id: string; name: string }>;
  years: number[];
  limits: { maxSkills: number; maxCategories: number; maxInterests: number };
};
