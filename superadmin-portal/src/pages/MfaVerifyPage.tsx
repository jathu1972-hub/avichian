import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import type { PublicUser } from '@avichian/shared';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole, getPortalUrls } from '../lib/portal';
import { resolvePostAuthDestination } from '@avichian/shared';

export function MfaVerifyPage() {
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const location = useLocation();
  const state = location.state as {
    mfaToken?: string;
    setup?: boolean;
    rememberMe?: boolean;
    redirectTo?: string;
  } | null;

  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupLoaded, setSetupLoaded] = useState(false);

  useEffect(() => {
    if (!state?.mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [state?.mfaToken, navigate]);

  if (!state?.mfaToken) {
    return null;
  }

  async function loadSetup() {
    if (setupLoaded) return;
    setLoading(true);
    try {
      const res = await api<{ secret: string; otpauth: string }>('/auth/login/mfa/setup', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: state!.mfaToken }),
      });
      setSecret(res.data!.secret);
      setSetupLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA setup failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (state?.setup && !setupLoaded) {
      loadSetup();
    }
  }, [state?.setup, setupLoaded]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const path = state?.setup ? '/auth/login/mfa/enable' : '/auth/login/mfa';
      const res = await api<{ accessToken: string; user: PublicUser; csrfToken?: string }>(path, {
        method: 'POST',
        body: JSON.stringify({
          mfaToken: state!.mfaToken,
          code,
          rememberMe: state?.rememberMe,
        }),
      });
      await establishSession(res.data!.accessToken, res.data!.user, res.data!.csrfToken ?? null);
      const dest =
        state?.redirectTo ??
        resolvePostAuthDestination(res.data!.user.role, 'super-admin', getPortalUrls());
      if (dest === 'redirect') return;
      navigate(typeof dest === 'string' ? dest : homeRouteForRole(res.data!.user.role), {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-md">
        <GlassCard>
          <h1 className="mb-2 text-2xl font-bold">{state.setup ? 'Set up MFA' : 'Verify MFA'}</h1>
          <p className="mb-4 text-sm text-slate-500">
            {state.setup
              ? 'Add this secret to your authenticator app, then enter the 6-digit code.'
              : 'Enter the code from your authenticator app.'}
          </p>
          {secret ? (
            <p className="mb-4 break-all rounded-[20px] bg-slate-100 p-3 font-mono text-xs">{secret}</p>
          ) : null}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" loading={loading}>{state.setup ? 'Enable MFA & Sign in' : 'Verify'}</Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}