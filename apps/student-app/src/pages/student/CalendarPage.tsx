import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

interface CalItem {
  id: string;
  title: string;
  start: string;
  venue: string | null;
}

export function CalendarPage() {
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59).toISOString();
    setLoading(true);
    api<CalItem[]>(`/student/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((res) => setItems(res.data ?? []))
      .finally(() => setLoading(false));
  }, [month]);

  const days = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const cells: { day: number | null; date: string | null }[] = [];
    for (let i = 0; i < first; i++) cells.push({ day: null, date: null });
    for (let d = 1; d <= count; d++) {
      cells.push({ day: d, date: new Date(y, m, d).toISOString().slice(0, 10) });
    }
    return cells;
  }, [month]);

  function eventsOn(date: string | null) {
    if (!date) return [];
    return items.filter((e) => e.start.slice(0, 10) === date);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Calendar</h1>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1 text-sm shadow-soft"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            Prev
          </button>
          <span className="min-w-[120px] text-center text-sm font-semibold">
            {month.toLocaleString(undefined, { month: 'short', year: 'numeric' })}
          </span>
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1 text-sm shadow-soft"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="glass-card rounded-[24px] p-3 shadow-soft">
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-slate-400">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        {loading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {days.map((c, i) => {
              const evs = eventsOn(c.date);
              return (
                <div
                  key={i}
                  className={`min-h-14 rounded-xl p-1 ${c.day ? 'bg-white/70' : ''}`}
                >
                  {c.day ? (
                    <>
                      <p className="text-[11px] font-semibold text-slate-700">{c.day}</p>
                      {evs.length > 0 ? (
                        <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {items.map((e) => (
          <div key={e.id} className="glass-card rounded-[20px] px-4 py-3 text-sm shadow-soft">
            <p className="font-medium">{e.title}</p>
            <p className="text-xs text-slate-400">{new Date(e.start).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
