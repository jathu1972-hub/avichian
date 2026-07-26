import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { StoryGroup } from '../../types/social';
import { StudentAvatar } from './StudentAvatar';

interface StoriesStripProps {
  groups: StoryGroup[];
  onOpenStory: (group: StoryGroup) => void;
}

export function StoriesStrip({ groups, onOpenStory }: StoriesStripProps) {
  return (
    <div className="glass-card rounded-[28px] p-4 shadow-soft">
      <div className="flex gap-4 overflow-x-auto pb-1">
        <Link
          to="/home/create?type=story"
          className="flex w-16 shrink-0 flex-col items-center gap-2 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary/40 bg-primary/5 text-primary">
            <Plus size={22} />
          </div>
          <span className="text-[11px] font-medium text-slate-600">Your story</span>
        </Link>

        {groups.map((group) => (
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
              ring={!group.user.isMe}
            />
            <span className="max-w-full truncate text-[11px] font-medium text-slate-600">
              {group.user.isMe ? 'You' : group.user.name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}