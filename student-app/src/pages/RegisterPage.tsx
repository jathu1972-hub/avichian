import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { Button } from '../components/ui/Button';

/**
 * Students cannot self-register. Super Admin creates every account before the semester.
 */
export function RegisterPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-50 to-primary/5 px-4 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <GlassCard>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Registration closed</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            AVICHIAN student accounts are created only by the Super Admin before the semester starts.
            You cannot create an account yourself.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            If you received a Student ID and temporary password from the college, use Login. If you
            do not have credentials, contact the AVICHIAN Super Admin.
          </p>
          <div className="mt-6 space-y-3">
            <Link to="/login">
              <Button type="button">Go to Login</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
