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

const frontendUrls = (
  process.env.FRONTEND_URLS ??
  process.env.CORS_ORIGIN ??
  process.env.FRONTEND_URL ??
  'http://localhost:5173,http://localhost:5174'
)
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appEnv,
  port: Number(process.env.PORT ?? 4000),
  isProduction,
  isDevelopment,
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
  appUrl: process.env.APP_URL ?? process.env.STUDENT_PORTAL_URL ?? 'http://localhost:5173',
  superAdminPortalUrl: process.env.SUPER_ADMIN_PORTAL_URL ?? 'http://localhost:5174',
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
};

/** Soft production guardrails (log only — do not crash after secrets already loaded). */
export function logProductionWarnings(): void {
  if (!isProduction) return;
  const warnings: string[] = [];
  if (frontendUrls.some((u) => u.includes('localhost'))) {
    warnings.push('FRONTEND_URLS/CORS_ORIGIN still includes localhost — Netlify origins will be blocked if missing.');
  }
  if (!env.publicApiUrl.startsWith('https://') && !env.publicApiUrl.includes('localhost')) {
    warnings.push('PUBLIC_API_URL should be https://api.avichian.in in production.');
  }
  const r2Partial =
    env.r2AccessKeyId || env.r2SecretAccessKey || env.r2BucketName || env.r2AccountId;
  if (r2Partial && !isR2FullyConfigured()) {
    warnings.push('R2 env is incomplete — set R2_ACCOUNT_ID, keys, bucket, and R2_PUBLIC_URL (or use local uploads).');
  }
  if (env.jwtAccessSecret.length < 32 || env.jwtRefreshSecret.length < 32) {
    warnings.push('JWT secrets should be at least 32 characters.');
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