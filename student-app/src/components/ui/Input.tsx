import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <label htmlFor={inputId} className="block space-y-1.5">
      {label ? (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
          {label}
        </span>
      ) : null}
      <input
        id={inputId}
        className={`min-h-12 w-full max-w-full rounded-[1.25rem] border border-slate-200/90 bg-white/90 px-4 text-sm font-medium text-slate-900 shadow-soft outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/12 sm:text-base dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${error ? 'border-error focus:ring-error/15' : ''} ${className}`}
        {...props}
      />
      {error ? <span className="text-xs font-medium text-error">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}
