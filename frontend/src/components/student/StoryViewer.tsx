import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StoryGroup } from '../../types/social';

interface StoryViewerProps {
  group: StoryGroup | null;
  onClose: () => void;
}

export function StoryViewer({ group, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [group?.user.id]);

  useEffect(() => {
    if (!group) return;
    const timer = window.setTimeout(() => {
      if (index < group.stories.length - 1) {
        setIndex((i) => i + 1);
      } else {
        onClose();
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [group, index, onClose]);

  if (!group) return null;
  const story = group.stories[index];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
          aria-label="Close story"
        >
          <X size={20} />
        </button>

        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-black">
          <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 p-3">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className={`h-full bg-white transition-all ${i < index ? 'w-full' : i === index ? 'w-1/2' : 'w-0'}`}
                />
              </div>
            ))}
          </div>

          <img src={story.mediaUrl} alt="" className="aspect-[9/16] w-full object-cover" />

          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <p className="font-semibold text-white">{group.user.name}</p>
            {story.caption ? <p className="mt-1 text-sm text-white/80">{story.caption}</p> : null}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}