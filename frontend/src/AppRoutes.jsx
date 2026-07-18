import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import DashboardLayout from '@/components/layout/DashboardLayout.jsx';
import GifLoader from '@/components/ui/GifLoader.jsx';

/* ── Auth pages (no sidebar) ─────────────────────────────────────────── */
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';

/* ── Client portal (its own auth flow, no admin sidebar) ────────────── */
import ClientPortalLogin from './pages/ClientPortalLogin.jsx';
import ClientPortalDashboard from './pages/ClientPortalDashboard.jsx';

/* ── Core ─────────────────────────────────────────────────────────────── */
import Dashboard from './pages/Dashboard.jsx';
import Tasks from './pages/Tasks.jsx';
import TodoDashboard from './pages/TodoDashboard.jsx';
import Attendance from './pages/Attendance.jsx';
import Reminders from './pages/Reminders.jsx';
import ActionCenter from './pages/ActionCenter.jsx';
import VisitsPage from './pages/VisitsPage.jsx';
import AIDocumentReader from './pages/AIDocumentReader.jsx';

/* ── Compliance ───────────────────────────────────────────────────────── */
import CompliancePage from './pages/CompliancePage.jsx';
import GSTReconciliation from './pages/GSTReconciliation.jsx';
import TrademarkSphere from './pages/TrademarkSphere.jsx';

/* ── Records ──────────────────────────────────────────────────────────── */
import DSCRegister from './pages/DSCRegister.jsx';
import DocumentRegister from './pages/DocumentsRegister.jsx';
import Clients from './pages/Clients.jsx';
import PasswordRepository from './pages/Passvault.jsx';

/* ── Client proposals ─────────────────────────────────────────────────── */
import LeadsPage from './pages/Leads.jsx';
import Quotations from './pages/Quotations.jsx';

/* ── Accounts (core + extended reports) ──────────────────────────────── */
import Invoicing from './pages/Invoicing.jsx';
import Purchase from './pages/Purchase.jsx';
import BankAccounts from './pages/BankAccounts.jsx';
import ChartOfAccounts from './pages/ChartOfAccounts.jsx';
import JournalEntries from './pages/JournalEntries.jsx';
import AccountingReports from './pages/AccountingReports.jsx';
import ZeroTouchEntry from './pages/ZeroTouchEntry.jsx';
import GSTPortalSync from './pages/GSTPortalSync.jsx';
import AccountingIntegrity from './pages/AccountingIntegrity.jsx';
import DayBook from './pages/DayBook.jsx';
import CashBankBook from './pages/CashBankBook.jsx';
import CashFlow from './pages/CashFlow.jsx';
import OutstandingReport from './pages/OutstandingReport.jsx';
import BankReconciliation from './pages/BankReconciliation.jsx';
import DepreciationSchedule from './pages/DepreciationSchedule.jsx';
import TDSTCSReport from './pages/TDSTCSReport.jsx';
import FinancialRatios from './pages/FinancialRatios.jsx';
import ComparativeReport from './pages/ComparativeReport.jsx';
import YearlyReport from './pages/YearlyReport.jsx';
import OpeningBalances from './pages/OpeningBalances.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import BulkImport from './pages/BulkImport.jsx';
import DueDates from './pages/DueDates.jsx';
import ImportInvoices from './pages/ImportInvoices.jsx';

/* ── Admin ────────────────────────────────────────────────────────────── */
import Reports from './pages/Reports.jsx';
import TaskAudit from './pages/TaskAudit.jsx';
import Users from './pages/Users.jsx';
import Interviews from './pages/Interviews.jsx';
import StaffActivity from './pages/StaffActivity.jsx';
import ClientPortalManagerPage from './pages/ClientPortalManagerPage.jsx';
import WhatsAppHub from './pages/WhatsAppHub.jsx';

/* ── Settings ─────────────────────────────────────────────────────────── */
import GeneralSettings from './pages/GeneralSettings.jsx';
import WhatsAppSettings from './pages/WhatsAppSettings.jsx';
import EmailSettings from '@/components/EmailSettings.jsx';

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
      <Route path="/invoicing" element={<Protected><Invoicing /></Protected>} />
      <Route path="/purchase" element={<Protected><Purchase /></Protected>} />
      <Route path="/bank-accounts" element={<Protected><BankAccounts /></Protected>} />
      <Route path="/chart-of-accounts" element={<Protected><ChartOfAccounts /></Protected>} />
      <Route path="/journal-entries" element={<Protected><JournalEntries /></Protected>} />
      <Route path="/accounting-reports" element={<Protected><AccountingReports /></Protected>} />
      <Route path="/zero-touch-entry" element={<Protected><ZeroTouchEntry /></Protected>} />
      <Route path="/gst-portal-sync" element={<Protected><GSTPortalSync /></Protected>} />
      <Route path="/accounting-integrity" element={<Protected><AccountingIntegrity /></Protected>} />
      <Route path="/day-book" element={<Protected><DayBook /></Protected>} />
      <Route path="/cash-bank-book" element={<Protected><CashBankBook /></Protected>} />
      <Route path="/cash-flow" element={<Protected><CashFlow /></Protected>} />
      <Route path="/outstanding-report" element={<Protected><OutstandingReport /></Protected>} />
      <Route path="/bank-reconciliation" element={<Protected><BankReconciliation /></Protected>} />
      <Route path="/depreciation" element={<Protected><DepreciationSchedule /></Protected>} />
      <Route path="/tds-tcs" element={<Protected><TDSTCSReport /></Protected>} />
      <Route path="/financial-ratios" element={<Protected><FinancialRatios /></Protected>} />
      <Route path="/comparative-report" element={<Protected><ComparativeReport /></Protected>} />
      <Route path="/yearly-report" element={<Protected><YearlyReport /></Protected>} />
      <Route path="/opening-balances" element={<Protected><OpeningBalances /></Protected>} />
      <Route path="/accounting-audit-trail" element={<Protected><AuditTrail /></Protected>} />
      <Route path="/bulk-import" element={<Protected><BulkImport /></Protected>} />
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
  );
}
