import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  visibility: string;
  createdAt: string;
}

export function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const res = await api<Announcement[]>('/super-admin/announcements');
    setItems(res.data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api('/super-admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title, body, visibility: 'DEPARTMENT' }),
    });
    setTitle('');
    setBody('');
    setMessage('Announcement published (audited)');
    load();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete announcement?')) return;
    await api(`/super-admin/announcements/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="text-sm opacity-60">Holiday notices, exams, emergencies</p>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      <form onSubmit={create} className="glass-card space-y-3 rounded-[24px] p-5">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-600">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
            className="w-full rounded-[20px] border border-slate-200 px-4 py-3 text-sm"
          />
        </label>
        <Button type="submit" className="w-auto">Publish Announcement</Button>
      </form>
      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="glass-card flex justify-between gap-3 rounded-[24px] p-5">
            <div>
              <p className="font-semibold">{a.title}</p>
              <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{a.body}</p>
              <p className="mt-2 text-[11px] text-slate-400">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            <button type="button" onClick={() => remove(a.id)} className="text-xs text-error">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
