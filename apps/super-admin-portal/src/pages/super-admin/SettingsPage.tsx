import { Settings } from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';

export function SettingsPage() {
  const sections = [
    { title: 'App', fields: ['App Name: Avichian', 'College: Avichi Arts and Science College'] },
    { title: 'Security', fields: ['Super Admin MFA: Disabled', 'Student OTP Expiry: 5 min', 'Lockout: 5 attempts'] },
    { title: 'Registration', fields: ['Domain: @avichi.edu', 'Master roster gate: Enabled'] },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Settings</h1>
      <p className="text-sm opacity-60">Editable settings UI ships with system_settings table in next iteration.</p>
      {sections.map((s) => (
        <GlassCard key={s.title}>
          <div className="flex items-center gap-2 text-slate-800">
            <Settings size={18} className="text-primary" />
            <h2 className="font-semibold">{s.title}</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {s.fields.map((f) => (
              <li key={f} className="rounded-xl bg-slate-50 px-4 py-2">{f}</li>
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  );
}