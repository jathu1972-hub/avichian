import type { OtpChannel, OtpPurpose } from '@prisma/client';
import { AUTH_ERRORS, OTP_MAX_VERIFY_ATTEMPTS } from '@avichian/shared';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { generateOtp, hashValue } from '../utils/crypto.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError } from '../utils/errors.js';
import { sendSmsOtp } from './sms/index.js';

interface SendOtpParams {
  purpose: OtpPurpose;
  channel: OtpChannel;
  regNo?: string;
  mobile?: string;
  email?: string;
  userId?: string;
}

export async function assertOtpResendAllowed(params: {
  purpose: OtpPurpose;
  regNo?: string;
  mobile?: string;
  email?: string;
}): Promise<void> {
  const windowStart = new Date(Date.now() - env.otpExpiryMinutes * 60 * 1000);
  const recent = await prisma.otpCode.findMany({
    where: {
      purpose: params.purpose,
      createdAt: { gte: windowStart },
      ...(params.regNo ? { regNo: params.regNo } : {}),
      ...(params.mobile ? { mobile: params.mobile } : {}),
      ...(params.email ? { email: params.email } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  const maxSends = env.otpMaxResends + 1;
  if (recent.length >= maxSends) {
    throw new AppError(429, 'Maximum OTP resend attempts reached. Try again later.');
  }

  const last = recent[0];
  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    const cooldownMs = env.otpResendCooldownSeconds * 1000;
    if (elapsed < cooldownMs) {
      const wait = Math.ceil((cooldownMs - elapsed) / 1000);
      throw new AppError(429, `Please wait ${wait} seconds before requesting another OTP.`);
    }
  }
}

export async function sendOtp(params: SendOtpParams): Promise<{
  expiresAt: Date;
  resendCooldownSeconds: number;
}> {
  await assertOtpResendAllowed({
    purpose: params.purpose,
    regNo: params.regNo,
    mobile: params.mobile,
    email: params.email,
  });

  const code = generateOtp(6);
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + env.otpExpiryMinutes * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      userId: params.userId,
      regNo: params.regNo,
      mobile: params.mobile,
      email: params.email,
      codeHash,
      purpose: params.purpose,
      channel: params.channel,
      expiresAt,
    },
  });

  if (params.channel === 'SMS' && params.mobile) {
    await sendSmsOtp(params.mobile, code, params.purpose);
  } else if (params.channel === 'EMAIL' && params.email) {
    await deliverEmailOtp(params.email, code, params.purpose);
  }

  return { expiresAt, resendCooldownSeconds: env.otpResendCooldownSeconds };
}

async function deliverEmailOtp(
  destination: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  if (env.nodeEnv !== 'production') {
    console.info(`[OTP:${purpose}:EMAIL] -> ${destination}: ${code}`);
    return;
  }
  console.info(`[OTP:EMAIL] Sent to ${hashValue(destination).slice(0, 8)}...`);
}

export async function verifyOtp(params: {
  purpose: OtpPurpose;
  code: string;
  regNo?: string;
  mobile?: string;
  email?: string;
  userId?: string;
}): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      purpose: params.purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
      ...(params.regNo ? { regNo: params.regNo } : {}),
      ...(params.mobile ? { mobile: params.mobile } : {}),
      ...(params.email ? { email: params.email } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError(400, AUTH_ERRORS.INVALID_OTP);
  }

  if (otp.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    throw new AppError(429, 'Too many OTP attempts. Request a new code.');
  }

  const valid = await verifyPassword(params.code, otp.codeHash);
  if (!valid) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, AUTH_ERRORS.INVALID_OTP);
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });
}