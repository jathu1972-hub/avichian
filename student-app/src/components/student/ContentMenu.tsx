import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MenuAction {
  id: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface ContentMenuProps {
  actions: MenuAction[];
  align?: 'left' | 'right';
  /**
   * overlay — white trigger for dark media viewers (stories/reels);
   * panel always uses high-contrast surface (never white text on white).
   */
  variant?: 'default' | 'overlay';
}

export function ContentMenu({ actions, align = 'right', variant = 'default' }: ContentMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const triggerClass =
    variant === 'overlay'
      ? 'rounded-full bg-white/15 p-2.5 text-white transition hover:bg-white/25'
      : 'rounded-full p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50';

  return (
    <div className="relative z-30" ref={ref}>
      <button
        type="button"
        aria-label="More options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClass}
      >
        <MoreVertical size={20} />
      </button>
      {open ? (
        <div
          className={`absolute z-40 min-w-[11.5rem] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-float dark:border-zinc-700 dark:bg-zinc-900 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          role="menu"
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className={`block w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-zinc-800 ${
                a.danger
                  ? 'text-error'
                  : 'text-slate-800 dark:text-zinc-100'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
