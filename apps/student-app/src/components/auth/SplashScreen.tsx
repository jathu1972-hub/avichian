import { GraduationCap } from 'lucide-react';

export function SplashScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gradient-to-b from-primary/10 to-background">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-float">
        <GraduationCap size={36} />
      </div>
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-slate-900">Avichian</h1>
        <p className="mt-2 text-sm text-slate-500">Loading your campus…</p>
      </div>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}