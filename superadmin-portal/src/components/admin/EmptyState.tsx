import type { LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white/40 px-8 py-16 text-center">
      <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
        <Icon size={32} />
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
      {actionLabel && onAction ? (
        <div className="mt-6 w-full max-w-xs">
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      ) : null}
    </div>
  );
}