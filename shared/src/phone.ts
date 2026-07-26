import { normalizeMobile } from './validation/auth.js';

/** Format Indian 10-digit mobile to E.164 for Appwrite Phone Auth */
export function toE164(mobile: string, countryCode = '91'): string {
  const digits = normalizeMobile(mobile);
  return `+${countryCode}${digits}`;
}

export function e164MatchesMobile(e164: string | undefined, mobile: string): boolean {
  if (!e164) return false;
  const digits = normalizeMobile(mobile);
  return e164 === `+91${digits}` || e164.endsWith(digits);
}