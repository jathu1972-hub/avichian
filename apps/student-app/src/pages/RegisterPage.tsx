import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PublicUser } from '@avichian/shared';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { appHomePath, isStudentRole } from '../lib/portal';
import { PasswordHint } from './LoginPage';

export function RegisterPage() {
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: PublicUser; csrfToken?: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            regNo,
            name,
            mobile,
            password,
            confirmPassword,
          }),
        },
      );

      const data = res.data!;
      if (!data.user || !isStudentRole(data.user.role)) {
        setError('Registration failed. Only student accounts can be created here.');
        return;
      }

      await establishSession(data.accessToken, data.user, data.csrfToken ?? null);
      navigate(appHomePath(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration denied');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-gradient-to-b from-primary/10 to-background px-safe py-8 sm:py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-md min-w-0">
        <GlassCard>
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Join Avichian</h1>
            <p className="text-sm text-slate-500">
              Only students already listed in the college Student Master database can register.
              Your register number, name, and mobile must match the roster.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Register Number"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              placeholder="25VCM05"
              required
            />
            <Input
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="As on college roster"
              required
            />
            <Input
              label="Mobile Number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="tel"
              placeholder="9629771369"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <PasswordHint password={password} />
            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            {error ? (
              <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
            ) : null}

            <Button type="submit" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-medium text-primary">
              Sign in
            </Link>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}
