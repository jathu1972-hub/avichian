import type { ROLES } from '../constants.js';

export type UserRole = (typeof ROLES)[number];

export interface PublicUser {
  id: string;
  regNo: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  year: number | null;
  profilePhotoUrl: string | null;
  coverPhotoUrl?: string | null;
  bio: string | null;
  online: boolean;
  lastSeen: string | null;
  /** When true, client must collect a new password before full app access */
  forcePasswordChange?: boolean;
  /** Alias for forcePasswordChange (first login / after Super Admin reset) */
  isFirstLogin?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}