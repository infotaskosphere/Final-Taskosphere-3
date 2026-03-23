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
  MapPin,
  Settings,
  Mail,
  Receipt,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  lightBlue: '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};

const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 72;

const NAV_GROUPS = [
  {
    id: 'core',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
      { path: '/todos', icon: CheckSquare, label: 'To Do' },
      { path: '/attendance', icon: Clock, label: 'Attendance' },
      { path: '/duedates', icon: Calendar, label: 'Compliance Calendar' },
      { path: '/visits', icon: MapPin, label: 'Client Visits' },
    ],
  },
  {
    id: 'records',
    dividerLabel: 'Records',
    items: [
      { path: '/dsc', icon: FileText, label: 'DSC Register', permission: 'can_view_all_dsc' },
      { path: '/documents', icon: FileText, label: 'Document Register', permission: 'can_view_documents' },
      { path: '/clients', icon: Users, label: 'Clients', permission: 'can_view_all_clients' },
    ],
  },
  {
    id: 'admin',
    dividerLabel: 'Admin',
    items: [
      { path: '/staff-activity', icon: Activity, label: 'Staff Activity', permission: 'can_view_staff_activity' },
      { path: '/reports', icon: BarChart3, label: 'Reports' },
      { path: '/task-audit', icon: Activity, label: 'Task Audit Log', permission: 'can_view_audit_logs' },
      { path: '/users', icon: Users, label: 'Users', permission: 'can_view_user_page' },
    ],
  },
  {
    id: 'proposals',
    dividerLabel: 'Client Proposals',
    items: [
      { path: '/leads', icon: Target, label: 'Lead Management', permission: 'can_view_all_leads' },
      { path: '/quotations', icon: Receipt, label: 'Quotations', permission: 'can_create_quotations' },
    ],
  },
  {
    id: 'settings',
    dividerLabel: 'Settings',
    items: [
      { path: '/settings/email', icon: Mail, label: 'Email Accounts' },
      { path: '/settings', icon: Settings, label: 'General Settings' },
    ],
  },
];

const springSnap = { type: 'spring', stiffness: 500, damping: 28 };
const springMed = { type: 'spring', stiffness: 400, damping: 24 };
const springSoft = { type: 'spring', stiffness: 300, damping: 20 };

