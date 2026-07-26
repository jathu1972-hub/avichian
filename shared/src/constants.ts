export const ROLES = ['STUDENT', 'STAFF', 'SUPER_ADMIN'] as const;

export const OTP_PURPOSES = [
  'REGISTRATION',
  'LOGIN',
  'PASSWORD_RESET',
  'MFA',
] as const;

export const AUTH_ERRORS = {
  STUDENT_NOT_FOUND: 'Student not found',
  INVALID_MOBILE: 'Invalid mobile number',
  MOBILE_MISMATCH:
    'This mobile number is not registered for this student. Please contact your department.',
  STUDENT_INACTIVE: 'Student account is inactive. Contact your department.',
  NOT_REGISTERED_YET: 'Account not created yet. Please register first.',
  ALREADY_REGISTERED: 'This register number is already registered',
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_PASSWORD: 'Invalid password',
  ACCOUNT_LOCKED: 'Account temporarily locked due to repeated failed attempts',
  ACCOUNT_SUSPENDED: 'This account has been suspended',
  ACCOUNT_DELETED: 'This account no longer exists',
  ACCOUNT_UNVERIFIED: 'Account verification is pending',
  INVALID_OTP: 'Invalid or expired OTP',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  MFA_REQUIRED: 'MFA verification required',
  MFA_SETUP_REQUIRED: 'MFA setup required before login',
} as const;

export const REMEMBER_ME_DAYS = 30;
export const DEFAULT_REFRESH_DAYS = 7;

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const OTP_MAX_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
