import { Router, type Request, type Response } from 'express';
import { issueCsrfToken } from '../middleware/csrf.js';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  enableMfaWithLoginToken,
  forgotPassword,
  loginEmailOtpRequest,
  loginEmailOtpVerify,
  loginOtpRequest,
  loginOtpVerify,
  studentLoginLookup,
  studentLoginOtpRequest,
  studentLoginOtpVerify,
  loginStaff,
  loginSuperAdmin,
  loginWithEmail,
  loginWithPassword,
  registerComplete,
  registerLookup,
  registerSendOtp,
  registerVerify,
  registerVerifyMobile,
  registerWithMaster,
  resetPassword,
  setupMfaWithLoginToken,
  verifyMfaLogin,
} from '../services/auth.service.js';
import {
  getRefreshCookieOptions,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
} from '../services/session.service.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { writeAuditLog } from '../services/audit.service.js';
import { AppError } from '../utils/errors.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again later.' },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'OTP limit reached. Try again later.' },
});

const registerVerifySchema = z.object({
  regNo: z.string().min(1),
  name: z.string().min(1),
  mobile: z.string().min(10),
  email: z.string().email(),
  department: z.string().min(1),
});

const registerVerifyMobileSchema = z.object({
  regNo: z.string().min(1),
  mobile: z.string().min(10),
});

const registerSendOtpSchema = z.object({
  regNo: z.string().min(1),
  mobile: z.string().min(10),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1).optional(),
});

const registerLookupSchema = z.object({
  regNo: z.string().min(1),
});

const registerWithMasterSchema = z
  .object({
    regNo: z.string().min(1),
    name: z.string().min(1),
    mobile: z.string().min(10),
    password: z.string().min(8),
    confirmPassword: z.string().min(8).optional(),
  })
  .refine((d) => !d.confirmPassword || d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const registerCompleteSchema = z.object({
  regNo: z.string().min(1),
  name: z.string().min(1),
  mobile: z.string().min(10),
  password: z.string().min(8),
});

const loginEmailPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const loginPasswordSchema = z.object({
  regNo: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const staffLoginSchema = z.object({
  staffId: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const superAdminLoginSchema = z.object({
  adminId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const studentLoginLookupSchema = z.object({
  regNo: z.string().min(1),
});

const studentLoginOtpRequestSchema = z.object({
  regNo: z.string().min(1),
  mobile: z.string().min(10),
});

const studentLoginOtpVerifySchema = z
  .object({
    regNo: z.string().min(1),
    mobile: z.string().min(10),
    otp: z.string().length(6).optional(),
    appwriteUserId: z.string().min(1).optional(),
    rememberMe: z.boolean().optional(),
  })
  .refine((d) => d.otp || d.appwriteUserId, {
    message: 'OTP or Appwrite verification required',
  });

const loginOtpRequestSchema = z.object({
  mobile: z.string().min(10),
});

const loginOtpVerifySchema = z.object({
  mobile: z.string().min(10),
  otp: z.string().length(6),
  rememberMe: z.boolean().optional(),
});

const loginEmailOtpRequestSchema = z.object({
  email: z.string().email(),
});

const loginEmailOtpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  rememberMe: z.boolean().optional(),
});

const forgotPasswordSchema = z.object({
  regNo: z.string().min(1),
});

const resetPasswordSchema = z.object({
  regNo: z.string().min(1),
  otp: z.string().length(6),
  password: z.string().min(8),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().length(6),
  rememberMe: z.boolean().optional(),
});

const mfaSetupEnableSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().length(6),
  rememberMe: z.boolean().optional(),
});

type LoginResult =
  | { mfaRequired: true; mfaToken: string; userId: string }
  | { mfaSetupRequired: true; mfaToken: string; userId: string }
  | { accessToken: string; refreshToken: string; expiresIn: number; user: unknown };

function sendLoginResult(req: Request, res: Response, result: LoginResult, rememberMe = false) {
  if ('mfaRequired' in result && result.mfaRequired) {
    res.json({ success: true, data: result });
    return;
  }
  if ('mfaSetupRequired' in result && result.mfaSetupRequired) {
    res.json({ success: true, data: result });
    return;
  }
  res.cookie('refresh_token', result.refreshToken, getRefreshCookieOptions(rememberMe));
  const csrfToken = issueCsrfToken(req, res);
  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
      csrfToken,
    },
  });
}

function sendAuthSession(req: Request, res: Response, session: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: unknown;
}, rememberMe = false) {
  res.cookie('refresh_token', session.refreshToken, getRefreshCookieOptions(rememberMe));
  const csrfToken = issueCsrfToken(req, res);
  res.json({
    success: true,
    data: {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
      csrfToken,
    },
  });
}

