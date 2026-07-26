import request from 'supertest';
import type { Express } from 'express';

export async function getCsrfToken(app: Express): Promise<string> {
  const res = await request(app).get('/api/csrf-token');
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const csrfCookie = cookies?.find((c) => c.startsWith('csrf_token='));
  const token = res.body.data.csrfToken as string;
  return JSON.stringify({ token, cookie: csrfCookie });
}

export function csrfHeaders(csrfData: string) {
  const { token, cookie } = JSON.parse(csrfData) as {
    token: string;
    cookie?: string;
  };
  return {
    'X-CSRF-Token': token,
    Cookie: cookie ?? '',
  };
}

export const TEST_STUDENT = {
  name: 'JANE DOE',
  reg_no: '25VCM99',
  mobile: '9876543210',
  email: 'janedoe@avichi.edu',
  department: 'Visual Communication',
  year: 2025,
  role: 'student',
  verified: true,
} as const;

export const TEST_PASSWORD = 'SecurePass1';