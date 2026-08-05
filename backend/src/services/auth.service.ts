import { authenticator } from 'otplib';
import {
  AUTH_ERRORS,
  isValidEmail,
  isValidMobile,
  isValidPassword,
  isValidRegNo,
  normalizeEmail,
  normalizeMobile,
  normalizeName,
  normalizeRegNo,
  toE164,
} from '@avichian/shared';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { encryptField, hashValue } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { hashPassword, isLegacyPasswordHash, verifyPassword } from '../utils/password.js';
import { signMfaPendingToken } from '../utils/jwt.js';
import { sendOtp, verifyOtp } from './otp.service.js';
import { createSession } from './session.service.js';
import {
  assertMasterMobile,
  formatMasterLookup,
  getEligibleMasterByRegNo,
  verifyAgainstMaster,
  verifyMobileAgainstMaster,
} from './student-master.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertAccountActive, clearExpiredLoginLock } from '../utils/account.js';
import { decryptField } from '../utils/crypto.js';
import { isAppwriteOtpEnabled, verifyAppwritePhoneUser } from './appwrite.service.js';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

type AuthUser = Awaited<ReturnType<typeof loadUserById>>;

function requiresMfa(role: string): boolean {
  return role === 'SUPER_ADMIN';
}

function requiresMfaSetup(_role: string, _mfaEnabled: boolean): boolean {
  return false;
}

async function loadUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { profile: true, department: true },
  });
}

async function resolvePostAuth(
  user: NonNullable<AuthUser>,
  meta: RequestMeta & { rememberMe?: boolean },
  method: 'PASSWORD' | 'OTP' | 'MFA',
) {
  if (requiresMfaSetup(user.role, user.mfaEnabled)) {
    const mfaToken = signMfaPendingToken(user.id);
    return {
      mfaSetupRequired: true as const,
      mfaToken,
      userId: user.id,
    };
  }

  if (requiresMfa(user.role) && user.mfaEnabled) {
    const mfaToken = signMfaPendingToken(user.id);
    return {
      mfaRequired: true as const,
      mfaToken,
      userId: user.id,
    };
  }

  await recordLoginAttempt({
    userId: user.id,
    regNo: user.regNo,
    method,
    success: true,
    meta,
  });

  await writeAuditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    metadata: { method: method.toLowerCase() },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return createSession(user, meta);
}

async function recordLoginAttempt(params: {
  userId?: string;
  regNo?: string;
  method: 'PASSWORD' | 'OTP' | 'MFA';
  success: boolean;
  reason?: string;
  meta: RequestMeta;
}) {
  await prisma.loginHistory.create({
    data: {
      userId: params.userId,
      regNo: params.regNo,
      method: params.method,
      success: params.success,
      reason: params.reason,
      ipAddress: params.meta.ipAddress,
      userAgent: params.meta.userAgent,
    },
  });
}

