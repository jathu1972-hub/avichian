import { config } from 'dotenv';
import { resolve } from 'path';

// Integration tests may only run against an explicitly supplied, isolated database.
// Never fall back to the developer's normal .env database: test cleanup deletes rows.
config({ path: resolve(process.cwd(), '../.env.test') });
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
process.env.DATABASE_URL = testDatabaseUrl ?? '';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-characters-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-characters-long';
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-32-bytes-hex!!';
process.env.COLLEGE_EMAIL_DOMAIN ??= 'avichi.edu';
process.env.SMS_PROVIDER ??= 'console';
process.env.NODE_ENV ??= 'test';
