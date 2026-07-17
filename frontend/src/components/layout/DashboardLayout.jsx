import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import {
  LayoutDashboard, CheckSquare, FileText, Clock, BarChart3,
  Users, LogOut, Menu, Activity, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Target, Sun, Moon, MapPin,
  Settings, Mail, Receipt, X, KeyRound, BrainCircuit,
  CreditCard, Fingerprint, Bell, Shield, ShieldCheck, ArrowLeftRight, MessageCircle,
  Building2, Zap, Briefcase, ShoppingBag, Landmark, BookOpen, NotebookPen,
  ScanLine, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import GifLoader from '@/components/ui/GifLoader.jsx';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  lightBlue:    '#E0F2FE',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
  // Sidebar is always this dark-navy palette, independent of the app's
  // light/dark theme toggle (which only affects the header + page content).
  // Tied to the same brand blue used in the header/logo (deepBlue/mediumBlue)
  // so the header and sidebar read as one unified colour family.
  sidebarBg:      '#0D3B66',
  sidebarBgSoft:  '#0A2E52',
  sidebarBorder:  'rgba(255,255,255,0.08)',
  sidebarActive:  '#2B8CD1',
};

const SIDEBAR_EXPANDED  = 280;
const SIDEBAR_COLLAPSED = 80;
const HEADER_H          = 76;

