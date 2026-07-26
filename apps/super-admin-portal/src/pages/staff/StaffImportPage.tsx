import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';

export function StaffImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const csrfRes = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'}/csrf-token`, {
        credentials: 'include',
      });
      const csrfJson = await csrfRes.json();
      const csrfToken = csrfJson.data?.csrfToken as string;

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'}/staff/students/import-csv`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('avichian_access_token') ?? ''}`,
          'X-CSRF-Token': csrfToken,
        },
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Import failed');
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Import Students (CSV)</h1>
      <div className="glass-card rounded-[28px] p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Expected columns</p>
        <p className="mt-2 font-mono text-xs">
          Register Number, Name, Email, Mobile, Department, Year
        </p>
        <p className="mt-3">Students are imported into the master roster only. They still need to register separately.</p>
      </div>

      <form onSubmit={handleImport} className="glass-card space-y-4 rounded-[28px] p-5">
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-[20px] border border-dashed border-slate-300 p-8 text-center">
          <Upload className="text-primary" />
          <span className="text-sm">{file ? file.name : 'Choose students.csv'}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        {result ? (
          <p className="text-sm text-green-700">
            Imported {result.imported} students · Skipped {result.skipped} duplicates
          </p>
        ) : null}
        <Button type="submit" loading={loading} disabled={!file}>Import CSV</Button>
      </form>
    </div>
  );
}