import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed, type PublicUser } from '@avichian/shared';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function ForcePasswordChangePage() {
  const { establishSession } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const check = isValidPasswordDetailed(password);
    if (!check.valid) {
      setError(check.errors.join(', '));
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{
        accessToken?: string;
        user?: PublicUser;
        forcePasswordChange?: boolean;
      }>('/settings/security/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword,
          newPassword: password,
        }),
      });
      if (res.data?.accessToken && res.data.user) {
        await establishSession(res.data.accessToken, {
          ...res.data.user,
          forcePasswordChange: false,
          isFirstLogin: false,
        });
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-primary/40 px-4 py-10">
      <div className="w-full max-w-md">
        <GlassCard>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex items-center gap-3 text-slate-800">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <KeyRound size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold">Change your password</h1>
                <p className="text-sm opacity-60">
                  Required before using the Super Admin dashboard
                </p>
              </div>
            </div>
            <Input
              label="Current / temporary password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <Button type="submit" loading={loading} className="w-full">
              Save and continue
            </Button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