// NAV_GROUPS: items with no `permission` key are visible to ALL authenticated users
// (matching <Protected> routes). Items with a `permission` key are only shown
// when the user has that permission flag (matching <Permission> routes).
// Admins always see everything.
const NAV_GROUPS = [
  {
    id: 'core',
    items: [
      // Default modules — <Protected> routes, visible to all roles
      { path: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/tasks',      icon: CheckSquare,     label: 'Tasks' },
      { path: '/todos',      icon: CheckSquare,     label: 'To Do' },
      { path: '/attendance', icon: Clock,           label: 'Attendance' },
      { path: '/reminders',  icon: Bell,            label: 'Reminders' },
      { path: '/action-center', icon: Zap, label: 'Action Center' },
      { path: '/visits',     icon: MapPin,          label: 'Client Visits' },
      { path: '/ai-reader',      icon: BrainCircuit,  label: 'AI Document Reader' },  // ← ADD THIS
    ],
  },
  {
    id: 'compliance',
    dividerLabel: 'Compliance',
    items: [
      // Compliance Calendar is now embedded inside Compliance Tracker — single unified page
      { path: '/compliance',         icon: ShieldCheck,    label: 'Compliance Tracker',  permission: 'can_view_compliance' },
      { path: '/gst-reconciliation', icon: ArrowLeftRight, label: 'GST Reconciliation', permission: 'can_view_gst_reconciliation' },
      { path: '/trademark-sphere', icon: Shield, label: 'Trademark Sphere', permission: 'can_view_trademark_sphere' },
    ],
  },
  {
    id: 'records',
    dividerLabel: 'Records',
    items: [
      // Permission-based modules — only visible when user has the flag
      { path: '/dsc',       icon: FileText,  label: 'DSC Register',      permission: 'can_view_all_dsc'     },
      { path: '/documents', icon: FileText,  label: 'Document Register', permission: 'can_view_documents'   },
      // Clients — always visible to all authenticated users.
      // "Assigned + Permission" model: can_view_all_clients controls DATA SCOPE (all vs assigned),
      // not page access. Users without the flag still see their own assigned clients.
      { path: '/clients',   icon: Users,     label: 'Clients' },
      { path: '/passwords', icon: KeyRound,  label: 'Password Vault',    permission: 'can_view_passwords'   },
    ],
  },
  {
    id: 'proposals',
    dividerLabel: 'Client Proposals',
    items: [
      { path: '/leads',      icon: Target,   label: 'Lead Management', permission: 'can_view_all_leads'    },
      { path: '/quotations', icon: Receipt,  label: 'Quotations',      permission: 'can_create_quotations' },
    ],
  },
  {
    id: 'accounts',
    dividerLabel: 'Accounts',
    items: [
      {
        path:       '/invoicing',
        icon:       CreditCard,
        label:      'Sale',
        permission: ['can_manage_invoices', 'can_create_quotations', 'can_view_sale'],
      },
      {
        path:       '/purchase',
        icon:       ShoppingBag,
        label:      'Purchase',
        permission: ['can_manage_invoices', 'can_create_quotations', 'can_view_purchase'],
      },
      {
        path:       '/bank-accounts',
        icon:       Landmark,
        label:      'Bank Accounts',
        permission: 'can_view_bank',
      },
      {
        path:       '/chart-of-accounts',
        icon:       BookOpen,
        label:      'Chart of Accounts',
        permission: ['can_view_chart_of_accounts', 'can_manage_chart_of_accounts'],
      },
      {
        path:       '/journal-entries',
        icon:       NotebookPen,
        label:      'Journal Entries',
        permission: ['can_view_journal_entries', 'can_post_journal_entries'],
      },
      {
        path:       '/accounting-reports',
        icon:       BarChart3,
        label:      'Accounting Reports',
        permission: 'can_view_accounting_reports',
      },
      {
        path:       '/zero-touch-entry',
        icon:       ScanLine,
        label:      'Zero-Touch Entry (AI)',
        permission: 'can_post_journal_entries',
      },
      {
        path:       '/gst-portal-sync',
        icon:       Landmark,
        label:      'Live GST Portal Sync',
        permission: 'can_view_accounting_reports',
      },
      {
        path:       '/accounting-integrity',
        icon:       Lock,
        label:      'Accounting Integrity',
        permission: 'can_manage_chart_of_accounts',
      },
    ],
  },
  {
    id: 'admin',
    dividerLabel: 'Admin',
    items: [
      // Reports — Admin only
      { path: '/reports',        icon: BarChart3,  label: 'Reports', adminOnly: true },
      { path: '/task-audit',     icon: Activity,   label: 'Task Audit Log',   permission: 'can_view_audit_logs'  },
      { path: '/users',          icon: Users,      label: 'Users',            permission: 'can_view_user_page'   },
      { path: '/interviews',     icon: Briefcase,  label: 'Employee Interviews', permission: 'can_view_interviews'  },
      { path: '/staff-activity', icon: Activity,   label: 'Staff Activity',   adminOnly: true                    },
      { path: '/client-portal-manager', icon: Building2, label: 'Client Portal', permission: 'can_view_client_portal' },
      { path: '/whatsapp-hub', icon: MessageCircle, label: 'Unified Inbox', permission: 'can_access_whatsapp_hub' },
    ],
  },
  {
    id: 'settings',
    dividerLabel: 'Settings',
    items: [
      // Settings — <Protected> routes, visible to all roles
      { path: '/settings/email',   icon: Mail,     label: 'Email Accounts'   },
      { path: '/settings/general', icon: Settings, label: 'General Settings' },
      { path: '/settings/whatsapp', icon: MessageCircle, label: 'WhatsApp Settings' },
    ],
  },
];

const springSnap = { type: 'spring', stiffness: 500, damping: 28 };
const springMed  = { type: 'spring', stiffness: 400, damping: 24 };
const springSoft = { type: 'spring', stiffness: 300, damping: 20 };

const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 18 },
  animate: {
    opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 28, mass: 0.9 },
  },
  exit: {
    opacity: 0, y: -8,
    transition: { duration: 0.16, ease: 'easeIn' },
  },
};

