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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  lightBlue:   '#E0F2FE',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
};

// ── Nav item groups — makes the sidebar easier to extend ─────────────────────
const NAV_GROUPS = [
  {
    id: 'core',
    items: [
      { path: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'           },
      { path: '/tasks',      icon: CheckSquare,     label: 'Tasks'               },
      { path: '/todos',      icon: CheckSquare,     label: 'To Do'               },
      { path: '/attendance', icon: Clock,           label: 'Attendance'          },
      { path: '/duedates',   icon: Calendar,        label: 'Compliance Calendar' },
      { path: '/visits',     icon: MapPin,          label: 'Client Visits'       },
    ],
  },
  {
    id: 'records',
    dividerLabel: 'Records',
    items: [
      { path: '/dsc',       icon: FileText, label: 'DSC Register',      permission: 'can_view_all_dsc'        },
      { path: '/documents', icon: FileText, label: 'Document Register', permission: 'can_view_documents'      },
      { path: '/clients',   icon: Users,    label: 'Clients',           permission: 'can_view_all_clients'    },
      { path: '/leads',     icon: Target,   label: 'Lead Management',   permission: 'can_view_all_leads'      },
    ],
  },
  {
    id: 'admin',
    dividerLabel: 'Admin',
    items: [
      { path: '/staff-activity', icon: Activity, label: 'Staff Activity', permission: 'can_view_staff_activity' },
      { path: '/reports',        icon: BarChart3, label: 'Reports'                                              },
      { path: '/task-audit',     icon: Activity,  label: 'Task Audit Log', permission: 'can_view_audit_logs'   },
      { path: '/users',          icon: Users,     label: 'Users',          permission: 'can_view_user_page'    },
    ],
  },
];

const springSnap = { type: 'spring', stiffness: 500, damping: 28 };
const springMed  = { type: 'spring', stiffness: 400, damping: 24 };
const springSoft = { type: 'spring', stiffness: 300, damping: 20 };

const DashboardLayout = ({ children }) => {
  const { user, logout, hasPermission, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed]     = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDark, setIsDark]             = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useActivityTracker(true);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  const handleResize = useCallback(() => {
    if (window.innerWidth < 1024) setCollapsed(false);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;
    const handle = (e) => {
      if (!e.target.closest('[data-user-menu]')) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
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

  // ── Flatten visible items for header breadcrumb lookup ────────────────────
  const allNavItems = NAV_GROUPS.flatMap(g => g.items);
  const visibleNavItems = allNavItems.filter(
    item => !item.permission || hasPermission(item.permission)
  );
  const activeLabel = visibleNavItems.find(i => i.path === location.pathname)?.label || 'Dashboard';

  const sidebarWidth  = collapsed ? 'w-[72px]'  : 'w-[260px]';
  const contentMargin = collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]';

  // ── Sidebar nav item renderer ─────────────────────────────────────────────
  const NavItem = ({ item }) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    const isActive = location.pathname === item.path;
    const Icon     = item.icon;

    return (
      <motion.div
        whileHover={{ x: collapsed ? 0 : 3 }}
        whileTap={{ scale: 0.97 }}
        transition={springSnap}
      >
        <Link
          to={item.path}
          onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
          title={collapsed ? item.label : undefined}
          className={`
            relative flex items-center gap-3
            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
            rounded-xl transition-all duration-200 group
            ${isActive
              ? 'text-white'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 dark:hover:text-slate-200 dark:hover:bg-slate-700/60'
            }
          `}
          style={isActive ? {
            background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
            boxShadow:  `0 4px 14px rgba(13,59,102,0.28)`,
          } : {}}
        >
          {/* Active left accent */}
          {isActive && !collapsed && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
              style={{ background: 'rgba(255,255,255,0.6)' }}
            />
          )}

          <Icon
            className={`flex-shrink-0 transition-colors ${
              collapsed ? 'h-5 w-5' : 'h-4 w-4'
            } ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}
          />

          {!collapsed && (
            <span className="font-medium text-sm whitespace-nowrap tracking-tight">
              {item.label}
            </span>
          )}

          {/* Collapsed tooltip */}
          {collapsed && (
            <div className="
              absolute left-full ml-3 px-2.5 py-1.5
              bg-slate-800 dark:bg-slate-700 text-white text-xs font-medium
              rounded-lg whitespace-nowrap pointer-events-none
              opacity-0 group-hover:opacity-100
              translate-x-1 group-hover:translate-x-0
              transition-all duration-200 z-[100]
              shadow-lg
            ">
              {item.label}
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800 dark:border-r-slate-700" />
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  // ── Divider with optional label ───────────────────────────────────────────
  const NavDivider = ({ label }) => (
    <div className={`mt-4 mb-2 ${collapsed ? 'px-2' : 'px-3'}`}>
      {!collapsed && label ? (
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
          {label}
        </p>
      ) : (
        <div className="border-t border-slate-100 dark:border-slate-700/60 mx-1" />
      )}
    </div>
  );

  return (
    <div className={`min-h-screen relative ${isDark ? 'bg-[#0f172a]' : 'bg-[#F4F6FA]'}`}>

      {/* ── Mobile Overlay ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-full ${sidebarWidth}
          z-50 flex flex-col
          transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        style={{
          background:   isDark ? '#1e293b' : '#ffffff',
          borderRight:  isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow:    '4px 0 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* ── Logo Area ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-4 flex-shrink-0"
          style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
        >
          <div className={`flex items-center overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
            <img
              src="/logo.png"
              alt="Taskosphere"
              className={`object-contain transition-all duration-300 ${collapsed ? 'h-9 w-9' : 'h-12'}`}
            />
          </div>

          {/* Collapse / Expand toggle */}
          <motion.button
            onClick={() => setCollapsed(prev => !prev)}
            className={`
              hidden lg:flex p-1.5 rounded-lg transition-all flex-shrink-0
              ${isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }
              ${collapsed ? 'absolute right-1 top-[18px]' : ''}
            `}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={springMed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </motion.button>
        </div>

        {/* ── Navigation ───────────────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-none space-y-0.5">
          {NAV_GROUPS.map((group, gi) => (
            <React.Fragment key={group.id}>
              {gi > 0 && <NavDivider label={group.dividerLabel} />}
              {group.items.map(item => (
                <NavItem key={item.path} item={item} />
              ))}
            </React.Fragment>
          ))}
        </nav>

        {/* ── Sidebar Footer — user mini-card ───────────────────────────── */}
        {!collapsed && (
          <div
            className="flex-shrink-0 px-3 py-3"
            style={{ borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
          >
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
              <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-600">
                {user?.profile_picture ? (
                  <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-bold text-xs"
                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                  >
                    {user?.full_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-xs truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                  {user?.full_name}
                </p>
                <p className={`text-[10px] truncate capitalize ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                  {user?.role}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className={`${contentMargin} transition-all duration-300 ease-in-out min-h-screen flex flex-col`}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header
          className="sticky top-0 z-40 flex-shrink-0"
          style={{
            background:   isDark
              ? 'rgba(15,23,42,0.92)'
              : 'rgba(255,255,255,0.95)',
            borderBottom: isDark ? '1px solid rgba(51,65,85,0.8)' : '1px solid rgba(0,0,0,0.07)',
            boxShadow:    '0 1px 8px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center justify-between px-5 md:px-7 h-14">

            {/* Mobile menu button */}
            <motion.div whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(prev => !prev)}
                className={`lg:hidden h-9 w-9 rounded-lg ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600'}`}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </motion.div>

            {/* Page breadcrumb (desktop) */}
            <div className="hidden lg:flex items-center gap-2">
              {/* Active nav icon */}
              {(() => {
                const active = visibleNavItems.find(i => i.path === location.pathname);
                if (!active) return null;
                const Icon = active.icon;
                return (
                  <div
                    className="p-1.5 rounded-lg"
                    style={{ background: `${COLORS.deepBlue}12` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: COLORS.deepBlue }} />
                  </div>
                );
              })()}
              <span className={`text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {activeLabel}
              </span>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-2 ml-auto">

              <NotificationBell />

              {/* Theme toggle */}
              <motion.button
                onClick={() => setIsDark(prev => !prev)}
                className={`h-9 w-9 rounded-xl flex items-center justify-center border transition-all ${
                  isDark
                    ? 'bg-slate-800 border-slate-600 text-amber-400 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                }`}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                transition={springMed}
                aria-label="Toggle theme"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isDark ? 'sun' : 'moon'}
                    initial={{ rotate: -30, opacity: 0 }}
                    animate={{ rotate: 0,   opacity: 1 }}
                    exit={{   rotate:  30, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </motion.div>
                </AnimatePresence>
              </motion.button>

              {/* User dropdown */}
              <div className="relative" data-user-menu>
                <motion.button
                  onClick={() => setUserMenuOpen(prev => !prev)}
                  className={`flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border transition-all ${
                    isDark
                      ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 bg-slate-800/60'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-600">
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-semibold text-xs"
                        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                      >
                        {user?.full_name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <span className={`hidden md:block text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {user?.full_name?.split(' ')[0]}
                  </span>
                  <motion.div
                    animate={{ rotate: userMenuOpen ? 180 : 0 }}
                    transition={springSoft}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </motion.div>
                </motion.button>

                {/* Dropdown panel */}
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0,  scale: 1    }}
                      exit={{   opacity: 0, y: -8, scale: 0.96  }}
                      transition={springSoft}
                      className="absolute right-0 mt-2 w-60 z-50 overflow-hidden"
                      style={{
                        background:  isDark ? '#1e293b' : '#ffffff',
                        borderRadius: '16px',
                        boxShadow:   isDark
                          ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(51,65,85,0.8)'
                          : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                      }}
                    >
                      {/* User info block */}
                      <div
                        className="px-4 py-3.5"
                        style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-slate-100 dark:ring-slate-700">
                            {user?.profile_picture ? (
                              <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
                                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                              >
                                {user?.full_name?.[0]?.toUpperCase() || 'U'}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              {user?.full_name}
                            </p>
                            <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                              {user?.email}
                            </p>
                            <span
                              className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-md capitalize"
                              style={{
                                background: `${COLORS.deepBlue}12`,
                                color:      COLORS.deepBlue,
                              }}
                            >
                              {user?.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Sign out */}
                      <div className="p-1.5">
                        <motion.button
                          onClick={handleLogout}
                          whileHover={{ x: 2 }}
                          transition={springSnap}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            isDark
                              ? 'text-red-400 hover:bg-red-900/30'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <LogOut className="h-4 w-4" />
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

        {/* ── Page Content ─────────────────────────────────────────────── */}
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
