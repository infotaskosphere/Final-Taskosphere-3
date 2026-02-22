import React from 'react';
import DocumentsRegister from "./pages/DocumentsRegister";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Toaster } from '@/components/ui/sonner';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Tasks from '@/pages/Tasks';
import DSCRegister from '@/pages/DSCRegister';
import Attendance from '@/pages/Attendance';
import Reports from '@/pages/Reports';
import Clients from '@/pages/Clients';
import Users from '@/pages/Users';
import DueDates from '@/pages/DueDates';
import StaffActivity from '@/pages/StaffActivity';
import Chat from '@/pages/Chat';
import '@/App.css';
// Protected Route (requires login)
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
};
// Public Route (redirects to dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};
const PermissionRoute = ({ permission, children }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If permission is defined, check it
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};
function AppRoutes() {
  return (
    <Routes>
      {/* Root → Login */}
      <Route
        path="/"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      {/* Login */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      {/* Register */}
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dsc"
        element={
          <PermissionRoute permission="can_view_all_dsc">
            <DSCRegister />
          </PermissionRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <PermissionRoute permission="can_view_documents">
            <DocumentsRegister />
          </PermissionRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Attendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <PermissionRoute permission="can_view_user_page">
            <Users />
          </PermissionRoute>
        }
      />
      <Route
        path="/duedates"
        element={
          <ProtectedRoute>
            <DueDates />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff-activity"
        element={
          <PermissionRoute permission="can_view_staff_activity">
            <StaffActivity />
          </PermissionRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <PermissionRoute permission="can_use_chat">
            <Chat />
          </PermissionRoute>
        }
      />
      {/* Catch-all: redirect unknown routes to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
export default App;
