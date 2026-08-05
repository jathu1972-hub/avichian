import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { appHomePath, isAppUserRole } from './lib/portal';
import { SplashScreen } from './components/auth/SplashScreen';
import { PortalRedirect } from './components/auth/PortalRedirect';
import { StudentLayout } from './layouts/StudentLayout';

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const ForcePasswordChangePage = lazy(() =>
  import('./pages/ForcePasswordChangePage').then((m) => ({ default: m.ForcePasswordChangePage })),
);
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const FeedPage = lazy(() =>
  import('./pages/student/FeedPage').then((m) => ({ default: m.FeedPage })),
);
const SearchPage = lazy(() =>
  import('./pages/student/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const CreateHubPage = lazy(() =>
  import('./pages/student/CreateHubPage').then((m) => ({ default: m.CreateHubPage })),
);
const CreatePostPage = lazy(() =>
  import('./pages/student/CreatePostPage').then((m) => ({ default: m.CreatePostPage })),
);
const FriendsPage = lazy(() =>
  import('./pages/student/FriendsPage').then((m) => ({ default: m.FriendsPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/student/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const UserProfilePage = lazy(() =>
  import('./pages/student/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
);
const ChatPage = lazy(() =>
  import('./pages/student/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const ConversationPage = lazy(() =>
  import('./pages/student/ConversationPage').then((m) => ({ default: m.ConversationPage })),
);
const CallPage = lazy(() =>
  import('./pages/student/CallPage').then((m) => ({ default: m.CallPage })),
);
const CommunitiesPage = lazy(() =>
  import('./pages/student/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })),
);
const CommunityDetailPage = lazy(() =>
  import('./pages/student/CommunityDetailPage').then((m) => ({ default: m.CommunityDetailPage })),
);
const EventsPage = lazy(() =>
  import('./pages/student/EventsPage').then((m) => ({ default: m.EventsPage })),
);
const CalendarPage = lazy(() =>
  import('./pages/student/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/student/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/student/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ComplaintsPage = lazy(() =>
  import('./pages/student/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })),
);
const StaffToolsPage = lazy(() =>
  import('./pages/student/StaffToolsPage').then((m) => ({ default: m.StaffToolsPage })),
);
const ReelsPage = lazy(() =>
  import('./pages/student/ReelsPage').then((m) => ({ default: m.ReelsPage })),
);

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <SplashScreen />;
  return (
    <>
      <PortalRedirect />
      {children}
    </>
  );
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (user && isAppUserRole(user.role)) {
    return <Navigate to={appHomePath()} replace />;
  }
  return children;
}

function AppUserRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user || !isAppUserRole(user.role)) {
    return <Navigate to="/login" replace />;
  }
  // First-time / admin-reset: must set personal password before using the app
  if (user.forcePasswordChange || user.isFirstLogin) {
    return <Navigate to="/force-password" replace />;
  }
  return children;
}

function ForcePasswordRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user || !isAppUserRole(user.role)) {
    return <Navigate to="/login" replace />;
  }
  if (!user.forcePasswordChange && !user.isFirstLogin) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function LazyCall({ mode }: { mode: 'voice' | 'video' }) {
  return (
    <Suspense fallback={<PageFallback />}>
      <CallPage mode={mode} />
    </Suspense>
  );
}

export default function App() {
  return (
    <AppBootstrap>
      <Suspense fallback={<SplashScreen />}>
        <Routes>
          <Route
            path="/"
            element={
              <GuestRoute>
                <Navigate to="/login" replace />
              </GuestRoute>
            }
          />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
          <Route
            path="/force-password"
            element={
              <ForcePasswordRoute>
                <Suspense fallback={<PageFallback />}>
                  <ForcePasswordChangePage />
                </Suspense>
              </ForcePasswordRoute>
            }
          />

          <Route path="/feed" element={<Navigate to="/home" replace />} />
          <Route
            path="/home"
            element={
              <AppUserRoute>
                <StudentLayout />
              </AppUserRoute>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<PageFallback />}>
                  <FeedPage />
                </Suspense>
              }
            />
            <Route path="search" element={<Suspense fallback={<PageFallback />}><SearchPage /></Suspense>} />
            <Route path="create" element={<Suspense fallback={<PageFallback />}><CreateHubPage /></Suspense>} />
            <Route path="create/:kind" element={<Suspense fallback={<PageFallback />}><CreatePostPage /></Suspense>} />
            <Route path="reels" element={<Suspense fallback={<PageFallback />}><ReelsPage /></Suspense>} />
            <Route path="friends" element={<Suspense fallback={<PageFallback />}><FriendsPage /></Suspense>} />
            <Route path="chat" element={<Suspense fallback={<PageFallback />}><ChatPage /></Suspense>} />
            <Route path="chat/:userId" element={<Suspense fallback={<PageFallback />}><ConversationPage /></Suspense>} />
            <Route path="call/voice/:userId" element={<LazyCall mode="voice" />} />
            <Route path="call/video/:userId" element={<LazyCall mode="video" />} />
            <Route path="communities" element={<Suspense fallback={<PageFallback />}><CommunitiesPage /></Suspense>} />
            <Route path="communities/:id" element={<Suspense fallback={<PageFallback />}><CommunityDetailPage /></Suspense>} />
            <Route path="events" element={<Suspense fallback={<PageFallback />}><EventsPage /></Suspense>} />
            <Route path="calendar" element={<Suspense fallback={<PageFallback />}><CalendarPage /></Suspense>} />
            <Route path="notifications" element={<Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense>} />
            <Route path="profile" element={<Suspense fallback={<PageFallback />}><ProfilePage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
            <Route path="complaints" element={<Suspense fallback={<PageFallback />}><ComplaintsPage /></Suspense>} />
            <Route path="staff-tools" element={<Suspense fallback={<PageFallback />}><StaffToolsPage /></Suspense>} />
            <Route path="user/:userId" element={<Suspense fallback={<PageFallback />}><UserProfilePage /></Suspense>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AppBootstrap>
  );
}
