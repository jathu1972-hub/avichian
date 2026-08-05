import { useCallback, useEffect, useRef, useState } from 'react';
import { checkApiHealth, type HealthStatus } from '../lib/health';

/**
 * Monitors API health with auto-retry. Super Admin has no Socket.IO client.
 */
export function ApiConnectionBanner() {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [message, setMessage] = useState('');
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const probe = useCallback(async () => {
    const result = await checkApiHealth();
    setStatus(result.status);
    if (result.status === 'error') {
      setMessage(result.message || 'Backend offline or unreachable.');
      attemptRef.current += 1;
      const delay = Math.min(15_000, 1500 * Math.pow(1.4, Math.min(attemptRef.current, 8)));
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void probe();
      }, delay);
    } else {
      attemptRef.current = 0;
      setMessage('');
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void probe();
      }, 20_000);
    }
  }, []);

  useEffect(() => {
    void probe();
    const onOnline = () => {
      attemptRef.current = 0;
      void probe();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [probe]);

  if (status !== 'error') return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[200] border-b border-amber-600/40 bg-amber-500 px-4 py-2.5 text-center text-sm font-medium text-slate-900 shadow-md"
    >
      <span>{message}</span>
      <span className="ml-2 opacity-80">Reconnecting…</span>
    </div>
  );
}
