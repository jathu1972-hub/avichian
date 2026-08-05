import bcrypt from 'bcrypt';
import argon2 from 'argon2';
import { isValidPassword, isValidPasswordDetailed } from '@avichian/shared';
import { AppError } from './errors.js';

const BCRYPT_ROUNDS = 12;

/**
 * Hash passwords with Argon2id (OWASP recommended).
 * Existing bcrypt hashes remain verifiable and are upgraded on next successful login.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    if (hash.startsWith('$argon2')) {
      return await argon2.verify(hash, password);
    }
    // Legacy bcrypt hashes (created before Argon2 migration)
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** True when hash should be re-saved as Argon2 after a successful verify */
export function isLegacyPasswordHash(hash: string): boolean {
  return Boolean(hash && !hash.startsWith('$argon2'));
}

/** Enforce production password rules (8+ chars, upper, lower, number, special). */
export function assertStrongPassword(password: string): void {
  if (!password || typeof password !== 'string') {
    throw new AppError(400, 'Password is required');
  }
  const check = isValidPasswordDetailed(password);
  if (!check.valid) {
    throw new AppError(
      400,
      `Password does not meet requirements: ${check.errors.join(', ')}`,
      'WEAK_PASSWORD',
    );
  }
  if (!isValidPassword(password)) {
    throw new AppError(400, 'Password does not meet requirements', 'WEAK_PASSWORD');
  }
}

export function assertPasswordsMatch(password: string, confirmPassword?: string): void {
  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new AppError(400, 'Password and confirm password do not match', 'PASSWORD_MISMATCH');
  }
}

/** Keep bcrypt available only for one-off scripts if needed */
export async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
