import { useCallback, useState } from 'react';
import {
  createAppwritePhoneSession,
  isAppwriteConfigured,
  verifyAppwritePhoneOtp,
} from '../lib/appwrite';

export function useAppwriteOtp() {
  const [appwriteUserId, setAppwriteUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const sendOtp = useCallback(async (mobile: string, cooldownSeconds = 30) => {
    if (!isAppwriteConfigured()) {
      throw new Error('Appwrite is not configured. Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID.');
    }
    setSending(true);
    try {
      const { appwriteUserId: uid } = await createAppwritePhoneSession(mobile);
      setAppwriteUserId(uid);
      setResendCooldown(cooldownSeconds);
      const timer = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            clearInterval(timer);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } finally {
      setSending(false);
    }
  }, []);

  const verifyOtp = useCallback(
    async (otp: string) => {
      if (!appwriteUserId) {
        throw new Error('No phone session. Send OTP first.');
      }
      await verifyAppwritePhoneOtp(appwriteUserId, otp);
      return appwriteUserId;
    },
    [appwriteUserId],
  );

  const reset = useCallback(() => {
    setAppwriteUserId(null);
    setResendCooldown(0);
  }, []);

  return {
    appwriteUserId,
    sending,
    resendCooldown,
    sendOtp,
    verifyOtp,
    reset,
    isAppwrite: isAppwriteConfigured(),
  };
}