import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { StoryGroup } from '../../types/social';
import { StudentAvatar } from './StudentAvatar';

interface StoriesStripProps {
  groups: StoryGroup[];
  onOpenStory: (group: StoryGroup) => void;
  loading?: boolean;
}

export function StoriesStrip({ groups, onOpenStory, loading }: StoriesStripProps) {
  const mine = groups.find((g) => g.user.isMe);

  return (
    <div className="glass-card rounded-[28px] p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Stories</p>
        <Link to="/home/create/story" className="text-xs font-medium text-primary">
          Add story
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1">
        {/* Add / your story entry */}
        {mine ? (
          <div className="flex w-16 shrink-0 flex-col items-center gap-2 text-center">
            <div className="relative">
              <button type="button" onClick={() => onOpenStory(mine)} className="block">
                <StudentAvatar
                  name={mine.user.name}
                  photoUrl={mine.user.profilePhotoUrl}
                  size="lg"
                  ring
                />
              </button>
              <Link
                to="/home/create/story"
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white ring-2 ring-white"
                aria-label="Add story"
              >
                <Plus size={12} />
              </Link>
            </div>
            <span className="max-w-full truncate text-[11px] font-medium text-slate-600">You</span>
          </div>
        ) : (
          <Link
            to="/home/create/story"
            className="flex w-16 shrink-0 flex-col items-center gap-2 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5 text-primary">
              <Plus size={22} />
            </div>
            <span className="text-[11px] font-medium text-slate-600">Your story</span>
          </Link>
        )}

        {loading ? (
          <div className="flex items-center px-4 text-xs text-slate-400">Loading stories…</div>
        ) : null}

        {!loading &&
          groups
            .filter((g) => !g.user.isMe)
            .map((group) => (
              <button
                key={group.user.id}
                type="button"
                onClick={() => onOpenStory(group)}
                className="flex w-16 shrink-0 flex-col items-center gap-2 text-center"
              >
                <StudentAvatar
                  name={group.user.name}
                  photoUrl={group.user.profilePhotoUrl}
                  size="lg"
                  ring
                />
                <span className="max-w-full truncate text-[11px] font-medium text-slate-600">
                  {group.user.name.split(' ')[0]}
                </span>
              </button>
            ))}
      </div>

      {!loading && groups.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-400">No stories yet — share the first one</p>
      ) : null}
    </div>
  );
}
