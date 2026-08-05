import { useCallback, useEffect, useRef, useState } from 'react';
import { checkApiHealth, type HealthStatus } from '../lib/health';
import { onSocketConnectionChange } from '../lib/socket';

/**
 * Monitors API health and Socket.IO connection.
 * Auto-retries when offline; clears the banner when the backend recovers.
 * Shows the actual cause (not a vague generic message only).
 */
export function ApiConnectionBanner() {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [message, setMessage] = useState('');
  const [socketDown, setSocketDown] = useState(false);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const probe = useCallback(async () => {
    const result = await checkApiHealth();
    setStatus(result.status);
    if (result.status === 'error') {
      setMessage(result.message || 'Backend offline or unreachable.');
      attemptRef.current += 1;
      // Exponential backoff up to 15s
      const delay = Math.min(15_000, 1500 * Math.pow(1.4, Math.min(attemptRef.current, 8)));
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void probe();
      }, delay);
    } else {
      attemptRef.current = 0;
      setMessage('');
      // Keep light polling so we notice outages quickly
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void probe();
      }, 20_000);
    }
  }, []);

  useEffect(() => {
    void probe();

    // Retry immediately when browser comes back online
    const onOnline = () => {
      attemptRef.current = 0;
      void probe();
    };
    window.addEventListener('online', onOnline);

    const unsub = onSocketConnectionChange((connected) => {
      setSocketDown(!connected);
    });

    return () => {
      window.removeEventListener('online', onOnline);
      unsub();
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [probe]);

  const showApi = status === 'error';
  const showSocket = !showApi && socketDown && status === 'ok';

  if (!showApi && !showSocket) return null;

  return (
    <div
      role="alert"
      className={`fixed inset-x-0 top-0 z-[200] px-4 py-2.5 text-center text-sm font-medium shadow-md ${
        showApi
          ? 'border-b border-amber-600/40 bg-amber-500 text-slate-900'
          : 'border-b border-sky-600/30 bg-sky-600 text-white'
      }`}
    >
      {showApi ? (
        <>
          <span>{message}</span>
          <span className="ml-2 opacity-80">Reconnecting…</span>
        </>
      ) : (
        <span>Realtime connection lost — reconnecting chat and calls…</span>
      )}
    </div>
  );
}
