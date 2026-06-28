import React, { Suspense, lazy, memo } from "react";
import GifLoader, { ContentLoader } from "@/components/ui/GifLoader.jsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext.jsx";
import DashboardLayout from "@/components/layout/DashboardLayout.jsx";

/* ── Lazy Loaded Pages ──────────────────────────────────────────────────── */
// Each import() is a separate chunk. Vite will prefetch these after the first
// paint because we're using dynamic import — no change to routing behaviour.

const Login             = lazy(() => import("@/pages/Login.jsx"));
const ForgotPassword    = lazy(() => import("@/pages/ForgotPassword.jsx"));
const TrademarkSphere   = lazy(() => import("@/pages/TrademarkSphere.jsx"));
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
const Interviews        = lazy(() => import("@/pages/Interviews.jsx"));
const LeadsPage         = lazy(() => import("@/pages/Leads.jsx"));
const VisitsPage        = lazy(() => import("@/pages/VisitsPage.jsx"));
const EmailSettings     = lazy(() => import("@/components/EmailSettings.jsx"));
const Quotations        = lazy(() => import("@/pages/Quotations.jsx"));
const GeneralSettings   = lazy(() => import("@/pages/GeneralSettings.jsx"));
const WhatsAppSettings  = lazy(() => import("@/pages/WhatsAppSettings.jsx"));
const Passvault         = lazy(() => import("@/pages/Passvault.jsx"));
const WhatsAppHub       = lazy(() => import("@/pages/WhatsAppHub.jsx"));
const Invoicing         = lazy(() => import("@/pages/Invoicing.jsx"));
const Reminders         = lazy(() => import("@/pages/Reminders.jsx"));
const CompliancePage    = lazy(() => import("@/pages/CompliancePage.jsx"));
const GSTReconciliation = lazy(() => import("@/pages/GSTReconciliation.jsx"));
const AIDocumentReader  = lazy(() => import("@/pages/AIDocumentReader.jsx"));
const StaffActivity     = lazy(() => import("@/pages/StaffActivity.jsx"));
const ActionCenter      = lazy(() => import("@/pages/ActionCenter.jsx"));
const ClientPortalLogin        = lazy(() => import("@/pages/ClientPortalLogin.jsx"));
const ClientPortalDashboard    = lazy(() => import("@/pages/ClientPortalDashboard.jsx"));
const ClientPortalManagerPage  = lazy(() => import("@/pages/ClientPortalManagerPage.jsx"));
const DesktopAgentDashboard    = lazy(() => import("@/pages/DesktopAgentDashboard.jsx"));

/* ── Route Guards ───────────────────────────────────────────────────────── */

/**
 * Protected: Requires login only. All authenticated roles can access.
 * Memoized so DashboardLayout is not remounted on every navigation —
 * only on auth state changes. This is the single biggest navigation win:
 * the sidebar/header stay mounted and only the page content swaps.
 */
