import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SplashScreen } from './components/auth/SplashScreen';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { SuperAdminLoginPage } from './pages/SuperAdminLoginPage';
import { DashboardHome } from './pages/super-admin/DashboardHome';
import { StudentsPage } from './pages/super-admin/StudentsPage';
import { StudentProfilePage } from './pages/super-admin/StudentProfilePage';
import { StaffPage } from './pages/super-admin/StaffPage';
import { DepartmentsPage } from './pages/super-admin/DepartmentsPage';
import { AuditLogsPage } from './pages/super-admin/AuditLogsPage';
import { SettingsPage } from './pages/super-admin/SettingsPage';
import { SystemHealthPage } from './pages/super-admin/SystemHealthPage';
import { PostsModerationPage } from './pages/super-admin/PostsModerationPage';
import { ReportsPage } from './pages/super-admin/ReportsPage';
import { AnnouncementsPage } from './pages/super-admin/AnnouncementsPage';
import { EventsAdminPage } from './pages/super-admin/EventsAdminPage';

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <SplashScreen />;
  return children;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return children;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user || user.role !== 'SUPER_ADMIN') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AppBootstrap>
      <Routes>
        <Route path="/login" element={<GuestRoute><SuperAdminLoginPage /></GuestRoute>} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/"
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentProfilePage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="posts" element={<PostsModerationPage />} />
          <Route path="moderation" element={<PostsModerationPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="events" element={<EventsAdminPage />} />
          <Route path="analytics" element={<DashboardHome />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="health" element={<SystemHealthPage />} />
          <Route path="profile" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AppBootstrap>
  );
}