async function handleFailedLogin(
  userId: string,
  regNo: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
  });

  // Best-effort timestamp (column added in lockout hardening)
  await prisma.$executeRawUnsafe(
    `UPDATE users SET last_failed_login_at = NOW() WHERE id = $1`,
    userId,
  ).catch(() => undefined);

  await recordLoginAttempt({
    userId,
    regNo,
    method: 'PASSWORD',
    success: false,
    reason: 'Invalid password',
    meta,
  });

  // Development: never lock accounts (still track failedAttempts for visibility)
  if (!env.lockoutEnabled) {
    throw new AppError(
      401,
      `${AUTH_ERRORS.INVALID_PASSWORD} (attempt ${user.failedLoginCount}; lockout disabled in ${env.appEnv})`,
    );
  }

  if (user.failedLoginCount >= env.maxLoginAttempts) {
    const lockedUntil = new Date(
      Date.now() + env.lockoutDurationMinutes * 60 * 1000,
    );
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil },
    });
    await writeAuditLog({
      userId,
      action: 'ACCOUNT_LOCKED',
      metadata: {
        regNo,
        lockedUntil: lockedUntil.toISOString(),
        failedAttempts: user.failedLoginCount,
        durationMinutes: env.lockoutDurationMinutes,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    const mins = Math.max(1, Math.ceil(env.lockoutDurationMinutes));
    throw new AppError(
      423,
      `${AUTH_ERRORS.ACCOUNT_LOCKED} Try again in about ${mins} minute(s).`,
    );
  }

  throw new AppError(401, AUTH_ERRORS.INVALID_PASSWORD);
}

/** Clear lock + failed counters after a successful password check (before session create). */
async function clearLoginFailures(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
}

/** Clear expired locks; in development, wipe lockout so testing is never blocked. */
async function prepareAccountForLogin<T extends { id: string; lockedUntil: Date | null; failedLoginCount: number }>(
  user: T,
): Promise<T> {
  const lockState = await clearExpiredLoginLock(user);
  if (!env.lockoutEnabled && (user.lockedUntil || user.failedLoginCount > 0)) {
    await clearLoginFailures(user.id);
    return { ...user, lockedUntil: null, failedLoginCount: 0 };
  }
  return {
    ...user,
    lockedUntil: lockState.lockedUntil,
    failedLoginCount: lockState.failedLoginCount,
  };
}

export async function registerLookup(params: { regNo: string }) {
  if (!isValidRegNo(params.regNo)) {
    throw new AppError(400, 'Invalid register number format');
  }

  const master = await getEligibleMasterByRegNo(params.regNo);
  return formatMasterLookup(master);
}

export async function registerVerifyMobile(params: { regNo: string; mobile: string }) {
  if (!isValidRegNo(params.regNo)) {
    throw new AppError(400, 'Invalid register number format');
  }
  if (!isValidMobile(params.mobile)) {
    throw new AppError(400, AUTH_ERRORS.INVALID_MOBILE);
  }

  const { master } = await verifyMobileAgainstMaster(params);
  return {
    verified: true,
    ...formatMasterLookup(master),
  };
}

export async function registerVerify(params: {
  regNo: string;
  name: string;
  mobile: string;
  email: string;
  department: string;
}) {
  if (!isValidRegNo(params.regNo)) {
    throw new AppError(400, 'Invalid register number format');
  }
  if (!isValidMobile(params.mobile)) {
    throw new AppError(400, AUTH_ERRORS.INVALID_MOBILE);
  }
  if (!isValidEmail(params.email, env.collegeEmailDomain)) {
    throw new AppError(400, `Email must be a valid @${env.collegeEmailDomain} address`);
  }

  await verifyAgainstMaster(params);
  return { verified: true, regNo: normalizeRegNo(params.regNo) };
}

export async function registerSendOtp(params: {
  regNo: string;
  mobile: string;
  name?: string;
  email?: string;
  department?: string;
}) {
  const { master, mobile } = await verifyMobileAgainstMaster({
    regNo: params.regNo,
    mobile: params.mobile,
  });
  const regNo = master.regNo;
  const email = master.email;

  if (isAppwriteOtpEnabled()) {
    return {
      provider: 'appwrite' as const,
      message: 'Create Appwrite phone session to receive OTP',
      phoneE164: toE164(mobile),
      mobileHint: `******${mobile.slice(-4)}`,
      resendCooldownSeconds: env.otpResendCooldownSeconds,
    };
  }

  const { expiresAt, resendCooldownSeconds } = await sendOtp({
    purpose: 'REGISTRATION',
    channel: 'SMS',
    regNo,
    mobile,
    email,
  });

  return {
    provider: 'console' as const,
    message: 'OTP sent to registered mobile number',
    expiresAt,
    mobileHint: `******${mobile.slice(-4)}`,
    resendCooldownSeconds,
  };
}

/**
 * Student registration against Student Master (no OTP).
 * Requires regNo + name + mobile to match an eligible master row; password is bcrypt-hashed.
 */
export async function registerWithMaster(
  params: {
    regNo: string;
    name: string;
    mobile: string;
    password: string;
  },
  meta: RequestMeta,
) {
  const regNo = normalizeRegNo(params.regNo);

  if (!isValidRegNo(regNo)) {
    throw new AppError(400, 'Invalid register number format');
  }
  if (!isValidMobile(params.mobile)) {
    throw new AppError(400, AUTH_ERRORS.INVALID_MOBILE);
  }
  if (!isValidPassword(params.password)) {
    throw new AppError(
      400,
      'Password must be at least 8 characters with uppercase, lowercase, and a number',
    );
  }

  const master = await getEligibleMasterByRegNo(regNo);
  const mobile = assertMasterMobile(master, params.mobile);
  const name = normalizeName(params.name);

  if (master.name !== name) {
    throw new AppError(
      400,
      'Name does not match the student master record. Check spelling as on your college roster.',
    );
  }

  const passwordHash = await hashPassword(params.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        regNo,
        passwordHash,
        email: master.email,
        mobileHash: hashValue(mobile),
        mobileEnc: master.mobileEnc,
        role: 'STUDENT',
        departmentId: master.departmentId,
        studentMasterId: master.id,
        profile: {
          create: {
            name: master.name,
            year: master.year,
            privacy: 'PUBLIC',
          },
        },
      },
      include: { profile: true, department: true },
    });

    await tx.studentMaster.update({
      where: { id: master.id },
      data: { accountCreated: true },
    });

    return created;
  });

  await writeAuditLog({
    userId: user.id,
    action: 'REGISTRATION',
    metadata: { regNo, method: 'master_password' },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return createSession(user, meta);
}

/** @deprecated use registerWithMaster — kept for older clients if any */
export async function registerComplete(
  params: {
    regNo: string;
    name?: string;
    mobile?: string;
    password: string;
    bio?: string;
    profilePhotoUrl?: string;
  },
  meta: RequestMeta,
) {
  if (params.name && params.mobile) {
    return registerWithMaster(
      {
        regNo: params.regNo,
        name: params.name,
        mobile: params.mobile,
        password: params.password,
      },
      meta,
    );
  }

  throw new AppError(
    400,
    'Registration requires register number, full name, mobile number, and password',
  );
}

export async function loginWithPassword(
  params: { regNo: string; password: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const identifier = params.regNo.trim();
  if (!identifier) {
    throw new AppError(400, 'Register number or email is required');
  }
  if (!params.password) {
    throw new AppError(400, 'Password is required');
  }

  const looksLikeEmail = identifier.includes('@');
  const regNo = looksLikeEmail ? '' : normalizeRegNo(identifier);
  const email = looksLikeEmail ? normalizeEmail(identifier) : '';

  // Authenticate only against PostgreSQL users table — never mock / JSON.
  const user = looksLikeEmail
    ? await prisma.user.findFirst({
        where: { email, deletedAt: null },
        include: { profile: true, department: true, admin: true },
      })
    : await prisma.user.findFirst({
        where: { regNo, deletedAt: null },
        include: { profile: true, department: true, admin: true },
      });

  if (!user) {
    const deleted = looksLikeEmail
      ? await prisma.user.findFirst({ where: { email, deletedAt: { not: null } } })
      : await prisma.user.findFirst({ where: { regNo, deletedAt: { not: null } } });
    if (deleted) {
      await recordLoginAttempt({
        userId: deleted.id,
        regNo: deleted.regNo,
        method: 'PASSWORD',
        success: false,
        reason: 'Account deleted',
        meta,
      });
      throw new AppError(403, AUTH_ERRORS.ACCOUNT_DELETED);
    }

    const master = !looksLikeEmail
      ? await prisma.studentMaster.findUnique({ where: { regNo } })
      : await prisma.studentMaster.findFirst({ where: { email } });

    await recordLoginAttempt({
      regNo: looksLikeEmail ? email : regNo,
      method: 'PASSWORD',
      success: false,
      reason: master ? 'Not registered yet' : 'Student not found',
      meta,
    });

    if (master && !master.accountCreated) {
      throw new AppError(401, AUTH_ERRORS.NOT_REGISTERED_YET);
    }
    throw new AppError(401, AUTH_ERRORS.STUDENT_NOT_FOUND);
  }

  // Super Admins must use the Super Admin portal login (employee ID + email + password).
  if (user.role === 'SUPER_ADMIN' || user.admin) {
    throw new AppError(
      403,
      'Super Admin accounts must sign in on the Super Admin portal, not the student app',
      'USE_ADMIN_PORTAL',
    );
  }

  const account = await prepareAccountForLogin(user);

  try {
    assertAccountActive(account);
  } catch (error) {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'PASSWORD',
      success: false,
      reason: error instanceof AppError ? error.message : 'Account inactive',
      meta,
    });
    throw error;
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    await handleFailedLogin(user.id, user.regNo, meta);
  }

  await clearLoginFailures(user.id);

  // Transparent upgrade: bcrypt → Argon2id after successful login
  if (isLegacyPasswordHash(user.passwordHash)) {
    const upgraded = await hashPassword(params.password);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: upgraded },
    });
    user.passwordHash = upgraded;
  }

  // Students + staff: issue JWT session immediately (same User row created by Super Admin).
  if (user.role === 'STUDENT' || user.role === 'STAFF') {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'PASSWORD',
      success: true,
      meta,
    });
    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      metadata: {
        method: 'password',
        role: user.role,
        identifier: looksLikeEmail ? 'email' : 'regNo',
        isFirstLogin: user.forcePasswordChange,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return createSession(user, { ...meta, rememberMe: params.rememberMe });
  }

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'PASSWORD');
}

