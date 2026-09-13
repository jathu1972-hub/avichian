import { MessageCircle, Phone, Sparkles, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentAvatar } from '../student/StudentAvatar';
import { ThunderBolt, usePrefersReducedMotion } from './ThunderConnect';
import { WhyYouMatch } from './WhyYouMatch';
import {
  acceptSkillConnect,
  cancelSkillConnect,
  declineSkillConnect,
  sendSkillConnect,
} from '../../lib/skill-match';
import { openChatWithPeer, startCall } from '../../lib/social';
import type { SkillMatchCard } from '../../types/skill-match';

export function MatchCard({
  card,
  onChange,
  compact = false,
}: {
  card: SkillMatchCard;
  onChange: (next: SkillMatchCard) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const avatarRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [bolt, setBolt] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(
    null,
  );
  const [glow, setGlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  function flashSuccess(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  }

  async function playConnectMotion() {
    const btn = buttonRef.current?.getBoundingClientRect();
    const av = avatarRef.current?.getBoundingClientRect();
    if (!btn || !av) return;
    if (reduced) {
      setGlow(true);
      window.setTimeout(() => setGlow(false), 500);
      return;
    }
    setBolt({
      from: { x: btn.left + btn.width / 2, y: btn.top + btn.height / 2 },
      to: { x: av.left + av.width / 2, y: av.top + av.height / 2 },
    });
    setGlow(true);
    await new Promise((r) => window.setTimeout(r, 760));
    setBolt(null);
    window.setTimeout(() => setGlow(false), 280);
  }

  async function handleConnect() {
    try {
      setBusy(true);
      setError('');
      void playConnectMotion();
      const next = await sendSkillConnect(card.id);
      onChange(next);
      flashSuccess(
        next.connectionState === 'connected' ? 'Connected' : 'Request sent',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (!card.requestId) return;
    try {
      setBusy(true);
      setError('');
      void playConnectMotion();
      const next = await acceptSkillConnect(card.requestId);
      onChange(next);
      flashSuccess('Connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    if (!card.requestId) return;
    try {
      setBusy(true);
      await declineSkillConnect(card.requestId);
      onChange({ ...card, connectionState: 'connect', requestId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!card.requestId) return;
    try {
      setBusy(true);
      await cancelSkillConnect(card.requestId);
      onChange({ ...card, connectionState: 'connect', requestId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  }

  async function handleMessage() {
    try {
      setBusy(true);
      const chat = await openChatWithPeer(card.id);
      navigate(`/home/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Friends only can message');
    } finally {
      setBusy(false);
    }
  }

  async function handleCall() {
    try {
      setBusy(true);
      const call = await startCall(card.id, 'VOICE');
      const name = encodeURIComponent(call.peer?.name || card.name);
      const room = encodeURIComponent(call.roomName || '');
      navigate(
        `/home/call/voice/${card.id}?callId=${call.id}&role=caller&name=${name}&room=${room}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call is not available');
    } finally {
      setBusy(false);
    }
  }

  const score = card.matchScore;
  const subtitle = [card.department, card.yearLabel].filter(Boolean).join(' · ');

  return (
    <article
      className={`skill-match-card relative overflow-hidden rounded-[1.6rem] border border-white/8 bg-zinc-900/70 p-4 shadow-soft backdrop-blur-xl sm:p-5 ${
        glow ? 'skill-match-card-glow' : ''
      }`}
    >
      {bolt ? <ThunderBolt from={bolt.from} to={bolt.to} reduced={reduced} /> : null}

      <div className="flex items-start gap-3">
        <div ref={avatarRef} className={glow ? 'skill-avatar-pulse' : ''}>
          <StudentAvatar name={card.name} photoUrl={card.profilePhotoUrl} size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          {score !== null ? (
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <Zap size={13} className="shrink-0" aria-hidden />
              <span>{score}% Skill Match</span>
            </p>
          ) : null}
          <h3 className="truncate text-base font-bold tracking-tight text-white">{card.name}</h3>
          <p className="truncate text-xs text-zinc-400">{subtitle}</p>
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 space-y-3">
          {card.youHelpThem.length ? (
            <ChipBlock label="You can help them" items={card.youHelpThem} tone="you" />
          ) : null}
          {card.theyHelpYou.length ? (
            <ChipBlock label="They can help you" items={card.theyHelpYou} tone="them" />
          ) : null}
          {card.sharedGoals.length ? (
            <ChipBlock label="Shared goal" items={card.sharedGoals} tone="goal" />
          ) : null}
          {!card.youHelpThem.length && !card.theyHelpYou.length && !card.sharedGoals.length ? (
            <WhyYouMatch reasons={card.reasons} />
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <WhyYouMatch reasons={card.reasons.slice(0, 2)} />
        </div>
      )}

      {error ? <p className="mt-3 text-xs text-error">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {card.connectionState === 'connect' ? (
          <button
            ref={buttonRef}
            type="button"
            disabled={busy}
            onClick={() => void handleConnect()}
            className="skill-connect-btn min-h-11 flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            aria-label={`Connect with ${card.name}`}
          >
            Connect
          </button>
        ) : null}
        {card.connectionState === 'request_sent' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCancel()}
            className="min-h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-300"
            aria-label="Cancel connection request"
          >
            Request Sent
          </button>
        ) : null}
        {card.connectionState === 'request_received' ? (
          <>
            <button
              ref={buttonRef}
              type="button"
              disabled={busy}
              onClick={() => void handleAccept()}
              className="skill-connect-btn min-h-11 flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 text-sm font-semibold text-white"
              aria-label={`Accept connection from ${card.name}`}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDecline()}
              className="min-h-11 rounded-2xl border border-white/10 px-4 text-sm font-semibold text-zinc-300"
              aria-label={`Decline connection from ${card.name}`}
            >
              Decline
            </button>
          </>
        ) : null}
        {card.connectionState === 'connected' ? (
          <>
            {card.canMessage ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleMessage()}
                className="min-h-11 flex-1 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 text-sm font-semibold text-white"
                aria-label={`Message ${card.name}`}
              >
                <MessageCircle size={16} className="mr-1.5 inline" />
                Message
              </button>
            ) : null}
            {card.canCall ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCall()}
                className="min-h-11 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-emerald-300"
                aria-label={`Call ${card.name}`}
              >
                <Phone size={16} />
              </button>
            ) : null}
          </>
        ) : null}
        {card.connectionState === 'blocked' ? (
          <span className="min-h-11 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-zinc-500">
            Blocked
          </span>
        ) : null}
        <Link
          to={`/home/skill-match/${card.id}`}
          className="inline-flex min-h-11 items-center rounded-2xl px-3 text-sm font-semibold text-zinc-400 hover:text-white"
        >
          View Profile
        </Link>
      </div>

      {toast ? (
        <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-300" role="status">
          <Sparkles size={12} /> {toast}
        </p>
      ) : null}
    </article>
  );
}

function ChipBlock({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'you' | 'them' | 'goal';
}) {
  const toneClass =
    tone === 'you'
      ? 'bg-emerald-500/12 text-emerald-200'
      : tone === 'them'
        ? 'bg-cyan-500/12 text-cyan-200'
        : 'bg-white/8 text-zinc-200';
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.slice(0, 6).map((item) => (
          <span key={item} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
