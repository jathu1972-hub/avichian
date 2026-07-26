import { MessageCircle, Phone, UserPlus, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { PostCard } from '../../components/student/PostCard';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  fetchStudentProfile,
  fetchUserPosts,
  openChatWithPeer,
  sendFriendRequest,
  startCall,
  toggleLike,
} from '../../lib/social';
import type { FeedPost, StudentProfile } from '../../types/social';

export function UserProfilePage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    Promise.all([fetchStudentProfile(userId), fetchUserPosts(userId)])
      .then(([profileData, postData]) => {
        setProfile(profileData);
        setPosts(postData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleAddFriend() {
    if (!profile) return;
    try {
      setActionLoading(true);
      await sendFriendRequest(profile.id);
      setRequestSent(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMessage() {
    if (!profile) return;
    try {
      setActionLoading(true);
      const chat = await openChatWithPeer(profile.id);
      navigate(`/home/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Friends only can message');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCall(type: 'VOICE' | 'VIDEO') {
    if (!profile) return;
    try {
      setActionLoading(true);
      const call = await startCall(profile.id, type);
      navigate(`/home/call/${type === 'VOICE' ? 'voice' : 'video'}/${profile.id}?callId=${call.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Friends only can call');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLike(postId: string) {
    try {
      setLikingId(postId);
      const result = await toggleLike(postId);
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: result.liked, likeCount: result.likeCount }
            : post,
        ),
      );
    } finally {
      setLikingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!profile) {
    return <p className="text-sm text-error">{error || 'Profile not found'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-[28px] p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <StudentAvatar name={profile.name} photoUrl={profile.profilePhotoUrl} size="lg" ring />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
            <p className="text-sm text-slate-500">
              {profile.regNo} · {profile.department}
              {profile.year ? ` · Year ${profile.year}` : ''}
            </p>
            {profile.bio ? <p className="mt-3 text-sm text-slate-600">{profile.bio}</p> : null}
            {profile.online ? (
              <p className="mt-2 text-xs font-medium text-success">Online</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex gap-6 text-center">
          <div>
            <p className="text-lg font-bold text-slate-900">{profile.postCount}</p>
            <p className="text-xs text-slate-500">Posts</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{profile.friendCount}</p>
            <p className="text-xs text-slate-500">Friends</p>
          </div>
        </div>

        {!profile.isSelf ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.isFriend ? (
              <>
                <Button type="button" className="w-auto flex-1" loading={actionLoading} onClick={handleMessage}>
                  <MessageCircle size={16} className="mr-2 inline" /> Message
                </Button>
                <button type="button" onClick={() => handleCall('VOICE')} className="rounded-[22px] bg-success/10 px-4 py-3 text-success">
                  <Phone size={18} />
                </button>
                <button type="button" onClick={() => handleCall('VIDEO')} className="rounded-[22px] bg-primary/10 px-4 py-3 text-primary">
                  <Video size={18} />
                </button>
              </>
            ) : (
              <Button type="button" className="w-full" loading={actionLoading} onClick={handleAddFriend} disabled={requestSent}>
                <UserPlus size={16} className="mr-2 inline" />
                {requestSent ? 'Request sent' : 'Follow'}
              </Button>
            )}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500">No posts yet.</p>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onLike={handleLike} liking={likingId === post.id} />
          ))
        )}
      </div>
    </div>
  );
}
