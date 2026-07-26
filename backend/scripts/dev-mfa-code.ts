import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import { createHash, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = createHash('sha256').update(process.env.ENCRYPTION_KEY ?? 'dev-encryption-key-32-bytes-hex!!').digest();

function decryptField(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({
    where: { email: 'admin@avichi.edu' },
    select: { email: true, role: true, mfaEnabled: true, mfaSecretEnc: true },
  });

  if (!user) {
    console.log('Super admin user not found.');
    return;
  }

  console.log(`Email: ${user.email}`);
  console.log(`MFA enabled: ${user.mfaEnabled}`);

  if (!user.mfaSecretEnc) {
    console.log('\nNo MFA secret stored yet.');
    console.log('Log in at /super-admin/login — you will be sent to /mfa-verify to set up MFA.');
    console.log('The secret key will appear on that page. Add it to Google Authenticator, then enter the 6-digit code.');
    return;
  }

  const secret = decryptField(user.mfaSecretEnc);
  const code = authenticator.generate(secret);
  console.log(`\nSecret: ${secret}`);
  console.log(`Current MFA code: ${code}`);
  console.log('(Codes refresh every 30 seconds)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = new PrismaClient();
    await prisma.$disconnect();
  });