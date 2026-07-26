import { motion, AnimatePresence } from 'framer-motion';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OtpPanel } from '../components/auth/OtpPanel';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Input } from '../components/ui/Input';
import { useAppwriteOtp } from '../hooks/useAppwriteOtp';
import { api } from '../lib/api';
import type { PublicUser } from '@avichian/shared';
import { useAuth } from '../context/AuthContext';
import { PasswordHint } from './LoginPage';

type Step = 'regno' | 'details' | 'otp' | 'profile';

interface LookupData {
  regNo: string;
  name: string;
  email: string;
  collegeEmail?: string;
  department: string;
  year: number;
  section?: string | null;
  mobileHint: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { establishSession } = useAuth();
  const appwrite = useAppwriteOtp();
  const [step, setStep] = useState<Step>('regno');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpProvider, setOtpProvider] = useState<'appwrite' | 'console'>('console');
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifiedOtp, setVerifiedOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Visual Communication');
  const [section, setSection] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | undefined>();
  const [mobileHint, setMobileHint] = useState('');

  const steps: Step[] = ['regno', 'details', 'otp', 'profile'];
  const stepIndex = steps.indexOf(step);

  async function handleRegNoLookup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<LookupData>('/auth/register/lookup', {
        method: 'POST',
        body: JSON.stringify({ regNo }),
      });
      const data = res.data!;
      setName(data.name);
      setEmail(data.collegeEmail ?? data.email);
      setDepartment(data.department);
      setSection(data.section ?? null);
      setMobileHint(data.mobileHint);
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Student not found');
    } finally {
      setLoading(false);
    }
  }

  async function startOtpFlow() {
    const otpRes = await api<{
      provider: 'appwrite' | 'console';
      resendCooldownSeconds: number;
      mobileHint: string;
    }>('/auth/register/otp', {
      method: 'POST',
      body: JSON.stringify({ regNo, mobile }),
    });

    setOtpProvider(otpRes.data!.provider);
    setMobileHint(otpRes.data!.mobileHint);
    setResendCooldown(otpRes.data!.resendCooldownSeconds);

    if (otpRes.data!.provider === 'appwrite') {
      await appwrite.sendOtp(mobile, otpRes.data!.resendCooldownSeconds);
    }
    setStep('otp');
  }

  async function handleDetails(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/register/verify-mobile', {
        method: 'POST',
        body: JSON.stringify({ regNo, mobile }),
      });
      await startOtpFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid mobile number');
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpVerify(code: string) {
    setError('');
    setLoading(true);
    try {
      if (otpProvider === 'appwrite') {
        await appwrite.verifyOtp(code);
      } else {
        setVerifiedOtp(code);
      }
      setOtpVerified(true);
      setTimeout(() => setStep('profile'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    setError('');
    setOtpVerified(false);
    try {
      if (otpProvider === 'appwrite') {
        await appwrite.sendOtp(mobile, resendCooldown);
      } else {
        await startOtpFlow();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setProfilePhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body: Record<string, string | undefined> = {
        regNo,
        password,
        bio: bio || undefined,
        profilePhotoUrl,
      };
      if (otpProvider === 'appwrite' && appwrite.appwriteUserId) {
        body.appwriteUserId = appwrite.appwriteUserId;
      } else {
        body.otp = verifiedOtp;
      }

      const res = await api<{ accessToken: string; user: PublicUser }>(
        '/auth/register/complete',
        { method: 'POST', body: JSON.stringify(body) },
      );
      await establishSession(
        res.data!.accessToken,
        res.data!.user,
        (res.data as { csrfToken?: string }).csrfToken ?? null,
      );
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/10 to-background px-4 py-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-md">
        <GlassCard>
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Join Avichian</h1>
            <p className="text-sm text-slate-500">Only verified students in the master roster can register.</p>
            <div className="flex gap-2 pt-2">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    stepIndex >= i ? 'bg-primary' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === 'regno' && (
              <motion.form key="regno" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleRegNoLookup} className="space-y-4">
                <p className="text-sm text-slate-500">Step 1 — Enter your college register number</p>
                <Input label="Register Number" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="25VCM05" required />
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" loading={loading}>Continue</Button>
              </motion.form>
            )}

            {step === 'details' && (
              <motion.form key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleDetails} className="space-y-4">
                <p className="text-sm text-slate-500">Step 2 — Enter your registered mobile number</p>
                <div className="rounded-[20px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{name}</p>
                  <p>{regNo} · {department}{section ? ` · Section ${section}` : ''}</p>
                  <p>{email}</p>
                </div>
                <Input label="Mobile Number" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" placeholder="9629771369" required />
                {mobileHint ? <p className="text-xs text-slate-500">Must match roster mobile ending in {mobileHint.slice(-4)}</p> : null}
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep('regno')}>Back</Button>
                  <Button type="submit" loading={loading}>Send OTP</Button>
                </div>
              </motion.form>
            )}

            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="mb-4 text-sm text-slate-500">Step 3 — Verify your mobile with OTP</p>
                <OtpPanel
                  mobileHint={mobileHint || `******${mobile.slice(-4)}`}
                  provider={otpProvider}
                  loading={loading}
                  sending={appwrite.sending}
                  error={error}
                  success={otpVerified}
                  resendCooldown={otpProvider === 'appwrite' ? appwrite.resendCooldown : resendCooldown}
                  onVerify={handleOtpVerify}
                  onResend={handleResendOtp}
                />
                <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setStep('details')}>Back</Button>
              </motion.div>
            )}

            {step === 'profile' && (
              <motion.form key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleComplete} className="space-y-4">
                <p className="text-sm text-slate-500">Step 4 — Create password and profile</p>
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  <Camera className="text-primary" />
                  {profilePhotoUrl ? 'Photo selected' : 'Upload profile photo (optional)'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                </label>
                <Input label="Create Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <PasswordHint password={password} />
                <Input label="Bio (optional)" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
                {error ? <p className="text-sm text-error">{error}</p> : null}
                <Button type="submit" loading={loading}>Create Account</Button>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already registered? <Link to="/login" className="font-medium text-primary">Sign in</Link>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
}