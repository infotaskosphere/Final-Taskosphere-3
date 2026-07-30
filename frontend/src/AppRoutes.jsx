import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import DashboardLayout from '@/components/layout/DashboardLayout.jsx';
import GifLoader from '@/components/ui/GifLoader.jsx';
import { AnimatePresence, motion } from 'framer-motion';

/* ── Auth pages (no sidebar) ─────────────────────────────────────────── */
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));

/* ── Client portal (its own auth flow, no admin sidebar) ────────────── */
const ClientPortalLogin = lazy(() => import('./pages/ClientPortalLogin.jsx'));
const ClientPortalDashboard = lazy(() => import('./pages/ClientPortalDashboard.jsx'));

/* ── Core ─────────────────────────────────────────────────────────────── */
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Tasks = lazy(() => import('./pages/Tasks.jsx'));
const TodoDashboard = lazy(() => import('./pages/TodoDashboard.jsx'));
const Attendance = lazy(() => import('./pages/Attendance.jsx'));
const Reminders = lazy(() => import('./pages/Reminders.jsx'));
const ActionCenter = lazy(() => import('./pages/ActionCenter.jsx'));
const VisitsPage = lazy(() => import('./pages/VisitsPage.jsx'));
const AIDocumentReader = lazy(() => import('./pages/AIDocumentReader.jsx'));

/* ── Compliance ───────────────────────────────────────────────────────── */
const ComplianceDashboard = lazy(() => import('./pages/ComplianceDashboard.jsx'));
const CompliancePage = lazy(() => import('./pages/CompliancePage.jsx'));
const GSTReconciliation = lazy(() => import('./pages/GSTReconciliation.jsx'));
const TrademarkSphere = lazy(() => import('./pages/TrademarkSphere.jsx'));

