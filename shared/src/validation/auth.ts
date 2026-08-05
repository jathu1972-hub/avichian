const REG_NO_PATTERN = /^[A-Z0-9]{6,12}$/i;
const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const PASSWORD_MIN = 8;

export function normalizeRegNo(regNo: string): string {
  return regNo.trim().toUpperCase();
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeMobile(mobile: string): string {
  return mobile.replace(/\D/g, '').slice(-10);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidRegNo(regNo: string): boolean {
  return REG_NO_PATTERN.test(normalizeRegNo(regNo));
}

export function isValidMobile(mobile: string): boolean {
  return MOBILE_PATTERN.test(normalizeMobile(mobile));
}

export function isValidEmail(email: string, domain?: string): boolean {
  const normalized = normalizeEmail(email);
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalized)) return false;
  if (domain && !normalized.endsWith(`@${domain.toLowerCase()}`)) return false;
  return true;
}

/** Special characters allowed for campus passwords */
const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    SPECIAL.test(password)
  );
}

export function normalizeDepartment(department: string): string {
  return department.trim().replace(/\s+/g, ' ');
}

export function isValidPasswordDetailed(password: string): {
  valid: boolean;
  errors: string[];
  score: number;
} {
  const errors: string[] = [];
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  else errors.push(`At least ${PASSWORD_MIN} characters`);
  if (/[A-Z]/.test(password)) score += 1;
  else errors.push('One uppercase letter');
  if (/[a-z]/.test(password)) score += 1;
  else errors.push('One lowercase letter');
  if (/\d/.test(password)) score += 1;
  else errors.push('One number');
  if (SPECIAL.test(password)) score += 1;
  else errors.push('One special character (!@#$%^&*…)');
  if (password.length >= 12) score += 1;
  return { valid: errors.length === 0, errors, score: Math.min(5, score) };
}

export function sanitizeText(input: string, maxLength = 500): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '');
}