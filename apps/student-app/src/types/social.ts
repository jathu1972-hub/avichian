export type PostVisibility = 'PUBLIC' | 'FRIENDS' | 'DEPARTMENT' | 'PRIVATE';

export interface StudentSummary {
  id: string;
  regNo: string;
  name: string;
  department: string;
  year: number | null;
  profilePhotoUrl: string | null;
  bio?: string | null;
}

export interface FeedPost {
  id: string;
  ownerId?: string;
  caption: string | null;
  mediaUrl: string | null;
  visibility: PostVisibility;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  archived?: boolean;
  author: StudentSummary;
}

export type StoryMediaType = 'IMAGE' | 'VIDEO';

export interface StoryItem {
  id: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface StoryGroup {
  user: StudentSummary & { isMe: boolean };
  stories: StoryItem[];
  latestAt: string;
}

export interface FriendRequestItem {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  createdAt: string;
  user: StudentSummary;
}

export interface SearchResult extends StudentSummary {
  email: string;
  online?: boolean;
  friendshipStatus: 'none' | 'friends' | 'pending_outgoing' | 'pending_incoming';
  mutualFriends?: number;
}

export interface StudentProfile extends StudentSummary {
  email: string;
  online: boolean;
  lastSeen: string | null;
  isSelf: boolean;
  isFriend: boolean;
  sameDepartment: boolean;
  postCount: number;
  friendCount: number;
}