export const authRouter = Router();

authRouter.use(authLimiter);

authRouter.post('/register/lookup', validateBody(registerLookupSchema), async (req, res, next) => {
  try {
    const result = await registerLookup(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/register/verify', validateBody(registerVerifySchema), async (req, res, next) => {
  try {
    const result = await registerVerify(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  '/register/verify-mobile',
  validateBody(registerVerifyMobileSchema),
  async (req, res, next) => {
    try {
      const result = await registerVerifyMobile(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post('/register/otp', otpLimiter, validateBody(registerSendOtpSchema), async (req, res, next) => {
  try {
    const result = await registerSendOtp(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/register', validateBody(registerWithMasterSchema), async (req, res, next) => {
  try {
    const session = await registerWithMaster(req.body, getRequestMeta(req));
    sendAuthSession(req, res, session);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/register/complete', validateBody(registerCompleteSchema), async (req, res, next) => {
  try {
    const session = await registerComplete(req.body, getRequestMeta(req));
    sendAuthSession(req, res, session);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', validateBody(loginPasswordSchema), async (req, res, next) => {
  try {
    const result = await loginWithPassword(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/email', validateBody(loginEmailPasswordSchema), async (req, res, next) => {
  try {
    const result = await loginWithEmail(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  '/login/student/lookup',
  validateBody(studentLoginLookupSchema),
  async (req, res, next) => {
    try {
      const result = await studentLoginLookup(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  '/login/student/otp/request',
  otpLimiter,
  validateBody(studentLoginOtpRequestSchema),
  async (req, res, next) => {
    try {
      const result = await studentLoginOtpRequest(req.body, getRequestMeta(req));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  '/login/student/otp/verify',
  validateBody(studentLoginOtpVerifySchema),
  async (req, res, next) => {
    try {
      const result = await studentLoginOtpVerify(req.body, getRequestMeta(req));
      sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post('/login/staff', validateBody(staffLoginSchema), async (req, res, next) => {
  try {
    const result = await loginStaff(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/super-admin', validateBody(superAdminLoginSchema), async (req, res, next) => {
  try {
    const result = await loginSuperAdmin(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/otp/request', otpLimiter, validateBody(loginOtpRequestSchema), async (req, res, next) => {
  try {
    const result = await loginOtpRequest(req.body, getRequestMeta(req));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/otp/verify', validateBody(loginOtpVerifySchema), async (req, res, next) => {
  try {
    const result = await loginOtpVerify(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/otp/email/request', otpLimiter, validateBody(loginEmailOtpRequestSchema), async (req, res, next) => {
  try {
    const result = await loginEmailOtpRequest(req.body, getRequestMeta(req));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/otp/email/verify', validateBody(loginEmailOtpVerifySchema), async (req, res, next) => {
  try {
    const result = await loginEmailOtpVerify(req.body, getRequestMeta(req));
    sendLoginResult(req, res, result as LoginResult, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/mfa', validateBody(mfaVerifySchema), async (req, res, next) => {
  try {
    const session = await verifyMfaLogin(req.body, getRequestMeta(req));
    sendAuthSession(req, res, session, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/mfa/setup', async (req, res, next) => {
  try {
    const { mfaToken } = req.body as { mfaToken?: string };
    if (!mfaToken) throw new AppError(400, 'mfaToken required');
    const result = await setupMfaWithLoginToken(mfaToken);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login/mfa/enable', validateBody(mfaSetupEnableSchema), async (req, res, next) => {
  try {
    const session = await enableMfaWithLoginToken(req.body, getRequestMeta(req));
    sendAuthSession(req, res, session, req.body.rememberMe);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      res.status(401).json({ success: false, error: 'No refresh token' });
      return;
    }

    const rotated = await rotateRefreshToken(refreshToken, getRequestMeta(req));
    await writeAuditLog({ action: 'SESSION_REFRESH', ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined });
    res.cookie('refresh_token', rotated.refreshToken, getRefreshCookieOptions());
    const csrfToken = issueCsrfToken(req, res);
    res.json({
      success: true,
      data: {
        accessToken: rotated.accessToken,
        expiresIn: rotated.expiresIn,
        csrfToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    let userId: string | null = null;
    if (refreshToken) {
      userId = await revokeSession(refreshToken);
      await writeAuditLog({
        userId: userId ?? undefined,
        action: 'LOGOUT',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
    }
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout/all', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const count = await revokeAllSessions(req.user!.id);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'SESSION_REVOKED',
      metadata: { allDevices: true, count },
      ...getRequestMeta(req),
    });
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ success: true, data: { revoked: count } });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/forgot-password', otpLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const result = await forgotPassword(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/reset-password', validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await resetPassword(req.body, getRequestMeta(req));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});