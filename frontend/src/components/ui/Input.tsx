import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <label htmlFor={inputId} className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <input
        id={inputId}
        className={`min-h-12 w-full rounded-[20px] border border-slate-200 bg-white/80 px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 ${error ? 'border-error' : ''} ${className}`}
        {...props}
      />
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </label>
  );
}