export async function studentLoginLookup(params: { regNo: string }) {
  if (!isValidRegNo(params.regNo)) {
    throw new AppError(400, 'Invalid register number');
  }

  const regNo = normalizeRegNo(params.regNo);

  const user = await prisma.user.findUnique({
    where: { regNo },
    include: { profile: true },
  });

  if (user && user.role === 'STUDENT' && !user.deletedAt) {
    const mobile = decryptField(user.mobileEnc);
    return {
      found: true as const,
      registered: true as const,
      regNo,
      name: user.profile?.name ?? regNo,
      mobileHint: `******${mobile.slice(-4)}`,
    };
  }

  const master = await prisma.studentMaster.findUnique({
    where: { regNo },
    include: { department: true },
  });

  if (master?.verified) {
    return {
      found: true as const,
      registered: false as const,
      regNo,
      name: master.name,
      department: master.department.name,
      message: AUTH_ERRORS.NOT_REGISTERED_YET,
    };
  }

  throw new AppError(404, AUTH_ERRORS.STUDENT_NOT_FOUND);
}

export async function studentLoginOtpRequest(
  params: { regNo: string; mobile: string },
  _meta: RequestMeta,
) {
  if (!isValidRegNo(params.regNo) || !isValidMobile(params.mobile)) {
    throw new AppError(400, 'Invalid register number or mobile number');
  }

  const regNo = normalizeRegNo(params.regNo);
  const mobile = normalizeMobile(params.mobile);

  const user = await prisma.user.findUnique({
    where: { regNo },
    include: { profile: true, department: true },
  });

  if (!user || user.role !== 'STUDENT' || user.deletedAt) {
    throw new AppError(404, AUTH_ERRORS.STUDENT_NOT_FOUND);
  }

  assertAccountActive(user);

  if (user.mobileHash !== hashValue(mobile)) {
    throw new AppError(403, AUTH_ERRORS.MOBILE_MISMATCH);
  }

  if (isAppwriteOtpEnabled()) {
    return {
      provider: 'appwrite' as const,
      message: 'Create Appwrite phone session to receive OTP',
      phoneE164: toE164(mobile),
      resendCooldownSeconds: env.otpResendCooldownSeconds,
      mobileHint: `******${mobile.slice(-4)}`,
    };
  }

  const { expiresAt, resendCooldownSeconds } = await sendOtp({
    purpose: 'LOGIN',
    channel: 'SMS',
    mobile,
    userId: user.id,
    regNo,
  });

  return {
    provider: 'console' as const,
    message: 'OTP sent to registered mobile number',
    expiresAt,
    resendCooldownSeconds,
    mobileHint: `******${mobile.slice(-4)}`,
  };
}

