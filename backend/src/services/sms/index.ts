import type { OtpPurpose } from '@prisma/client';
import { env } from '../../config/env.js';

export async function sendSmsOtp(
  mobile: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  if (env.smsProvider === 'console' || env.nodeEnv !== 'production') {
    console.info(`[OTP:${purpose}:SMS] -> ${mobile}: ${code}`);
    return;
  }

  switch (env.smsProvider) {
    case 'msg91':
      await sendViaMsg91(mobile, code);
      break;
    case 'appwrite':
      // Appwrite Phone Auth: client createPhoneToken + createSession; backend verifies via Users API.
      console.info(`[OTP:${purpose}:SMS] Appwrite client flow — mobile ******${mobile.slice(-4)}`);
      break;
    case 'firebase':
      console.info(`[OTP:${purpose}:SMS] Firebase client-side flow — mobile ${mobile.slice(-4)}`);
      break;
    default:
      console.info(`[OTP:${purpose}:SMS] -> ${mobile}: ${code}`);
  }
}

async function sendViaMsg91(mobile: string, code: string): Promise<void> {
  const authKey = env.msg91AuthKey;
  const templateId = env.msg91TemplateId;
  if (!authKey || !templateId) {
    throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID required for MSG91 SMS');
  }

  const response = await fetch('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: authKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      mobile: `91${mobile}`,
      otp: code,
      sender: env.msg91SenderId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MSG91 SMS failed: ${text}`);
  }
}