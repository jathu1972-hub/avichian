import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/admin/EmptyState';
import { api } from '../../lib/api';

interface AuditLog {
  id: string;
  action: string;
  createdAt: string;
  ipAddress: string | null;
  metadata: unknown;
  user?: { regNo: string; role: string; profile?: { name: string } } | null;
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditLog[]>('/super-admin/audit-logs?limit=100')
      .then((res) => setLogs(res.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      <p className="text-sm opacity-60">Every admin action is recorded with timestamp and IP.</p>
      {loading ? (
        <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />
      ) : logs.length === 0 ? (
        <EmptyState icon={Activity} title="No audit events" description="Actions will appear as admins use the system." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="glass-card rounded-[20px] px-4 py-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{log.action}</span>
                <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {log.user?.profile?.name ?? log.user?.regNo ?? 'System'} ({log.user?.role ?? '—'})
                {log.ipAddress ? ` · ${log.ipAddress}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}