export async function studentLoginOtpVerify(
  params: {
    regNo: string;
    mobile: string;
    otp?: string;
    appwriteUserId?: string;
    rememberMe?: boolean;
  },
  meta: RequestMeta,
) {
  const regNo = normalizeRegNo(params.regNo);
  const mobile = normalizeMobile(params.mobile);

  const user = await prisma.user.findUnique({
    where: { regNo },
    include: { profile: true, department: true },
  });

  if (!user || user.role !== 'STUDENT' || user.mobileHash !== hashValue(mobile)) {
    throw new AppError(401, AUTH_ERRORS.INVALID_CREDENTIALS);
  }

  assertAccountActive(user);

  if (isAppwriteOtpEnabled()) {
    if (!params.appwriteUserId) {
      throw new AppError(400, 'Appwrite phone verification required');
    }
    await verifyAppwritePhoneUser(params.appwriteUserId, mobile);
    await writeAuditLog({
      userId: user.id,
      action: 'MFA_VERIFIED',
      resourceType: 'phone',
      resourceId: params.appwriteUserId,
      metadata: { regNo, provider: 'appwrite', purpose: 'login' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  } else {
    if (!params.otp) {
      throw new AppError(400, 'OTP is required');
    }
    await verifyOtp({
      purpose: 'LOGIN',
      code: params.otp,
      regNo,
      mobile,
      userId: user.id,
    });
  }

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'OTP');
}

export async function loginWithEmail(
  params: { email: string; password: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  if (!isValidEmail(params.email)) {
    throw new AppError(400, 'Enter a valid email address');
  }

  const email = normalizeEmail(params.email);
  // Same Users table as register-number login (PostgreSQL / Prisma).
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { profile: true, department: true },
  });

  if (!user || !['STUDENT', 'STAFF'].includes(user.role)) {
    await recordLoginAttempt({
      regNo: email,
      method: 'PASSWORD',
      success: false,
      reason: 'User not found',
      meta,
    });
    throw new AppError(401, AUTH_ERRORS.STUDENT_NOT_FOUND);
  }

  const account = await prepareAccountForLogin(user);

  try {
    assertAccountActive(account);
  } catch (error) {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'PASSWORD',
      success: false,
      reason: error instanceof AppError ? error.message : 'Account inactive',
      meta,
    });
    throw error;
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    await handleFailedLogin(user.id, user.regNo, meta);
  }

  await clearLoginFailures(user.id);

  if (user.role === 'STUDENT' || user.role === 'STAFF') {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'PASSWORD',
      success: true,
      meta,
    });
    await writeAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      metadata: { method: 'password', role: user.role, identifier: 'email' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return createSession(user, { ...meta, rememberMe: params.rememberMe });
  }

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'PASSWORD');
}

