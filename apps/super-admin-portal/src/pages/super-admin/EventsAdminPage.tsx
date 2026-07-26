import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface EventRow {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  venue: string | null;
  published: boolean;
}

export function EventsAdminPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venue, setVenue] = useState('');

  async function load() {
    const res = await api<EventRow[]>('/super-admin/events');
    setItems(res.data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/super-admin/events', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: description || undefined,
        startsAt: new Date(startsAt).toISOString(),
        venue: venue || undefined,
      }),
    });
    setName('');
    setDescription('');
    setStartsAt('');
    setVenue('');
    load();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete event?')) return;
    await api(`/super-admin/events/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Management</h1>
        <p className="text-sm opacity-60">Create, publish, cancel college events</p>
      </div>
      <form onSubmit={create} className="glass-card space-y-3 rounded-[24px] p-5">
        <Input label="Event name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Starts at" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <Button type="submit" className="w-auto">Publish Event</Button>
      </form>
      <div className="space-y-3">
        {items.map((ev) => (
          <div key={ev.id} className="glass-card flex justify-between rounded-[24px] p-5">
            <div>
              <p className="font-semibold">{ev.name}</p>
              <p className="text-sm text-slate-500">{ev.description}</p>
              <p className="text-xs text-slate-400">
                {new Date(ev.startsAt).toLocaleString()}
                {ev.venue ? ` · ${ev.venue}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => remove(ev.id)} className="text-xs text-error">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
