import { User } from 'lucide-react';

interface StudentAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const sizes = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-base',
};

export function StudentAvatar({ name, photoUrl, size = 'md', ring }: StudentAvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary ${sizes[size]} ${ring ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <User size={size === 'lg' ? 24 : 18} />
      )}
    </div>
  );
}