export async function loginOtpRequest(
  params: { mobile: string },
  meta: RequestMeta,
) {
  if (!isValidMobile(params.mobile)) {
    throw new AppError(400, 'Invalid mobile number');
  }

  const mobile = normalizeMobile(params.mobile);
  const user = await prisma.user.findFirst({
    where: { mobileHash: hashValue(mobile), deletedAt: null },
  });

  if (!user) {
    throw new AppError(404, 'No account found for this mobile number');
  }

  assertAccountActive(user);

  const { expiresAt } = await sendOtp({
    purpose: 'LOGIN',
    channel: 'SMS',
    mobile,
    userId: user.id,
    regNo: user.regNo,
  });

  return { message: 'OTP sent', expiresAt };
}

export async function loginOtpVerify(
  params: { mobile: string; otp: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const mobile = normalizeMobile(params.mobile);

  const user = await prisma.user.findFirst({
    where: { mobileHash: hashValue(mobile) },
    include: { profile: true, department: true },
  });

  if (!user) {
    throw new AppError(401, AUTH_ERRORS.INVALID_CREDENTIALS);
  }

  assertAccountActive(user);

  await verifyOtp({
    purpose: 'LOGIN',
    code: params.otp,
    mobile,
    userId: user.id,
  });

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'OTP');
}

