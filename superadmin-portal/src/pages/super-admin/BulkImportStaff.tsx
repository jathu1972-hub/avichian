import { Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../../components/ui/Button';
import { api, getAccessToken } from '../../lib/api';
import { ApiClientError } from '../../lib/errors';

interface Department {
  id: string;
  name: string;
}

type PreviewStaff = {
  rowNumber: number;
  name: string;
  staffId: string;
  email: string;
  departmentName: string | null;
  designation: string | null;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
};

type PreviewResult = {
  total: number;
  valid: number;
  duplicate: number;
  invalid: number;
  department: string | null;
  departmentId: string | null;
  staff: PreviewStaff[];
};

type ImportResult = {
  created: number;
  skipped: number;
  failed: number;
  status: string;
  errorReport: Array<{ rowNumber: number; name: string; staffId: string; reason: string }>;
  credentials: Array<{ staffId: string; email: string; name: string; temporaryPassword: string }>;
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

export function BulkImportStaff({
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
    staffIdCol: 1,
    emailCol: null as number | null,
    departmentCol: null as number | null,
    designationCol: null as number | null,
    mobileCol: null as number | null,
  });
  const [needsMap, setNeedsMap] = useState(false);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  function authErrorMessage(err: unknown): string {
    if (err instanceof ApiClientError) {
      if (err.status === 401) return 'Session expired. Sign in again as Super Admin.';
      if (err.status === 403) {
        return "You don't have permission. Super Admin access is required.";
      }
      return err.message;
    }
    return err instanceof Error ? err.message : 'Request failed';
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAccessToken()) {
        if (!cancelled) setError('Not signed in as Super Admin.');
        return;
      }
      try {
        await api('/super-admin/staff');
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
        staffIdCol: number | null;
        emailCol: number | null;
        departmentCol: number | null;
        designationCol: number | null;
        mobileCol: number | null;
        confidence: string;
      }>('/super-admin/staff/import/detect', {
        method: 'POST',
        body: JSON.stringify({ headers: parsed.headers }),
      });
      const d = det.data!;
      if (d.nameCol == null || d.staffIdCol == null || d.confidence === 'low') {
        setNeedsMap(true);
        setMapping({
          nameCol: d.nameCol ?? 0,
          staffIdCol: d.staffIdCol ?? Math.min(1, parsed.headers.length - 1),
          emailCol: d.emailCol,
          departmentCol: d.departmentCol,
          designationCol: d.designationCol,
          mobileCol: d.mobileCol,
        });
        setStep(2);
      } else {
        setNeedsMap(false);
        setMapping({
          nameCol: d.nameCol,
          staffIdCol: d.staffIdCol,
          emailCol: d.emailCol,
          departmentCol: d.departmentCol,
          designationCol: d.designationCol,
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
      const res = await api<PreviewResult>('/super-admin/staff/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          headers,
          matrix,
          mapping,
          departmentId: departmentId || null,
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
    setBusy(true);
    setError('');
    setProgress(10);
    const t = window.setInterval(() => {
      setProgress((p) => Math.min(90, p + 8));
    }, 400);
    try {
      const res = await api<ImportResult>('/super-admin/staff/import', {
        method: 'POST',
        body: JSON.stringify({
          headers,
          matrix,
          mapping,
          departmentId: departmentId || null,
          fileName: file?.name,
        }),
      });
      setProgress(100);
      setResult(res.data ?? null);
      setStep(5);
      onDone(
        `Staff import complete: ${res.data?.created ?? 0} created, ${res.data?.skipped ?? 0} skipped, ${res.data?.failed ?? 0} failed`,
      );
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      window.clearInterval(t);
      setBusy(false);
    }
  }

  function downloadCredentials() {
    const rows = result?.credentials ?? [];
    if (!rows.length) return;
    const lines = [
      'Staff ID,Name,Email,Temporary Password',
      ...rows.map(
        (r) =>
          `"${r.staffId}","${(r.name || '').replace(/"/g, '""')}","${r.email}","${r.temporaryPassword}"`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-temporary-passwords.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadErrors() {
    const rows = result?.errorReport ?? preview?.staff.filter((s) => s.status !== 'valid') ?? [];
    const lines = [
      'Row,Name,Staff ID,Reason',
      ...rows.map(
        (r) =>
          `${r.rowNumber},"${(r.name || '').replace(/"/g, '""')}","${r.staffId || ''}","${(r.reason || '').replace(/"/g, '""')}"`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[min(94dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] bg-zinc-950 shadow-float sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-50">Bulk Import Staff</h2>
            <p className="text-xs text-zinc-400">
              Step {step} of 5 · Real PostgreSQL STAFF accounts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-300 hover:bg-zinc-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-zinc-100">
          {error ? (
            <p className="rounded-2xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>
          ) : null}

          {step === 1 ? (
            <div
              className="flex flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed border-zinc-700 bg-zinc-900 px-6 py-12 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              <Upload className="mb-3 text-primary" size={32} />
              <p className="font-semibold">Upload Staff Excel / CSV</p>
              <p className="mt-1 text-xs text-zinc-400">
                Name · Staff ID · Email · Department · Designation
              </p>
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
                <p className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
                  <FileSpreadsheet size={16} /> {file.name} ({matrix.length} rows)
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">Map spreadsheet columns to staff fields.</p>
              {(
                [
                  ['nameCol', 'Full Name'],
                  ['staffIdCol', 'Staff ID'],
                  ['emailCol', 'Email (optional)'],
                  ['departmentCol', 'Department (optional)'],
                  ['designationCol', 'Designation (optional)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="font-medium">{label}</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2"
                    value={
                      mapping[key] === null || mapping[key] === undefined
                        ? ''
                        : String(mapping[key])
                    }
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setMapping({ ...mapping, [key]: v as never });
                    }}
                  >
                    {key !== 'nameCol' && key !== 'staffIdCol' ? (
                      <option value="">— None —</option>
                    ) : null}
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Button type="button" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Default department for rows without a department column ({matrix.length} rows).
              </p>
              <label className="block text-sm">
                <span className="font-medium">Department</span>
                <select
                  className="mt-1 w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">— Required if Excel has no Department —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-zinc-500">
                Each staff account gets a unique temporary password. Only hashes are stored in
                PostgreSQL.
              </p>
              <div className="flex gap-2">
                {needsMap ? (
                  <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                    Back
                  </Button>
                ) : null}
                <Button type="button" loading={busy} onClick={() => void runPreview()}>
                  Validate &amp; Preview
                </Button>
              </div>
            </div>
          ) : null}

          {step === 4 && preview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['TOTAL', preview.total],
                  ['VALID', preview.valid],
                  ['DUPLICATES', preview.duplicate],
                  ['INVALID', preview.invalid],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-2xl bg-zinc-900 px-3 py-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      {l}
                    </p>
                    <p className="text-xl font-bold tabular-nums">{v}</p>
                  </div>
                ))}
              </div>
              {preview.department ? (
                <p className="text-xs text-zinc-400">
                  Default department: <span className="text-zinc-200">{preview.department}</span>
                </p>
              ) : null}
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-zinc-800 text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Staff ID</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.staff.slice(0, 80).map((s) => (
                      <tr key={`${s.rowNumber}-${s.staffId}`} className="border-t border-zinc-800">
                        <td className="px-2 py-1.5">{s.rowNumber}</td>
                        <td className="px-2 py-1.5">{s.name}</td>
                        <td className="px-2 py-1.5 font-mono">{s.staffId}</td>
                        <td className="px-2 py-1.5">
                          {s.status === 'valid' ? (
                            <span className="text-success">valid</span>
                          ) : (
                            <span className="text-error">
                              {s.status}: {s.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button
                  type="button"
                  loading={busy}
                  disabled={preview.valid < 1}
                  onClick={() => void runImport()}
                >
                  Create {preview.valid} Account{preview.valid === 1 ? '' : 's'}
                </Button>
                <Button type="button" variant="ghost" onClick={downloadErrors}>
                  <Download size={14} className="mr-1 inline" />
                  Error report
                </Button>
              </div>
              {busy ? (
                <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 5 && result ? (
            <div className="space-y-4 text-center">
              <p className="text-lg font-bold text-success">Import finished</p>
              <p className="text-sm text-zinc-400">
                Created {result.created} · Skipped {result.skipped} · Failed {result.failed} ·{' '}
                {result.status}
              </p>
              <p className="text-xs text-zinc-500">
                Download temporary passwords now — they are not stored in the database.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {result.credentials?.length ? (
                  <Button type="button" onClick={downloadCredentials}>
                    <Download size={14} className="mr-1 inline" />
                    Temporary passwords CSV
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={downloadErrors}>
                  Error report
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
