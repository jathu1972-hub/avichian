import { Client, Users } from 'node-appwrite';
import { e164MatchesMobile } from '@avichian/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function getClient(): Client {
  if (!env.appwriteEndpoint || !env.appwriteProjectId || !env.appwriteApiKey) {
    throw new AppError(503, 'Appwrite is not configured on the server');
  }
  return new Client()
    .setEndpoint(env.appwriteEndpoint)
    .setProject(env.appwriteProjectId)
    .setKey(env.appwriteApiKey);
}

export function isAppwriteOtpEnabled(): boolean {
  return env.smsProvider === 'appwrite' && Boolean(env.appwriteProjectId);
}

/**
 * After the client completes Appwrite createSession(userId, otp),
 * verify the Appwrite user exists with the expected verified phone.
 */
export async function verifyAppwritePhoneUser(
  appwriteUserId: string,
  expectedMobile: string,
): Promise<void> {
  const users = new Users(getClient());

  let appwriteUser;
  try {
    appwriteUser = await users.get(appwriteUserId);
  } catch {
    throw new AppError(401, 'Phone verification failed. Please try again.');
  }

  if (!e164MatchesMobile(appwriteUser.phone, expectedMobile)) {
    throw new AppError(401, 'Phone verification does not match the registered mobile number.');
  }

  const verified = (appwriteUser as { phoneVerification?: boolean }).phoneVerification;
  if (verified === false) {
    throw new AppError(401, 'Phone number is not verified. Complete OTP verification first.');
  }
}