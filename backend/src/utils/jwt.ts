import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '@avichian/shared';

export interface AccessTokenPayload {
  sub: string;
  regNo: string;
  role: UserRole;
  departmentId: string;
  type: 'access';
}

export interface MfaPendingPayload {
  sub: string;
  type: 'mfa_pending';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.jwtAccessSecret, {
    expiresIn: env.accessTokenExpiry as jwt.SignOptions['expiresIn'],
  });
}

export function signMfaPendingToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa_pending' }, env.jwtAccessSecret, {
    expiresIn: '5m',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return payload;
}

export function verifyMfaPendingToken(token: string): MfaPendingPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as MfaPendingPayload;
  if (payload.type !== 'mfa_pending') {
    throw new Error('Invalid token type');
  }
  return payload;
}

export function getAccessTokenExpirySeconds(): number {
  const match = env.accessTokenExpiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 60);
}