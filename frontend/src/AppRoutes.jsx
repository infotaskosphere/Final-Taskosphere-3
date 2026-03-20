import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";

/* Lazy Pages */
const Login             = lazy(() => import("@/pages/Login"));
const TaskAudit         = lazy(() => import("@/pages/TaskAudit"));
const Register          = lazy(() => import("@/pages/Register"));
const Dashboard         = lazy(() => import("@/pages/Dashboard"));
const Tasks             = lazy(() => import("@/pages/Tasks"));
const TodoDashboard     = lazy(() => import("@/pages/TodoDashboard"));
const DSCRegister       = lazy(() => import("@/pages/DSCRegister"));
const DocumentsRegister = lazy(() => import("@/pages/DocumentsRegister"));
const Attendance        = lazy(() => import("@/pages/Attendance"));
const Reports           = lazy(() => import("@/pages/Reports"));
const Clients           = lazy(() => import("@/pages/Clients"));
const Users             = lazy(() => import("@/pages/Users"));
const DueDates          = lazy(() => import("@/pages/DueDates"));
const StaffActivity     = lazy(() => import("@/pages/StaffActivity"));
const LeadsPage         = lazy(() => import("@/pages/Leads"));
const VisitsPage        = lazy(() => import("@/pages/VisitsPage"));
const EmailSettings     = lazy(() => import("@/components/EmailSettings"));
const GeneralSettings   = lazy(() => import("@/components/GeneralSettings")); // ✅ ADDED

/* ── Route Guards ─────────────────────────────────────────────────────────── */

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

const Public = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

const Permission = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
};

/* ── Main Routes ──────────────────────────────────────────────────────────── */

function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <Routes>

        {/* Public Routes */}
        <Route
          path="/"
          element={
            <Public>
              <Login />
            </Public>
          }
        />

        <Route
          path="/login"
          element={
            <Public>
              <Login />
            </Public>
          }
        />

        <Route
          path="/register"
          element={
            <Public>
              <Register />
            </Public>
          }
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />

        {/* Tasks */}
        <Route
          path="/tasks"
          element={
            <Protected>
              <Tasks />
            </Protected>
          }
        />

        {/* Todo Dashboard */}
        <Route
          path="/todos"
          element={
            <Protected>
              <TodoDashboard />
            </Protected>
          }
        />

        {/* DSC */}
        <Route
          path="/dsc"
          element={
            <Permission permission="can_view_all_dsc">
              <DSCRegister />
            </Permission>
          }
        />

        {/* Documents */}
        <Route
          path="/documents"
          element={
            <Permission permission="can_view_documents">
              <DocumentsRegister />
            </Permission>
          }
        />

        {/* Attendance */}
        <Route
          path="/attendance"
          element={
            <Protected>
              <Attendance />
            </Protected>
          }
        />

        {/* Reports */}
        <Route
          path="/reports"
          element={
            <Protected>
              <Reports />
            </Protected>
          }
        />

        {/* Clients */}
        <Route
          path="/clients"
          element={
            <Protected>
              <Clients />
            </Protected>
          }
        />

        {/* Users */}
        <Route
          path="/users"
          element={
            <Permission permission="can_view_user_page">
              <Users />
            </Permission>
          }
        />

        {/* Leads Management */}
        <Route
          path="/leads"
          element={
            <Permission permission="can_view_all_leads">
              <LeadsPage />
            </Permission>
          }
        />

        {/* Due Dates */}
        <Route
          path="/duedates"
          element={
            <Protected>
              <DueDates />
            </Protected>
          }
        />

        {/* Staff Activity */}
        <Route
          path="/staff-activity"
          element={
            <Permission permission="can_view_staff_activity">
              <StaffActivity />
            </Permission>
          }
        />

        {/* Task Audit */}
        <Route
          path="/task-audit"
          element={
            <Permission permission="can_view_audit_logs">
              <TaskAudit />
            </Permission>
          }
        />

        {/* Email Account Settings */}
        <Route
          path="/settings/email"
          element={
            <Protected>
              <EmailSettings />
            </Protected>
          }
        />

        {/* ✅ FIX: General Settings — was missing, caused redirect to dashboard */}
        <Route
          path="/settings/general"
          element={
            <Protected>
              <GeneralSettings />
            </Protected>
          }
        />

        {/* ✅ /settings alone → redirect to general settings */}
        <Route
          path="/settings"
          element={<Navigate to="/settings/general" replace />}
        />

        {/* Client Visits */}
        <Route
          path="/visits"
          element={
            <Protected>
              <VisitsPage />
            </Protected>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
