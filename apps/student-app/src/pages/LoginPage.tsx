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
      navigate(appHomePath(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-gradient-to-b from-secondary/20 via-background to-background px-safe py-8 sm:py-10 md:py-14">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto w-full max-w-md min-w-0 space-y-6 sm:space-y-8"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-float">
            <GraduationCap size={32} />
          </div>
          <h1 className="font-display text-3xl font-bold text-slate-900">AVICHIAN</h1>
          <p className="mt-2 text-sm text-slate-500">Private campus app · Students &amp; Staff</p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Register Number / Email / Staff ID"
              value={regNo}
              onChange={(e) =>
                setRegNo(e.target.value.includes('@') ? e.target.value : e.target.value.toUpperCase())
              }
              placeholder="25VCM05 or student@avichi.edu"
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

          <div className="mt-6 flex justify-between text-sm">
            <Link to="/register" className="font-medium text-primary">
              Student registration
            </Link>
            <Link to="/forgot-password" className="text-slate-500">
              Need help?
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export function PasswordHint({ password }: { password: string }) {
  const check = isValidPasswordDetailed(password);
  if (!password) return null;
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
