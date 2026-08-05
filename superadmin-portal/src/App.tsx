import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SplashScreen } from './components/auth/SplashScreen';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';

const SuperAdminLoginPage = lazy(() =>
  import('./pages/SuperAdminLoginPage').then((m) => ({ default: m.SuperAdminLoginPage })),
);
const DashboardHome = lazy(() =>
  import('./pages/super-admin/DashboardHome').then((m) => ({ default: m.DashboardHome })),
);
const StudentsPage = lazy(() =>
  import('./pages/super-admin/StudentsPage').then((m) => ({ default: m.StudentsPage })),
);
const StudentProfilePage = lazy(() =>
  import('./pages/super-admin/StudentProfilePage').then((m) => ({ default: m.StudentProfilePage })),
);
const StaffPage = lazy(() =>
  import('./pages/super-admin/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const DepartmentsPage = lazy(() =>
  import('./pages/super-admin/DepartmentsPage').then((m) => ({ default: m.DepartmentsPage })),
);
const AuditLogsPage = lazy(() =>
  import('./pages/super-admin/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/super-admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SystemHealthPage = lazy(() =>
  import('./pages/super-admin/SystemHealthPage').then((m) => ({ default: m.SystemHealthPage })),
);
const PostsModerationPage = lazy(() =>
  import('./pages/super-admin/PostsModerationPage').then((m) => ({ default: m.PostsModerationPage })),
);
const ReelsModerationPage = lazy(() =>
  import('./pages/super-admin/ReelsModerationPage').then((m) => ({ default: m.ReelsModerationPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/super-admin/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const AnnouncementsPage = lazy(() =>
  import('./pages/super-admin/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })),
);
const EventsAdminPage = lazy(() =>
  import('./pages/super-admin/EventsAdminPage').then((m) => ({ default: m.EventsAdminPage })),
);
const CommunitiesAdminPage = lazy(() =>
  import('./pages/super-admin/CommunitiesAdminPage').then((m) => ({ default: m.CommunitiesAdminPage })),
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
  return children;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/" replace />;
  return children;
}

/** Client guard — API still enforces SUPER_ADMIN on every protected route. */
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user || user.role !== 'SUPER_ADMIN') return <Navigate to="/login" replace />;
  return children;
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

export default function App() {
  return (
    <AppBootstrap>
      <Suspense fallback={<SplashScreen />}>
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
            <Route index element={<LazyPage><DashboardHome /></LazyPage>} />
            <Route path="students" element={<LazyPage><StudentsPage /></LazyPage>} />
            <Route path="students/:id" element={<LazyPage><StudentProfilePage /></LazyPage>} />
            <Route path="staff" element={<LazyPage><StaffPage /></LazyPage>} />
            <Route path="departments" element={<LazyPage><DepartmentsPage /></LazyPage>} />
            <Route path="posts" element={<LazyPage><PostsModerationPage /></LazyPage>} />
            <Route path="reels" element={<LazyPage><ReelsModerationPage /></LazyPage>} />
            <Route path="moderation" element={<LazyPage><PostsModerationPage /></LazyPage>} />
            <Route path="reports" element={<LazyPage><ReportsPage /></LazyPage>} />
            <Route path="announcements" element={<LazyPage><AnnouncementsPage /></LazyPage>} />
            <Route path="events" element={<LazyPage><EventsAdminPage /></LazyPage>} />
            <Route path="communities" element={<LazyPage><CommunitiesAdminPage /></LazyPage>} />
            <Route path="analytics" element={<LazyPage><DashboardHome /></LazyPage>} />
            <Route path="audit-logs" element={<LazyPage><AuditLogsPage /></LazyPage>} />
            <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
            <Route path="health" element={<LazyPage><SystemHealthPage /></LazyPage>} />
            <Route path="profile" element={<LazyPage><SettingsPage /></LazyPage>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AppBootstrap>
  );
}
