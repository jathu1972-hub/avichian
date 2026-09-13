import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { isValidPasswordDetailed } from '@avichian/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api, getAccessToken } from '../../lib/api';
import { ApiClientError } from '../../lib/errors';

interface Department {
  id: string;
  name: string;
}

type PreviewStudent = {
  rowNumber: number;
  name: string;
  regNo: string;
  email: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
};

type PreviewResult = {
  total: number;
  valid: number;
  duplicate: number;
  invalid: number;
  department: string;
  departmentId: string;
  year: number;
  section: string | null;
  students: PreviewStudent[];
};

type ImportResult = {
  batchId: string;
  created: number;
  skipped: number;
  failed: number;
  status: string;
  errorReport: Array<{ rowNumber: number; name: string; regNo: string; reason: string }>;
};

function parseFile(file: File): Promise<{ headers: string[]; matrix: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]!];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as string[][];
        if (!rows.length) {
          reject(new Error('Spreadsheet is empty'));
          return;
        }
        const headers = (rows[0] ?? []).map((h) => String(h ?? '').trim());
        const matrix = rows
          .slice(1)
          .map((r) => headers.map((_, i) => String(r?.[i] ?? '').trim()))
          .filter((r) => r.some((c) => c.length > 0));
        resolve({ headers, matrix });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function BulkImportStudents({
  departments,
  onClose,
  onDone,
}: {
  departments: Department[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<string[][]>([]);
  const [mapping, setMapping] = useState({
    nameCol: 0,
    regCol: 1,
    emailCol: null as number | null,
    mobileCol: null as number | null,
  });
  const [needsMap, setNeedsMap] = useState(false);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');
  const [year, setYear] = useState(1);
  const [section, setSection] = useState('');
  const [password, setPassword] = useState('Students@2026');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const pw = useMemo(() => isValidPasswordDetailed(password), [password]);

  function authErrorMessage(err: unknown): string {
    if (err instanceof ApiClientError) {
      if (err.status === 401 || err.kind === 'auth_expired') {
        return 'Your Super Admin session expired. Please sign in again.';
      }
      if (err.status === 403 || err.kind === 'forbidden') {
        if (err.message.toLowerCase().includes('csrf')) {
          return 'Security check failed (CSRF). Refresh the page and try again.';
        }
        return "You don't have permission to perform this action. Super Admin access is required.";
      }
      return err.message;
    }
    return err instanceof Error ? err.message : 'Request failed';
  }

  /** Confirm Super Admin JWT works before upload (same auth as the rest of the portal). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken()) {
        if (!cancelled) {
          setError('Not signed in as Super Admin. Please sign in again.');
        }
        return;
      }
      try {
        // Lightweight authorized call — same middleware as import endpoints
        await api('/super-admin/students/import/history');
        if (!cancelled) setError('');
      } catch (e) {
        if (!cancelled) setError(authErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(f: File) {
    setError('');
    const ext = f.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setError('Only .csv, .xlsx, or .xls files are allowed');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError('File must be 8MB or smaller');
      return;
    }
    try {
      const parsed = await parseFile(f);
      setFile(f);
      setHeaders(parsed.headers);
      setMatrix(parsed.matrix);
      const det = await api<{
        nameCol: number | null;
        regCol: number | null;
        emailCol: number | null;
        mobileCol: number | null;
        confidence: string;
      }>('/super-admin/students/import/detect', {
        method: 'POST',
        body: JSON.stringify({ headers: parsed.headers }),
      });
      const d = det.data!;
      if (d.nameCol == null || d.regCol == null || d.confidence === 'low') {
        setNeedsMap(true);
        setMapping({
          nameCol: d.nameCol ?? 0,
          regCol: d.regCol ?? Math.min(1, parsed.headers.length - 1),
          emailCol: d.emailCol,
          mobileCol: d.mobileCol,
        });
        setStep(2);
      } else {
        setNeedsMap(false);
        setMapping({
          nameCol: d.nameCol,
          regCol: d.regCol,
          emailCol: d.emailCol,
          mobileCol: d.mobileCol,
        });
        setStep(3);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }

  async function runPreview() {
    setBusy(true);
    setError('');
    try {
      const res = await api<PreviewResult>('/super-admin/students/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          headers,
          matrix,
          mapping,
          departmentId,
          year,
          section: section || null,
        }),
      });
      setPreview(res.data ?? null);
      setStep(4);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!pw.valid) {
      setError(`Password: ${pw.errors.join(', ')}`);
      return;
    }
    setBusy(true);
    setError('');
    setProgress(10);
    const t = window.setInterval(() => {
      setProgress((p) => Math.min(90, p + 8));
    }, 400);
    try {
      const res = await api<ImportResult>('/super-admin/students/import', {
        method: 'POST',
        body: JSON.stringify({
          headers,
          matrix,
          mapping,
          departmentId,
          year,
          section: section || null,
          password,
        }),
      });
      setProgress(100);
      setResult(res.data ?? null);
      setStep(5);
      onDone(
        `Import complete: ${res.data?.created ?? 0} created, ${res.data?.skipped ?? 0} skipped, ${res.data?.failed ?? 0} failed`,
      );
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      window.clearInterval(t);
      setBusy(false);
    }
  }

  function downloadErrors() {
    const rows = result?.errorReport ?? preview?.students.filter((s) => s.status !== 'valid') ?? [];
    const lines = [
      'Row,Name,Roll Number,Reason',
      ...rows.map(
        (r) =>
          `${r.rowNumber},"${(r.name || '').replace(/"/g, '""')}","${r.regNo || ''}","${(r.reason || '').replace(/"/g, '""')}"`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[min(94dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-float dark:bg-zinc-950 sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-bold">Bulk Import Students</h2>
            <p className="text-xs text-slate-500">Step {step} of 5 · Real PostgreSQL accounts</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error ? <p className="rounded-2xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}

          {step === 1 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              <Upload className="mb-3 text-primary" size={32} />
              <p className="font-semibold">Drag Excel/CSV here</p>
              <p className="mt-1 text-xs text-slate-500">.csv · .xlsx · .xls · max 8MB</p>
              <label className="mt-4 cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">
                Choose File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              {file ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <FileSpreadsheet size={16} /> {file.name} ({matrix.length} rows)
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Map spreadsheet columns to student fields.</p>
              <label className="block text-sm">
                <span className="font-medium">Full Name column</span>
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                  value={mapping.nameCol}
                  onChange={(e) => setMapping({ ...mapping, nameCol: Number(e.target.value) })}
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Roll Number column</span>
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                  value={mapping.regCol}
                  onChange={(e) => setMapping({ ...mapping, regCol: Number(e.target.value) })}
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Apply department & year to all {matrix.length} students in this file.
              </p>
              <label className="block text-sm">
                <span className="font-medium">Department</span>
                <select
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Year</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Section (optional)"
                  value={section}
                  onChange={(e) => setSection(e.target.value.toUpperCase())}
                  placeholder="A"
                />
              </div>
              <Input
                label="Initial password (all students)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {!pw.valid ? (
                <ul className="text-xs text-error">
                  {pw.errors.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-success">Password meets policy · forced change on first login</p>
              )}
              <p className="text-xs text-slate-500">
                Emails auto-created as rollnumber@domain (from COLLEGE_EMAIL_DOMAIN).
              </p>
              <div className="flex gap-2">
                <Button type="button" loading={busy} onClick={() => void runPreview()}>
                  Preview import
                </Button>
                {needsMap ? (
                  <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                    Back
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                    Back
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {step === 4 && preview ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-zinc-900">
                  <p className="text-xs text-slate-500">Found</p>
                  <p className="text-xl font-bold">{preview.total}</p>
                </div>
                <div className="rounded-2xl bg-success/10 p-3">
                  <p className="text-xs text-success">Valid</p>
                  <p className="text-xl font-bold text-success">{preview.valid}</p>
                </div>
                <div className="rounded-2xl bg-warning/10 p-3">
                  <p className="text-xs text-warning">Duplicate</p>
                  <p className="text-xl font-bold text-warning">{preview.duplicate}</p>
                </div>
                <div className="rounded-2xl bg-error/10 p-3">
                  <p className="text-xs text-error">Invalid</p>
                  <p className="text-xl font-bold text-error">{preview.invalid}</p>
                </div>
              </div>
              <p className="text-sm">
                {preview.department} · Year {preview.year}
                {preview.section ? ` · Sec ${preview.section}` : ''}
              </p>
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-100 text-xs dark:border-zinc-800">
                <table className="min-w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-2 py-2">Row</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Roll</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.students.slice(0, 100).map((s) => (
                      <tr key={`${s.rowNumber}-${s.regNo}`} className="border-t border-slate-50 dark:border-zinc-800">
                        <td className="px-2 py-1.5">{s.rowNumber}</td>
                        <td className="px-2 py-1.5">{s.name}</td>
                        <td className="px-2 py-1.5 font-mono">{s.regNo}</td>
                        <td className="px-2 py-1.5">
                          {s.status === 'valid' ? (
                            <span className="text-success">Valid</span>
                          ) : (
                            <span className="text-error">{s.reason || s.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {busy ? (
                <div>
                  <p className="mb-1 text-sm">Importing students…</p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  loading={busy}
                  disabled={preview.valid === 0}
                  onClick={() => void runImport()}
                >
                  Import {preview.valid} students
                </Button>
                <Button type="button" variant="secondary" onClick={() => setStep(3)} disabled={busy}>
                  Back
                </Button>
                {(preview.invalid > 0 || preview.duplicate > 0) && (
                  <Button type="button" variant="ghost" onClick={downloadErrors}>
                    Download issues
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {step === 5 && result ? (
            <div className="space-y-3 text-center">
              <p className="text-2xl font-bold text-success">Import complete</p>
              <p className="text-sm text-slate-600">
                Created <strong>{result.created}</strong> · Skipped <strong>{result.skipped}</strong> ·
                Failed <strong>{result.failed}</strong>
              </p>
              <p className="text-xs text-slate-500">
                Students log in with Roll Number + initial password, then must change password.
              </p>
              {result.errorReport?.length ? (
                <Button type="button" variant="secondary" onClick={downloadErrors}>
                  Download error report
                </Button>
              ) : null}
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
