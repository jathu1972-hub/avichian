import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';

/**
 * Students cannot self-reset. Super Admin issues a temporary password;
 * next login forces a personal password change.
 */
export function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-50 to-primary/5 px-4 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <GlassCard>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Forgot password?</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Please contact the AVICHIAN Super Admin to reset your password.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            After verification, Super Admin will issue a temporary password. On your next login you
            will be required to create a new private password before using the app.
          </p>
          <div className="mt-6 space-y-3">
            <Link to="/login">
              <Button type="button">Back to Login</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
