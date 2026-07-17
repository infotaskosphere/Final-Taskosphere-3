import React, { Suspense, memo } from "react";
import GifLoader, { ContentLoader } from "@/components/ui/GifLoader.jsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext.jsx";
import DashboardLayout from "@/components/layout/DashboardLayout.jsx";
import { lazyWithRetry } from "@/lib/lazyWithRetry.js";

/* ── Lazy Loaded Pages ──────────────────────────────────────────────────── */
// Each import() is a separate chunk. Vite will prefetch these after the first
// paint because we're using dynamic import — no change to routing behaviour.
// lazyWithRetry auto-recovers from "Failed to fetch dynamically imported
// module" errors that happen when a browser tab is left open across a new
// deploy (stale index.html referencing an old, now-deleted chunk hash).

const Login             = lazyWithRetry(() => import("@/pages/Login.jsx"), "Login");
const ForgotPassword    = lazyWithRetry(() => import("@/pages/ForgotPassword.jsx"), "ForgotPassword");
const TrademarkSphere   = lazyWithRetry(() => import("@/pages/TrademarkSphere.jsx"), "TrademarkSphere");
const TaskAudit         = lazyWithRetry(() => import("@/pages/TaskAudit.jsx"), "TaskAudit");
const Register          = lazyWithRetry(() => import("@/pages/Register.jsx"), "Register");
const Dashboard         = lazyWithRetry(() => import("@/pages/Dashboard.jsx"), "Dashboard");
const Tasks             = lazyWithRetry(() => import("@/pages/Tasks.jsx"), "Tasks");
const TodoDashboard     = lazyWithRetry(() => import("@/pages/TodoDashboard.jsx"), "TodoDashboard");
const DSCRegister       = lazyWithRetry(() => import("@/pages/DSCRegister.jsx"), "DSCRegister");
const DocumentsRegister = lazyWithRetry(() => import("@/pages/DocumentsRegister.jsx"), "DocumentsRegister");
const Attendance        = lazyWithRetry(() => import("@/pages/Attendance.jsx"), "Attendance");
const Reports           = lazyWithRetry(() => import("@/pages/Reports.jsx"), "Reports");
const Clients           = lazyWithRetry(() => import("@/pages/Clients.jsx"), "Clients");
const Users             = lazyWithRetry(() => import("@/pages/Users.jsx"), "Users");
const Interviews        = lazyWithRetry(() => import("@/pages/Interviews.jsx"), "Interviews");
const LeadsPage         = lazyWithRetry(() => import("@/pages/Leads.jsx"), "LeadsPage");
const VisitsPage        = lazyWithRetry(() => import("@/pages/VisitsPage.jsx"), "VisitsPage");
const EmailSettings     = lazyWithRetry(() => import("@/components/EmailSettings.jsx"), "EmailSettings");
const Quotations        = lazyWithRetry(() => import("@/pages/Quotations.jsx"), "Quotations");
const GeneralSettings   = lazyWithRetry(() => import("@/pages/GeneralSettings.jsx"), "GeneralSettings");
const WhatsAppSettings  = lazyWithRetry(() => import("@/pages/WhatsAppSettings.jsx"), "WhatsAppSettings");
const Passvault         = lazyWithRetry(() => import("@/pages/Passvault.jsx"), "Passvault");
const WhatsAppHub       = lazyWithRetry(() => import("@/pages/WhatsAppHub.jsx"), "WhatsAppHub");
const Invoicing         = lazyWithRetry(() => import("@/pages/Invoicing.jsx"), "Invoicing");
const Purchase          = lazyWithRetry(() => import("@/pages/Purchase.jsx"), "Purchase");
const BankAccounts       = lazyWithRetry(() => import("@/pages/BankAccounts.jsx"), "BankAccounts");
const ChartOfAccounts    = lazyWithRetry(() => import("@/pages/ChartOfAccounts.jsx"), "ChartOfAccounts");
const JournalEntries     = lazyWithRetry(() => import("@/pages/JournalEntries.jsx"), "JournalEntries");
const AccountingReports  = lazyWithRetry(() => import("@/pages/AccountingReports.jsx"), "AccountingReports");
const ZeroTouchEntry = lazyWithRetry(() => import("@/pages/ZeroTouchEntry.jsx"), "ZeroTouchEntry");
const GSTPortalSync = lazyWithRetry(() => import("@/pages/GSTPortalSync.jsx"), "GSTPortalSync");
const AccountingIntegrity = lazyWithRetry(() => import("@/pages/AccountingIntegrity.jsx"), "AccountingIntegrity");
const Reminders         = lazyWithRetry(() => import("@/pages/Reminders.jsx"), "Reminders");
const CompliancePage    = lazyWithRetry(() => import("@/pages/CompliancePage.jsx"), "CompliancePage");
const GSTReconciliation = lazyWithRetry(() => import("@/pages/GSTReconciliation.jsx"), "GSTReconciliation");
const AIDocumentReader  = lazyWithRetry(() => import("@/pages/AIDocumentReader.jsx"), "AIDocumentReader");
const StaffActivity     = lazyWithRetry(() => import("@/pages/StaffActivity.jsx"), "StaffActivity");
const ActionCenter      = lazyWithRetry(() => import("@/pages/ActionCenter.jsx"), "ActionCenter");
const ClientPortalLogin        = lazyWithRetry(() => import("@/pages/ClientPortalLogin.jsx"), "ClientPortalLogin");
const ClientPortalDashboard    = lazyWithRetry(() => import("@/pages/ClientPortalDashboard.jsx"), "ClientPortalDashboard");
const ClientPortalManagerPage  = lazyWithRetry(() => import("@/pages/ClientPortalManagerPage.jsx"), "ClientPortalManagerPage");

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
      <Route path="/sale"       element={<Navigate to="/invoicing" replace />} />
      <Route path="/purchase"   element={<Permission permission={["can_manage_invoices", "can_create_quotations"]}><PageLoader><Purchase /></PageLoader></Permission>} />
      {/* Bank / Chart of Accounts / Journal / Reports are gated INSIDE the page
          (RequestAccessGate) rather than at the route level: admin sees the
          page immediately, everyone else sees a "request access" screen and
          can ask their admin from there — so any logged-in user can load the
          route, but only approved users see the real content. */}
      <Route path="/bank-accounts"       element={<Protected><PageLoader><BankAccounts /></PageLoader></Protected>} />
      <Route path="/chart-of-accounts"   element={<Protected><PageLoader><ChartOfAccounts /></PageLoader></Protected>} />
      <Route path="/journal-entries"     element={<Protected><PageLoader><JournalEntries /></PageLoader></Protected>} />
      <Route path="/accounting-reports"  element={<Protected><PageLoader><AccountingReports /></PageLoader></Protected>} />
      <Route path="/zero-touch-entry"     element={<Protected><PageLoader><ZeroTouchEntry /></PageLoader></Protected>} />
      <Route path="/gst-portal-sync"      element={<Protected><PageLoader><GSTPortalSync /></PageLoader></Protected>} />
      <Route path="/accounting-integrity" element={<Protected><PageLoader><AccountingIntegrity /></PageLoader></Protected>} />
      <Route path="/task-audit" element={<Permission permission="can_view_audit_logs"><PageLoader><TaskAudit /></PageLoader></Permission>} />
      <Route path="/users"          element={<Permission permission="can_view_user_page"><PageLoader><Users /></PageLoader></Permission>} />
      <Route path="/interviews"     element={<Permission permission="can_view_interviews"><PageLoader><Interviews /></PageLoader></Permission>} />
      <Route path="/staff-activity" element={<AdminOnly><PageLoader><StaffActivity /></PageLoader></AdminOnly>} />

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
