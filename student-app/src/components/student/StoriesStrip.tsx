import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { StoryGroup } from '../../types/social';
import { resolveMediaUrl } from '../../lib/config';

interface StoriesStripProps {
  groups: StoryGroup[];
  onOpenStory: (group: StoryGroup) => void;
  loading?: boolean;
}

/** Fixed 1:1 bubble — never stretches to oval */
const BUBBLE = 'size-14 shrink-0 aspect-square sm:size-16';
/** Column width = bubble width so labels center under the circle */
const CELL = 'w-14 shrink-0 sm:w-16';

function initialsFrom(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/**
 * Concentric story avatar (all perfect circles, equal insets):
 * green story ring → white outer border → profile photo (object-cover, centered)
 */
function StoryBubble({
  name,
  photoUrl,
  hasStory,
  onClick,
}: {
  name: string;
  photoUrl?: string | null;
  hasStory: boolean;
  onClick?: () => void;
}) {
  const src = resolveMediaUrl(photoUrl);
  const initials = initialsFrom(name);

  const face = (
    <span
      className={`flex size-full items-center justify-center overflow-hidden rounded-full ${
        hasStory ? 'bg-primary p-[2.5px]' : 'bg-slate-200 p-[2.5px] dark:bg-zinc-600'
      }`}
    >
      {/* White (light) / zinc (dark) border — concentric with ring and face */}
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-white p-[2px] dark:bg-zinc-950">
        <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-primary/10">
          {src ? (
            <img
              src={src}
              alt=""
              className="size-full object-cover object-center"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <span className="select-none text-sm font-semibold leading-none text-primary sm:text-base">
              {initials || '?'}
            </span>
          )}
        </span>
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${BUBBLE} block overflow-hidden rounded-full p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        aria-label={`${name}'s story`}
      >
        {face}
      </button>
    );
  }

  return <span className={`${BUBBLE} block overflow-hidden rounded-full`}>{face}</span>;
}

function StoryCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={`flex ${CELL} flex-col items-center gap-1.5`}>
      {children}
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-slate-700 dark:text-zinc-300">
        {label}
      </span>
    </div>
  );
}

export function StoriesStrip({ groups, onOpenStory, loading }: StoriesStripProps) {
  const mine = groups.find((g) => g.user.isMe);

  return (
    <section className="stories-rail" aria-label="Stories">
      {/* Heading + action on one baseline */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-base font-extrabold leading-none tracking-tight text-slate-900 dark:text-white">
          Campus stories
        </p>
        <Link
          to="/home/create/story"
          className="text-xs font-bold leading-none text-primary hover:underline"
        >
          Add story
        </Link>
      </div>

      <div className="scroll-x flex items-start gap-3.5 px-1 pb-1 sm:gap-4">
        {mine ? (
          <StoryCell label="You">
            {/* Relative box = bubble size; + anchors to bottom-right of circle */}
            <div className={`relative ${BUBBLE}`}>
              <StoryBubble
                name={mine.user.name}
                photoUrl={mine.user.profilePhotoUrl}
                hasStory
                onClick={() => onOpenStory(mine)}
              />
              <Link
                to="/home/create/story"
                className="absolute bottom-0 right-0 z-10 flex size-5 translate-x-[22%] translate-y-[22%] items-center justify-center rounded-full bg-primary text-white shadow-sm ring-2 ring-white dark:ring-zinc-950 sm:size-[1.375rem]"
                aria-label="Add story"
              >
                <Plus className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
              </Link>
            </div>
          </StoryCell>
        ) : (
          <StoryCell label="Your story">
            <Link
              to="/home/create/story"
              className={`flex ${BUBBLE} items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-primary/45 bg-primary/5 text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              aria-label="Add your story"
            >
              <Plus className="size-5 shrink-0 sm:size-6" strokeWidth={2} aria-hidden />
            </Link>
          </StoryCell>
        )}

        {loading ? (
          <div className="flex h-14 items-center self-center px-2 text-xs text-slate-500 dark:text-zinc-400 sm:h-16">
            Loading stories…
          </div>
        ) : null}

        {!loading &&
          groups
            .filter((g) => !g.user.isMe)
            .map((group) => (
              <StoryCell
                key={group.user.id}
                label={group.user.name.split(' ')[0] ?? group.user.name}
              >
                <StoryBubble
                  name={group.user.name}
                  photoUrl={group.user.profilePhotoUrl}
                  hasStory
                  onClick={() => onOpenStory(group)}
                />
              </StoryCell>
            ))}
      </div>

      {!loading && groups.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-600 dark:text-zinc-400">
          No stories yet — share the first one
        </p>
      ) : null}
    </section>
  );
}
