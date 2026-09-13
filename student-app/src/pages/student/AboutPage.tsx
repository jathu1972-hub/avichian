import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-md px-1 pb-10">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to="/home/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-800"
          aria-label="Back to settings"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-lg font-bold text-zinc-50">About</h1>
      </div>

      <div className="premium-card flex flex-col items-center px-6 py-10 text-center">
        <div className="brand-mark flex h-16 w-16 items-center justify-center rounded-[1.25rem] text-2xl font-extrabold tracking-tight text-white">
          A
        </div>
        <h2 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-zinc-50">
          AVICHIAN
        </h2>
        <p className="mt-1 text-sm font-medium text-primary">Private Campus Platform</p>
        <p className="mt-5 max-w-xs text-sm leading-relaxed text-zinc-400">
          A private social platform for Avichi Arts and Science College — connect with classmates,
          share moments, and stay involved in campus life.
        </p>

        <div className="my-8 h-px w-16 bg-zinc-700" aria-hidden />

        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Designed &amp; Developed by
        </p>
        <p className="mt-2 font-display text-lg font-bold tracking-tight text-zinc-100">
          Jathurshan
        </p>

        <div className="mt-10 w-full max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            Credits
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Application design, engineering, and product development by Jathurshan.
          </p>
          <p className="mt-2 text-xs font-medium text-zinc-300">
            Designed &amp; Developed by Jathurshan
          </p>
        </div>

        <p className="mt-8 text-xs text-zinc-500">© 2026 AVICHIAN</p>
        <p className="mt-1 text-[11px] text-zinc-600">Version 1.0.0</p>
      </div>
    </div>
  );
}
