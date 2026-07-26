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
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}