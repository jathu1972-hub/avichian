import { Clock3, GraduationCap, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatCard } from '../../components/admin/StatCard';
import { api } from '../../lib/api';

interface StaffStats {
  department: string;
  rosterCount: number;
  registeredCount: number;
  pendingRegistration: number;
}

export function StaffDashboard() {
  const [stats, setStats] = useState<StaffStats | null>(null);

  useEffect(() => {
    api<StaffStats>('/staff/dashboard').then((res) => setStats(res.data ?? null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff Dashboard</h1>
        <p className="text-sm text-slate-500">{stats?.department ?? 'Loading department...'}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={GraduationCap} label="Roster records" value={stats?.rosterCount ?? 0} />
        <StatCard icon={UserCheck} label="Registered accounts" value={stats?.registeredCount ?? 0} />
        <StatCard icon={Clock3} label="Pending registration" value={stats?.pendingRegistration ?? 0} />
      </div>
    </div>
  );
}