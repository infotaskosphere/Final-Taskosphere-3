import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import DashboardLayout from '@/components/layout/DashboardLayout.jsx';
import ModuleGate from '@/components/ModuleGate.jsx';
import { PageGuard } from '@/components/governance/GovernanceGuards.jsx';
import GifLoader, { ContentLoader } from '@/components/ui/GifLoader.jsx';
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
const MISReport = lazy(() => import('./pages/MISReport.jsx'));
const SalarySlips = lazy(() => import('./pages/SalarySlips.jsx'));

/* ── Records ──────────────────────────────────────────────────────────── */
const ClientApprovals = lazy(() => import('./pages/ClientApprovals.jsx'));
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

const StaffActivity = lazy(() => import('./pages/StaffActivity.jsx'));
const ClientPortalManagerPage = lazy(() => import('./pages/ClientPortalManagerPage.jsx'));
const WhatsAppHub = lazy(() => import('./pages/WhatsAppHub.jsx'));

/* ── Governed modules (new pages — see backend/governed_modules.py) ─── */
const Leave = lazy(() => import('./pages/governed/Leave.jsx'));
const Payroll = lazy(() => import('./pages/governed/Payroll.jsx'));
const HR = lazy(() => import('./pages/governed/HR.jsx'));
const Recruitment = lazy(() => import('./pages/governed/Recruitment.jsx'));
const ClientDiscussion = lazy(() => import('./pages/governed/ClientDiscussion.jsx'));
const MasterData = lazy(() => import('./pages/governed/MasterData.jsx'));
const Roles = lazy(() => import('./pages/governed/Roles.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const PermissionMatrix = lazy(() => import('./pages/PermissionMatrix.jsx'));

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
      {/* Nested Suspense boundary: a not-yet-downloaded lazy page (e.g.
          Tasks.jsx, which is large) now only shows ContentLoader inside
          the content area while its chunk loads — the sidebar/header
          stay mounted and visible. Previously the ONLY Suspense boundary
          was the app-wide one in App.jsx using the full-screen GifLoader,
          so every first-visit navigation to a lazy page unmounted the
          entire DashboardLayout (sidebar and all) and replaced the whole
          screen with a loading overlay, then remounted everything from
          scratch once the chunk arrived — which is what made pages like
          Tasks (opened via "+ New Task", ?newTask=1) look like they
          "opened, then closed, then reopened": the real sequence was
          mount → suspend → full-screen overlay → remount, not a genuine
          dialog open/close. */}
      <Suspense fallback={<ContentLoader />}>
        <AnimatedOutlet />
      </Suspense>
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

// Admin module is role-gated only, not flag-gated (see backend/models.py
// MODULE_HIERARCHY["admin"] note) — every route under it uses this instead
// of ModuleGate.
function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user?.role?.toLowerCase() !== 'admin') return <Navigate to="/dashboard" replace />;
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

        {/* ── Core ──
            Every Taskosphere page is now individually admin-granted via its
            own can_view_X flag (see MODULE_HIERARCHY["taskosphere"] in
            backend/models.py) — same PageGuard pattern Client Portal Manager
            already used. Dashboard is the one exception: it's intentionally
            left un-gated here (no PageGuard) so that turning any page off
            can never create a redirect loop, since every denied PageGuard
            redirects to /dashboard. Its can_view_dashboard flag still
            controls whether the Dashboard link shows in the sidebar. */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tasks" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_tasks"><Tasks /></PageGuard></ModuleGate>} />
        <Route path="/todos" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_todo_dashboard"><TodoDashboard /></PageGuard></ModuleGate>} />
        <Route path="/todo" element={<Navigate to="/todos" replace />} />
        <Route path="/attendance" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_attendance"><Attendance /></PageGuard></ModuleGate>} />
        <Route path="/reminders" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_reminders"><Reminders /></PageGuard></ModuleGate>} />
        <Route path="/action-center" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_action_center"><ActionCenter /></PageGuard></ModuleGate>} />
        <Route path="/visits" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_client_visits"><VisitsPage /></PageGuard></ModuleGate>} />
        <Route path="/ai-reader" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_ai_document_reader"><AIDocumentReader /></PageGuard></ModuleGate>} />
        {/* Client Portal Manager — moved here from Admin; still individually
            admin-granted per user via can_view_client_portal (see
            MODULE_HIERARCHY["taskosphere"] in backend/models.py). */}
        <Route path="/client-portal-manager/*" element={<ModuleGate module="taskosphere"><PageGuard module="taskosphere" page="can_view_client_portal"><ClientPortalManagerPage /></PageGuard></ModuleGate>} />

        {/* ── Compliance ── */}
        <Route path="/compliance-dashboard" element={<ModuleGate module="compliance"><ComplianceDashboard /></ModuleGate>} />
        <Route path="/compliance" element={<ModuleGate module="compliance"><CompliancePage /></ModuleGate>} />
        <Route path="/gst-reconciliation" element={<ModuleGate module="compliance"><GSTReconciliation /></ModuleGate>} />
        <Route path="/trademark-sphere" element={<ModuleGate module="compliance"><TrademarkSphere /></ModuleGate>} />
        <Route path="/mis-report" element={<ModuleGate module="compliance"><PageGuard module="compliance" page="can_view_mis_report"><MISReport /></PageGuard></ModuleGate>} />
        <Route path="/salary-slips" element={<ModuleGate module="compliance"><PageGuard module="compliance" page="can_view_salary_slips"><SalarySlips /></PageGuard></ModuleGate>} />

        {/* ── Records ── */}
        <Route path="/records-dashboard" element={<ModuleGate module="records"><RecordsDashboard /></ModuleGate>} />
        <Route path="/client-approvals" element={<ModuleGate module="records"><ClientApprovals /></ModuleGate>} />
        <Route path="/dsc" element={<ModuleGate module="records"><DSCRegister /></ModuleGate>} />
        <Route path="/documents" element={<ModuleGate module="records"><DocumentRegister /></ModuleGate>} />
        <Route path="/clients" element={<ModuleGate module="records"><Clients /></ModuleGate>} />
        <Route path="/passwords" element={<ModuleGate module="records"><PasswordRepository /></ModuleGate>} />

        {/* ── Client proposals ── */}
        <Route path="/client-proposals-dashboard" element={<ModuleGate module="proposals"><ClientProposalsDashboard /></ModuleGate>} />
        <Route path="/leads" element={<ModuleGate module="proposals"><LeadsPage /></ModuleGate>} />
        <Route path="/quotations" element={<ModuleGate module="proposals"><Quotations /></ModuleGate>} />

        {/* ── Accounts ── */}
        <Route path="/finix-dashboard" element={<ModuleGate module="finix"><FinixDashboard /></ModuleGate>} />
        <Route path="/invoicing" element={<ModuleGate module="finix"><Invoicing /></ModuleGate>} />
        <Route path="/purchase" element={<ModuleGate module="finix"><Purchase /></ModuleGate>} />
        <Route path="/bank-accounts" element={<ModuleGate module="finix"><BankAccounts /></ModuleGate>} />
        <Route path="/chart-of-accounts" element={<ModuleGate module="finix"><ChartOfAccounts /></ModuleGate>} />
        <Route path="/journal-entries" element={<ModuleGate module="finix"><JournalEntries /></ModuleGate>} />
        <Route path="/accounting-reports" element={<ModuleGate module="finix"><AccountingReports /></ModuleGate>} />
        <Route path="/zero-touch-entry" element={<ModuleGate module="finix"><ZeroTouchEntry /></ModuleGate>} />
        <Route path="/gst-portal-sync" element={<ModuleGate module="finix"><GSTPortalSync /></ModuleGate>} />
        <Route path="/accounting-integrity" element={<ModuleGate module="finix"><AccountingIntegrity /></ModuleGate>} />
        <Route path="/day-book" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/cash-bank-book" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/cash-flow" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/outstanding-report" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/bank-reconciliation" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/depreciation" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/tds-tcs" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/financial-ratios" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/comparative-report" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/yearly-report" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/opening-balances" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/accounting-audit-trail" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/bulk-import" element={<ModuleGate module="finix"><ExtendedReports /></ModuleGate>} />
        <Route path="/due-dates" element={<ModuleGate module="finix"><DueDates /></ModuleGate>} />
        <Route path="/import-invoices" element={<ModuleGate module="finix"><ImportInvoices /></ModuleGate>} />

        {/* ── Admin ── */}
        <Route path="/people-matrix" element={<ModuleGate module="peopleMatrix"><PeopleMatrixDashboard /></ModuleGate>} />
        <Route path="/reports" element={<Reports />} />
        {/* Audit Logs & Unified Inbox are now admin-only in the nav (see
            DashboardLayout.jsx) — gate the routes themselves too, so a
            non-admin can't reach them just by typing the URL. */}
        <Route path="/task-audit" element={<AdminOnly><TaskAudit /></AdminOnly>} />
        <Route path="/users" element={<ModuleGate module="peopleMatrix"><Users /></ModuleGate>} />
        <Route path="/staff-activity" element={<StaffActivity />} />
        <Route path="/whatsapp-hub" element={<AdminOnly><WhatsAppHub /></AdminOnly>} />

        {/* ── People Matrix: Leave / Payroll / HR / Recruitment ── */}
        {/* Performance was removed — it duplicated /reports (see the Reports
            nav item above), which is the real, built-out reporting page. */}
        <Route path="/leave" element={<ModuleGate module="peopleMatrix"><PageGuard module="people_matrix" page="can_view_leave"><Leave /></PageGuard></ModuleGate>} />
        <Route path="/payroll" element={<ModuleGate module="peopleMatrix"><PageGuard module="people_matrix" page="can_view_payroll"><Payroll /></PageGuard></ModuleGate>} />
        <Route path="/hr" element={<ModuleGate module="peopleMatrix"><PageGuard module="people_matrix" page="can_view_hr"><HR /></PageGuard></ModuleGate>} />
        <Route path="/recruitment" element={<ModuleGate module="peopleMatrix"><PageGuard module="people_matrix" page="can_view_recruitment"><Recruitment /></PageGuard></ModuleGate>} />

        {/* ── Client Proposals: Client Discussion ── */}
        <Route path="/client-discussion" element={<ModuleGate module="proposals"><PageGuard module="proposals" page="can_view_client_discussion"><ClientDiscussion /></PageGuard></ModuleGate>} />

        {/* ── Admin: Dashboard / Permission Matrix / Master Data / Roles ──
            The Admin module is role-gated only (see MODULE_HIERARCHY["admin"]
            in backend/models.py) — AdminOnly below checks role directly
            instead of going through ModuleGate/PageGuard's flag lookups. ── */}
        <Route path="/admin-dashboard" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
        <Route path="/permission-matrix" element={<AdminOnly><PermissionMatrix /></AdminOnly>} />
        <Route path="/master-data" element={<AdminOnly><PageGuard module="admin" page="can_view_master_data"><MasterData /></PageGuard></AdminOnly>} />
        <Route path="/roles" element={<AdminOnly><PageGuard module="admin" page="can_view_roles"><Roles /></PageGuard></AdminOnly>} />

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
