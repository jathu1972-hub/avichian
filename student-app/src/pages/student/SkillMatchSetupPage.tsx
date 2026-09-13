import { ArrowLeft, Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMySkillMatch, fetchSkillCatalog, PROFICIENCY_LABEL, saveMySkillMatch } from '../../lib/skill-match';
import type { SkillCatalog, SkillMatchVisibility, SkillProficiency } from '../../types/skill-match';

type SelectedSkill = { skillId: string; name: string; categoryId: string; proficiency: SkillProficiency };

const PROFICIENCIES: SkillProficiency[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];

const VISIBILITY: { v: SkillMatchVisibility; l: string; d: string }[] = [
  { v: 'CAMPUS', l: 'Visible to campus', d: 'Activated students can discover you' },
  { v: 'CONNECTED', l: 'Visible to connected students', d: 'Only people you connect with' },
  { v: 'HIDDEN', l: 'Hidden', d: 'You will not appear in Skill Match' },
];

export function SkillMatchSetupPage() {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [skills, setSkills] = useState<SelectedSkill[]>([]);
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [availabilityIds, setAvailabilityIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<SkillMatchVisibility>('CAMPUS');
  const [picker, setPicker] = useState<'skills' | 'interests' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSkillCatalog(), fetchMySkillMatch()])
      .then(([cat, me]) => {
        setCatalog(cat);
        const selected: SelectedSkill[] = [];
        for (const group of me.skills) {
          for (const s of group.skills) {
            selected.push({
              skillId: s.id,
              name: s.name,
              categoryId: group.categoryId,
              proficiency: s.proficiency,
            });
          }
        }
        setSkills(selected);
        setInterestIds(me.interests.map((i) => i.id));
        setGoalIds(me.goals.map((g) => g.id));
        setAvailabilityIds(me.availabilities.map((a) => a.id));
        setVisibility(me.visibility);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const maxSkills = catalog?.limits.maxSkills ?? 10;
  const maxCats = catalog?.limits.maxCategories ?? 5;
  const maxInterests = catalog?.limits.maxInterests ?? 15;
  const categoryCount = new Set(skills.map((s) => s.categoryId)).size;

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      await saveMySkillMatch({
        skills: skills.map((s) => ({ skillId: s.skillId, proficiency: s.proficiency })),
        interestIds,
        goalIds,
        availabilityIds,
        visibility,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <Link to="/home/skill-match" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ArrowLeft size={16} /> Skill Match
      </Link>
      <header>
        <h1 className="font-display text-2xl font-extrabold text-white">Your Skill Match profile</h1>
        <p className="mt-1 text-sm text-zinc-400">Tell classmates what you can do, what you want to learn, and how to approach you.</p>
      </header>

      <Section
        kicker="What can you do?"
        title="My Skills"
        hint={`${skills.length}/${maxSkills} skills · ${categoryCount}/${maxCats} categories`}
      >
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <div key={s.skillId} className="flex items-center gap-1 rounded-full bg-emerald-500/12 py-1 pl-3 pr-1">
              <span className="text-xs font-medium text-emerald-100">{s.name}</span>
              <select
                value={s.proficiency}
                aria-label={`Proficiency for ${s.name}`}
                onChange={(e) =>
                  setSkills((prev) =>
                    prev.map((x) =>
                      x.skillId === s.skillId
                        ? { ...x, proficiency: e.target.value as SkillProficiency }
                        : x,
                    ),
                  )
                }
                className="rounded-full bg-black/30 px-1 py-0.5 text-[10px] text-emerald-200"
              >
                {PROFICIENCIES.map((p) => (
                  <option key={p} value={p}>
                    {PROFICIENCY_LABEL[p]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-1.5 text-emerald-300/70"
                aria-label={`Remove ${s.name}`}
                onClick={() => setSkills((prev) => prev.filter((x) => x.skillId !== s.skillId))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPicker('skills')}
          className="mt-3 min-h-10 rounded-2xl border border-dashed border-white/15 px-4 text-sm font-semibold text-zinc-300"
        >
          Search → Category → Skill
        </button>
      </Section>

      <Section
        kicker="What do you want to learn?"
        title="Interested In"
        hint="These are interests — not expertise"
      >
        <ChipToggle
          items={catalog?.categories.flatMap((c) => c.skills.map((s) => ({ id: s.id, label: s.name }))) ?? []}
          selected={interestIds}
          max={maxInterests}
          previewOnly
          onOpen={() => setPicker('interests')}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {interestIds.map((id) => {
            const skill = catalog?.categories.flatMap((c) => c.skills).find((s) => s.id === id);
            if (!skill) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setInterestIds((prev) => prev.filter((x) => x !== id))}
                className="rounded-full bg-cyan-500/12 px-3 py-1 text-xs text-cyan-100"
              >
                {skill.name} ×
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPicker('interests')}
          className="mt-3 min-h-10 rounded-2xl border border-dashed border-white/15 px-4 text-sm font-semibold text-zinc-300"
        >
          Add interests
        </button>
      </Section>

      <Section kicker="What do you want to do?" title="I Want To">
        <div className="flex flex-wrap gap-2">
          {catalog?.goals.map((g) => {
            const on = goalIds.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  setGoalIds((prev) => (on ? prev.filter((x) => x !== g.id) : [...prev, g.id]))
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  on ? 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30' : 'bg-white/5 text-zinc-400'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section kicker="How can other students approach you?" title="Available For">
        <div className="flex flex-wrap gap-2">
          {catalog?.availabilities.map((a) => {
            const on = availabilityIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  setAvailabilityIds((prev) => (on ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  on ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-white/5 text-zinc-400'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section kicker="Privacy" title="Who can see you">
        <div className="space-y-2">
          {VISIBILITY.map((opt) => (
            <label
              key={opt.v}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${
                visibility === opt.v ? 'border-emerald-400/30 bg-emerald-500/8' : 'border-white/8 bg-black/20'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                checked={visibility === opt.v}
                onChange={() => setVisibility(opt.v)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-white">{opt.l}</span>
                <span className="text-xs text-zinc-500">{opt.d}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-emerald-300" role="status">
          Profile saved
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Skill Match profile'}
      </button>

      {picker && catalog ? (
        <PickerSheet
          mode={picker}
          catalog={catalog}
          selectedSkillIds={skills.map((s) => s.skillId)}
          selectedInterestIds={interestIds}
          maxSkills={maxSkills}
          maxCategories={maxCats}
          maxInterests={maxInterests}
          currentCategoryCount={categoryCount}
          onClose={() => setPicker(null)}
          onToggleSkill={(skill, categoryId) => {
            setSkills((prev) => {
              if (prev.some((s) => s.skillId === skill.id)) {
                return prev.filter((s) => s.skillId !== skill.id);
              }
              if (prev.length >= maxSkills) return prev;
              const nextCats = new Set([...prev.map((s) => s.categoryId), categoryId]);
              if (nextCats.size > maxCats) return prev;
              return [
                ...prev,
                { skillId: skill.id, name: skill.name, categoryId, proficiency: 'INTERMEDIATE' },
              ];
            });
          }}
          onToggleInterest={(id) => {
            setInterestIds((prev) => {
              if (prev.includes(id)) return prev.filter((x) => x !== id);
              if (prev.length >= maxInterests) return prev;
              return [...prev, id];
            });
          }}
        />
      ) : null}
    </div>
  );
}

function Section({
  kicker,
  title,
  hint,
  children,
}: {
  kicker: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-white/8 bg-zinc-900/60 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">{kicker}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChipToggle({
  items,
  selected,
  max,
  previewOnly,
  onOpen,
}: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  max: number;
  previewOnly?: boolean;
  onOpen?: () => void;
}) {
  if (previewOnly) {
    return (
      <p className="text-xs text-zinc-500">
        {selected.length}/{max} selected
        {onOpen ? (
          <button type="button" className="ml-2 text-emerald-300" onClick={onOpen}>
            Browse
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs ${on ? 'bg-cyan-500/15 text-cyan-100' : 'bg-white/5 text-zinc-400'}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function PickerSheet({
  mode,
  catalog,
  selectedSkillIds,
  selectedInterestIds,
  maxSkills,
  maxCategories,
  maxInterests,
  currentCategoryCount,
  onClose,
  onToggleSkill,
  onToggleInterest,
}: {
  mode: 'skills' | 'interests';
  catalog: SkillCatalog;
  selectedSkillIds: string[];
  selectedInterestIds: string[];
  maxSkills: number;
  maxCategories: number;
  maxInterests: number;
  currentCategoryCount: number;
  onClose: () => void;
  onToggleSkill: (skill: { id: string; name: string }, categoryId: string) => void;
  onToggleInterest: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState(catalog.categories[0]?.id ?? '');
  const selected = mode === 'skills' ? selectedSkillIds : selectedInterestIds;
  const max = mode === 'skills' ? maxSkills : maxInterests;

  const category = catalog.categories.find((c) => c.id === categoryId) ?? catalog.categories[0];
  const query = q.trim().toLowerCase();

  const list = useMemo(() => {
    if (query) {
      return catalog.categories.flatMap((c) =>
        c.skills
          .filter((s) => s.name.toLowerCase().includes(query))
          .map((s) => ({ ...s, categoryId: c.id, categoryName: c.name })),
      );
    }
    return (category?.skills ?? []).map((s) => ({
      ...s,
      categoryId: category!.id,
      categoryName: category!.name,
    }));
  }, [catalog, category, query]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={mode === 'skills' ? 'Select skills' : 'Select interests'}>
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[1.6rem] border border-white/10 bg-zinc-950">
        <div className="border-b border-white/8 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="inline-flex items-center gap-1.5 font-semibold text-white">
              <Zap size={14} className="text-emerald-300" />
              {mode === 'skills' ? 'Add skills' : 'Add interests'}
            </h3>
            <p className="text-xs text-zinc-500">
              {selected.length}/{max}
              {mode === 'skills' ? ` · ${currentCategoryCount}/${maxCategories} categories` : ''}
            </p>
          </div>
          <label className="relative block">
            <span className="sr-only">Search skills</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills…"
              className="min-h-11 w-full rounded-2xl border border-white/8 bg-zinc-900 pl-9 pr-3 text-sm text-white outline-none"
            />
          </label>
          {!query ? (
            <div className="mt-3 flex flex-wrap gap-2 pb-1">
              {catalog.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                    categoryId === c.id
                      ? 'bg-emerald-500/15 text-emerald-100'
                      : 'bg-white/5 text-zinc-400'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-3">
          <div className="flex flex-wrap gap-2">
            {list.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    mode === 'skills' ? onToggleSkill(s, s.categoryId) : onToggleInterest(s.id)
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    on ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30' : 'bg-white/5 text-zinc-300'
                  }`}
                >
                  {s.name}
                  {query ? <span className="ml-1 text-[10px] text-zinc-500">{s.categoryName}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-white/8 p-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
