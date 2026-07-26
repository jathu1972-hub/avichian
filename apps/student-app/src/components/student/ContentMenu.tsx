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
}

export function ContentMenu({ actions, align = 'right' }: ContentMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More options"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
      >
        <MoreVertical size={18} />
      </button>
      {open ? (
        <div
          className={`absolute z-20 min-w-[180px] overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-float ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`block w-full px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                a.danger ? 'font-medium text-error' : 'text-slate-700'
              }`}
              onClick={() => {
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
