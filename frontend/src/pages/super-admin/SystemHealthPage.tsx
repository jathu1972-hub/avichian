import { CheckCircle, Database } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export function SystemHealthPage() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => setOk(j.success))
      .catch(() => setOk(false));
  }, []);

  const services = [
    { name: 'API Server', status: ok },
    { name: 'PostgreSQL', status: ok },
    { name: 'Socket.IO', status: null },
    { name: 'WebRTC', status: null },
    { name: 'SMS Service', status: null },
    { name: 'Email Service', status: null },
    { name: 'Cloud Storage', status: null },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Health</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {services.map((s) => (
          <div key={s.name} className="glass-card flex items-center justify-between rounded-[28px] p-5">
            <div className="flex items-center gap-3">
              <Database className="text-primary" size={20} />
              <span className="font-medium">{s.name}</span>
            </div>
            {s.status === true ? (
              <span className="flex items-center gap-1 text-sm text-success"><CheckCircle size={16} /> Healthy</span>
            ) : s.status === false ? (
              <span className="text-sm text-error">Down</span>
            ) : (
              <span className="text-sm text-slate-400">Phase 2+</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}