export async function loginEmailOtpRequest(
  params: { email: string },
  _meta: RequestMeta,
) {
  if (!isValidEmail(params.email, env.collegeEmailDomain)) {
    throw new AppError(400, `Email must be a valid @${env.collegeEmailDomain} address`);
  }

  const email = normalizeEmail(params.email);
  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    throw new AppError(404, 'No account found for this email');
  }

  assertAccountActive(user);

  const { expiresAt } = await sendOtp({
    purpose: 'LOGIN',
    channel: 'EMAIL',
    email,
    userId: user.id,
    regNo: user.regNo,
  });

  return { message: 'OTP sent to college email', expiresAt };
}

export async function loginEmailOtpVerify(
  params: { email: string; otp: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const email = normalizeEmail(params.email);
  const user = await prisma.user.findFirst({
    where: { email },
    include: { profile: true, department: true },
  });

  if (!user) {
    throw new AppError(401, AUTH_ERRORS.INVALID_CREDENTIALS);
  }

  assertAccountActive(user);

  await verifyOtp({
    purpose: 'LOGIN',
    code: params.otp,
    email,
    userId: user.id,
  });

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'OTP');
}

export async function loginStaff(
  params: { staffId: string; password: string; email?: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const staffId = params.staffId.trim().toUpperCase();

  const staff = await prisma.staff.findUnique({
    where: { staffId },
    include: {
      user: { include: { profile: true, department: true } },
    },
  });

  if (!staff || !staff.active) {
    await recordLoginAttempt({
      regNo: staffId,
      method: 'PASSWORD',
      success: false,
      reason: 'Invalid staff credentials',
      meta,
    });
    throw new AppError(401, AUTH_ERRORS.INVALID_CREDENTIALS);
  }

  const user = staff.user;
  if (user.role !== 'STAFF') {
    throw new AppError(403, AUTH_ERRORS.FORBIDDEN);
  }

  const account = await prepareAccountForLogin(user);

  try {
    assertAccountActive(account);
  } catch (error) {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'PASSWORD',
      success: false,
      reason: error instanceof AppError ? error.message : 'Account inactive',
      meta,
    });
    throw error;
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    await handleFailedLogin(user.id, user.regNo, meta);
  }

  await clearLoginFailures(user.id);

  return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'PASSWORD');
}

export async function loginSuperAdmin(
  params: { adminId: string; email: string; password: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const adminId = normalizeRegNo(params.adminId);
  const email = normalizeEmail(params.email);

  let user = await prisma.user.findFirst({
    where: { regNo: adminId, deletedAt: null },
    include: { profile: true, department: true, admin: true },
  });

  // Legacy repair: Admin row present but role stuck as STUDENT
  if (user?.admin && user.role !== 'SUPER_ADMIN') {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'SUPER_ADMIN' },
      include: { profile: true, department: true, admin: true },
    });
  }

  if (!user || user.role !== 'SUPER_ADMIN' || !user.admin || user.email !== email) {
    await recordLoginAttempt({
      regNo: adminId,
      method: 'PASSWORD',
      success: false,
      reason: 'Invalid super admin credentials',
      meta,
    });
    throw new AppError(401, AUTH_ERRORS.INVALID_CREDENTIALS);
  }

  const account = await prepareAccountForLogin(user);

  try {
    assertAccountActive(account);
  } catch (error) {
    await recordLoginAttempt({
      userId: user.id,
      regNo: adminId,
      method: 'PASSWORD',
      success: false,
      reason: error instanceof AppError ? error.message : 'Account inactive',
      meta,
    });
    throw error;
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    await handleFailedLogin(user.id, adminId, meta);
  }

  await clearLoginFailures(user.id);

  // MFA only when already enabled on the account (first-time logins go straight in).
  if (user.mfaEnabled) {
    return resolvePostAuth(user, { ...meta, rememberMe: params.rememberMe }, 'PASSWORD');
  }

  await recordLoginAttempt({
    userId: user.id,
    regNo: adminId,
    method: 'PASSWORD',
    success: true,
    meta,
  });
  await writeAuditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    metadata: { method: 'super_admin_password' },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return createSession(user, { ...meta, rememberMe: params.rememberMe });
}

