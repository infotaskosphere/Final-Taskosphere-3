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
const PasswordRepository = lazy(() => import("@/pages/PasswordRepository.jsx"));
// ── NEW: Invoicing & Billing ────────────────────────────────────────────────
const Invoicing         = lazy(() => import("@/pages/Invoicing.jsx"));

/* ── Route Guards ───────────────────────────────────────────────────────── */

/**
 * Protected — requires login only (no specific permission).
 */
const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

/**
 * Public — redirects logged-in users away to dashboard.
 */
const Public = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

/**
 * Permission — requires login AND one (or more) permissions.
 *
 * NEW: `permission` now accepts either a string OR an array of strings.
 * When an array is supplied the check is OR-based — access is granted if
 * the user holds ANY of the listed permissions (plus admin always passes).
 *
 * Usage examples:
 *   <Permission permission="can_view_all_leads">          (single)
 *   <Permission permission={["can_manage_invoices",       (array / OR)
 *                             "can_create_quotations"]}>
 */
const Permission = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // Admin always passes — no permission check needed.
  if (user.role === "admin") {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  // No permission constraint supplied → treat as Protected.
  if (!permission) {
    return <DashboardLayout>{children}</DashboardLayout>;
  }

  // Normalise to array and evaluate OR logic.
  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = perms.some((p) => hasPermission(p));

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

/* ── Page Loader Wrapper ───────────────────────────────────────────────── */
const PageLoader = ({ children }) => (
  <Suspense fallback={<div className="page-loader">Loading...</div>}>
    {children}
  </Suspense>
);

/* ── App Routes ───────────────────────────────────────────────────────── */
function AppRoutes() {
  return (
    <Routes>
      {/* ── Public ────────────────────────────────────────────────────── */}
      <Route
        path="/"
        element={
          <Public>
            <PageLoader><Login /></PageLoader>
          </Public>
        }
      />

      <Route
        path="/login"
        element={
          <Public>
            <PageLoader><Login /></PageLoader>
          </Public>
        }
      />

      <Route
        path="/register"
        element={
          <Public>
            <PageLoader><Register /></PageLoader>
          </Public>
        }
      />

      {/* ── Dashboard ─────────────────────────────────────────────────── */}
      <Route
        path="/dashboard"
        element={
          <Protected>
            <PageLoader><Dashboard /></PageLoader>
          </Protected>
        }
      />

      {/* ── Operations ────────────────────────────────────────────────── */}
      <Route
        path="/tasks"
        element={
          <Protected>
            <PageLoader><Tasks /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/todos"
        element={
          <Protected>
            <PageLoader><TodoDashboard /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/attendance"
        element={
          <Protected>
            <PageLoader><Attendance /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/visits"
        element={
          <Protected>
            <PageLoader><VisitsPage /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/duedates"
        element={
          <Protected>
            <PageLoader><DueDates /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/reports"
        element={
          <Protected>
            <PageLoader><Reports /></PageLoader>
          </Protected>
        }
      />

      {/* ── Gated Registers ───────────────────────────────────────────── */}
      <Route
        path="/dsc"
        element={
          <Permission permission="can_view_all_dsc">
            <PageLoader><DSCRegister /></PageLoader>
          </Permission>
        }
      />

      <Route
        path="/documents"
        element={
          <Permission permission="can_view_documents">
            <PageLoader><DocumentsRegister /></PageLoader>
          </Permission>
        }
      />

      <Route
        path="/clients"
        element={
          <Protected>
            <PageLoader><Clients /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/passwords"
        element={
          <Protected>
            <PageLoader><PasswordRepository /></PageLoader>
          </Protected>
        }
      />

      {/* ── Admin ─────────────────────────────────────────────────────── */}
      <Route
        path="/users"
        element={
          <Permission permission="can_view_user_page">
            <PageLoader><Users /></PageLoader>
          </Permission>
        }
      />

      <Route
        path="/leads"
        element={
          <Permission permission="can_view_all_leads">
            <PageLoader><LeadsPage /></PageLoader>
          </Permission>
        }
      />

      {/*
        Quotations — requires can_create_quotations.
        Users with can_manage_invoices but NOT can_create_quotations should
        still be able to reach Quotations for reference; widen the gate here
        using OR logic.
      */}
      <Route
        path="/quotations"
        element={
          <Permission permission={["can_create_quotations", "can_manage_invoices"]}>
            <PageLoader><Quotations /></PageLoader>
          </Permission>
        }
      />

      {/*
        Invoicing & Billing — NEW ROUTE
        Access granted if user holds can_manage_invoices OR can_create_quotations.
        Admin always passes (handled in Permission component).
        The page itself enforces row-level security via the backend.
      */}
      <Route
        path="/invoicing"
        element={
          <Permission permission={["can_manage_invoices", "can_create_quotations"]}>
            <PageLoader><Invoicing /></PageLoader>
          </Permission>
        }
      />

      <Route
        path="/staff-activity"
        element={
          <Permission permission="can_view_staff_activity">
            <PageLoader><StaffActivity /></PageLoader>
          </Permission>
        }
      />

      <Route
        path="/task-audit"
        element={
          <Permission permission="can_view_audit_logs">
            <PageLoader><TaskAudit /></PageLoader>
          </Permission>
        }
      />

      {/* ── Settings ──────────────────────────────────────────────────── */}
      <Route
        path="/settings/email"
        element={
          <Protected>
            <PageLoader><EmailSettings /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/settings/general"
        element={
          <Protected>
            <PageLoader><GeneralSettings /></PageLoader>
          </Protected>
        }
      />

      <Route
        path="/settings"
        element={<Navigate to="/settings/general" replace />}
      />

      {/* ── Fallback ──────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default AppRoutes;
