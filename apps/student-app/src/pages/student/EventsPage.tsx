import { Calendar, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

interface EventItem {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  venue: string | null;
}

export function EventsPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<EventItem[]>('/student/events')
      .then((res) => setItems(res.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Events</h1>
          <p className="text-sm text-slate-500">Department events & workshops</p>
        </div>
        <Link to="/home/calendar" className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          Calendar
        </Link>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
      ) : items.length === 0 ? (
        <div className="glass-card rounded-[28px] p-8 text-center text-slate-400 shadow-soft">
          No published events yet
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ev) => (
            <div key={ev.id} className="glass-card rounded-[24px] p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/15 p-3 text-amber-600">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{ev.name}</p>
                  {ev.description ? <p className="mt-1 text-sm text-slate-500">{ev.description}</p> : null}
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(ev.startsAt).toLocaleString()}
                  </p>
                  {ev.venue ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={12} /> {ev.venue}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
