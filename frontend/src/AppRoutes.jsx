import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";

/* Lazy Pages */
const Login = lazy(() => import("@/pages/Login"));
const TaskAudit = lazy(() => import("@/pages/TaskAudit"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const DSCRegister = lazy(() => import("@/pages/DSCRegister"));
const DocumentsRegister = lazy(() => import("@/pages/DocumentsRegister"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Reports = lazy(() => import("@/pages/Reports"));
const Clients = lazy(() => import("@/pages/Clients"));
const Users = lazy(() => import("@/pages/Users"));
const DueDates = lazy(() => import("@/pages/DueDates"));
const StaffActivity = lazy(() => import("@/pages/StaffActivity"));
const Chat = lazy(() => import("@/pages/Chat"));

/* Route Guards */

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

/* Main Routes */

function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <Routes>

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

        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />

        <Route
          path="/tasks"
          element={
            <Protected>
              <Tasks />
            </Protected>
          }
        />

        <Route
          path="/dsc"
          element={
            <Permission permission="can_view_all_dsc">
              <DSCRegister />
            </Permission>
          }
        />

        <Route
          path="/documents"
          element={
            <Permission permission="can_view_documents">
              <DocumentsRegister />
            </Permission>
          }
        />

        <Route
          path="/attendance"
          element={
            <Protected>
              <Attendance />
            </Protected>
          }
        />

        <Route
          path="/reports"
          element={
            <Protected>
              <Reports />
            </Protected>
          }
        />

        <Route
          path="/clients"
          element={
            <Protected>
              <Clients />
            </Protected>
          }
        />

        <Route
          path="/users"
          element={
            <Permission permission="can_view_user_page">
              <Users />
            </Permission>
          }
        />

        <Route
          path="/duedates"
          element={
            <Protected>
              <DueDates />
            </Protected>
          }
        />

        <Route
          path="/staff-activity"
          element={
            <Permission permission="can_view_staff_activity">
              <StaffActivity />
            </Permission>
          }
        />

        <Route
          path="/chat"
          element={
            <Permission permission="can_use_chat">
              <Chat />
            </Permission>
          }
        />

        <Route
          path="/task-audit"
          element={
            <Permission permission="can_view_audit_logs">
              <TaskAudit />
            </Permission>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