const DashboardLayout = ({ children }) => {
  const { user, logout, hasPermission, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  // ── Responsive detection ──────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(false); // Never collapse on mobile
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const sidebarWidth = isMobile ? '100%' : (collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED);
  const headerOffset = isMobile ? 0 : (collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useActivityTracker(true);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-user-menu]')) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  if (loading) return null;

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login', { replace: true });
  };

  const allNavItems = NAV_GROUPS.flatMap((g) => g.items);
  const visibleNavItems = allNavItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );
  const activeLabel = visibleNavItems.find((i) => i.path === location.pathname)?.label || 'Dashboard';

  // ── Sidebar Nav Item ──────────────────────────────────────────────────────
  const NavItem = ({ item }) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    return (
      <motion.div
        whileHover={{ x: collapsed && !isMobile ? 0 : 4 }}
        whileTap={{ scale: 0.97 }}
        transition={springSnap}
      >
        <Link
          to={item.path}
          onClick={() => {
            if (isMobile) setSidebarOpen(false);
          }}
          title={collapsed && !isMobile ? item.label : undefined}
          className={`
            group relative flex items-center
            ${isMobile || !collapsed ? 'gap-3.5 px-4 py-3.5' : 'justify-center px-0 py-3.5'}
            rounded-xl transition-all duration-200 touch-manipulation
            ${isActive
              ? 'text-white bg-gradient-to-r from-[#0D3B66] to-[#1F6FB2] shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 dark:hover:bg-slate-700/40'
            }
          `}
        >
          <Icon
            className={`
              flex-shrink-0 transition-colors
              ${isMobile ? 'h-5 w-5' : collapsed ? 'h-6 w-6' : 'h-4.5 w-4.5'}
              ${isActive ? 'text-white' : 'group-hover:text-slate-200'}
            `}
          />
          {(isMobile || !collapsed) && (
            <span className="font-medium text-sm sm:text-base tracking-tight">
              {item.label}
            </span>
          )}

          {/* Collapsed tooltip (desktop only) */}
          {collapsed && !isMobile && (
            <div
              className="
                pointer-events-none absolute left-full ml-4 px-3 py-2
                bg-slate-900 text-white text-sm font-medium rounded-lg
                opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0
                transition-all duration-200 shadow-xl z-50 whitespace-nowrap
              "
            >
              {item.label}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-6 border-transparent border-r-slate-900" />
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  // ── Nav Divider ───────────────────────────────────────────────────────────
  const NavDivider = ({ label }) => (
    <div className={`my-5 ${collapsed && !isMobile ? 'px-2' : 'px-4'}`}>
      {label && !(collapsed && !isMobile) ? (
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">
          {label}
        </p>
      ) : (
        <div className="border-t border-slate-200/60 dark:border-slate-700/50 mx-2" />
      )}
    </div>
  );

  return (
    <div className={`min-h-screen relative ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:relative
        `}
        style={{
          width: sidebarWidth,
          background: isDark ? '#0f172a' : '#ffffff',
          borderRight: isMobile ? 'none' : (isDark ? '1px solid #334155' : '1px solid #e2e8f0'),
          boxShadow: isMobile ? 'none' : '4px 0 20px rgba(0,0,0,0.08)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Logo / header area */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}
        >
          <img
            src="/logo.png"
            alt="Taskosphere"
            className="h-9 sm:h-10 object-contain"
          />

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-10 w-10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          {!isMobile && (
            <motion.button
              onClick={() => setCollapsed((prev) => !prev)}
              className={`
                hidden lg:flex items-center justify-center h-9 w-9 rounded-lg
                ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}
              `}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              transition={springMed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </motion.button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 sm:px-3 py-5 overflow-y-auto scrollbar-thin space-y-1">
          {NAV_GROUPS.map((group, gi) => (
            <React.Fragment key={group.id}>
              {gi > 0 && <NavDivider label={group.dividerLabel} />}
              {group.items.map((item) => (
                <NavItem key={item.path} item={item} />
              ))}
            </React.Fragment>
          ))}
        </nav>

        {/* User profile footer – always visible on mobile */}
        <div
          className="p-4 border-t flex-shrink-0"
          style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-slate-200/60 dark:ring-slate-600/60">
              {user?.profile_picture ? (
                <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-white font-semibold text-base"
                  style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                >
                  {user?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className={`font-medium text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {user?.full_name}
              </p>
              <p className={`text-xs truncate mt-0.5 capitalize ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Header ── */}
      <header
        className="fixed top-0 right-0 left-0 z-40 transition-all duration-300"
        style={{
          left: isMobile ? 0 : `${headerOffset}px`,
          height: 'var(--header-height, 64px)',
          background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="flex items-center justify-between h-full px-4 sm:px-6">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden -ml-1.5 h-11 w-11"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>

          {/* Page title – centered on mobile */}
          <div className="absolute left-1/2 -translate-x-1/2 font-medium text-base sm:text-lg lg:hidden">
            {activeLabel}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <NotificationBell />

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 sm:h-11 sm:w-11 rounded-full"
              onClick={() => setIsDark((prev) => !prev)}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            {/* User menu trigger */}
            <div className="relative" data-user-menu>
              <Button
                variant="ghost"
                className="h-10 w-10 sm:h-11 sm:w-11 p-0.5 rounded-full"
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <div className="w-full h-full rounded-full overflow-hidden ring-1 ring-slate-200/40 dark:ring-slate-600/40">
                  {user?.profile_picture ? (
                    <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white font-semibold text-base"
                      style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                    >
                      {user?.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
              </Button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -8 }}
                    transition={springSoft}
                    className="absolute right-0 mt-2 w-64 sm:w-72 z-50 overflow-hidden rounded-2xl shadow-2xl"
                    style={{
                      background: isDark ? '#0f172a' : '#ffffff',
                      border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    }}
                  >
                    {/* User info */}
                    <div className="p-5 border-b" style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl overflow-hidden ring-2 ring-slate-200/40 dark:ring-slate-600/40 flex-shrink-0">
                          {user?.profile_picture ? (
                            <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
                              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                            >
                              {user?.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`font-semibold text-base truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                            {user?.full_name}
                          </p>
                          <p className={`text-sm truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Logout */}
                    <div className="p-2">
                      <motion.button
                        onClick={handleLogout}
                        whileHover={{ x: 4 }}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                          ${isDark ? 'text-red-400 hover:bg-red-950/30' : 'text-red-600 hover:bg-red-50'}
                        `}
                      >
                        <LogOut className="h-4.5 w-4.5" />
                        Sign out
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div
        className="flex flex-col min-h-screen transition-all duration-300"
        style={{
          marginLeft: isMobile ? 0 : `${headerOffset}px`,
          paddingTop: 'var(--header-height, 64px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <main className="flex-1">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-5 md:px-6 lg:px-8 py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
