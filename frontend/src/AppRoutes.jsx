import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import DashboardLayout from '@/components/layout/DashboardLayout.jsx';
import GifLoader from '@/components/ui/GifLoader.jsx';

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
const CompliancePage = lazy(() => import('./pages/CompliancePage.jsx'));
const GSTReconciliation = lazy(() => import('./pages/GSTReconciliation.jsx'));
const TrademarkSphere = lazy(() => import('./pages/TrademarkSphere.jsx'));

/* ── Records ──────────────────────────────────────────────────────────── */
const DSCRegister = lazy(() => import('./pages/DSCRegister.jsx'));
const DocumentRegister = lazy(() => import('./pages/DocumentsRegister.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const PasswordRepository = lazy(() => import('./pages/Passvault.jsx'));

/* ── Client proposals ─────────────────────────────────────────────────── */
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

// Wraps every internal app page: bounces unauthenticated users to /login
// and renders the shared sidebar + header (DashboardLayout) around the
// page. Per-module permission checks (e.g. Accounting Reports, Passwords,
// Users) are handled inside each page itself via RequestAccessGate /
// role checks, not here — this guard only enforces "is signed in".
function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
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

        {/* ── Core ── */}
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/tasks" element={<Protected><Tasks /></Protected>} />
        <Route path="/todos" element={<Protected><TodoDashboard /></Protected>} />
        <Route path="/todo" element={<Navigate to="/todos" replace />} />
        <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
        <Route path="/reminders" element={<Protected><Reminders /></Protected>} />
        <Route path="/action-center" element={<Protected><ActionCenter /></Protected>} />
        <Route path="/visits" element={<Protected><VisitsPage /></Protected>} />
        <Route path="/ai-reader" element={<Protected><AIDocumentReader /></Protected>} />

        {/* ── Compliance ── */}
        <Route path="/compliance" element={<Protected><CompliancePage /></Protected>} />
        <Route path="/gst-reconciliation" element={<Protected><GSTReconciliation /></Protected>} />
        <Route path="/trademark-sphere" element={<Protected><TrademarkSphere /></Protected>} />

        {/* ── Records ── */}
        <Route path="/dsc" element={<Protected><DSCRegister /></Protected>} />
        <Route path="/documents" element={<Protected><DocumentRegister /></Protected>} />
        <Route path="/clients" element={<Protected><Clients /></Protected>} />
        <Route path="/passwords" element={<Protected><PasswordRepository /></Protected>} />

        {/* ── Client proposals ── */}
        <Route path="/leads" element={<Protected><LeadsPage /></Protected>} />
        <Route path="/quotations" element={<Protected><Quotations /></Protected>} />

        {/* ── Accounts ── */}
        <Route path="/finix-dashboard" element={<Protected><FinixDashboard /></Protected>} />
        <Route path="/invoicing" element={<Protected><Invoicing /></Protected>} />
        <Route path="/purchase" element={<Protected><Purchase /></Protected>} />
        <Route path="/bank-accounts" element={<Protected><BankAccounts /></Protected>} />
        <Route path="/chart-of-accounts" element={<Protected><ChartOfAccounts /></Protected>} />
        <Route path="/journal-entries" element={<Protected><JournalEntries /></Protected>} />
        <Route path="/accounting-reports" element={<Protected><AccountingReports /></Protected>} />
        <Route path="/zero-touch-entry" element={<Protected><ZeroTouchEntry /></Protected>} />
        <Route path="/gst-portal-sync" element={<Protected><GSTPortalSync /></Protected>} />
        <Route path="/accounting-integrity" element={<Protected><AccountingIntegrity /></Protected>} />
        <Route path="/day-book" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/cash-bank-book" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/cash-flow" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/outstanding-report" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/bank-reconciliation" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/depreciation" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/tds-tcs" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/financial-ratios" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/comparative-report" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/yearly-report" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/opening-balances" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/accounting-audit-trail" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/bulk-import" element={<Protected><ExtendedReports /></Protected>} />
        <Route path="/due-dates" element={<Protected><DueDates /></Protected>} />
        <Route path="/import-invoices" element={<Protected><ImportInvoices /></Protected>} />

        {/* ── Admin ── */}
        <Route path="/reports" element={<Protected><Reports /></Protected>} />
        <Route path="/task-audit" element={<Protected><TaskAudit /></Protected>} />
        <Route path="/users" element={<Protected><Users /></Protected>} />
        <Route path="/interviews" element={<Protected><Interviews /></Protected>} />
        <Route path="/staff-activity" element={<Protected><StaffActivity /></Protected>} />
        <Route path="/client-portal-manager/*" element={<Protected><ClientPortalManagerPage /></Protected>} />
        <Route path="/whatsapp-hub" element={<Protected><WhatsAppHub /></Protected>} />

        {/* ── Settings ── */}
        <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="/settings/general" element={<Protected><GeneralSettings /></Protected>} />
        <Route path="/settings/email" element={<Protected><EmailSettings /></Protected>} />
        <Route path="/settings/whatsapp" element={<Protected><WhatsAppSettings /></Protected>} />

        {/* ── Root & fallback ── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
