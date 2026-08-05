import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import { OtpPanel } from '../components/auth/OtpPanel';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { useAppwriteOtp } from '../hooks/useAppwriteOtp';
import { api } from '../lib/api';
import type { PublicUser } from '@avichian/shared';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole } from '../lib/roles';

type LoginMode = 'student-otp' | 'password' | 'email' | 'staff';
type StudentStep = 'regno' | 'mobile' | 'otp';

export function LoginPage() {
  const { establishSession } = useAuth();
  const navigate = useNavigate();
  const appwrite = useAppwriteOtp();
  const [mode, setMode] = useState<LoginMode>('student-otp');
  const [studentStep, setStudentStep] = useState<StudentStep>('regno');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpProvider, setOtpProvider] = useState<'appwrite' | 'console'>('console');
  const [otpVerified, setOtpVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [regNo, setRegNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [mobileHint, setMobileHint] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const [needsRegistration, setNeedsRegistration] = useState(false);

  function resetStudentFlow() {
    setStudentStep('regno');
    setStudentName('');
    setMobileHint('');
    setMobile('');
    setOtpVerified(false);
    setNeedsRegistration(false);
    appwrite.reset();
    setError('');
  }

  async function handleAuthSuccess(data: {
    accessToken?: string;
    user?: PublicUser;
    csrfToken?: string;
    mfaRequired?: boolean;
    mfaSetupRequired?: boolean;
    mfaToken?: string;
  }) {
    const dest = data.user ? homeRouteForRole(data.user.role) : '/home';
    if (data.mfaRequired || data.mfaSetupRequired) {
      navigate('/mfa-verify', {
        state: { mfaToken: data.mfaToken, setup: data.mfaSetupRequired, rememberMe, redirectTo: dest },
      });
      return;
    }
    await establishSession(data.accessToken!, data.user ?? null, data.csrfToken ?? null);
    navigate(dest, { replace: true });
  }

  async function handleStudentLookup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ registered: boolean; name: string; message?: string; mobileHint?: string }>(
        '/auth/login/student/lookup',
        { method: 'POST', body: JSON.stringify({ regNo }) },
      );
      if (!res.data?.registered) {
        setStudentName(res.data?.name ?? '');
        setNeedsRegistration(true);
        setError(res.data?.message ?? 'Account not created yet. Please register first.');
        return;
      }
      setNeedsRegistration(false);
      setStudentName(res.data.name);
      setMobileHint(res.data.mobileHint ?? '');
      setStudentStep('mobile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Student not found');
    } finally {
      setLoading(false);
    }
  }

  async function sendStudentOtp() {
    const res = await api<{
      provider: 'appwrite' | 'console';
      resendCooldownSeconds: number;
      mobileHint?: string;
    }>('/auth/login/student/otp/request', {
      method: 'POST',
      body: JSON.stringify({ regNo, mobile }),
    });
    setOtpProvider(res.data!.provider);
    setResendCooldown(res.data!.resendCooldownSeconds);
    if (res.data?.mobileHint) setMobileHint(res.data.mobileHint);
    if (res.data!.provider === 'appwrite') {
      await appwrite.sendOtp(mobile, res.data!.resendCooldownSeconds);
    }
    setStudentStep('otp');
  }

  async function handleStudentMobile(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendStudentOtp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentOtpVerify(code: string) {
    setError('');
    setLoading(true);
    try {
      const body: Record<string, string | boolean | undefined> = { regNo, mobile, rememberMe };
      if (otpProvider === 'appwrite') {
        const uid = await appwrite.verifyOtp(code);
        body.appwriteUserId = uid;
      } else {
        body.otp = code;
      }
      const res = await api<{ accessToken: string; user: PublicUser }>(
        '/auth/login/student/otp/verify',
        { method: 'POST', body: JSON.stringify(body) },
      );
      setOtpVerified(true);
      await handleAuthSuccess(res.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: PublicUser; mfaRequired?: boolean; mfaSetupRequired?: boolean; mfaToken?: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ regNo, password, rememberMe }) },
      );
      await handleAuthSuccess(res.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: PublicUser; mfaRequired?: boolean; mfaSetupRequired?: boolean; mfaToken?: string }>(
        '/auth/login/email',
        { method: 'POST', body: JSON.stringify({ email, password, rememberMe }) },
      );
      await handleAuthSuccess(res.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: PublicUser }>(
        '/auth/login/staff',
        { method: 'POST', body: JSON.stringify({ staffId, password, rememberMe }) },
      );
      await handleAuthSuccess(res.data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Staff login failed');
    } finally {
      setLoading(false);
    }
  }

  const modes: { id: LoginMode; label: string }[] = [
    { id: 'student-otp', label: 'Mobile OTP' },
    { id: 'password', label: 'Reg + Password' },
    { id: 'email', label: 'Email + Password' },
    { id: 'staff', label: 'Staff' },
  ];

  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-secondary/20 via-background to-background px-4 py-10">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-float">
            <GraduationCap size={32} />
          </div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Avichian</h1>
          <p className="mt-2 text-sm text-slate-500">Your private campus — Visual Communication</p>
        </div>

        <GlassCard>
          <div className="mb-5 flex flex-wrap gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMode(m.id); setError(''); resetStudentFlow(); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  mode === m.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mode === 'student-otp' && studentStep === 'regno' && (
              <motion.form key="regno" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleStudentLookup} className="space-y-4">
                <Input label="Register Number" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="25VCM01" required />
                {needsRegistration ? (
                  <div className="rounded-[20px] bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-medium">{studentName}</p>
                    <p className="mt-1">{error}</p>
                    <Link to="/register" className="mt-3 inline-block font-semibold text-primary">
                      Go to registration →
                    </Link>
                  </div>
                ) : error ? (
                  <p className="text-sm text-error">{error}</p>
                ) : null}
                <Button type="submit" loading={loading}>Continue</Button>
              </motion.form>
            )}

            {mode === 'student-otp' && studentStep === 'mobile' && (
              <motion.form key="mobile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleStudentMobile} className="space-y-4">
                <div className="rounded-[20px] bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-medium">{studentName}</p>
                  <p className="text-slate-500">{regNo}</p>
                </div>
                <Input label="Mobile Number" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" required />
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStudentStep('regno')}>Back</Button>
                  <Button type="submit" loading={loading}>Send OTP</Button>
                </div>
              </motion.form>
            )}

            {mode === 'student-otp' && studentStep === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <OtpPanel
                  mobileHint={mobileHint || `******${mobile.slice(-4)}`}
                  provider={otpProvider}
                  loading={loading}
                  sending={appwrite.sending}
                  error={error}
                  success={otpVerified}
                  resendCooldown={otpProvider === 'appwrite' ? appwrite.resendCooldown : resendCooldown}
                  onVerify={handleStudentOtpVerify}
                  onResend={async () => {
                    setError('');
                    try {
                      if (otpProvider === 'appwrite') await appwrite.sendOtp(mobile, resendCooldown);
                      else await sendStudentOtp();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Resend failed');
                    }
                  }}
                />
                <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setStudentStep('mobile')}>Back</Button>
              </motion.div>
            )}

            {mode === 'password' && (
              <motion.form key="password" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handlePasswordLogin} className="space-y-4">
                <Input label="Register Number" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} required />
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
                  Remember me for 30 days
                </label>
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" loading={loading}>Sign in</Button>
              </motion.form>
            )}

            {mode === 'email' && (
              <motion.form key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleEmailLogin} className="space-y-4">
                <p className="text-xs text-slate-500">Student or HOD — college email + password. HOD may require MFA.</p>
                <Input label="College Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@avichi.edu" required />
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
                  Remember me
                </label>
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" loading={loading}>Sign in</Button>
              </motion.form>
            )}

            {mode === 'staff' && (
              <motion.form key="staff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleStaffLogin} className="space-y-4">
                <Input label="Staff ID" value={staffId} onChange={(e) => setStaffId(e.target.value.toUpperCase())} required />
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded" />
                  Remember me
                </label>
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" loading={loading}>Staff Sign in</Button>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="mt-6 flex justify-between text-sm">
            <Link to="/register" className="font-medium text-primary">New here? Register</Link>
            <Link to="/forgot-password" className="text-slate-500">Forgot password?</Link>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">
            <Link to="/super-admin/login" className="hover:text-primary">Super Admin access</Link>
          </p>
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
        <li key={e} className="text-error">• {e}</li>
      ))}
      {check.valid ? <li className="text-success">• Password meets requirements</li> : null}
    </ul>
  );
}