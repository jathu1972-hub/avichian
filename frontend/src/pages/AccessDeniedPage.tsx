import { ShieldOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';

export function AccessDeniedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-900 px-4">
      <GlassCard>
        <div className="text-center">
          <ShieldOff className="mx-auto text-error" size={48} />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">403 Access Denied</h1>
          <p className="mt-2 text-sm text-slate-500">
            This area is restricted to Super Admin accounts only.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link to="/login"><Button variant="secondary">Student Login</Button></Link>
            <Link to="/super-admin/login"><Button>Super Admin Login</Button></Link>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}