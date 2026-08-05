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
  caption: string | null;
  mediaUrl: string | null;
  visibility: PostVisibility;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  author: StudentSummary;
}

export interface StoryGroup {
  user: StudentSummary & { isMe: boolean };
  stories: Array<{
    id: string;
    mediaUrl: string;
    caption: string | null;
    createdAt: string;
    expiresAt: string;
  }>;
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
  friendshipStatus: 'none' | 'friends' | 'pending_outgoing' | 'pending_incoming';
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