import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { appHomePath, isAppUserRole } from './lib/portal';
import { SplashScreen } from './components/auth/SplashScreen';
import { PortalRedirect } from './components/auth/PortalRedirect';
import { StudentLayout } from './layouts/StudentLayout';
import { FeedPage } from './pages/student/FeedPage';
import { SearchPage } from './pages/student/SearchPage';
import { CreatePostPage } from './pages/student/CreatePostPage';
import { FriendsPage } from './pages/student/FriendsPage';
import { ProfilePage } from './pages/student/ProfilePage';
import { UserProfilePage } from './pages/student/UserProfilePage';
import { ChatPage } from './pages/student/ChatPage';
import { ConversationPage } from './pages/student/ConversationPage';
import { CallPage } from './pages/student/CallPage';
import { CommunitiesPage } from './pages/student/CommunitiesPage';
import { EventsPage } from './pages/student/EventsPage';
import { CalendarPage } from './pages/student/CalendarPage';
import { NotificationsPage } from './pages/student/NotificationsPage';
import { SettingsPage } from './pages/student/SettingsPage';
import { StaffToolsPage } from './pages/student/StaffToolsPage';
import { ReelsPage } from './pages/student/ReelsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';

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
  return children;
}

export default function App() {
  return (
    <AppBootstrap>
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

        <Route path="/feed" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <AppUserRoute>
              <StudentLayout />
            </AppUserRoute>
          }
        >
          <Route index element={<FeedPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="create" element={<CreatePostPage />} />
          <Route path="reels" element={<ReelsPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:userId" element={<ConversationPage />} />
          <Route path="call/voice/:userId" element={<CallPage mode="voice" />} />
          <Route path="call/video/:userId" element={<CallPage mode="video" />} />
          <Route path="communities" element={<CommunitiesPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="staff-tools" element={<StaffToolsPage />} />
          <Route path="user/:userId" element={<UserProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AppBootstrap>
  );
}
