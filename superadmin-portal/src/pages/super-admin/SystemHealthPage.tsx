import { CheckCircle, Database, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function SystemHealthPage() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    api<{ status: string; service: string }>('/health')
      .then((res) => {
        setOk(Boolean(res.success));
        setDetail(res.data?.service ?? 'api');
      })
      .catch(() => {
        setOk(false);
        setDetail('unreachable');
      });
  }, []);

  const services = [
    { name: 'API Server', status: ok, note: detail },
    { name: 'PostgreSQL', status: ok, note: ok ? 'via API health' : 'check DATABASE_URL' },
    { name: 'Socket.IO', status: ok, note: 'same process as API' },
    { name: 'WebRTC', status: true as boolean | null, note: 'client STUN (optional TURN)' },
    { name: 'Media / Uploads', status: ok, note: '/api/media + /api/uploads' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Health</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((s) => (
          <div key={s.name} className="glass-card flex items-center justify-between rounded-[28px] p-5">
            <div className="flex items-center gap-3">
              <Database size={20} className="text-primary" />
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-slate-500">{s.note}</p>
              </div>
            </div>
            {s.status === null ? (
              <span className="text-sm text-slate-400">Checking…</span>
            ) : s.status ? (
              <CheckCircle className="text-success" size={22} />
            ) : (
              <XCircle className="text-error" size={22} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
