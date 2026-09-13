import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import type { PublicUser } from '@avichian/shared';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { appHomePath, isAppUserRole } from '../lib/portal';

export function LoginPage() {
  const { establishSession } = useAuth();
  const navigate = useNavigate();
  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{
        accessToken: string;
        user: PublicUser;
        csrfToken?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ regNo, password, rememberMe }),
      });

      const data = res.data!;
      if (!data.user || !isAppUserRole(data.user.role)) {
        setError('This app is for students and staff only.');
        return;
      }

      await establishSession(data.accessToken, data.user, data.csrfToken ?? null);
      if (data.user.forcePasswordChange || data.user.isFirstLogin) {
        navigate('/force-password', { replace: true });
        return;
      }
      navigate(appHomePath(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden px-safe py-8 sm:py-10 md:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_20%_-10%,rgba(16,185,129,0.18),transparent_55%),radial-gradient(700px_400px_at_100%_10%,rgba(6,182,212,0.14),transparent_50%),linear-gradient(180deg,#f8fafc_0%,#ecfdf5_40%,#f8fafc_100%)]" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="relative mx-auto w-full max-w-md min-w-0 space-y-6 sm:space-y-8"
      >
        <div className="text-center">
          <div className="brand-mark mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.35rem] text-white">
            <GraduationCap size={32} strokeWidth={1.75} />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">AVICHIAN</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Private campus · Students &amp; Staff</p>
        </div>

        <GlassCard elevated>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Register Number or College Email"
              value={regNo}
              onChange={(e) =>
                setRegNo(e.target.value.includes('@') ? e.target.value : e.target.value.toUpperCase())
              }
              placeholder="25VCM01 or student@avichi.edu"
              autoComplete="username"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Remember me
            </label>
            {error ? (
              <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
            ) : null}
            <Button type="submit" loading={loading}>
              Login
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Link to="/forgot-password" className="font-medium text-primary">
              Forgot password?
            </Link>
            <p className="mt-3 text-xs text-slate-400">
              Accounts are created by Super Admin only — no self-registration.
            </p>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export function PasswordHint({ password }: { password: string }) {
  const check = isValidPasswordDetailed(password);
  if (!password) return null;
  // score available for strength UI consumers
  return (
    <ul className="space-y-1 text-xs">
      {check.errors.map((e) => (
        <li key={e} className="text-error">
          • {e}
        </li>
      ))}
      {check.valid ? <li className="text-success">• Password meets requirements</li> : null}
    </ul>
  );
}
