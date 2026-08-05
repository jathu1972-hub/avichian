import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '../.env') });
config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Prefer primary key; accept common aliases used in host dashboards / docs. */
function requireEnvAlias(keys: string[], fallback?: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable (any of): ${keys.join(', ')}`);
}

const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development').toLowerCase();
const isProduction =
  appEnv === 'production' || process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

// Production: 5 attempts → 15 min lock. Development: lockout disabled (or 30s if LOCKOUT_ENABLED=true).
const lockoutEnabledEnv = process.env.LOCKOUT_ENABLED;
const lockoutEnabled =
  lockoutEnabledEnv !== undefined
    ? lockoutEnabledEnv === 'true' || lockoutEnabledEnv === '1'
    : isProduction;

/**
 * CORS allowlist for SPAs.
 * Accepts (any combination):
 * - FRONTEND_URLS=https://app...,https://admin...
 * - CORS_ORIGIN=...
 * - FRONTEND_URL / APP_URL / STUDENT_PORTAL_URL (student)
 * - ADMIN_URL / SUPER_ADMIN_PORTAL_URL (super admin)
 */
function collectFrontendUrls(): string[] {
  const chunks: string[] = [];
  const multi =
    process.env.FRONTEND_URLS ?? process.env.CORS_ORIGIN ?? process.env.ALLOWED_ORIGINS;
  if (multi) chunks.push(...multi.split(','));

  for (const key of [
    'FRONTEND_URL',
    'APP_URL',
    'STUDENT_PORTAL_URL',
    'ADMIN_URL',
    'SUPER_ADMIN_PORTAL_URL',
  ] as const) {
    const v = process.env[key];
    if (v?.trim()) chunks.push(v.trim());
  }

  if (chunks.length === 0) {
    chunks.push('http://localhost:5173', 'http://localhost:5174');
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of chunks) {
    const url = raw.trim().replace(/\/+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const frontendUrls = collectFrontendUrls();

/** True when SPAs are not same-origin as API (GitHub Pages / Netlify → API host). */
const crossSiteCookies =
  isProduction ||
  frontendUrls.some((u) => {
    try {
      const host = new URL(u).hostname;
      return host !== 'localhost' && host !== '127.0.0.1';
    } catch {
      return false;
    }
  }) ||
  process.env.CROSS_SITE_COOKIES === 'true' ||
  process.env.CROSS_SITE_COOKIES === '1';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appEnv,
  port: Number(process.env.PORT ?? 4000),
  isProduction,
  isDevelopment,
  /** SameSite=None; Secure cookies for SPA on another origin */
  crossSiteCookies,
  /** When false (default in development), failed logins never lock accounts. */
  lockoutEnabled,
  databaseUrl: requireEnv('DATABASE_URL'),
  /** JWT access — also accepts JWT_SECRET */
  jwtAccessSecret: requireEnvAlias(['JWT_ACCESS_SECRET', 'JWT_SECRET']),
  /** JWT refresh — also accepts REFRESH_SECRET */
  jwtRefreshSecret: requireEnvAlias(['JWT_REFRESH_SECRET', 'REFRESH_SECRET']),
  encryptionKey: requireEnv('ENCRYPTION_KEY'),
  /** Browser origins allowed by CORS (Netlify + custom domains). Alias: CORS_ORIGIN */
  frontendUrls,
  appUrl:
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    process.env.STUDENT_PORTAL_URL ??
    'http://localhost:5173',
  superAdminPortalUrl:
    process.env.SUPER_ADMIN_PORTAL_URL ??
    process.env.ADMIN_URL ??
    'http://localhost:5174',
  collegeEmailDomain: process.env.COLLEGE_EMAIL_DOMAIN ?? 'avichi.edu',
  studentMasterSeedPath:
    process.env.STUDENT_MASTER_SEED_PATH ?? './seed-data/student_master.json',
  smsProvider: process.env.SMS_PROVIDER ?? 'console',
  appwriteEndpoint: process.env.APPWRITE_ENDPOINT,
  appwriteProjectId: process.env.APPWRITE_PROJECT_ID,
  appwriteApiKey: process.env.APPWRITE_API_KEY,
  msg91AuthKey: process.env.MSG91_AUTH_KEY,
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID,
  msg91SenderId: process.env.MSG91_SENDER_ID ?? 'AVICHI',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
  /** Production default 15 minutes; development soft-lock 30 seconds if lockout is enabled. */
  lockoutDurationMinutes: Number(
    process.env.LOCKOUT_DURATION_MINUTES ?? (isProduction ? 15 : 0.5),
  ),
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES ?? 5),
  otpMaxResends: Number(process.env.OTP_MAX_RESENDS ?? 3),
  otpResendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30),
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY ?? '15m',
  refreshTokenExpiryDays: Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS ?? 7),
  superAdminRegNo: process.env.SUPER_ADMIN_REG_NO,
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD,
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
  /** Public base URL used for local media links (no trailing slash). */
  publicApiUrl: process.env.PUBLIC_API_URL ?? process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  r2AccountId: process.env.R2_ACCOUNT_ID || undefined,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || undefined,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || undefined,
  r2BucketName: process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || undefined,
  r2PublicUrl: process.env.R2_PUBLIC_URL || undefined,
  /** Full R2 S3 API endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com */
  r2Endpoint: process.env.R2_ENDPOINT || undefined,
  /**
   * WebRTC ICE / LiveKit / Coturn (production calls)
   * STUN_URLS: comma-separated, default Google STUN
   * TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL: Coturn (or Twilio, etc.)
   * LIVEKIT_URL + LIVEKIT_API_KEY + LIVEKIT_API_SECRET: optional SFU path
   */
  stunUrls:
    process.env.STUN_URLS ??
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
  turnUrls: process.env.TURN_URLS || process.env.COTURN_URL || undefined,
  turnUsername: process.env.TURN_USERNAME || process.env.COTURN_USERNAME || undefined,
  turnCredential: process.env.TURN_CREDENTIAL || process.env.COTURN_PASSWORD || undefined,
  livekitUrl: process.env.LIVEKIT_URL || undefined,
  livekitApiKey: process.env.LIVEKIT_API_KEY || undefined,
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || undefined,
};

/** Soft production guardrails (log only — do not crash after secrets already loaded). */
export function logProductionWarnings(): void {
  if (!isProduction) return;
  const warnings: string[] = [];
  if (frontendUrls.some((u) => u.includes('localhost'))) {
    warnings.push('FRONTEND_URLS/CORS_ORIGIN still includes localhost — Netlify origins will be blocked if missing.');
  }
  if (!env.publicApiUrl.startsWith('https://') && !env.publicApiUrl.includes('localhost')) {
    warnings.push('PUBLIC_API_URL should be https://api.avichian.com (or your API host) in production.');
  }
  if (
    !frontendUrls.some((u) => u.includes('app.avichian') || u.includes('netlify.app')) &&
    frontendUrls.every((u) => u.includes('localhost'))
  ) {
    warnings.push(
      'FRONTEND_URLS / FRONTEND_URL / ADMIN_URL look like localhost only — Netlify SPAs will be blocked by CORS.',
    );
  }
  const r2Partial =
    env.r2AccessKeyId || env.r2SecretAccessKey || env.r2BucketName || env.r2AccountId;
  if (r2Partial && !isR2FullyConfigured()) {
    warnings.push('R2 env is incomplete — set R2_ACCOUNT_ID, keys, bucket, and R2_PUBLIC_URL (or use local uploads).');
  }
  if (env.jwtAccessSecret.length < 32 || env.jwtRefreshSecret.length < 32) {
    warnings.push('JWT secrets should be at least 32 characters.');
  }
  if (!env.turnUrls) {
    warnings.push(
      'TURN_URLS not set — voice/video may fail across NATs. Configure Coturn for production calls.',
    );
  }
  if (env.livekitUrl && (!env.livekitApiKey || !env.livekitApiSecret)) {
    warnings.push('LIVEKIT_URL set but LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing.');
  }
  for (const w of warnings) {
    console.warn(`[production] ${w}`);
  }
}

function isR2FullyConfigured(): boolean {
  return Boolean(
    (env.r2AccountId || env.r2Endpoint) &&
      env.r2AccessKeyId &&
      env.r2SecretAccessKey &&
      env.r2BucketName &&
      env.r2PublicUrl,
  );
}