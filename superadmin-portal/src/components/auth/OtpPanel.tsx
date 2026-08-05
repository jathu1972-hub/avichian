import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface OtpPanelProps {
  mobileHint: string;
  provider?: 'appwrite' | 'console';
  loading?: boolean;
  sending?: boolean;
  error?: string;
  success?: boolean;
  resendCooldown: number;
  onVerify: (otp: string) => void | Promise<void>;
  onResend: () => void | Promise<void>;
  expiryMinutes?: number;
}

export function OtpPanel({
  mobileHint,
  provider = 'console',
  loading,
  sending,
  error,
  success,
  resendCooldown,
  onVerify,
  onResend,
  expiryMinutes = 5,
}: OtpPanelProps) {
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(expiryMinutes * 60);

  useEffect(() => {
    setCountdown(expiryMinutes * 60);
  }, [expiryMinutes, mobileHint]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    await onVerify(otp);
  }

  if (success) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-3 py-6 text-center"
      >
        <CheckCircle2 className="text-success" size={48} />
        <p className="font-semibold text-slate-800">Phone verified</p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-[20px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {sending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="animate-spin text-primary" size={16} />
            Sending OTP to {mobileHint}…
          </span>
        ) : provider === 'console' ? (
          <span>
            Dev mode: OTP is <strong>not sent by SMS</strong>. Check the backend terminal for{' '}
            <code className="rounded bg-slate-200 px-1">[OTP:…:SMS] -&gt; …{mobileHint.slice(-4)}: XXXXXX</code>
          </span>
        ) : (
          <span>OTP sent to <strong>{mobileHint}</strong> via SMS</span>
        )}
      </div>

      <Input
        label="6-digit OTP"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
      />

      <p className="text-center text-xs text-slate-500">
        Expires in {mins}:{secs.toString().padStart(2, '0')}
      </p>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <Button type="submit" loading={loading} disabled={otp.length !== 6 || sending}>
        Verify OTP
      </Button>

      <Button
        type="button"
        variant="secondary"
        disabled={resendCooldown > 0 || sending || loading}
        onClick={onResend}
        className="w-full"
      >
        <RefreshCw size={16} className="mr-2 inline" />
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
      </Button>
    </form>
  );
}