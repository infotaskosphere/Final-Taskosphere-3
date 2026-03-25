import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext.jsx";
import DashboardLayout from "@/components/layout/DashboardLayout.jsx";
import PasswordRepository from "@/pages/PasswordRepository.jsx";

/* ── Lazy Loaded Pages ──────────────────────────────────────────────────── */
const Login             = lazy(() => import("@/pages/Login.jsx"));
const TaskAudit         = lazy(() => import("@/pages/TaskAudit.jsx"));
const Register          = lazy(() => import("@/pages/Register.jsx"));
const Dashboard         = lazy(() => import("@/pages/Dashboard.jsx"));
const Tasks             = lazy(() => import("@/pages/Tasks.jsx"));
const TodoDashboard     = lazy(() => import("@/pages/TodoDashboard.jsx"));
const DSCRegister       = lazy(() => import("@/pages/DSCRegister.jsx"));
const DocumentsRegister = lazy(() => import("@/pages/DocumentsRegister.jsx"));
const Attendance        = lazy(() => import("@/pages/Attendance.jsx"));
const Reports           = lazy(() => import("@/pages/Reports.jsx"));
const Clients           = lazy(() => import("@/pages/Clients.jsx"));
const Users             = lazy(() => import("@/pages/Users.jsx"));
const DueDates          = lazy(() => import("@/pages/DueDates.jsx"));
const StaffActivity     = lazy(() => import("@/pages/StaffActivity.jsx"));
const LeadsPage         = lazy(() => import("@/pages/Leads.jsx"));
const VisitsPage        = lazy(() => import("@/pages/VisitsPage.jsx"));
const EmailSettings     = lazy(() => import("@/components/EmailSettings.jsx"));
const Quotations        = lazy(() => import("@/pages/Quotations.jsx"));
const GeneralSettings   = lazy(() => import("@/pages/GeneralSettings.jsx"));

/* ── Route Guards ───────────────────────────────────────────────────────── */

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

const Public = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

const Permission = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/dashboard" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

/* ── App Routes ─────────────────────────────────────────────────────────── */
/*
 * IMPORTANT: No fallback on this Suspense.
 * App.jsx > RouteChangeHandler already shows the shaped skeleton
 * while lazy chunks load. If we put a fallback here it creates a
 * second competing loading state that wipes out the sidebar.
 */
function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>

        {/* Public */}
        <Route path="/"        element={<Public><Login /></Public>} />
        <Route path="/login"   element={<Public><Login /></Public>} />
        <Route path="/register" element={<Public><Register /></Public>} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />

        {/* Operations */}
        <Route path="/tasks"      element={<Protected><Tasks /></Protected>} />
        <Route path="/todos"      element={<Protected><TodoDashboard /></Protected>} />
        <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
        <Route path="/visits"     element={<Protected><VisitsPage /></Protected>} />
        <Route path="/duedates"   element={<Protected><DueDates /></Protected>} />
        <Route path="/reports"    element={<Protected><Reports /></Protected>} />

        {/* Gated Registers */}
        <Route path="/dsc"       element={<Permission permission="can_view_all_dsc"><DSCRegister /></Permission>} />
        <Route path="/documents" element={<Permission permission="can_view_documents"><DocumentsRegister /></Permission>} />
        <Route path="/clients"   element={<Protected><Clients /></Protected>} />
        <Route path="/passwords" element={<Protected><PasswordRepository /></Protected>} />

        {/* Admin */}
        <Route path="/users"          element={<Permission permission="can_view_user_page"><Users /></Permission>} />
        <Route path="/leads"          element={<Permission permission="can_view_all_leads"><LeadsPage /></Permission>} />
        <Route path="/quotations"     element={<Permission permission="can_create_quotations"><Quotations /></Permission>} />
        <Route path="/staff-activity" element={<Permission permission="can_view_staff_activity"><StaffActivity /></Permission>} />
        <Route path="/task-audit"     element={<Permission permission="can_view_audit_logs"><TaskAudit /></Permission>} />

        {/* Settings */}
        <Route path="/settings/email"   element={<Protected><EmailSettings /></Protected>} />
        <Route path="/settings/general" element={<Protected><GeneralSettings /></Protected>} />
        <Route path="/settings"         element={<Navigate to="/settings/general" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
