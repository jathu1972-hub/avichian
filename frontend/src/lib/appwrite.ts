import { Account, Client, ID } from 'appwrite';
import { toE164 } from '@avichian/shared';

const env = (import.meta as ImportMeta & {
  env: Record<string, string | undefined>;
}).env;
const endpoint = env.VITE_APPWRITE_ENDPOINT;
const projectId = env.VITE_APPWRITE_PROJECT_ID;

let client: Client | null = null;
let account: Account | null = null;

export function isAppwriteConfigured(): boolean {
  return Boolean(endpoint && projectId);
}

export function getAppwriteAccount(): Account {
  if (!endpoint || !projectId) {
    throw new Error('Appwrite is not configured. Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID.');
  }
  if (!client) {
    client = new Client().setEndpoint(endpoint).setProject(projectId);
    account = new Account(client);
  }
  return account!;
}

/** Create Appwrite phone token — sends OTP SMS via Appwrite */
export async function createAppwritePhoneSession(mobile: string): Promise<{
  appwriteUserId: string;
  phoneE164: string;
}> {
  const phoneE164 = toE164(mobile);
  const appwriteUserId = ID.unique();
  const acc = getAppwriteAccount();
  await acc.createPhoneToken(appwriteUserId, phoneE164);
  return { appwriteUserId, phoneE164 };
}

/** Verify OTP with Appwrite — creates Appwrite session */
export async function verifyAppwritePhoneOtp(
  appwriteUserId: string,
  otp: string,
): Promise<void> {
  const acc = getAppwriteAccount();
  await acc.createSession(appwriteUserId, otp);
}