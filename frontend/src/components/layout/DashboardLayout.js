
import React, { useState, useEffect, useCallback } from 'react';
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
  Calendar,
  Activity,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import { toast } from 'sonner';
import { motion } from "framer-motion";

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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useActivityTracker(true);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', collapsed.toString());
  }, [collapsed]);

  const handleResize = useCallback(() => {
    if (window.innerWidth < 1024) {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
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
    { path: '/todos', icon: CheckSquare, label: 'To Do' },
    { path: '/attendance', icon: Clock, label: 'Attendance' },
    { path: '/duedates', icon: Calendar, label: 'Compliance Calendar' },
    { path: '/dsc', icon: FileText, label: 'DSC Register', permission: 'can_view_all_dsc' },
    { path: '/documents', icon: FileText, label: 'Document Register', permission: 'can_view_documents' },
    { path: '/clients', icon: Users, label: 'Clients', permission: 'can_view_all_clients' },
    { path: '/staff-activity', icon: Activity, label: 'Staff Activity', permission: 'can_view_staff_activity' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
    { path: '/task-audit', icon: Activity, label: 'Task Audit Log', permission: 'can_view_audit_logs' },
    { path: '/leads', icon: Target, label: 'Lead Management', permission: 'can_view_all_leads' },
    { path: '/users', icon: Users, label: 'Users', permission: 'can_view_user_page' },
  ];

  const visibleNavItems = navItems.filter(
    item => !item.permission || hasPermission(item.permission)
  );

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[260px]';
  const contentMargin = collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]';

  return (
    <div className={`min-h-screen relative ${isDark ? 'bg-[#0f172a]' : 'bg-[#F4F6FA]'}`}>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-full ${sidebarWidth}
          z-50 flex flex-col
          transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          boxShadow: '4px 0 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Logo Area */}
        <div
          className="flex items-center justify-between px-4 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9' }}
        >
          {/* Logo only — no text, centred when collapsed, left-aligned when expanded */}
          <div className={`flex items-center overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
            <img
              src="/logo.png"
              alt="Taskosphere"
              className={`object-contain transition-all duration-300 ${collapsed ? 'h-9 w-9' : 'h-12'}`}
            />
          </div>

          {!collapsed && (
            <motion.button
              onClick={() => setCollapsed(prev => !prev)}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex-shrink-0"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400 }}
              aria-label="Collapse sidebar"
              aria-expanded={true}
            >
              <PanelLeftClose size={16} />
            </motion.button>
          )}
          {collapsed && (
            <motion.button
              onClick={() => setCollapsed(prev => !prev)}
              className="hidden lg:flex absolute right-1 top-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400 }}
              aria-label="Expand sidebar"
              aria-expanded={false}
            >
              <PanelLeftOpen size={16} />
            </motion.button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-none">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <React.Fragment key={item.path}>
                {item.path === '/staff-activity' && (
                  <div className="my-3 mx-1" style={{ borderTop: '1px solid #e2e8f0' }} />
                )}

                <motion.div
                  whileHover={{ x: collapsed ? 0 : 4 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <Link
                    to={item.path}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarOpen(false);
                    }}
                    title={collapsed ? item.label : undefined}
                    className={`
                      relative flex items-center gap-3
                      ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
                      rounded-xl transition-all duration-200
                      ${isActive
                        ? 'text-white'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }
                    `}
                    style={isActive ? {
                      background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
                      boxShadow: `0 4px 12px rgba(13,59,102,0.25)`,
                    } : {}}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full" style={{ background: COLORS.mediumBlue }} />
                    )}
                    <Icon className={`flex-shrink-0 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'} ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    {!collapsed && (
                      <span className="font-medium text-sm whitespace-nowrap tracking-tight">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </motion.div>
              </React.Fragment>
            );
          })}
        </nav>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className={`${contentMargin} transition-all duration-300 ease-in-out min-h-screen flex flex-col`}>

        {/* Header — always white background for full logo visibility & branding */}
        <header
          className="sticky top-0 z-40 flex-shrink-0 bg-white"
          style={{
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center justify-between px-5 md:px-7 h-14">

            {/* Mobile Menu Button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(prev => !prev)}
                className="lg:hidden h-9 w-9 rounded-lg text-slate-600"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </motion.div>

            {/* Page Title (desktop) */}
            <div className="hidden lg:block">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">
                {visibleNavItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}
              </span>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <NotificationBell />

              {/* Theme Toggle */}
              <motion.button
                onClick={() => setIsDark(prev => !prev)}
                className={`h-9 w-9 rounded-xl flex items-center justify-center border transition-all ${
                  isDark
                    ? 'bg-slate-800 border-slate-600 text-amber-400 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                }`}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400 }}
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.button>

              {/* User Dropdown */}
              <div className="relative">
                <motion.button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200">
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-semibold text-xs"
                        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                      >
                        {user?.full_name?.[0]?.toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                  <span className="hidden md:block text-sm font-semibold text-slate-700">
                    {user?.full_name?.split(' ')[0]}
                  </span>
                  <motion.div
                    animate={{ rotate: userMenuOpen ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </motion.div>
                </motion.button>

                {userMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white rounded-2xl py-1.5 z-50"
                    style={{
                      boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-slate-100">
                          {user?.profile_picture ? (
                            <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white font-semibold text-sm"
                              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                            >
                              {user?.full_name?.[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-800">{user?.full_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors mt-1"
                    >
                      <LogOut className="h-4 w-4" />
                      <span className="font-medium">Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 md:p-7">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
};

export default DashboardLayout;
