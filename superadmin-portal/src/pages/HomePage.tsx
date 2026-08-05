import { motion } from 'framer-motion';
import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-secondary/10 px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-lg space-y-6">
        <GlassCard>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User size={28} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
              <p className="text-sm text-slate-500">{user?.regNo} · {user?.department}</p>
              {user?.bio ? <p className="mt-1 text-sm text-slate-600">{user.bio}</p> : null}
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="mb-2 text-lg font-semibold">Phase 1 complete</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            You&apos;re authenticated on the Super Admin portal. Manage students, content, events, and reports from the sidebar.
            once you approve this foundation.
          </p>
          <p className="mt-4 text-xs text-slate-400">No fake data — this screen only shows your real profile.</p>
        </GlassCard>

        <Button variant="secondary" onClick={handleLogout}>
          <span className="inline-flex items-center justify-center gap-2">
            <LogOut size={18} />
            Sign out
          </span>
        </Button>
      </motion.div>
    </div>
  );
}