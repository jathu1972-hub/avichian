import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { homeRouteForRole } from './lib/roles';
import { SplashScreen } from './components/auth/SplashScreen';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { StudentLayout } from './layouts/StudentLayout';
import { FeedPage } from './pages/student/FeedPage';
import { SearchPage } from './pages/student/SearchPage';
import { CreatePostPage } from './pages/student/CreatePostPage';
import { FriendsPage } from './pages/student/FriendsPage';
import { ProfilePage } from './pages/student/ProfilePage';
import { UserProfilePage } from './pages/student/UserProfilePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { MfaVerifyPage } from './pages/MfaVerifyPage';
import { SuperAdminLoginPage } from './pages/SuperAdminLoginPage';
import { DashboardHome } from './pages/super-admin/DashboardHome';
import { StudentsPage } from './pages/super-admin/StudentsPage';
import { StaffPage } from './pages/super-admin/StaffPage';
import { HodPage } from './pages/super-admin/HodPage';
import { DepartmentsPage } from './pages/super-admin/DepartmentsPage';
import { AuditLogsPage } from './pages/super-admin/AuditLogsPage';
import { SettingsPage } from './pages/super-admin/SettingsPage';
import { SystemHealthPage } from './pages/super-admin/SystemHealthPage';
import { Phase2Page } from './pages/super-admin/Phase2Page';
import { HodLayout } from './layouts/HodLayout';
import { StaffLayout } from './layouts/StaffLayout';
import { HodDashboard } from './pages/hod/HodDashboard';
import { HodStaffPage } from './pages/hod/HodStaffPage';
import { HodDepartmentPage } from './pages/hod/HodDepartmentPage';
import { StaffDashboard } from './pages/staff/StaffDashboard';
import { StaffStudentsPage } from './pages/staff/StaffStudentsPage';
import { StaffImportPage } from './pages/staff/StaffImportPage';

function AppBootstrap({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <SplashScreen />;
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeRouteForRole(user.role) : '/login'} replace />;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to={homeRouteForRole(user.role)} replace />;
  return children;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/super-admin/login" replace />;
  if (user.role !== 'SUPER_ADMIN') return <AccessDeniedPage />;
  return children;
}

function HodRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'HOD') return <AccessDeniedPage />;
  return children;
}

function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'STAFF') return <AccessDeniedPage />;
  return children;
}

function StudentRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'STUDENT') return <AccessDeniedPage />;
  return children;
}

function CatchAllRedirect() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeRouteForRole(user.role)} replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AppBootstrap>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/super-admin/login" element={<GuestRoute><SuperAdminLoginPage /></GuestRoute>} />
        <Route path="/admin/login" element={<Navigate to="/super-admin/login" replace />} />
        <Route path="/admin" element={<Navigate to="/super-admin" replace />} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
        <Route path="/mfa-verify" element={<MfaVerifyPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />

        <Route path="/feed" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <StudentRoute>
              <StudentLayout />
            </StudentRoute>
          }
        >
          <Route index element={<FeedPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="create" element={<CreatePostPage />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="user/:userId" element={<UserProfilePage />} />
        </Route>

        <Route path="/hod" element={<HodRoute><HodLayout /></HodRoute>}>
          <Route index element={<HodDashboard />} />
          <Route path="staff" element={<HodStaffPage />} />
          <Route path="department" element={<HodDepartmentPage />} />
        </Route>

        <Route path="/staff" element={<StaffRoute><StaffLayout /></StaffRoute>}>
          <Route index element={<StaffDashboard />} />
          <Route path="students" element={<StaffStudentsPage />} />
          <Route path="import" element={<StaffImportPage />} />
        </Route>

        <Route
          path="/super-admin"
          element={
            <SuperAdminRoute>
              <SuperAdminLayout />
            </SuperAdminRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="hod" element={<HodPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="health" element={<SystemHealthPage />} />
          <Route path="posts" element={<Phase2Page />} />
          <Route path="communities" element={<Phase2Page />} />
          <Route path="events" element={<Phase2Page />} />
          <Route path="chat" element={<Phase2Page />} />
          <Route path="calls" element={<Phase2Page />} />
          <Route path="reports" element={<Phase2Page />} />
          <Route path="storage" element={<Phase2Page />} />
          <Route path="notifications" element={<Phase2Page />} />
          <Route path="analytics" element={<Phase2Page />} />
        </Route>

        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </AppBootstrap>
  );
}