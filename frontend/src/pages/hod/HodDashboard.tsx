import { GraduationCap, Users, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatCard } from '../../components/admin/StatCard';
import { api } from '../../lib/api';

interface HodStats {
  department: string;
  staffCount: number;
  rosterCount: number;
  registeredCount: number;
}

export function HodDashboard() {
  const [stats, setStats] = useState<HodStats | null>(null);

  useEffect(() => {
    api<HodStats>('/hod/dashboard').then((res) => setStats(res.data ?? null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HOD Dashboard</h1>
        <p className="text-sm text-slate-500">{stats?.department ?? 'Loading department...'}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Staff" value={stats?.staffCount ?? 0} />
        <StatCard icon={GraduationCap} label="Student roster" value={stats?.rosterCount ?? 0} />
        <StatCard icon={UserCheck} label="Registered students" value={stats?.registeredCount ?? 0} />
      </div>
      <div className="glass-card rounded-[28px] p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Testing flow</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Create staff accounts under Staff.</li>
          <li>Staff import student CSV records (no accounts yet).</li>
          <li>Students register on the public registration page.</li>
        </ol>
      </div>
    </div>
  );
}