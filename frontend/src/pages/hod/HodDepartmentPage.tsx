import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface HodDepartment {
  name: string;
  code: string | null;
  hod: { user: { profile: { name: string } | null; email: string } } | null;
}

export function HodDepartmentPage() {
  const [department, setDepartment] = useState<HodDepartment | null>(null);

  useEffect(() => {
    api<HodDepartment>('/hod/department').then((res) => setDepartment(res.data ?? null));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Department</h1>
      <div className="glass-card rounded-[28px] p-5">
        <p className="text-sm text-slate-500">Department name</p>
        <p className="text-xl font-semibold">{department?.name ?? '—'}</p>
        <p className="mt-4 text-sm text-slate-500">Code</p>
        <p className="font-medium">{department?.code ?? '—'}</p>
        <p className="mt-4 text-sm text-slate-500">HOD</p>
        <p className="font-medium">{department?.hod?.user.profile?.name ?? '—'}</p>
        <p className="text-sm text-slate-500">{department?.hod?.user.email}</p>
      </div>
    </div>
  );
}