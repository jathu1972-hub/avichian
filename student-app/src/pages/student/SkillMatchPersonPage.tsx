import { ArrowLeft, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MatchCard } from '../../components/skill-match/MatchCard';
import { WhyYouMatch } from '../../components/skill-match/WhyYouMatch';
import { PROFICIENCY_LABEL, fetchSkillMatchProfile } from '../../lib/skill-match';
import { connectSocket } from '../../lib/socket';
import type { SkillMatchCard } from '../../types/skill-match';

export function SkillMatchPersonPage() {
  const { userId = '' } = useParams();
  const [card, setCard] = useState<SkillMatchCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acceptedPulse, setAcceptedPulse] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchSkillMatchProfile(userId)
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : 'Profile not found'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const socket = connectSocket();
    function onAccept(payload: { userId?: string }) {
      if (!userId) return;
      if (payload.userId && payload.userId !== userId) return;
      void fetchSkillMatchProfile(userId).then((next) => {
        setCard(next);
        setAcceptedPulse(true);
        window.setTimeout(() => setAcceptedPulse(false), 900);
      });
    }
    socket.on('skill-match:accept', onAccept);
    socket.on('skill-match:request', onAccept);
    socket.on('skill-match:decline', onAccept);
    return () => {
      socket.off('skill-match:accept', onAccept);
      socket.off('skill-match:request', onAccept);
      socket.off('skill-match:decline', onAccept);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-400" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Link to="/home/skill-match" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ArrowLeft size={16} /> Skill Match
        </Link>
        <p className="text-sm text-error">{error || 'Profile not found'}</p>
      </div>
    );
  }

  if (card.isSelf) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link to="/home/skill-match" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ArrowLeft size={16} /> Skill Match
        </Link>
        <p className="text-sm text-zinc-400">This is your Skill Match profile.</p>
        <Link
          to="/home/skill-match/me"
          className="inline-flex min-h-11 items-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white"
        >
          Edit profile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <Link to="/home/skill-match" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ArrowLeft size={16} /> Skill Match
      </Link>

      {acceptedPulse && card.connectionState === 'connected' ? (
        <div className="skill-match-card-glow rounded-[1.4rem] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          <Zap size={14} className="mr-1 inline" />
          CONNECTED
          {card.matchScore !== null ? ` · ${card.matchScore}% Skill Match` : ''}
        </div>
      ) : null}

      <MatchCard card={card} onChange={setCard} />

      {card.bio ? (
        <section className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bio</h2>
          <p className="mt-2 text-sm text-zinc-300">{card.bio}</p>
        </section>
      ) : null}

      <section className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">My Skills</h2>
        <div className="mt-3 space-y-3">
          {card.skills.map((group) => (
            <div key={group.categoryId}>
              <p className="text-sm font-semibold text-white">{group.categoryName}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.skills.map((s) => (
                  <span key={s.id} className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] text-emerald-100">
                    {s.name} — {PROFICIENCY_LABEL[s.proficiency]}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!card.skills.length ? <p className="text-sm text-zinc-500">No skills listed</p> : null}
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Interested In</h2>
        <p className="mt-1 text-[11px] text-zinc-500">Learning interests — not claimed expertise</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.interests.map((i) => (
            <span key={i.id} className="rounded-full bg-cyan-500/12 px-2.5 py-1 text-[11px] text-cyan-100">
              {i.name}
            </span>
          ))}
          {!card.interests.length ? <p className="text-sm text-zinc-500">No interests listed</p> : null}
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">I Want To</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.goals.map((g) => (
            <span key={g.id} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-zinc-200">
              {g.label}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Available For</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.availabilities.map((a) => (
            <span key={a.id} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-zinc-200">
              {a.label}
            </span>
          ))}
        </div>
      </section>

      <div className="rounded-[1.4rem] border border-white/8 bg-zinc-900/60 p-4">
        <WhyYouMatch reasons={card.reasons} />
      </div>
    </div>
  );
}
