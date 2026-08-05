import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const [regNo, setRegNo] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ regNo }),
      });
      setMessage(res.data?.message ?? 'OTP sent if account exists');
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ regNo, otp, password }),
      });
      setMessage('Password reset successful. You can now sign in.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-md">
        <GlassCard>
          <h1 className="mb-2 text-2xl font-bold">Reset password</h1>
          <p className="mb-6 text-sm text-slate-500">We&apos;ll send an OTP to your registered mobile.</p>

          {step === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <Input label="Register Number" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} required />
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <Button type="submit" loading={loading}>Send OTP</Button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              {message ? <p className="text-sm text-success">{message}</p> : null}
              <Input label="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required />
              <Input label="New Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <Button type="submit" loading={loading}>Reset Password</Button>
            </form>
          )}

          <Link to="/login" className="mt-6 block text-center text-sm text-primary">
            Back to sign in
          </Link>
        </GlassCard>
      </div>
    </div>
  );
}