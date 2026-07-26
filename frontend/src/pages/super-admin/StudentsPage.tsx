import { GraduationCap, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/admin/EmptyState';
import { api } from '../../lib/api';

interface Student {
  id: string;
  regNo: string;
  name: string;
  email: string;
  department: string;
  status: string;
  online: boolean;
  lastLoginAt: string | null;
}

interface MasterStudent {
  id: string;
  regNo: string;
  name: string;
  email: string;
  department: string;
  year: number;
  registered: boolean;
  mobileMasked: string;
}

export function StudentsPage() {
  const [tab, setTab] = useState<'registered' | 'roster'>('registered');
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [roster, setRoster] = useState<MasterStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'registered') {
        const res = await api<{ items: Student[] }>(`/super-admin/students?search=${encodeURIComponent(search)}`);
        setStudents(res.data?.items ?? []);
      } else {
        const res = await api<{ items: MasterStudent[] }>(`/super-admin/students/master?search=${encodeURIComponent(search)}`);
        setRoster(res.data?.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function suspend(id: string) {
    await api(`/super-admin/students/${id}/suspend`, { method: 'POST' });
    load();
  }

  async function activate(id: string) {
    await api(`/super-admin/students/${id}/activate`, { method: 'POST' });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Student Management</h1>
          <p className="text-sm opacity-60">Registered accounts and master roster</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('registered')}
            className={`rounded-full px-4 py-2 text-sm font-medium ${tab === 'registered' ? 'bg-primary text-white' : 'bg-slate-100'}`}
          >
            Registered
          </button>
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={`rounded-full px-4 py-2 text-sm font-medium ${tab === 'roster' ? 'bg-primary text-white' : 'bg-slate-100'}`}
          >
            Master Roster
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, reg no, email…"
          className="w-full rounded-[20px] border border-slate-200 bg-white/80 py-3 pl-11 pr-4 text-sm"
        />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : tab === 'registered' ? (
        students.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No registered students"
            description="Students appear here after they complete registration against the master roster."
          />
        ) : (
          <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white/70">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b bg-slate-50/80 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.regNo} · {s.email}</p>
                    </td>
                    <td className="px-4 py-3">{s.department}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${s.online ? 'bg-success/10 text-success' : 'bg-slate-100'}`}>
                        {s.status}{s.online ? ' · Online' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.status === 'SUSPENDED' ? (
                        <Button variant="ghost" onClick={() => activate(s.id)}>Activate</Button>
                      ) : (
                        <Button variant="ghost" onClick={() => suspend(s.id)}>Suspend</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : roster.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No roster entries" description="Import students via seed-data or admin import." />
      ) : (
        <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white/70">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-slate-50/80 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Reg No</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Registered</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.regNo}</td>
                  <td className="px-4 py-3">{s.department}</td>
                  <td className="px-4 py-3">{s.mobileMasked}</td>
                  <td className="px-4 py-3">{s.registered ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}