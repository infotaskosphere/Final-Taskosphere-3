import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";

/* Lazy Pages */
const Login = lazy(() => import("@/pages/Login"));
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

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

const PermissionRoute = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission))
    return <Navigate to="/dashboard" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
};

/* Routes */

function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-10">Loading...</div>}>
      <Routes>

        <Route path="/" element={
          <PublicRoute><Login /></PublicRoute>
        } />

        <Route path="/login" element={
          <PublicRoute><Login /></PublicRoute>
        } />

        <Route path="/register" element={
          <PublicRoute><Register /></PublicRoute>
        } />

        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />

        <Route path="/tasks" element={
          <ProtectedRoute><Tasks /></ProtectedRoute>
        } />

        <Route path="/dsc" element={
          <PermissionRoute permission="can_view_all_dsc">
            <DSCRegister />
          </PermissionRoute>
        } />

        <Route path="/documents" element={
          <PermissionRoute permission="can_view_documents">
            <DocumentsRegister />
          </PermissionRoute>
        } />

        <Route path="/attendance" element={
          <ProtectedRoute><Attendance /></ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute><Reports /></ProtectedRoute>
        } />

        <Route path="/clients" element={
          <ProtectedRoute><Clients /></ProtectedRoute>
        } />

        <Route path="/users" element={
          <PermissionRoute permission="can_view_user_page">
            <Users />
          </PermissionRoute>
        } />

        <Route path="/duedates" element={
          <ProtectedRoute><DueDates /></ProtectedRoute>
        } />

        <Route path="/staff-activity" element={
          <PermissionRoute permission="can_view_staff_activity">
            <StaffActivity />
          </PermissionRoute>
        } />

        <Route path="/chat" element={
          <PermissionRoute permission="can_use_chat">
            <Chat />
          </PermissionRoute>
        } />

        <Route path="/task-audit" element={
          <PermissionRoute permission="can_view_audit_logs">
            <Dashboard />
         </PermissionRoute>
        } />
        
        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
