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
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  lightBlue:    '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
};

const SIDEBAR_EXPANDED  = 260;
const SIDEBAR_COLLAPSED = 72;

// ── Nav sequence: Core → Records → Client Proposals → Admin → Settings ────────
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
      { path: '/dsc',       icon: FileText, label: 'DSC Register',      permission: 'can_view_all_dsc'     },
      { path: '/documents', icon: FileText, label: 'Document Register', permission: 'can_view_documents'   },
      { path: '/clients',   icon: Users,    label: 'Clients',           permission: 'can_view_all_clients' },
      { path: '/passwords', icon: KeyRound, label: 'Password Vault', permission: 'can_view_passwords' },
    ],
  },
  {
    id: 'proposals',
    dividerLabel: 'Client Proposals',
    items: [
      { path: '/leads',      icon: Target,  label: 'Lead Management', permission: 'can_view_all_leads'    },
      { path: '/quotations', icon: Receipt, label: 'Quotations',      permission: 'can_create_quotations' },
    ],
  },
  {
    id: 'admin',
    dividerLabel: 'Admin',
    items: [
      { path: '/staff-activity', icon: Activity,  label: 'Staff Activity',  permission: 'can_view_staff_activity' },
      { path: '/reports',        icon: BarChart3,  label: 'Reports'                                               },
      { path: '/task-audit',     icon: Activity,   label: 'Task Audit Log', permission: 'can_view_audit_logs'    },
      { path: '/users',          icon: Users,      label: 'Users',          permission: 'can_view_user_page'     },
    ],
  },
  {
    id: 'settings',
    dividerLabel: 'Settings',
    items: [
      { path: '/settings/email', icon: Mail,     label: 'Email Accounts'   },
      { path: '/settings',       icon: Settings, label: 'General Settings' },
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useActivityTracker(true);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  const handleResize = useCallback(() => {
    const desktop = window.innerWidth >= 1024;
    setIsDesktop(desktop);
    if (!desktop) setCollapsed(false);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  useEffect(() => {
    if (window.innerWidth >= 1024) setSidebarOpen(true);
  }, []);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

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

  const allNavItems     = NAV_GROUPS.flatMap(g => g.items);
  const visibleNavItems = allNavItems.filter(
    item => !item.permission || hasPermission(item.permission)
  );
  const activeLabel = visibleNavItems.find(i => i.path === location.pathname)?.label || 'Dashboard';

  const sidebarPx = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const offsetPx  = isDesktop ? sidebarPx : 0;

  // ── Sidebar nav item ──────────────────────────────────────────────────────
  const NavItem = ({ item }) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    return (
      <motion.div
        whileHover={{ x: collapsed ? 0 : 3 }}
        whileTap={{ scale: 0.97 }}
        transition={springSnap}
      >
        <Link
          to={item.path}
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
            boxShadow:  '0 4px 14px rgba(13,59,102,0.28)',
          } : {}}
        >
          {/* Active left accent bar */}
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

          {/* Active dot indicator when collapsed */}
          {isActive && collapsed && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70" />
          )}

          {/* Tooltip when collapsed */}
          {collapsed && (
            <div className="
              absolute left-full ml-3 px-2.5 py-1.5
              bg-slate-800 dark:bg-slate-700 text-white text-xs font-medium
              rounded-lg whitespace-nowrap pointer-events-none
              opacity-0 group-hover:opacity-100
              translate-x-1 group-hover:translate-x-0
              transition-all duration-200 z-[100] shadow-lg
            ">
              {item.label}
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800 dark:border-r-slate-700" />
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  // ── Nav divider ───────────────────────────────────────────────────────────
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

      {/* ── Mobile Overlay ── */}
      <AnimatePresence>
        {sidebarOpen && !isDesktop && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
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
          fixed top-0 left-0 h-full z-50 flex flex-col
          transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
        style={{
          width:       sidebarPx,
          background:  isDark ? '#1e293b' : '#ffffff',
          borderRight: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow:   '4px 0 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* ── Logo header — always centered, no wordmark ── */}
        <div
          className="relative flex items-center justify-center px-3 py-4 flex-shrink-0"
          style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
        >
          {/* Logo — centered regardless of collapsed state */}
          <img
            src="/logo.png"
            alt="Taskosphere"
            className={`object-contain transition-all duration-300 ${
              collapsed ? 'h-8 w-8' : 'h-11 w-auto'
            }`}
          />

          {/* Collapse toggle — desktop only, absolute right */}
          {isDesktop && (
            <motion.button
              onClick={() => setCollapsed(prev => !prev)}
              className={`
                absolute right-2.5 top-1/2 -translate-y-1/2
                p-1.5 rounded-lg transition-colors
                ${isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }
              `}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={springMed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </motion.button>
          )}

          {/* Close button — mobile only, absolute right */}
          {!isDesktop && (
            <motion.button
              onClick={() => setSidebarOpen(false)}
              className={`
                absolute right-2.5 top-1/2 -translate-y-1/2
                p-1.5 rounded-lg transition-colors
                ${isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }
              `}
              whileTap={{ scale: 0.9 }}
            >
              <X size={15} />
            </motion.button>
          )}
        </div>

        {/* Nav */}
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

        {/* Sidebar footer — user info + logout */}
        <div
          className="flex-shrink-0 px-3 py-3"
          style={{ borderTop: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
        >
          {!collapsed ? (
            <div className={`rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
              {/* User row */}
              <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-600">
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
                  <p className={`font-semibold text-[10px] sm:text-xs truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                    {user?.full_name}
                  </p>
                  <p className={`text-[10px] truncate capitalize ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                    {user?.role}
                  </p>
                </div>
              </div>
              {/* Divider */}
              <div className={`mx-2 mb-1 border-t ${isDark ? 'border-slate-600/50' : 'border-slate-200/70'}`} />
              {/* Logout */}
              <motion.button
                onClick={handleLogout}
                whileHover={{ x: 2 }}
                transition={springSnap}
                className={`w-full flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg text-xs font-medium transition-colors ${
                  isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'
                }`}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </motion.button>
            </div>
          ) : (
            /* Collapsed: avatar + logout icon stacked */
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-600">
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
              <motion.button
                onClick={handleLogout}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:bg-red-50'}`}
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </motion.button>
            </div>
          )}
        </div>
      </aside>

      {/* ── HEADER ── */}
      <header
        className="fixed top-0 right-0 z-40 transition-all duration-300 ease-in-out"
        style={{
          left:                 offsetPx,
          width:                `calc(100% - ${offsetPx}px)`,
          background:           isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.98)',
          borderBottom:         isDark ? '1px solid rgba(51,65,85,0.8)' : '1px solid rgba(0,0,0,0.07)',
          boxShadow:            '0 1px 8px rgba(0,0,0,0.06)',
          backdropFilter:       'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center justify-between px-3 sm:px-5 md:px-7 h-12 sm:h-14">

          {/* Mobile menu button */}
          <motion.div whileTap={{ scale: 0.9 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(prev => !prev)}
              className={`lg:hidden h-8 w-8 sm:h-9 sm:w-9 rounded-lg ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600'}`}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </motion.div>

          {/* Breadcrumb — animated on route change */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="hidden lg:flex items-center gap-2"
            >
              {(() => {
                const active = visibleNavItems.find(i => i.path === location.pathname);
                if (!active) return null;
                const Icon = active.icon;
                return (
                  <>
                    <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
                      <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" style={{ color: COLORS.deepBlue }} />
                    </div>
                    <span className={`text-xs sm:text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {activeLabel}
                    </span>
                  </>
                );
              })()}
            </motion.div>
          </AnimatePresence>

          {/* Right cluster */}
          <div className="flex items-center gap-1 sm:gap-2 ml-auto">

            <NotificationBell />

            {/* Theme toggle — pill slider */}
            <motion.button
              onClick={() => setIsDark(prev => !prev)}
              className={`relative h-8 w-14 sm:h-9 sm:w-16 rounded-full flex items-center border transition-all overflow-hidden ${
                isDark
                  ? 'bg-slate-800 border-slate-600'
                  : 'bg-slate-100 border-slate-200'
              }`}
              whileTap={{ scale: 0.93 }}
              transition={springMed}
              aria-label="Toggle theme"
            >
              {/* Track icons */}
              <Sun  className="absolute left-1.5 h-3 w-3 text-amber-400 opacity-70" />
              <Moon className="absolute right-1.5 h-3 w-3 text-slate-400 opacity-70" />
              {/* Sliding thumb */}
              <motion.div
                className={`absolute w-6 h-6 rounded-full shadow-sm flex items-center justify-center ${isDark ? 'bg-slate-200' : 'bg-white'}`}
                animate={{ x: isDark ? 32 : 4 }}
                transition={springSnap}
                style={{ top: '50%', marginTop: -12 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isDark ? 'moon' : 'sun'}
                    initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
                    animate={{ rotate: 0,   opacity: 1, scale: 1   }}
                    exit={{   rotate:  30, opacity: 0, scale: 0.7  }}
                    transition={{ duration: 0.15 }}
                  >
                    {isDark
                      ? <Moon className="h-3 w-3 text-slate-700" />
                      : <Sun  className="h-3 w-3 text-amber-500" />
                    }
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </motion.button>

            {/* User dropdown */}
            <div className="relative" data-user-menu>
              <motion.button
                onClick={() => setUserMenuOpen(prev => !prev)}
                className={`flex items-center gap-1.5 sm:gap-2.5 pl-1.5 sm:pl-2 pr-2 sm:pr-3 py-1 sm:py-1.5 rounded-xl border transition-all ${
                  isDark
                    ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 bg-slate-800/60'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-600">
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
                <span className={`hidden md:block text-xs sm:text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {user?.full_name?.split(' ')[0]}
                </span>
                <motion.div animate={{ rotate: userMenuOpen ? 180 : 0 }} transition={springSoft}>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{   opacity: 0, y: -8, scale: 0.96  }}
                    transition={springSoft}
                    className="absolute right-0 mt-2 w-60 z-50 overflow-hidden"
                    style={{
                      background:   isDark ? '#1e293b' : '#ffffff',
                      borderRadius: '16px',
                      boxShadow:    isDark
                        ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(51,65,85,0.8)'
                        : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                    }}
                  >
                    {/* User info header */}
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
                            style={{ background: `${COLORS.deepBlue}12`, color: COLORS.deepBlue }}
                          >
                            {user?.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick links */}
                    <div className="p-1.5">
                      <motion.button
                        onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                        whileHover={{ x: 2 }}
                        transition={springSnap}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors mb-0.5 ${
                          isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Settings className="h-4 w-4" />
                        Settings
                      </motion.button>
                      <motion.button
                        onClick={handleLogout}
                        whileHover={{ x: 2 }}
                        transition={springSnap}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'
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

      {/* ── Main Content ── */}
      <div
        className="transition-all duration-300 ease-in-out min-h-screen flex flex-col"
        style={{
          marginLeft: offsetPx,
          paddingTop: 56,
        }}
      >
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
