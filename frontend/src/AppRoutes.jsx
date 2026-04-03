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

  /**
   * Protected: Requires login only. All authenticated roles can access.
   * Used for: Dashboard, default-module pages available to all roles.
   */
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

  /**
   * Permission: Requires login + specific permission flag.
   * Admin always bypasses.
   * Manager/Staff: must have the permission set (either by default role template or admin grant).
   *
   * Per ACCESS_GOVERNANCE:
   *   ADMIN: ALLOW_ALL
   *   MANAGER: DEFAULT_MODULES auto-allowed | OTHER_MODULES require admin grant
   *   STAFF:   DEFAULT_MODULES auto-allowed | OTHER_MODULES require admin grant
   */
  const Permission = ({ permission, children }) => {
    const { user, loading, hasPermission } = useAuth();

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (!user) return <Navigate to="/login" replace />;

    // Admin: full global access
    if (user.role === "admin") {
      return <DashboardLayout>{children}</DashboardLayout>;
    }

    // No permission required — open to all authenticated users
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
  /**
   * PERMISSION MATRIX ROUTE MAPPING:
   *
   * DEFAULT_MODULES (all roles — server-side scopes data by role):
   *   TASK, TODO, CLIENT_VISIT, CLIENT_PAGE, COMPLIANCE, CALENDAR, ATTENDANCE
   *   → Use <Protected> (accessible to all authenticated roles)
   *   → Data is scoped server-side:
   *       Admin  → all data
   *       Manager → own + same-department data
   *       Staff   → own data only
   *
   * GENERAL_SETTINGS → <Protected> (all roles, own profile/settings)
   *
   * OTHER_MODULES (admin-granted only):
   *   LEADS, QUOTATIONS, INVOICING, USER_DIRECTORY, STAFF_ACTIVITY, AUDIT_LOGS
   *   → Use <Permission permission="..."> (requires admin to grant flag)
   */
  function AppRoutes() {
    return (
      <Routes>

        {/* Public */}
        <Route path="/" element={<Public><PageLoader><Login /></PageLoader></Public>} />
        <Route path="/login" element={<Public><PageLoader><Login /></PageLoader></Public>} />
        <Route path="/register" element={<Public><PageLoader><Register /></PageLoader></Public>} />

        {/* Dashboard — all roles */}
        <Route path="/dashboard" element={<Protected><PageLoader><Dashboard /></PageLoader></Protected>} />

        {/* ── DEFAULT_MODULES — accessible to all roles, data scoped server-side ── */}

        {/* TASK module */}
        <Route path="/tasks" element={<Protected><PageLoader><Tasks /></PageLoader></Protected>} />

        {/* TODO module */}
        <Route path="/todos" element={<Protected><PageLoader><TodoDashboard /></PageLoader></Protected>} />

        {/* ATTENDANCE / CALENDAR module */}
        <Route path="/attendance" element={<Protected><PageLoader><Attendance /></PageLoader></Protected>} />

        {/* CLIENT_VISIT module */}
        <Route path="/visits" element={<Protected><PageLoader><VisitsPage /></PageLoader></Protected>} />

        {/* COMPLIANCE module */}
        <Route path="/duedates" element={<Protected><PageLoader><DueDates /></PageLoader></Protected>} />
        <Route path="/documents" element={<Protected><PageLoader><DocumentsRegister /></PageLoader></Protected>} />

        {/* CLIENT_PAGE module */}
        <Route path="/clients" element={<Protected><PageLoader><Clients /></PageLoader></Protected>} />

        {/* GENERAL_SETTINGS module */}
        <Route path="/settings/general" element={<Protected><PageLoader><GeneralSettings /></PageLoader></Protected>} />
        <Route path="/settings/email" element={<Protected><PageLoader><EmailSettings /></PageLoader></Protected>} />
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/passwords" element={<Protected><PageLoader><Passvault /></PageLoader></Protected>} />

        {/* Reports — accessible to all (own data for staff, dept data for manager) */}
        <Route path="/reports" element={<Protected><PageLoader><Reports /></PageLoader></Protected>} />

        {/* ── OTHER_MODULES — admin-granted only ── */}

        {/* DSC — admin-granted */}
        <Route path="/dsc" element={<Permission permission="can_view_all_dsc"><PageLoader><DSCRegister /></PageLoader></Permission>} />

        {/* USER_DIRECTORY — admin-granted */}
        <Route path="/users" element={<Permission permission="can_view_user_page"><PageLoader><Users /></PageLoader></Permission>} />

        {/* LEADS — admin-granted */}
        <Route path="/leads" element={<Permission permission="can_view_all_leads"><PageLoader><LeadsPage /></PageLoader></Permission>} />

        {/* QUOTATIONS — admin-granted */}
        <Route path="/quotations" element={<Permission permission={["can_create_quotations", "can_manage_invoices"]}><PageLoader><Quotations /></PageLoader></Permission>} />

        {/* INVOICING — admin-granted */}
        <Route path="/invoicing" element={<Permission permission={["can_manage_invoices", "can_create_quotations"]}><PageLoader><Invoicing /></PageLoader></Permission>} />

        {/* STAFF_ACTIVITY — admin-granted (manager has it by default) */}
        <Route path="/staff-activity" element={<Permission permission="can_view_staff_activity"><PageLoader><StaffActivity /></PageLoader></Permission>} />

        {/* AUDIT_LOGS — admin-granted only */}
        <Route path="/task-audit" element={<Permission permission="can_view_audit_logs"><PageLoader><TaskAudit /></PageLoader></Permission>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    );
  }

  export default AppRoutes;
  