/* ── Records ──────────────────────────────────────────────────────────── */
const RecordsDashboard = lazy(() => import('./pages/RecordsDashboard.jsx'));
const PeopleMatrixDashboard = lazy(() => import('./pages/PeopleMatrixDashboard.jsx'));
const DSCRegister = lazy(() => import('./pages/DSCRegister.jsx'));
const DocumentRegister = lazy(() => import('./pages/DocumentsRegister.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const PasswordRepository = lazy(() => import('./pages/Passvault.jsx'));

/* ── Client proposals ─────────────────────────────────────────────────── */
const ClientProposalsDashboard = lazy(() => import('./pages/ClientProposalsDashboard.jsx'));
const LeadsPage = lazy(() => import('./pages/Leads.jsx'));
const Quotations = lazy(() => import('./pages/Quotations.jsx'));

/* ── Accounts (core + extended reports) ──────────────────────────────── */
const FinixDashboard = lazy(() => import('./pages/FinixDashboard.jsx'));
const Invoicing = lazy(() => import('./pages/Invoicing.jsx'));
const Purchase = lazy(() => import('./pages/Purchase.jsx'));
const BankAccounts = lazy(() => import('./pages/BankAccounts.jsx'));
const ChartOfAccounts = lazy(() => import('./pages/ChartOfAccounts.jsx'));
const JournalEntries = lazy(() => import('./pages/JournalEntries.jsx'));
const AccountingReports = lazy(() => import('./pages/AccountingReports.jsx'));
const ZeroTouchEntry = lazy(() => import('./pages/ZeroTouchEntry.jsx'));
const GSTPortalSync = lazy(() => import('./pages/GSTPortalSync.jsx'));
const AccountingIntegrity = lazy(() => import('./pages/AccountingIntegrity.jsx'));
const ExtendedReports = lazy(() => import('./pages/ExtendedReports.jsx'));
const DueDates = lazy(() => import('./pages/DueDates.jsx'));
const ImportInvoices = lazy(() => import('./pages/ImportInvoices.jsx'));

/* ── Admin ────────────────────────────────────────────────────────────── */
const Reports = lazy(() => import('./pages/Reports.jsx'));
const TaskAudit = lazy(() => import('./pages/TaskAudit.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));
const Interviews = lazy(() => import('./pages/Interviews.jsx'));
const StaffActivity = lazy(() => import('./pages/StaffActivity.jsx'));
const ClientPortalManagerPage = lazy(() => import('./pages/ClientPortalManagerPage.jsx'));
const WhatsAppHub = lazy(() => import('./pages/WhatsAppHub.jsx'));

/* ── Settings ─────────────────────────────────────────────────────────── */
const GeneralSettings = lazy(() => import('./pages/GeneralSettings.jsx'));
const WhatsAppSettings = lazy(() => import('./pages/WhatsAppSettings.jsx'));
const EmailSettings = lazy(() => import('@/components/EmailSettings.jsx'));

/* ── Route guards ─────────────────────────────────────────────────────── */

// Shown while AuthContext is restoring the session from localStorage/
// sessionStorage on first load or a hard refresh.
function AuthLoading() {
  return <GifLoader />;
}

// Renders ONCE and stays mounted for every internal-app navigation — the
// sidebar/header (DashboardLayout) no longer unmounts + remounts on every
// route change the way the old per-route <Protected> wrapper caused (it
// was re-created inside a tree that App.jsx keyed by pathname, so every
// click fully tore down and rebuilt the whole layout: sidebar nav list,
// notification polling effect, section-bar computation, etc.). Now only
// the page content under <Outlet/> swaps, which is what actually needs
// to change between pages — this is what makes navigation feel instant.
function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <DashboardLayout>
      <AnimatedOutlet />
    </DashboardLayout>
  );
}

// Small opacity-only cross-fade on the page content itself. Deliberately
// cheap (no layout-shifting slide/scale) so it never becomes the
// bottleneck — this replaced the old app-wide "wait for exit, then
// mount" transition that used to block on every navigation.
function AnimatedOutlet() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}

// Wraps /login, /register, /forgot-password: an already-signed-in user
// skips straight to the dashboard instead of seeing the auth form again.
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

/* ── Router ───────────────────────────────────────────────────────────── */
export default function AppRoutes() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <Routes>
        {/* ── Public / auth ── */}
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />

        {/* ── Client portal (separate client-facing auth) ── */}
        <Route path="/client-portal" element={<Navigate to="/client-portal/login" replace />} />
        <Route path="/client-portal/login" element={<ClientPortalLogin />} />
        <Route path="/client-portal/dashboard" element={<ClientPortalDashboard />} />

        {/* ── Everything below shares ONE persistent DashboardLayout instance
            (mounted once by ProtectedLayout) instead of each page getting
            its own — this is the fix for sluggish page-to-page navigation. ── */}
        <Route element={<ProtectedLayout />}>

        {/* ── Core ── */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/todos" element={<TodoDashboard />} />
        <Route path="/todo" element={<Navigate to="/todos" replace />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/reminders" element={<Reminders />} />
        <Route path="/action-center" element={<ActionCenter />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/ai-reader" element={<AIDocumentReader />} />

        {/* ── Compliance ── */}
        <Route path="/compliance-dashboard" element={<ComplianceDashboard />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/gst-reconciliation" element={<GSTReconciliation />} />
        <Route path="/trademark-sphere" element={<TrademarkSphere />} />

        {/* ── Records ── */}
        <Route path="/records-dashboard" element={<RecordsDashboard />} />
        <Route path="/dsc" element={<DSCRegister />} />
        <Route path="/documents" element={<DocumentRegister />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/passwords" element={<PasswordRepository />} />

        {/* ── Client proposals ── */}
        <Route path="/client-proposals-dashboard" element={<ClientProposalsDashboard />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/quotations" element={<Quotations />} />

        {/* ── Accounts ── */}
        <Route path="/finix-dashboard" element={<FinixDashboard />} />
        <Route path="/invoicing" element={<Invoicing />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/bank-accounts" element={<BankAccounts />} />
        <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="/journal-entries" element={<JournalEntries />} />
        <Route path="/accounting-reports" element={<AccountingReports />} />
        <Route path="/zero-touch-entry" element={<ZeroTouchEntry />} />
        <Route path="/gst-portal-sync" element={<GSTPortalSync />} />
        <Route path="/accounting-integrity" element={<AccountingIntegrity />} />
        <Route path="/day-book" element={<ExtendedReports />} />
        <Route path="/cash-bank-book" element={<ExtendedReports />} />
        <Route path="/cash-flow" element={<ExtendedReports />} />
        <Route path="/outstanding-report" element={<ExtendedReports />} />
        <Route path="/bank-reconciliation" element={<ExtendedReports />} />
        <Route path="/depreciation" element={<ExtendedReports />} />
        <Route path="/tds-tcs" element={<ExtendedReports />} />
        <Route path="/financial-ratios" element={<ExtendedReports />} />
        <Route path="/comparative-report" element={<ExtendedReports />} />
        <Route path="/yearly-report" element={<ExtendedReports />} />
        <Route path="/opening-balances" element={<ExtendedReports />} />
        <Route path="/accounting-audit-trail" element={<ExtendedReports />} />
        <Route path="/bulk-import" element={<ExtendedReports />} />
        <Route path="/due-dates" element={<DueDates />} />
        <Route path="/import-invoices" element={<ImportInvoices />} />

        {/* ── Admin ── */}
        <Route path="/people-matrix" element={<PeopleMatrixDashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/task-audit" element={<TaskAudit />} />
        <Route path="/users" element={<Users />} />
        <Route path="/interviews" element={<Interviews />} />
        <Route path="/staff-activity" element={<StaffActivity />} />
        <Route path="/client-portal-manager/*" element={<ClientPortalManagerPage />} />
        <Route path="/whatsapp-hub" element={<WhatsAppHub />} />

        {/* ── Settings ── */}
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/general" element={<GeneralSettings />} />
        <Route path="/settings/email" element={<EmailSettings />} />
        <Route path="/settings/whatsapp" element={<WhatsAppSettings />} />

        </Route>

        {/* ── Root & fallback ── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
