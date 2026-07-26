import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { updateCallStatus } from '../../lib/social';
import { connectSocket } from '../../lib/socket';

export function CallPage({ mode }: { mode: 'voice' | 'video' }) {
  const { userId } = useParams();
  const [params] = useSearchParams();
  const callId = params.get('callId');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState(callId ? 'Ringing…' : 'Preparing call…');

  useEffect(() => {
    const socket = connectSocket();
    if (userId) {
      socket.emit('call:signal', {
        toUserId: userId,
        type: mode === 'video' ? 'VIDEO' : 'VOICE',
        callId,
        signal: { type: 'offer-placeholder' },
      });
    }
    setStatus(callId ? 'Connected (signaling via Socket.IO)' : 'Start from chat to save history');

    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [userId, mode, callId]);

  async function endCall(final: 'COMPLETED' | 'REJECTED' | 'MISSED' = 'COMPLETED') {
    if (callId) {
      try {
        await updateCallStatus(callId, final, seconds);
      } catch {
        /* ignore */
      }
    }
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="flex min-h-[75dvh] flex-col items-center justify-between rounded-[28px] bg-gradient-to-b from-slate-900 to-slate-800 p-6 text-white shadow-float">
      <div className="w-full text-center">
        <p className="text-xs uppercase tracking-wide text-white/50">
          {mode === 'video' ? 'Video call' : 'Voice call'} · friends only
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">Peer {userId?.slice(0, 8)}</h1>
        <p className="mt-2 text-sm text-white/60">{status}</p>
        <p className="mt-1 font-mono text-lg">{mm}:{ss}</p>
      </div>

      <div
        className={`flex w-full max-w-sm flex-col items-center justify-center rounded-[24px] ${
          mode === 'video' ? 'aspect-[9/14] bg-slate-700/50' : 'h-40'
        }`}
      >
        {mode === 'video' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/50">
            <Video size={40} />
            <p className="text-sm">LiveKit + Coturn ready to wire</p>
            <p className="px-6 text-center text-xs">
              Set LIVEKIT_URL / API keys for HD WebRTC media. Signaling uses Socket.IO now.
            </p>
          </div>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/30 text-3xl font-bold">
            {(userId ?? 'U').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex justify-center gap-4">
          <button type="button" onClick={() => setMuted((v) => !v)} className="rounded-full bg-white/10 p-4">
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          {mode === 'video' ? (
            <button type="button" onClick={() => setCamOff((v) => !v)} className="rounded-full bg-white/10 p-4">
              {camOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
          ) : null}
          <Link
            to="/home/chat"
            onClick={() => endCall('COMPLETED')}
            className="rounded-full bg-error p-4"
          >
            <PhoneOff size={22} />
          </Link>
        </div>
        <p className="text-center text-[11px] text-white/40">
          Flow: Call → Socket.IO signal → Accept → LiveKit room → Coturn → WebRTC → history saved
        </p>
        <Link to="/home/chat" onClick={() => endCall('COMPLETED')}>
          <Button type="button" variant="secondary" className="!border-white/20 !bg-white/10 !text-white">
            End & back to chat
          </Button>
        </Link>
      </div>
    </div>
  );
}
