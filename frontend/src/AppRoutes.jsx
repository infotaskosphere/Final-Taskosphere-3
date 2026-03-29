import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext.jsx";
import DashboardLayout from "@/components/layout/DashboardLayout.jsx";

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
const Passvault         = lazy(() => import("@/pages/Passvault.jsx"));
const Invoicing         = lazy(() => import("@/pages/Invoicing.jsx"));

/* ── Route Guards ───────────────────────────────────────────────────────── */

/* ✅ FIXED: Never return null */
const Protected = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
};

const Public = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  return children;
};

const Permission = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "admin") {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  if (!permission) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = perms.some((p) => hasPermission(p));

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

/* ── Page Loader ───────────────────────────────────────────────────────── */
const PageLoader = ({ children }) => (
  <Suspense fallback={<div style={{ padding: 20 }}>Loading...</div>}>
    {children}
  </Suspense>
);

/* ── Routes ────────────────────────────────────────────────────────────── */
function AppRoutes() {
  return (
    <Routes>

      {/* Public */}
      <Route path="/" element={<Public><PageLoader><Login /></PageLoader></Public>} />
      <Route path="/login" element={<Public><PageLoader><Login /></PageLoader></Public>} />
      <Route path="/register" element={<Public><PageLoader><Register /></PageLoader></Public>} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<Protected><PageLoader><Dashboard /></PageLoader></Protected>} />

      {/* Operations */}
      <Route path="/tasks" element={<Protected><PageLoader><Tasks /></PageLoader></Protected>} />
      <Route path="/todos" element={<Protected><PageLoader><TodoDashboard /></PageLoader></Protected>} />
      <Route path="/attendance" element={<Protected><PageLoader><Attendance /></PageLoader></Protected>} />
      <Route path="/visits" element={<Protected><PageLoader><VisitsPage /></PageLoader></Protected>} />
      <Route path="/duedates" element={<Protected><PageLoader><DueDates /></PageLoader></Protected>} />
      <Route path="/reports" element={<Protected><PageLoader><Reports /></PageLoader></Protected>} />

      {/* Registers */}
      <Route path="/dsc" element={<Permission permission="can_view_all_dsc"><PageLoader><DSCRegister /></PageLoader></Permission>} />
      <Route path="/documents" element={<Permission permission="can_view_documents"><PageLoader><DocumentsRegister /></PageLoader></Permission>} />
      <Route path="/clients" element={<Protected><PageLoader><Clients /></PageLoader></Protected>} />
      <Route path="/passwords" element={<Protected><PageLoader><Passvault /></PageLoader></Protected>} />

      {/* Admin */}
      <Route path="/users" element={<Permission permission="can_view_user_page"><PageLoader><Users /></PageLoader></Permission>} />
      <Route path="/leads" element={<Permission permission="can_view_all_leads"><PageLoader><LeadsPage /></PageLoader></Permission>} />
      <Route path="/quotations" element={<Permission permission={["can_create_quotations", "can_manage_invoices"]}><PageLoader><Quotations /></PageLoader></Permission>} />
      <Route path="/invoicing" element={<Permission permission={["can_manage_invoices", "can_create_quotations"]}><PageLoader><Invoicing /></PageLoader></Permission>} />
      <Route path="/staff-activity" element={<Permission permission="can_view_staff_activity"><PageLoader><StaffActivity /></PageLoader></Permission>} />
      <Route path="/task-audit" element={<Permission permission="can_view_audit_logs"><PageLoader><TaskAudit /></PageLoader></Permission>} />

      {/* Settings */}
      <Route path="/settings/email" element={<Protected><PageLoader><EmailSettings /></PageLoader></Protected>} />
      <Route path="/settings/general" element={<Protected><PageLoader><GeneralSettings /></PageLoader></Protected>} />
      <Route path="/settings" element={<Navigate to="/settings/general" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  );
}

export default AppRoutes;
