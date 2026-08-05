import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface MasterStudent {
  regNo: string;
  name: string;
  email: string;
  mobileMasked: string;
  department: string;
  year: number;
  registered: boolean;
}

interface MasterList {
  items: MasterStudent[];
  total: number;
}

export function StaffStudentsPage() {
  const [data, setData] = useState<MasterList | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<MasterList>('/staff/students/master')
      .then((res) => setData(res.data ?? null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Student Roster</h1>
      <p className="text-sm text-slate-500">Records only — students must register to create accounts.</p>
      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {(data?.items ?? []).map((s) => (
            <div key={s.regNo} className="glass-card rounded-[28px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-slate-500">{s.regNo} · {s.email}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${s.registered ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {s.registered ? 'Registered' : 'Roster only'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{s.department} · Year {s.year} · {s.mobileMasked}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}