export async function verifyMfaLogin(
  params: { mfaToken: string; code: string },
  meta: RequestMeta,
) {
  const { verifyMfaPendingToken } = await import('../utils/jwt.js');
  const payload = verifyMfaPendingToken(params.mfaToken);

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { profile: true, department: true },
  });

  if (!user || !user.mfaEnabled || !user.mfaSecretEnc) {
    throw new AppError(401, AUTH_ERRORS.UNAUTHORIZED);
  }

  const { decryptField } = await import('../utils/crypto.js');
  const secret = decryptField(user.mfaSecretEnc);
  const valid = authenticator.verify({ token: params.code, secret });

  if (!valid) {
    await recordLoginAttempt({
      userId: user.id,
      regNo: user.regNo,
      method: 'MFA',
      success: false,
      reason: 'Invalid MFA code',
      meta,
    });
    throw new AppError(401, 'Invalid MFA code');
  }

  await recordLoginAttempt({
    userId: user.id,
    regNo: user.regNo,
    method: 'MFA',
    success: true,
    meta,
  });

  await writeAuditLog({
    userId: user.id,
    action: 'MFA_VERIFIED',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return createSession(user, { ...meta, rememberMe: false });
}

export async function setupMfaWithLoginToken(mfaToken: string) {
  const { verifyMfaPendingToken } = await import('../utils/jwt.js');
  const payload = verifyMfaPendingToken(mfaToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !requiresMfaSetup(user.role, user.mfaEnabled)) {
    throw new AppError(403, AUTH_ERRORS.FORBIDDEN);
  }
  return setupMfa(user.id);
}

export async function enableMfaWithLoginToken(
  params: { mfaToken: string; code: string; rememberMe?: boolean },
  meta: RequestMeta,
) {
  const { verifyMfaPendingToken } = await import('../utils/jwt.js');
  const payload = verifyMfaPendingToken(params.mfaToken);
  await enableMfa(payload.sub, params.code);
  const user = await loadUserById(payload.sub);
  if (!user) throw new AppError(401, AUTH_ERRORS.UNAUTHORIZED);
  return createSession(user, { ...meta, rememberMe: params.rememberMe });
}

/**
 * Students cannot self-reset passwords. Only Super Admin issues temporary passwords.
 * Endpoint kept for API compatibility — always returns the contact-admin message.
 */
export async function forgotPassword(_params: { regNo: string }) {
  return {
    message: 'Please contact the AVICHIAN Super Admin to reset your password.',
    selfResetAllowed: false,
  };
}

/** Disabled: college-managed accounts only. Super Admin resets via portal. */
export async function resetPassword(
  _params: { regNo: string; otp: string; password: string },
  _meta: RequestMeta,
) {
  throw new AppError(
    403,
    'Please contact the AVICHIAN Super Admin to reset your password. Self-service password reset is not available.',
    'SELF_RESET_DISABLED',
  );
}

export async function setupMfa(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !requiresMfa(user.role)) {
    throw new AppError(403, AUTH_ERRORS.FORBIDDEN);
  }

  const secret = authenticator.generateSecret();
  const mfaSecretEnc = encryptField(secret);

  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecretEnc, mfaEnabled: false },
  });

  const otpauth = authenticator.keyuri(user.email, 'Avichian', secret);
  return { secret, otpauth };
}

export async function enableMfa(userId: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaSecretEnc) {
    throw new AppError(400, 'MFA not initialized');
  }

  const { decryptField } = await import('../utils/crypto.js');
  const secret = decryptField(user.mfaSecretEnc);
  const valid = authenticator.verify({ token: code, secret });
  if (!valid) {
    throw new AppError(400, 'Invalid MFA code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  await writeAuditLog({
    userId,
    action: 'MFA_ENABLED',
  });

  return { message: 'MFA enabled' };
}