const DashboardLayout = ({ children }) => {
  const { user, logout, hasPermission, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [collapsed,    setCollapsed]    = useState(() => {
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
  const [hasUnread, setHasUnread] = useState(false);

  const sidebarNavRef = useRef(null);
  const mainRef       = useRef(null);
  const activeItemRef = useRef(null);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useActivityTracker(!!user);

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

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count', { _silent: true });
        setHasUnread((data?.count ?? 0) > 0);
      } catch { /* ignore — 401/403 handled globally by api interceptor */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <GifLoader />;
  if (!user) { navigate('/login', { replace: true }); return null; }

  const handleLogout = () => {
    window.__STOP_ACTIVITY__ = true;
    logout();
    toast.success('Logged out successfully');
    navigate('/login', { replace: true });
  };

  const checkNavPermission = (item) => {
    if (item.adminOnly) return user?.role === 'admin';
    const permission = item.permission;
    if (!permission) return true;
    if (user?.role === 'admin') return true;
    if (Array.isArray(permission)) return permission.some(p => hasPermission(p));
    return hasPermission(permission);
  };

  const allNavItems     = NAV_GROUPS.flatMap(g => g.items);
  const visibleNavItems = allNavItems.filter(i => checkNavPermission(i));
  const activeLabel     = visibleNavItems.find(i =>
    i.path === location.pathname ||
    (!i.exact && location.pathname.startsWith(i.path + '/') && i.path !== '/')
  )?.label || 'Dashboard';

  const sidebarPx = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const offsetPx  = isDesktop ? sidebarPx : 0;

  /* ── Nav Item ─────────────────────────────────────────────────────── */
  const NavItem = ({ item }) => {
    if (!checkNavPermission(item)) return null;
    // exact:true items only highlight on a precise path match
    // (prevents /settings matching when the user is on /settings/email)
    const isActive = location.pathname === item.path ||
      (!item.exact && location.pathname.startsWith(item.path + '/') && item.path !== '/');
    const Icon = item.icon;

    return (
      <motion.div
        ref={isActive ? activeItemRef : null}
        whileHover={{ x: collapsed ? 0 : 3 }}
        whileTap={{ scale: 0.97 }}
        transition={springSnap}
      >
        <Link
          to={item.path}
          title={collapsed ? item.label : undefined}
          className={`relative flex items-center gap-3 min-w-0
            ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'}
            rounded-xl transition-all duration-200 group
            ${isActive ? 'text-white' : 'text-slate-300 hover:text-white hover:bg-white/[0.07]'}`}
          style={isActive ? {
            background: `linear-gradient(135deg, ${COLORS.mediumBlue}, ${COLORS.sidebarActive})`,
            boxShadow: '0 4px 14px rgba(46,139,230,0.35)',
          } : {}}
        >
          {isActive && !collapsed && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
              style={{ background: 'rgba(255,255,255,0.6)' }}
            />
          )}
          <Icon
            className={`flex-shrink-0 transition-colors
              ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}
              ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-100'}`}
          />
          {!collapsed && (
            <span className="font-medium text-sm whitespace-nowrap tracking-tight truncate">
              {item.label}
            </span>
          )}
          {isActive && collapsed && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70" />
          )}
          {collapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-200 z-[100] shadow-lg">
              {item.label}
              <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  const NavDivider = ({ label }) => (
    <div className={`mt-4 mb-2 ${collapsed ? 'px-2' : 'px-3'}`}>
      {!collapsed && label ? (
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
          {label}
        </p>
      ) : (
        <div className="border-t mx-1" style={{ borderColor: COLORS.sidebarBorder }} />
      )}
    </div>
  );

  return (
    <div
      className={`min-h-screen relative ${isDark ? 'bg-[#0f172a]' : 'bg-[#F4F6FA]'}`}
      style={{ overflowX: 'hidden' }}
    >

      {/* ── Mobile overlay ── */}
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
          fixed left-0 z-[45] flex flex-col
          transition-all duration-300 ease-in-out
          ${isDesktop
            ? 'translate-x-0'
            : sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }
        `}
        style={{
          top:         HEADER_H,
          height:      `calc(100% - ${HEADER_H}px)`,
          width:       sidebarPx,
          background:  `linear-gradient(180deg, ${COLORS.sidebarBg} 0%, ${COLORS.sidebarBgSoft} 100%)`,
          borderRight: `1px solid ${COLORS.sidebarBorder}`,
          boxShadow:   '10px 0 30px rgba(0,0,0,0.25)',
        }}
      >
        {/* Nav scroll container */}
        <div
          ref={sidebarNavRef}
          className="flex-1 overflow-y-auto overflow-x-hidden slim-scroll sidebar-scroll py-4"
        >
          {NAV_GROUPS.map((group) => {
            const visibleGroupItems = group.items.filter(
              (item) => checkNavPermission(item)
            );
            if (visibleGroupItems.length === 0) return null;
            return (
              <div key={group.id} className="mb-2">
                {group.dividerLabel && <NavDivider label={group.dividerLabel} />}
                <div className={`space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
                  {visibleGroupItems.map((item) => (
                    <NavItem key={item.path} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapse button — desktop only */}
        <div className="p-4 border-t hidden lg:block" style={{ borderColor: COLORS.sidebarBorder }}>
          <Button
            variant="ghost"
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-start gap-3'} h-11 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.07] transition-all`}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <React.Fragment>
                <PanelLeftClose className="h-4 w-4" />
                <span className="text-sm font-medium">Collapse Sidebar</span>
              </React.Fragment>
            )}
          </Button>
        </div>
      </aside>

      {/* ── Header — full width, sits above both the sidebar and the content ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center transition-all duration-300 ease-in-out backdrop-blur-md"
        style={{
          height:       HEADER_H,
          background:   isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)',
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          overflow:     'visible',
        }}
      >
        {/* Brand block — same width as the sidebar so the logo lines up with it */}
        <div
          className="flex items-center flex-shrink-0 h-full transition-all duration-300 ease-in-out overflow-hidden"
          style={{ width: isDesktop ? sidebarPx : 'auto', paddingLeft: isDesktop ? 0 : undefined }}
        >
          <Link
            to="/dashboard"
            className="relative flex items-center justify-center w-full min-w-0"
          >
            <div className="relative flex-shrink-0 flex items-center justify-center">
              {/* Preload both variants so the theme swap is instant, no flicker. */}
              <img src="/logo-lite.png" alt="" aria-hidden="true" style={{ display: 'none' }} />
              <img src="/logo-dark.png" alt="" aria-hidden="true" style={{ display: 'none' }} />
              {collapsed && isDesktop ? (
                <img
                  src="/icon-192.png"
                  alt="Task-O-Sphere"
                  className="object-contain block"
                  style={{ height: 56, width: 56 }}
                />
              ) : (
                <img
                  key={isDark ? 'dark' : 'lite'}
                  src={isDark ? '/logo-dark.png' : '/logo-lite.png'}
                  alt="Task-O-Sphere"
                  className="object-contain block mx-auto transition-opacity duration-150"
                  style={{ height: 60, maxWidth: isDesktop ? sidebarPx - 24 : 200 }}
                />
              )}
              {hasUnread && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2"
                  style={{ background: COLORS.emeraldGreen, borderColor: isDark ? '#0f172a' : '#ffffff' }}
                />
              )}
            </div>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-between px-3 sm:px-5 min-w-0 gap-2 h-full border-l" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="lg:hidden flex-shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 active:scale-95 transition-all"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <AnimatePresence mode="wait">
              <motion.h1
                key={location.pathname}
                className={`text-xs sm:text-sm font-semibold truncate min-w-0 tracking-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-800'
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                style={{ maxWidth: 'clamp(100px, 40vw, 260px)' }}
              >
                {activeLabel}
              </motion.h1>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <NotificationBell />

            {/* Theme toggle */}
            <motion.button
              onClick={() => setIsDark(!isDark)}
              className={`relative flex-shrink-0 w-[54px] h-7 rounded-full flex items-center border transition-colors shadow-inner ${
                isDark
                  ? 'bg-gradient-to-r from-slate-800 to-slate-700 border-slate-600'
                  : 'bg-gradient-to-r from-sky-100 to-slate-100 border-slate-300'
              }`}
              whileTap={{ scale: 0.93 }}
              transition={springMed}
              aria-label="Toggle theme"
            >
              <Sun  className="absolute left-1.5 h-3 w-3 text-amber-400" />
              <Moon className="absolute right-1.5 h-3 w-3 text-slate-400" />
              <motion.div
                className={`absolute w-5 h-5 rounded-full shadow flex items-center justify-center z-10 ${
                  isDark ? 'bg-slate-200' : 'bg-white'
                }`}
                animate={{ x: isDark ? 28 : 3 }}
                transition={springSnap}
                style={{ top: '50%', marginTop: -10 }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isDark ? 'moon' : 'sun'}
                    initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 30, opacity: 0, scale: 0.7 }}
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

            {/* User menu */}
            <div className="relative flex-shrink-0" data-user-menu>
              <motion.button
                onClick={() => setUserMenuOpen(prev => !prev)}
                className={`flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-2 sm:pr-3 py-1 sm:py-1.5 rounded-xl border transition-all ${
                  isDark
                    ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/60 bg-slate-800/60'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                aria-label="Open user menu"
              >
                <div
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-offset-2 transition-shadow"
                  style={{
                    boxShadow: isDark
                      ? '0 0 0 1px rgba(31,175,90,0.35), 0 2px 8px rgba(0,0,0,0.35)'
                      : '0 0 0 1px rgba(13,59,102,0.15), 0 2px 8px rgba(13,59,102,0.12)',
                    // ring-offset color follows the header background
                    // (Tailwind ring-offset requires --tw-ring-offset-color; we set it via inline style)
                    ['--tw-ring-color']: isDark ? '#1FAF5A' : '#0D3B66',
                    ['--tw-ring-offset-color']: isDark ? '#0f172a' : '#ffffff',
                  }}
                >
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
                <span className={`hidden md:block text-xs sm:text-sm font-semibold max-w-[100px] truncate ${
                  isDark ? 'text-slate-200' : 'text-slate-700'
                }`}>
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
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={springSoft}
                    className="absolute right-0 mt-2 z-[200] overflow-hidden"
                    style={{
                      width: 'min(240px, calc(100vw - 2rem))',
                      background:   isDark ? '#1e293b' : '#ffffff',
                      borderRadius: '16px',
                      boxShadow: isDark
                        ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(51,65,85,0.8)'
                        : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div
                      className="px-4 py-3.5"
                      style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #f1f5f9' }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
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
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                            {user?.full_name}
                          </p>
                          <p className="text-xs truncate mt-0.5 text-slate-400">{user?.email}</p>
                          <span
                            className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-md capitalize"
                            style={{ background: `${COLORS.deepBlue}12`, color: COLORS.deepBlue }}
                          >
                            {user?.role}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-1.5">
                      <motion.button
                        onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                        whileHover={{ x: 2 }}
                        transition={springSnap}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors mb-0.5 ${
                          isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Settings className="h-4 w-4 flex-shrink-0" /> Settings
                      </motion.button>
                      <motion.button
                        onClick={handleLogout}
                        whileHover={{ x: 2 }}
                        transition={springSnap}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <LogOut className="h-4 w-4 flex-shrink-0" /> Sign out
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content wrapper ── */}
      <div
        className="transition-all duration-300 ease-in-out min-h-screen flex flex-col"
        style={{
          marginLeft: offsetPx,
          paddingTop:  HEADER_H,
          minWidth:    0,
          maxWidth:    '100%',
          overflowX:   'hidden',
        }}
      >
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ padding: 'clamp(0.875rem, 2vw, 1.75rem)', position: 'relative' }}
        >
          <div
            className="mx-auto w-full min-w-0"
            style={{ maxWidth: 'var(--content-max, 1400px)' }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                variants={PAGE_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full min-w-0"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

    </div>
  );
};

export default DashboardLayout;