const Protected = memo(function Protected({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <GifLoader />;
  if (!user) return <Navigate to="/login" replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
});

const Public = memo(function Public({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <GifLoader />;
  if (user) return <Navigate to="/dashboard" replace />;

  return children;
});

/**
 * AdminOnly: Requires login + admin role.
 */
const AdminOnly = memo(function AdminOnly({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <GifLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
});

/**
 * Permission: Requires login + specific permission flag.
 * Admin always bypasses.
 */
const Permission = memo(function Permission({ permission, children }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <GifLoader />;
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
});

/**
 * PageLoader — wraps lazy pages with a single shared Suspense boundary.
 *
 * One Suspense per page instead of nesting them eliminates double-suspension
 * artifacts. ContentLoader keeps the sidebar/header visible while the page
 * chunk downloads, which is the main perceived-performance win.
 */
const PageLoader = memo(function PageLoader({ children, isPublic = false }) {
  return (
    <Suspense fallback={isPublic ? <GifLoader /> : <ContentLoader />}>
      {children}
    </Suspense>
  );
});

/* ── Routes ────────────────────────────────────────────────────────────── */
// Routes component itself does not need to be memoized — React Router
// already bails out of re-rendering routes that don't match.
function AppRoutes() {
  return (
    <Routes>

      {/* Public — full-screen loader is fine here (no sidebar) */}
      <Route path="/"               element={<Public><PageLoader isPublic><Login /></PageLoader></Public>} />
      <Route path="/login"          element={<Public><PageLoader isPublic><Login /></PageLoader></Public>} />
      <Route path="/register"       element={<Public><PageLoader isPublic><Register /></PageLoader></Public>} />
      <Route path="/forgot-password" element={<Public><PageLoader isPublic><ForgotPassword /></PageLoader></Public>} />

      {/* Dashboard — all roles */}
      <Route path="/dashboard" element={<Protected><PageLoader><Dashboard /></PageLoader></Protected>} />

      {/* DEFAULT_MODULES — all roles, data scoped server-side */}
      <Route path="/tasks"         element={<Protected><PageLoader><Tasks /></PageLoader></Protected>} />
      <Route path="/todos"         element={<Protected><PageLoader><TodoDashboard /></PageLoader></Protected>} />
      <Route path="/attendance"    element={<Protected><PageLoader><Attendance /></PageLoader></Protected>} />
      <Route path="/reminders"     element={<Protected><PageLoader><Reminders /></PageLoader></Protected>} />
      <Route path="/action-center" element={<Protected><PageLoader><ActionCenter /></PageLoader></Protected>} />
      <Route path="/visits"        element={<Protected><PageLoader><VisitsPage /></PageLoader></Protected>} />
      <Route path="/reports"       element={<Protected><PageLoader><Reports /></PageLoader></Protected>} />
      <Route path="/ai-reader"     element={<Protected><PageLoader><AIDocumentReader /></PageLoader></Protected>} />
      <Route path="/whatsapp-hub"  element={<Permission permission="can_access_whatsapp_hub"><PageLoader><WhatsAppHub /></PageLoader></Permission>} />

      {/* ── COMPLIANCE GROUP ── */}
      <Route path="/duedates"           element={<Navigate to="/compliance" replace />} />
      <Route path="/compliance"         element={<Permission permission="can_view_compliance"><PageLoader><CompliancePage /></PageLoader></Permission>} />
      <Route path="/gst-reconciliation" element={<Permission permission="can_view_gst_reconciliation"><PageLoader><GSTReconciliation /></PageLoader></Permission>} />
      <Route path="/trademark-sphere"   element={<Permission permission="can_view_trademark_sphere"><PageLoader><TrademarkSphere /></PageLoader></Permission>} />

      {/* Settings — all roles */}
      <Route path="/settings/general"  element={<Protected><PageLoader><GeneralSettings /></PageLoader></Protected>} />
      <Route path="/settings/email"    element={<Protected><PageLoader><EmailSettings /></PageLoader></Protected>} />
      <Route path="/settings"          element={<Navigate to="/settings/general" replace />} />
      <Route path="/settings/whatsapp" element={<Protected><PageLoader><WhatsAppSettings /></PageLoader></Protected>} />

      {/* PERMISSION-BASED MODULES */}
      <Route path="/documents"  element={<Permission permission="can_view_documents"><PageLoader><DocumentsRegister /></PageLoader></Permission>} />
      <Route path="/clients"    element={<Protected><PageLoader><Clients /></PageLoader></Protected>} />
      <Route path="/passwords"  element={<Permission permission="can_view_passwords"><PageLoader><Passvault /></PageLoader></Permission>} />
      <Route path="/dsc"        element={<Permission permission="can_view_all_dsc"><PageLoader><DSCRegister /></PageLoader></Permission>} />
      <Route path="/leads"      element={<Permission permission="can_view_all_leads"><PageLoader><LeadsPage /></PageLoader></Permission>} />
      <Route path="/quotations" element={<Permission permission={["can_create_quotations", "can_manage_invoices"]}><PageLoader><Quotations /></PageLoader></Permission>} />
      <Route path="/invoicing"  element={<Permission permission={["can_manage_invoices", "can_create_quotations"]}><PageLoader><Invoicing /></PageLoader></Permission>} />
      <Route path="/task-audit" element={<Permission permission="can_view_audit_logs"><PageLoader><TaskAudit /></PageLoader></Permission>} />
      <Route path="/users"          element={<Permission permission="can_view_user_page"><PageLoader><Users /></PageLoader></Permission>} />
      <Route path="/interviews"     element={<Permission permission="can_view_interviews"><PageLoader><Interviews /></PageLoader></Permission>} />
      <Route path="/staff-activity" element={<AdminOnly><PageLoader><StaffActivity /></PageLoader></AdminOnly>} />
      <Route path="/desktop-agents" element={<AdminOnly><PageLoader><DesktopAgentDashboard /></PageLoader></AdminOnly>} />

      {/* Client Portal Manager */}
      <Route path="/client-portal-manager"   element={<Permission permission="can_view_client_portal"><PageLoader><ClientPortalManagerPage /></PageLoader></Permission>} />
      <Route path="/client-portal-manager/*" element={<Permission permission="can_view_client_portal"><PageLoader><ClientPortalManagerPage /></PageLoader></Permission>} />

      {/* Client Portal — standalone, no main-app auth */}
      <Route path="/client-portal"           element={<PageLoader isPublic><ClientPortalLogin /></PageLoader>} />
      <Route path="/client-portal/dashboard" element={<PageLoader isPublic><ClientPortalDashboard /></PageLoader>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  );
}

export default AppRoutes;
