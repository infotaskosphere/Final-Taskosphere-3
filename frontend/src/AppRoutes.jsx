import React, { Suspense, lazy } from "react";
import GifLoader, { ContentLoader } from "@/components/ui/GifLoader.jsx";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext.jsx";
import DashboardLayout from "@/components/layout/DashboardLayout.jsx";

/* ── Lazy Loaded Pages ──────────────────────────────────────────────────── */

const Login             = lazy(() => import("@/pages/Login.jsx"));
const ForgotPassword    = lazy(() => import("@/pages/ForgotPassword.jsx"));
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
const Reminders         = lazy(() => import("@/pages/Reminders.jsx"));
const CompliancePage    = lazy(() => import("@/pages/CompliancePage.jsx")); // ← NEW

// ── Accounting Module ───────────────────────────────────────────────────────
const AccountingDashboard = lazy(() => import("@/pages/AccountingDashboard.jsx"));
const BankStatements      = lazy(() => import("@/pages/BankStatements.jsx"));
const ChartOfAccounts     = lazy(() => import("@/pages/ChartOfAccounts.jsx"));
const JournalEntries      = lazy(() => import("@/pages/JournalEntries.jsx"));
const LedgerView          = lazy(() => import("@/pages/LedgerView.jsx"));
const FinancialReports    = lazy(() => import("@/pages/FinancialReports.jsx"));
const Reconciliation      = lazy(() => import("@/pages/Reconciliation.jsx"));
const OpeningBalances     = lazy(() => import("@/pages/OpeningBalances.jsx"));

/* ── Route Guards ───────────────────────────────────────────────────────── */

/**
 * Protected: Requires login only. All authenticated roles can access.
 * Uses GifLoader for auth loading (full-screen, no sidebar yet).
 */
const Protected = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <GifLoader />;
  if (!user) return <Navigate to="/login" replace />;

  return <DashboardLayout>{children}</DashboardLayout>;
};

const Public = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <GifLoader />;
  if (user) return <Navigate to="/dashboard" replace />;

  return children;
};

/**
 * Permission: Requires login + specific permission flag.
 * Admin always bypasses.
 */
const Permission = ({ permission, children }) => {
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
};

/**
 * PageLoader — wraps lazy pages with Suspense.
 *
 * Uses ContentLoader (NOT GifLoader) as the fallback so the sidebar
 * and header remain visible while a lazy chunk is being downloaded.
 * ContentLoader uses position:absolute and is contained within the
 * relative-positioned main content area of DashboardLayout.
 *
 * For Public pages (login/register) there is no sidebar, so we fall
 * back to the full-screen GifLoader there.
 */
const PageLoader = ({ children, isPublic = false }) => (
  <Suspense fallback={isPublic ? <GifLoader /> : <ContentLoader />}>
    {children}
  </Suspense>
);

/* ── Routes ────────────────────────────────────────────────────────────── */
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
      <Route path="/tasks"      element={<Protected><PageLoader><Tasks /></PageLoader></Protected>} />
      <Route path="/todos"      element={<Protected><PageLoader><TodoDashboard /></PageLoader></Protected>} />
      <Route path="/attendance" element={<Protected><PageLoader><Attendance /></PageLoader></Protected>} />
      <Route path="/reminders" element={<Protected><PageLoader><Reminders /></PageLoader></Protected>} />
      <Route path="/visits"     element={<Protected><PageLoader><VisitsPage /></PageLoader></Protected>} />
      <Route path="/duedates"   element={<Protected><PageLoader><DueDates /></PageLoader></Protected>} />
      <Route path="/reports"    element={<Protected><PageLoader><Reports /></PageLoader></Protected>} />

      {/* Compliance Tracker — permission-gated, dept-scoped server-side */}
      <Route path="/compliance" element={<Permission permission="can_view_compliance"><PageLoader><CompliancePage /></PageLoader></Permission>} />

      {/* Settings — all roles */}
      <Route path="/settings/general" element={<Protected><PageLoader><GeneralSettings /></PageLoader></Protected>} />
      <Route path="/settings/email"   element={<Protected><PageLoader><EmailSettings /></PageLoader></Protected>} />
      <Route path="/settings"         element={<Navigate to="/settings/general" replace />} />

      {/* PERMISSION-BASED MODULES */}
      <Route path="/documents"    element={<Permission permission="can_view_documents"><PageLoader><DocumentsRegister /></PageLoader></Permission>} />
      {/* Clients — Protected (not Permission-gated).
           can_view_all_clients controls DATA scope server-side (all vs assigned),
           not page access. All authenticated users can visit /clients. */}
      <Route path="/clients"      element={<Protected><PageLoader><Clients /></PageLoader></Protected>} />
      <Route path="/passwords"    element={<Permission permission="can_view_passwords"><PageLoader><Passvault /></PageLoader></Permission>} />
      <Route path="/dsc"          element={<Permission permission="can_view_all_dsc"><PageLoader><DSCRegister /></PageLoader></Permission>} />
      <Route path="/leads"        element={<Permission permission="can_view_all_leads"><PageLoader><LeadsPage /></PageLoader></Permission>} />
      <Route path="/quotations"   element={<Permission permission={["can_create_quotations", "can_manage_invoices"]}><PageLoader><Quotations /></PageLoader></Permission>} />
      <Route path="/invoicing"    element={<Permission permission={["can_manage_invoices", "can_create_quotations"]}><PageLoader><Invoicing /></PageLoader></Permission>} />
      <Route path="/staff-activity" element={<Permission permission="can_view_staff_activity"><PageLoader><StaffActivity /></PageLoader></Permission>} />
      <Route path="/task-audit"   element={<Permission permission="can_view_audit_logs"><PageLoader><TaskAudit /></PageLoader></Permission>} />
      <Route path="/users"        element={<Permission permission="can_view_user_page"><PageLoader><Users /></PageLoader></Permission>} />

      {/* ── AI Accounting Module ─────────────────────────────────────── */}
      <Route path="/accounting"              element={<Protected><PageLoader><AccountingDashboard /></PageLoader></Protected>} />
      <Route path="/accounting/bank-statements" element={<Protected><PageLoader><BankStatements /></PageLoader></Protected>} />
      <Route path="/accounting/accounts"     element={<Protected><PageLoader><ChartOfAccounts /></PageLoader></Protected>} />
      <Route path="/accounting/journal"      element={<Protected><PageLoader><JournalEntries /></PageLoader></Protected>} />
      <Route path="/accounting/ledger"       element={<Protected><PageLoader><LedgerView /></PageLoader></Protected>} />
      <Route path="/accounting/pl"           element={<Protected><PageLoader><FinancialReports defaultTab="pl" /></PageLoader></Protected>} />
      <Route path="/accounting/balance-sheet" element={<Protected><PageLoader><FinancialReports defaultTab="bs" /></PageLoader></Protected>} />
      <Route path="/accounting/trial-balance" element={<Protected><PageLoader><FinancialReports defaultTab="tb" /></PageLoader></Protected>} />
      <Route path="/accounting/trading"      element={<Protected><PageLoader><FinancialReports defaultTab="trading" /></PageLoader></Protected>} />
      <Route path="/accounting/reconcile"    element={<Protected><PageLoader><Reconciliation /></PageLoader></Protected>} />
      <Route path="/accounting/opening-balances" element={<Protected><PageLoader><OpeningBalances /></PageLoader></Protected>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  );
}

export default AppRoutes;
