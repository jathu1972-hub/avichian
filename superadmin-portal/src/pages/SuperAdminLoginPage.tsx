import { motion } from 'framer-motion';
import { Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import type { PublicUser } from '@avichian/shared';
import { useAuth } from '../context/AuthContext';
import { getPortalUrls } from '../lib/portal';

export function SuperAdminLoginPage() {
  const { establishSession } = useAuth();
  const navigate = useNavigate();
  const [adminId, setAdminId] = useState('');
  const [email, setEmail] = useState('');
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
        accessToken?: string;
        user?: PublicUser;
        csrfToken?: string;
        mfaRequired?: boolean;
        mfaSetupRequired?: boolean;
        mfaToken?: string;
      }>('/auth/login/super-admin', {
        method: 'POST',
        body: JSON.stringify({ adminId, email, password, rememberMe }),
      });

      const data = res.data!;

      if (data.mfaRequired || data.mfaSetupRequired) {
        setError(
          data.mfaSetupRequired
            ? 'MFA setup is required for this account. Use the MFA setup flow or ask the team lead to disable MFA for first login.'
            : 'MFA code required. Complete authenticator verification.',
        );
        return;
      }

      if (!data.accessToken || !data.user) {
        setError('Login failed: no session returned');
        return;
      }

      if (data.user.role !== 'SUPER_ADMIN') {
        setError('This dashboard is for Super Admin only.');
        return;
      }

      await establishSession(data.accessToken, data.user, data.csrfToken ?? null);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      // Friendlier hint when GitHub Pages cannot reach the PC tunnel
      if (/Failed to fetch|Network error|Cannot reach|Unable to connect/i.test(msg)) {
        setError('Unable to connect to the server. Please try again later.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-primary/40 px-4 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.15),transparent_50%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mx-auto w-full max-w-md min-w-0 space-y-6 sm:space-y-8"
      >
        <div className="text-center text-white">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20 text-accent ring-2 ring-accent/40"
          >
            <Shield size={32} />
          </motion.div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Super Admin</h1>
          <p className="mt-2 text-sm text-slate-300">Restricted system access — Avichian</p>
        </div>

        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-2 text-slate-700">
              <Lock size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">Secure sign in</h2>
            </div>

            <Input
              label="Admin ID"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value.toUpperCase())}
              placeholder="SA001"
              autoComplete="username"
              required
            />
            <Input
              label="College Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin1@avichian.edu"
              autoComplete="email"
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
              Remember this device (30 days)
            </label>

            {error ? (
              <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
            ) : null}

            <Button type="submit" loading={loading}>
              Access Admin Console
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            <a href={getPortalUrls().app} className="text-primary hover:underline">
              Open AVICHIAN app
            </a>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
