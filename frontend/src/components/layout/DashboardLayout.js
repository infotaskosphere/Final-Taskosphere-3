import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import {
  LayoutDashboard,
  CheckSquare,
  FileText,
  Clock,
  BarChart3,
  Users,
  LogOut,
  Menu,
  Building2,
  Calendar,
  Activity,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import { toast } from 'sonner';

const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  lightBlue: '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

const DashboardLayout = ({ children }) => {
  const { user, logout, hasPermission, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useActivityTracker(true);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) return null;
  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/login", { replace: true });
  };

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/todos', icon: CheckSquare, label: 'Todo Dashboard' },
    { path: '/clients', icon: Building2, label: 'Clients' },
    { path: '/attendance', icon: Clock, label: 'Attendance' },
    { path: '/duedates', icon: Calendar, label: 'Compliance Calendar' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
    { path: '/dsc', icon: FileText, label: 'DSC Register', permission: 'can_view_all_dsc' },
    { path: '/documents', icon: FileText, label: 'Documents Register', permission: 'can_view_documents' },
    { path: '/users', icon: Users, label: 'Users', permission: 'can_view_user_page' },
    { path: '/staff-activity', icon: Activity, label: 'Staff Activity', permission: 'can_view_staff_activity' },
    { path: '/task-audit', icon: Activity, label: 'Task Audit Log', permission: 'can_view_audit_logs' },
  ];

  const visibleNavItems = navItems.filter(item =>
    !item.permission || hasPermission(item.permission)
  );

  return (
    <div className="min-h-screen bg-slate-50 relative">

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-72
          bg-gradient-to-b from-blue-50 via-sky-50 to-cyan-50
          border-r shadow-xl z-50
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">

          {/* Logo */}
          <div className="py-6 flex justify-center border-b">
            <img src="/logo.png" alt="Taskosphere" className="h-14 object-contain" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all
                    ${isActive
                      ? 'text-white shadow-md'
                      : 'text-slate-700 hover:bg-blue-100'
                    }`}
                  style={
                    isActive
                      ? {
                          background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`
                        }
                      : {}
                  }
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-72 transition-all duration-300">

        {/* Header */}
        <header className="sticky top-0 bg-white border-b z-40">
          <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(prev => !prev)}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex items-center space-x-4">
              <NotificationBell />

              {/* User Menu */}
              <div className="relative z-50">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-full hover:bg-slate-100"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`
                    }}
                  >
                    {user?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>

                  <span className="hidden md:block font-semibold">
                    {user?.full_name}
                  </span>

                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      userMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border py-2">
                    <div className="px-4 py-3 border-b">
                      <p className="font-semibold text-sm">{user?.full_name}</p>
                      <p className="text-xs text-slate-500">{user?.email}</p>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
};

export default DashboardLayout;
