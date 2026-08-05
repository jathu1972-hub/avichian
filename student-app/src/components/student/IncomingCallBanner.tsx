import { Phone, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateCallStatus } from '../../lib/calls';
import {
  isRingtoneWanted,
  startIncomingRingtone,
  stopIncomingRingtone,
} from '../../lib/ringtone';
import { connectSocket } from '../../lib/socket';
import { StudentAvatar } from './StudentAvatar';

interface IncomingInvite {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  fromUserId: string;
  fromName: string;
  fromPhoto?: string | null;
  roomName?: string;
  fromDepartment?: string | null;
}

const AUTO_MISS_MS = 45_000;

/** Module-level guards survive React StrictMode remounts */
let globalActiveCallId: string | null = null;
let globalMissTimer: number | null = null;

function clearGlobalMissTimer() {
  if (globalMissTimer) {
    window.clearTimeout(globalMissTimer);
    globalMissTimer = null;
  }
}

export function IncomingCallBanner() {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<IncomingInvite | null>(null);
  const [missedToast, setMissedToast] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const missedToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const socket = connectSocket();

    function showMissed(name: string) {
      setMissedToast(`Missed Call from ${name}`);
      if (missedToastTimerRef.current) window.clearTimeout(missedToastTimerRef.current);
      missedToastTimerRef.current = window.setTimeout(() => {
        setMissedToast(null);
        missedToastTimerRef.current = null;
      }, 4500);
    }

    function dismissInvite(callId?: string) {
      if (callId && globalActiveCallId && callId !== globalActiveCallId) return;
      if (!callId || globalActiveCallId === callId) {
        stopIncomingRingtone();
        clearGlobalMissTimer();
        globalActiveCallId = null;
      }
      if (mountedRef.current) {
        setInvite((cur) => {
          if (!cur) return null;
          if (callId && cur.callId !== callId) return cur;
          return null;
        });
      }
    }

    function presentInvite(next: IncomingInvite) {
      const path = window.location.pathname + window.location.hash;
      if (path.includes('/home/call/') || path.includes('#/home/call/')) return;
      if (!next.callId || !next.fromUserId) return;

      // Dual-channel invite: same callId must not restart ring / dialog
      if (globalActiveCallId === next.callId) {
        if (mountedRef.current) {
          setInvite((cur) => {
            if (!cur || cur.callId !== next.callId) return next;
            return {
              ...cur,
              fromName: next.fromName || cur.fromName,
              fromPhoto: next.fromPhoto ?? cur.fromPhoto,
              fromDepartment: next.fromDepartment ?? cur.fromDepartment,
              roomName: next.roomName || cur.roomName,
            };
          });
        }
        if (isRingtoneWanted() === false) {
          void startIncomingRingtone();
        }
        return;
      }

      globalActiveCallId = next.callId;
      if (mountedRef.current) setInvite(next);
      void startIncomingRingtone();

      clearGlobalMissTimer();
      globalMissTimer = window.setTimeout(() => {
        if (globalActiveCallId !== next.callId) return;
        void updateCallStatus(next.callId, 'MISSED', 0).catch(() => undefined);
        const s = connectSocket();
        s.emit('callEnded', {
          toUserId: next.fromUserId,
          callId: next.callId,
          reason: 'MISSED',
        });
        s.emit('call:signal', {
          toUserId: next.fromUserId,
          callId: next.callId,
          type: next.callType,
          signal: { type: 'hangup', reason: 'MISSED' },
        });
        stopIncomingRingtone();
        globalActiveCallId = null;
        if (mountedRef.current) {
          setInvite(null);
          showMissed(next.fromName || 'Friend');
        }
        clearGlobalMissTimer();
      }, AUTO_MISS_MS);
    }

    function onSignal(payload: {
      fromUserId: string;
      callId?: string;
      type?: string;
      signal: {
        type?: string;
        callId?: string;
        callType?: string;
        fromUserId?: string;
        fromName?: string;
        fromPhoto?: string | null;
        fromDepartment?: string | null;
        roomName?: string;
      };
    }) {
      const signal = payload.signal;
      if (signal?.type === 'hangup' || signal?.type === 'reject') {
        dismissInvite(payload.callId || signal.callId);
        return;
      }
      if (signal?.type !== 'invite') return;

      presentInvite({
        callId: signal.callId || payload.callId || '',
        callType: (signal.callType || payload.type || 'VOICE') as 'VOICE' | 'VIDEO',
        fromUserId: signal.fromUserId || payload.fromUserId,
        fromName: signal.fromName || 'Friend',
        fromPhoto: signal.fromPhoto,
        fromDepartment: signal.fromDepartment,
        roomName: signal.roomName,
      });
    }

    function onInvitation(payload: {
      fromUserId: string;
      callId: string;
      callType: string;
      fromName?: string;
      fromPhoto?: string | null;
      fromDepartment?: string | null;
      roomName?: string;
    }) {
      presentInvite({
        callId: payload.callId,
        callType: (payload.callType || 'VOICE') as 'VOICE' | 'VIDEO',
        fromUserId: payload.fromUserId,
        fromName: payload.fromName || 'Friend',
        fromPhoto: payload.fromPhoto,
        fromDepartment: payload.fromDepartment,
        roomName: payload.roomName,
      });
    }

    socket.on('call:signal', onSignal);
    socket.on('callInvitation', onInvitation);

    // Restore UI if remounted while a call is still ringing
    if (globalActiveCallId && mountedRef.current) {
      // invite state re-set only when next event arrives; ring continues
    }

    return () => {
      mountedRef.current = false;
      socket.off('call:signal', onSignal);
      socket.off('callInvitation', onInvitation);
      // Do NOT stop ringtone / clear globalActiveCallId on StrictMode cleanup —
      // only accept/reject/timeout/hangup stop the ring.
    };
  }, []);

  async function accept() {
    const i = invite;
    if (!i) return;
    stopIncomingRingtone();
    clearGlobalMissTimer();
    globalActiveCallId = null;
    setInvite(null);

    const mode = i.callType === 'VIDEO' ? 'video' : 'voice';
    const socket = connectSocket();
    // Prefer single named event + thin signal for call page
    socket.emit('callAccepted', { toUserId: i.fromUserId, callId: i.callId });
    socket.emit('call:signal', {
      toUserId: i.fromUserId,
      callId: i.callId,
      type: i.callType,
      signal: { type: 'accepted', callId: i.callId },
    });
    const room = encodeURIComponent(i.roomName || '');
    navigate(
      `/home/call/${mode}/${i.fromUserId}?callId=${encodeURIComponent(i.callId)}&role=callee&name=${encodeURIComponent(i.fromName)}&room=${room}`,
    );
  }

  async function reject() {
    const i = invite;
    if (!i) return;
    stopIncomingRingtone();
    clearGlobalMissTimer();
    globalActiveCallId = null;
    setInvite(null);

    const socket = connectSocket();
    socket.emit('callRejected', { toUserId: i.fromUserId, callId: i.callId });
    socket.emit('call:signal', {
      toUserId: i.fromUserId,
      callId: i.callId,
      type: i.callType,
      signal: { type: 'reject' },
    });
    if (i.callId) {
      try {
        await updateCallStatus(i.callId, 'REJECTED', 0);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <>
      {missedToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-safe z-[110] flex justify-center px-4 pt-3">
          <div className="rounded-2xl border border-white/15 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white shadow-float backdrop-blur-md">
            {missedToast}
          </div>
        </div>
      ) : null}

      {invite ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xl pt-safe pb-safe">
          <div className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-white/20 bg-white/10 p-7 text-white shadow-float backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-slate-950/40" />
            <div className="relative flex flex-col items-center text-center">
              <div className="relative mb-5">
                <div className="absolute -inset-3 animate-ping rounded-full bg-emerald-400/25" />
                <div className="absolute -inset-1 animate-pulse rounded-full bg-emerald-400/15" />
                <div className="relative scale-125 rounded-full ring-4 ring-emerald-400/50 shadow-lg shadow-emerald-500/20">
                  <StudentAvatar name={invite.fromName} photoUrl={invite.fromPhoto} size="lg" />
                </div>
              </div>
              <p className="font-display text-2xl font-bold tracking-tight">{invite.fromName}</p>
              {invite.fromDepartment ? (
                <p className="mt-1 text-xs text-white/55">{invite.fromDepartment}</p>
              ) : null}
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
                {invite.callType === 'VIDEO' ? <Video size={16} /> : <Phone size={16} />}
                Incoming {invite.callType === 'VIDEO' ? 'Video' : 'Voice'} Call
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"
                  style={{ animationDelay: '300ms' }}
                />
                <span className="ml-1 text-[11px] text-white/45">Ringing…</span>
              </div>
            </div>

            <div className="relative mt-10 flex items-center justify-center gap-10">
              <button
                type="button"
                onClick={() => void reject()}
                className="flex flex-col items-center gap-2"
                aria-label="Decline"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 shadow-lg shadow-rose-500/40 ring-1 ring-white/10">
                  <PhoneOff size={28} />
                </span>
                <span className="text-xs font-medium text-white/75">Decline</span>
              </button>
              <button
                type="button"
                onClick={() => void accept()}
                className="flex flex-col items-center gap-2"
                aria-label="Accept"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 ring-1 ring-white/10">
                  <Phone size={28} />
                </span>
                <span className="text-xs font-medium text-white/75">Accept</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
