import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state glass-elevated">
      <div className="empty-state-icon animate-float">
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <p className="mt-4 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
