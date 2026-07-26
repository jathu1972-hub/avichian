import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';

/**
 * No OTP / SMS reset in the Student App.
 * Password recovery is handled by department staff or Super Admin — not via OTP in-app.
 */
export function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <GlassCard>
          <h1 className="text-2xl font-bold text-slate-900">Need help signing in?</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            AVICHIAN uses register number (or staff ID) and password only. There is no SMS or email
            OTP reset in the app.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            If you forgot your password, contact department staff or the Super Admin team. They can
            reset your account after verifying your identity.
          </p>
          <div className="mt-6 space-y-3">
            <Link to="/login">
              <Button type="button">Back to Login</Button>
            </Link>
            <Link to="/register" className="block text-center text-sm font-medium text-primary">
              Not registered yet? Create account
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
