import { motion } from 'framer-motion';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import type { PublicUser } from '@avichian/shared';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api, setAccessToken, setCsrfToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { appHomePath } from '../lib/portal';
import { PasswordHint } from './LoginPage';

/**
 * First-time login gate after Super Admin creates the account or resets the password.
 * No skip — password must be set before any app features.
 */
export function ForcePasswordChangePage() {
  const { user, setUser, establishSession, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => isValidPasswordDetailed(newPassword), [newPassword]);
  const score = newPassword ? strength.score : 0;
  const strengthLabel =
    score <= 2 ? 'Weak' : score <= 3 ? 'Fair' : score <= 4 ? 'Good' : 'Strong';
  const strengthColor =
    score <= 2
      ? 'bg-error'
      : score <= 3
        ? 'bg-amber-500'
        : score <= 4
          ? 'bg-sky-500'
          : 'bg-emerald-500';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (!strength.valid) {
      setError(`Password requirements: ${strength.errors.join(', ')}`);
      return;
    }
    if (newPassword === currentPassword) {
      setError('Choose a password different from the temporary one');
      return;
    }

    setLoading(true);
    try {
      const res = await api<{
        message: string;
        user: PublicUser;
        forcePasswordChange: boolean;
        isFirstLogin?: boolean;
        accessToken?: string;
        expiresIn?: number;
        csrfToken?: string;
      }>('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = res.data!;
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        if (data.csrfToken) setCsrfToken(data.csrfToken);
        await establishSession(data.accessToken, data.user, data.csrfToken ?? null);
      } else if (data.user) {
        setUser({ ...data.user, forcePasswordChange: false, isFirstLogin: false });
      } else if (user) {
        setUser({ ...user, forcePasswordChange: false, isFirstLogin: false });
      }

      setSuccess(true);
      window.setTimeout(() => {
        navigate(appHomePath(), { replace: true });
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-emerald-50 to-background px-4 dark:from-slate-950 dark:to-slate-900">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-float">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Password saved
          </h1>
          <p className="mt-2 text-sm text-slate-500">Opening AVICHIAN…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-amber-50 via-background to-primary/5 px-safe py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-md space-y-6"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-float">
            <KeyRound size={28} />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Welcome to AVICHIAN
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            For your security, you must create a new password before using the app.
          </p>
          {user?.regNo ? (
            <p className="mt-1 text-xs font-medium text-slate-400">
              Signed in as {user.regNo}
              {user.name ? ` · ${user.name}` : ''}
            </p>
          ) : null}
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-700">1. Login</span>
          <span className="h-px w-6 bg-slate-300" />
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-primary">2. New password</span>
          <span className="h-px w-6 bg-slate-300" />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">3. Home</span>
        </div>

        <GlassCard>
          <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <p>
              Your college Super Admin issued a temporary password. Create a private password that only
              you know. Example format: <span className="font-mono font-semibold">Abc@2026</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Current password (temporary)"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div>
              <Input
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {newPassword ? (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i <= score ? strengthColor : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">Strength: {strengthLabel}</p>
                  <PasswordHint password={newPassword} />
                </div>
              ) : null}
            </div>
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error ? (
              <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
            ) : null}
            <Button type="submit" loading={loading}>
              Save password
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            There is no skip option. This step is required for campus security.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-2 w-full text-center text-sm text-slate-500 hover:text-primary"
          >
            Sign out
          </button>
        </GlassCard>
      </motion.div>
    </div>
  );
}
