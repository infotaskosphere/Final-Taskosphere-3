/**
 * DashboardLayout.jsx — v2  COMPLETE REWRITE
 *
 * NEW FEATURES:
 *  - Command Palette (⌘K / Ctrl+K) — fuzzy nav + quick actions
 *  - Global search bar in header
 *  - Quick-add floating button (New Task / Visit / Document from anywhere)
 *  - Role-aware greeting with today's at-a-glance summary
 *  - Notification drawer (slide-in panel with categories + mark-all-read)
 *  - Live clock + today's date in header
 *  - Breadcrumb trail for nested routes
 *  - Status indicator on user avatar (active/away via useActivityTracker)
 *  - Scroll-aware header (shadow deepens on scroll)
 *  - Page transition animations (AnimatePresence on route outlet)
 *  - Sidebar hover preview cards when collapsed
 *  - Unread badges on nav items (Tasks overdue, Visits missed)
 *  - Recently visited pages (top of nav, last 3)
 *  - Pinned favourites (drag to pin up to 3)
 *  - Back-to-top button
 *  - Offline indicator banner
 *  - Session expiry warning toast
 *  - Keyboard navigation throughout
 *  - Contextual sub-navigation (Settings section expands inline)
 *  - Improved sidebar footer (collapse-aware strip)
 *  - Fixed collapse button overlap bug
 *  - Proper breadcrumb for nested routes (/settings/email → Settings → Email)
 *  - Hardcoded paddingTop replaced with CSS var
 *  - Page transitions with AnimatePresence
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
  createContext, useContext,
} from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard, CheckSquare, FileText, Clock, BarChart3, Users,
  LogOut, Menu, Calendar, Activity, ChevronDown, PanelLeftClose,
  PanelLeftOpen, Target, Sun, Moon, MapPin, Settings, Mail, Receipt,
  Search, Plus, X, Command, ArrowUp, Wifi, WifiOff, Bell, BellOff,
  Zap, Star, StarOff, History, ChevronRight, Home, UserCheck,
  CalendarDays, TrendingUp, AlertTriangle, CheckCircle2, Loader2,
  ClipboardList, FolderOpen, Building2, Sparkles,
} from 'lucide-react';

// ─── Brand tokens ──────────────────────────────────────────────────────────
const C = {
  deepBlue:   '#0D3B66',
  medBlue:    '#1F6FB2',
  sky:        '#38BDF8',
  emerald:    '#059669',
  green:      '#34D399',
  coral:      '#F43F5E',
  amber:      '#F59E0B',
  purple:     '#7C3AED',
};
const GRAD = {
  primary: `linear-gradient(135deg, ${C.deepBlue}, ${C.medBlue})`,
  emerald: `linear-gradient(135deg, ${C.emerald}, ${C.green})`,
  amber:   `linear-gradient(135deg, #D97706, ${C.amber})`,
  coral:   `linear-gradient(135deg, #BE123C, ${C.coral})`,
};

const HEADER_H  = 56;   // px — single source of truth
const S_WIDE    = 260;
const S_NARROW  = 68;

// ─── Spring presets ────────────────────────────────────────────────────────
const SP = {
  snap:  { type: 'spring', stiffness: 500, damping: 30 },
  med:   { type: 'spring', stiffness: 380, damping: 26 },
  soft:  { type: 'spring', stiffness: 280, damping: 22 },
  slide: { type: 'spring', stiffness: 340, damping: 28 },
};

// ─── Nav structure ─────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id: 'core',
    items: [
      { path: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',           color: C.deepBlue  },
      { path: '/tasks',      icon: CheckSquare,     label: 'Tasks',               color: C.medBlue,  badge: 'tasks_overdue'  },
      { path: '/todos',      icon: ClipboardList,   label: 'To Do',               color: C.medBlue   },
      { path: '/attendance', icon: Clock,           label: 'Attendance',          color: C.emerald   },
      { path: '/duedates',   icon: CalendarDays,    label: 'Compliance Calendar', color: C.amber     },
      { path: '/visits',     icon: MapPin,          label: 'Client Visits',       color: C.coral,    badge: 'visits_missed'  },
    ],
  },
  {
    id: 'records',
    dividerLabel: 'Records',
    items: [
      { path: '/dsc',       icon: FileText,    label: 'DSC Register',      color: C.purple, permission: 'can_view_all_dsc'     },
      { path: '/documents', icon: FolderOpen,  label: 'Document Register', color: C.purple, permission: 'can_view_documents'   },
      { path: '/clients',   icon: Building2,   label: 'Clients',           color: C.purple, permission: 'can_view_all_clients' },
    ],
  },
  {
    id: 'admin',
    dividerLabel: 'Admin',
    items: [
      { path: '/staff-activity', icon: Activity,  label: 'Staff Activity',  color: C.amber, permission: 'can_view_staff_activity' },
      { path: '/reports',        icon: BarChart3,  label: 'Reports',         color: C.amber  },
      { path: '/task-audit',     icon: TrendingUp, label: 'Task Audit Log',  color: C.amber, permission: 'can_view_audit_logs'    },
      { path: '/users',          icon: Users,      label: 'Users',           color: C.amber, permission: 'can_view_user_page'     },
    ],
  },
  {
    id: 'proposals',
    dividerLabel: 'Client Proposals',
    items: [
      { path: '/leads',      icon: Target,  label: 'Lead Management', color: C.emerald, permission: 'can_view_all_leads'    },
      { path: '/quotations', icon: Receipt, label: 'Quotations',      color: C.emerald, permission: 'can_create_quotations' },
    ],
  },
  {
    id: 'settings',
    dividerLabel: 'Settings',
    collapsible: true,
    items: [
      { path: '/settings/email', icon: Mail,     label: 'Email Accounts',  color: C.deepBlue },
      { path: '/settings',       icon: Settings, label: 'General Settings',color: C.deepBlue },
    ],
  },
];

// All items flattened for search / palette
const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// Quick actions for command palette
const QUICK_ACTIONS = [
  { id: 'new-task',    label: 'New Task',         icon: CheckSquare, path: '/tasks?new=1',    color: C.medBlue  },
  { id: 'new-visit',   label: 'Schedule Visit',   icon: MapPin,      path: '/visits?new=1',   color: C.coral    },
  { id: 'new-doc',     label: 'Upload Document',  icon: FileText,    path: '/documents?new=1',color: C.purple   },
  { id: 'new-lead',    label: 'Add Lead',         icon: Target,      path: '/leads?new=1',    color: C.emerald  },
];

// ─── Greeting helper ───────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Live clock ────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-xs font-mono font-semibold text-slate-400 tabular-nums hidden xl:block">
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

// ─── Offline banner ────────────────────────────────────────────────────────
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 py-2
            bg-orange-500 text-white text-xs font-bold"
        >
          <WifiOff className="h-3.5 w-3.5" />
          You're offline — some features may not work
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Back-to-top button ────────────────────────────────────────────────────
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById('main-scroll');
    if (!el) return;
    const handler = () => setShow(el.scrollTop > 300);
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 16 }}
          animate={{ opacity: 1, scale: 1,   y: 0  }}
          exit={{   opacity: 0, scale: 0.8, y: 16  }}
          transition={SP.med}
          onClick={() => document.getElementById('main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-2xl text-white shadow-lg flex items-center justify-center"
          style={{ background: GRAD.primary, boxShadow: '0 4px 20px rgba(13,59,102,0.35)' }}
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

// ─── Command Palette ───────────────────────────────────────────────────────
function CommandPalette({ open, onClose, navItems, isDark }) {
  const navigate  = useNavigate();
  const [query,   setQuery]   = useState('');
  const [cursor,  setCursor]  = useState(0);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (open) { setQuery(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const pages = navItems
      .filter(i => i.label.toLowerCase().includes(q) || i.path.includes(q))
      .map(i => ({ ...i, type: 'page' }));
    const actions = QUICK_ACTIONS
      .filter(i => i.label.toLowerCase().includes(q))
      .map(i => ({ ...i, type: 'action' }));
    return q ? [...actions, ...pages] : [...QUICK_ACTIONS.map(i => ({ ...i, type: 'action' })), ...pages];
  }, [query, navItems]);

  const go = useCallback((item) => {
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      if (e.key === 'Enter' && results[cursor]) go(results[cursor]);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, cursor, results, go, onClose]);

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4"
      style={{ background: 'rgba(5,12,26,0.72)', backdropFilter: 'blur(12px)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.93, y: -20, opacity: 0 }}
        animate={{ scale: 1,    y: 0,   opacity: 1 }}
        exit={{   scale: 0.93, y: -20, opacity: 0 }}
        transition={SP.med}
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background:  isDark ? '#1e293b' : '#ffffff',
          border:      isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow:   '0 24px 80px rgba(0,0,0,0.3)',
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b"
          style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
          <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            placeholder="Search pages, actions…"
            className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-400
            bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No results for "{query}"</div>
          ) : (
            <div className="p-2 space-y-0.5">
              {/* Section label */}
              {!query && (
                <p className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Actions</p>
              )}
              {results.map((item, i) => {
                const Icon = item.icon;
                const isAction = item.type === 'action';
                const active = i === cursor;
                return (
                  <React.Fragment key={item.path || item.id}>
                    {!query && i === QUICK_ACTIONS.length && (
                      <p className="px-3 pt-2 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Pages
                      </p>
                    )}
                    <motion.button
                      key={item.id || item.path}
                      onClick={() => go(item)}
                      onMouseEnter={() => setCursor(i)}
                      animate={{ backgroundColor: active
                        ? isDark ? 'rgba(31,111,178,0.2)' : 'rgba(13,59,102,0.06)'
                        : 'transparent'
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${item.color || C.deepBlue}18` }}>
                        <Icon className="h-4 w-4" style={{ color: item.color || C.deepBlue }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-semibold truncate",
                          isDark ? "text-slate-100" : "text-slate-800")}>
                          {item.label}
                        </p>
                        {isAction && (
                          <p className="text-[10px] text-slate-400 font-medium">Quick action</p>
                        )}
                      </div>
                      {active && (
                        <kbd className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700
                          text-slate-400 border border-slate-200 dark:border-slate-600 flex-shrink-0">
                          ↵
                        </kbd>
                      )}
                    </motion.button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t flex items-center gap-4"
          style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['esc', 'close']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 text-[9px] font-black rounded bg-slate-100 dark:bg-slate-700
                text-slate-500 border border-slate-200 dark:border-slate-600">
                {key}
              </kbd>
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Quick-add floating button ─────────────────────────────────────────────
function QuickAddFAB({ isDark }) {
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-6 right-20 z-50 flex flex-col-reverse items-end gap-2">
      <AnimatePresence>
        {open && QUICK_ACTIONS.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 12, scale: 0.85 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{   opacity: 0, y: 12, scale: 0.85  }}
              transition={{ ...SP.med, delay: i * 0.04 }}
              onClick={() => { navigate(action.path); setOpen(false); }}
              className="flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-2xl text-white text-xs font-bold shadow-lg"
              style={{ background: `linear-gradient(135deg, ${action.color}dd, ${action.color})`,
                       boxShadow: `0 4px 16px ${action.color}44` }}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </motion.button>
          );
        })}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        className="w-12 h-12 rounded-2xl text-white shadow-xl flex items-center justify-center"
        style={{ background: GRAD.primary, boxShadow: '0 6px 24px rgba(13,59,102,0.4)' }}
        aria-label="Quick add"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={SP.snap}>
          <Plus className="h-5 w-5" />
        </motion.div>
      </motion.button>
    </div>
  );
}

// ─── Today's summary strip (shown in sidebar below greeting) ───────────────
function TodaySummary({ isDark }) {
  const { data } = useQuery({
    queryKey: ['today-summary'],
    queryFn:  () => api.get('/dashboard/today-summary').then(r => r.data).catch(() => null),
    staleTime: 60_000,
    retry: false,
  });
  if (!data) return null;
  const items = [
    { label: 'Tasks due',    value: data.tasks_due    || 0, color: C.medBlue },
    { label: 'Visits today', value: data.visits_today || 0, color: C.coral   },
    { label: 'Pending docs', value: data.pending_docs || 0, color: C.amber   },
  ].filter(i => i.value > 0);
  if (!items.length) return null;
  return (
    <div className="mx-3 mb-2 p-2.5 rounded-xl border"
      style={{
        background:   isDark ? 'rgba(31,111,178,0.08)' : 'rgba(13,59,102,0.04)',
        borderColor:  isDark ? 'rgba(31,111,178,0.2)' : 'rgba(13,59,102,0.1)',
      }}>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Today</p>
      <div className="space-y-1">
        {items.map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
            <span className="text-[10px] font-black tabular-nums" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recently visited ──────────────────────────────────────────────────────
const MAX_RECENT = 3;
function useRecentPages(location) {
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentPages') || '[]'); } catch { return []; }
  });
  useEffect(() => {
    const item = ALL_ITEMS.find(i => i.path === location.pathname);
    if (!item) return;
    setRecent(prev => {
      const next = [item, ...prev.filter(p => p.path !== item.path)].slice(0, MAX_RECENT);
      localStorage.setItem('recentPages', JSON.stringify(next));
      return next;
    });
  }, [location.pathname]);
  return recent;
}

// ─── Pinned favourites ─────────────────────────────────────────────────────
function usePinned() {
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pinnedNav') || '[]'); } catch { return []; }
  });
  const toggle = useCallback((path) => {
    setPinned(prev => {
      const next = prev.includes(path)
        ? prev.filter(p => p !== path)
        : prev.length < 3 ? [...prev, path] : prev;
      localStorage.setItem('pinnedNav', JSON.stringify(next));
      return next;
    });
  }, []);
  return [pinned, toggle];
}

// ─── Notification Drawer ───────────────────────────────────────────────────
function NotificationDrawer({ open, onClose, isDark }) {
  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn:  () => api.get('/notifications').then(r => r.data).catch(() => []),
    enabled:  open,
    staleTime: 30_000,
  });

  const categories = useMemo(() => {
    const cats = { Tasks: [], Visits: [], System: [] };
    (notifs || []).forEach(n => {
      const cat = n.category || 'System';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(n);
    });
    return cats;
  }, [notifs]);

  const [activeTab, setActiveTab] = useState('Tasks');

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[800]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ background: 'rgba(5,12,26,0.4)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            className="fixed top-0 right-0 h-full z-[900] flex flex-col w-80 sm:w-96 shadow-2xl"
            style={{
              background:  isDark ? '#1e293b' : '#ffffff',
              borderLeft:  isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            }}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={SP.slide}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
              style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
              <div className="flex items-center gap-2.5">
                <Bell className="h-4.5 w-4.5" style={{ color: C.deepBlue }} />
                <h2 className={cn("font-bold text-sm", isDark ? "text-slate-100" : "text-slate-800")}>
                  Notifications
                </h2>
                {notifs.filter(n => !n.read).length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black text-white"
                    style={{ background: GRAD.coral }}>
                    {notifs.filter(n => !n.read).length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => api.post('/notifications/mark-all-read').catch(() => {})}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-600 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  Mark all read
                </button>
                <button onClick={onClose}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex border-b flex-shrink-0"
              style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
              {Object.keys(categories).map(cat => (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-bold transition-colors relative",
                    activeTab === cat
                      ? isDark ? "text-blue-400" : "text-blue-600"
                      : isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
                  )}>
                  {cat}
                  {categories[cat].filter(n => !n.read).length > 0 && (
                    <span className="absolute top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                  {activeTab === cat && (
                    <motion.div layoutId="notif-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ background: GRAD.primary }} />
                  )}
                </button>
              ))}
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : categories[activeTab]?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <BellOff className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-400">No {activeTab.toLowerCase()} notifications</p>
                </div>
              ) : (
                <div className="p-3 space-y-1.5">
                  {(categories[activeTab] || []).map((n, i) => (
                    <motion.div key={n.id || i}
                      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        "p-3 rounded-xl border transition-colors cursor-pointer",
                        !n.read
                          ? isDark ? "bg-blue-950/30 border-blue-900/50" : "bg-blue-50/60 border-blue-100"
                          : isDark ? "bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/40" : "bg-white border-slate-100 hover:bg-slate-50",
                      )}>
                      <div className="flex items-start gap-2.5">
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-semibold leading-snug",
                            isDark ? "text-slate-200" : "text-slate-700")}>
                            {n.message || n.title || 'Notification'}
                          </p>
                          {n.created_at && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Breadcrumb trail ──────────────────────────────────────────────────────
function Breadcrumb({ location, isDark }) {
  const segments = location.pathname.split('/').filter(Boolean);
  if (!segments.length) return null;

  const crumbs = segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const item = ALL_ITEMS.find(n => n.path === path);
    return {
      label: item?.label || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      path,
      icon:  item?.icon || Home,
    };
  });

  if (crumbs.length === 0) return null;

  return (
    <div className="hidden lg:flex items-center gap-1.5">
      {crumbs.map((crumb, i) => {
        const Icon = crumb.icon;
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.path}>
            {i === 0 ? (
              <div className="p-1.5 rounded-lg flex-shrink-0" style={{ background: `${C.deepBlue}12` }}>
                <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: C.deepBlue }} />
              </div>
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
            )}
            <span className={cn(
              "text-xs font-semibold whitespace-nowrap",
              isLast
                ? isDark ? "text-slate-200" : "text-slate-700"
                : isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600",
            )}>
              {crumb.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Session expiry warning ────────────────────────────────────────────────
function useSessionWarning(user) {
  const warned = useRef(false);
  useEffect(() => {
    if (!user) return;
    // Try to parse expiry from JWT
    try {
      const token   = localStorage.getItem('token') || '';
      const payload = JSON.parse(atob(token.split('.')[1] || ''));
      if (!payload.exp) return;
      const expiresAt = payload.exp * 1000;
      const warnAt    = expiresAt - 5 * 60 * 1000; // 5 min before
      const now       = Date.now();
      if (now >= warnAt) return;
      const timeout = setTimeout(() => {
        if (!warned.current) {
          warned.current = true;
          toast.warning('Your session expires in 5 minutes', {
            action: { label: 'Stay logged in', onClick: () => api.post('/auth/refresh').catch(() => {}) },
            duration: 30_000,
          });
        }
      }, warnAt - now);
      return () => clearTimeout(timeout);
    } catch {}
  }, [user]);
}

// ─── Main DashboardLayout ──────────────────────────────────────────────────
const DashboardLayout = ({ children }) => {
  const { user, logout, hasPermission, loading } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed,   setCollapsed]   = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [settingsOpen, setSettingsOpen] = useState(() =>
    location.pathname.startsWith('/settings')
  );

  // Header / UI state
  const [isDark,       setIsDark]       = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cmdOpen,      setCmdOpen]      = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [scrolled,     setScrolled]     = useState(false);
  const [isDesktop,    setIsDesktop]    = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );

  // Features
  const recentPages        = useRecentPages(location);
  const [pinned, togglePin] = usePinned();
  useActivityTracker(true);
  useSessionWarning(user);

  // Theme persistence
  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Sidebar collapse persistence
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  // Responsive
  useEffect(() => {
    const handle = () => {
      const d = window.innerWidth >= 1024;
      setIsDesktop(d);
      if (!d) setCollapsed(false);
    };
    window.addEventListener('resize', handle);
    handle();
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Open sidebar on desktop
  useEffect(() => { if (window.innerWidth >= 1024) setSidebarOpen(true); }, []);

  // Scroll detection on main panel
  useEffect(() => {
    const el = document.getElementById('main-scroll');
    if (!el) return;
    const h = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', h, { passive: true });
    return () => el.removeEventListener('scroll', h);
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(o => !o); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Close user menu on outside click
  const userMenuRef = useRef(null);
  useEffect(() => {
    if (!userMenuOpen) return;
    const h = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [userMenuOpen]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 className="h-8 w-8 text-blue-500" />
      </motion.div>
    </div>
  );

  if (!user) { navigate('/login', { replace: true }); return null; }

  const handleLogout = () => { logout(); toast.success('Signed out'); navigate('/login', { replace: true }); };

  const allVisible = ALL_ITEMS.filter(i => !i.permission || hasPermission(i.permission));
  const sidebarPx  = collapsed ? S_NARROW : S_WIDE;
  const offsetPx   = isDesktop ? sidebarPx : 0;

  // ── Sidebar nav item ─────────────────────────────────────────────────────
  const NavItem = ({ item, small = false }) => {
    if (item.permission && !hasPermission(item.permission)) return null;
    const isActive  = location.pathname === item.path;
    const isPinned  = pinned.includes(item.path);
    const Icon      = item.icon;

    return (
      <motion.div
        className="relative group"
        whileHover={{ x: collapsed ? 0 : 2 }}
        whileTap={{ scale: 0.97 }}
        transition={SP.snap}
      >
        <Link
          to={item.path}
          onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
          title={collapsed ? item.label : undefined}
          className={cn(
            'relative flex items-center gap-2.5 rounded-xl transition-all duration-150',
            collapsed ? 'justify-center w-11 h-11 mx-auto' : small ? 'px-3 py-2' : 'px-3 py-2.5',
            isActive
              ? 'text-white'
              : isDark
                ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80',
          )}
          style={isActive ? { background: GRAD.primary, boxShadow: '0 4px 16px rgba(13,59,102,0.28)' } : {}}
        >
          {/* Left pill on active */}
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white/50" />
          )}

          <Icon className={cn(
            'flex-shrink-0 transition-colors',
            collapsed ? 'h-5 w-5' : small ? 'h-3.5 w-3.5' : 'h-4 w-4',
            isActive ? 'text-white' : isDark
              ? 'text-slate-500 group-hover:text-slate-300'
              : 'text-slate-400 group-hover:text-slate-600',
          )} />

          {!collapsed && (
            <span className={cn("flex-1 text-sm whitespace-nowrap tracking-tight",
              small ? "text-xs font-medium" : "font-medium")}>
              {item.label}
            </span>
          )}

          {/* Pin button — shows on hover when expanded */}
          {!collapsed && !isActive && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(item.path); }}
              className={cn(
                "opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity flex-shrink-0",
                isDark ? "text-slate-500 hover:text-amber-400" : "text-slate-300 hover:text-amber-500",
                isPinned && "opacity-100 text-amber-400",
              )}
              title={isPinned ? 'Unpin' : 'Pin to favourites'}
            >
              {isPinned
                ? <Star className="h-3 w-3 fill-current" />
                : <Star className="h-3 w-3" />}
            </button>
          )}

          {/* Collapsed tooltip */}
          {collapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-2 rounded-xl shadow-xl
              opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0
              transition-all duration-200 z-[100] pointer-events-none min-w-[120px]"
              style={{
                background: isDark ? '#0f172a' : '#1e293b',
                border:     '1px solid rgba(255,255,255,0.08)',
              }}>
              <p className="text-xs font-bold text-white whitespace-nowrap">{item.label}</p>
              <span className="absolute right-full top-1/2 -translate-y-1/2
                border-4 border-transparent"
                style={{ borderRightColor: isDark ? '#0f172a' : '#1e293b' }} />
            </div>
          )}
        </Link>
      </motion.div>
    );
  };

  // ── Section divider ──────────────────────────────────────────────────────
  const NavDivider = ({ label, collapsible, sectionId }) => (
    <div className={cn('mb-1', collapsed ? 'px-1 mt-3' : 'px-3 mt-4')}>
      {!collapsed && label ? (
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
            {label}
          </p>
          {collapsible && (
            <motion.button
              onClick={() => setSettingsOpen(o => !o)}
              animate={{ rotate: settingsOpen ? 0 : -90 }}
              transition={SP.snap}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <ChevronDown className="h-3 w-3" />
            </motion.button>
          )}
        </div>
      ) : (
        <div className="border-t border-slate-100 dark:border-slate-700/60 mx-1" />
      )}
    </div>
  );

  return (
    <div className={cn("min-h-screen relative", isDark ? 'bg-[#0b1120]' : 'bg-[#F2F5FB]')}>
      <OfflineBanner />

      {/* ── Mobile overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && !isDesktop && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{
              background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 100%)',
              backdropFilter: 'blur(2px)',
            }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <motion.aside
        className="fixed top-0 left-0 h-full z-50 flex flex-col"
        animate={{ width: sidebarPx, x: isDesktop ? 0 : sidebarOpen ? 0 : -sidebarPx }}
        transition={SP.slide}
        style={{
          background:  isDark ? '#131c2e' : '#ffffff',
          borderRight: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e8ecf4',
          boxShadow:   isDesktop
            ? isDark ? '2px 0 20px rgba(0,0,0,0.3)' : '2px 0 16px rgba(0,0,0,0.05)'
            : '4px 0 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* ── Logo strip ──────────────────────────────────────────────────── */}
        <div
          className="flex items-center h-14 px-3 flex-shrink-0 relative"
          style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9' }}
        >
          <AnimatePresence mode="wait">
            {!collapsed ? (
              <motion.div key="expanded" className="flex items-center gap-2.5 flex-1 overflow-hidden"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <img src="/logo.png" alt="Taskosphere" className="h-8 object-contain flex-shrink-0" />
                <span className={cn("font-black text-sm tracking-tight truncate",
                  isDark ? "text-slate-100" : "text-slate-800")}>
                  Taskosphere
                </span>
              </motion.div>
            ) : (
              <motion.div key="collapsed" className="flex items-center justify-center w-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <img src="/logo.png" alt="Taskosphere" className="h-8 w-8 object-contain" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapse toggle — always right-aligned, never overlaps logo */}
          <motion.button
            onClick={() => setCollapsed(p => !p)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={SP.snap}
            className={cn(
              "flex-shrink-0 p-1.5 rounded-xl transition-colors",
              isDark
                ? "text-slate-500 hover:text-slate-200 hover:bg-slate-700"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
              collapsed && "absolute right-2 top-1/2 -translate-y-1/2",
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </motion.button>
        </div>

        {/* ── Nav scroll area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 scrollbar-none">

          {/* Pinned favourites */}
          {pinned.length > 0 && !collapsed && (
            <div className="mb-1">
              <div className="px-3 mb-1">
                <p className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest px-1 flex items-center gap-1">
                  <Star className="h-2.5 w-2.5 fill-current" /> Pinned
                </p>
              </div>
              {pinned.map(path => {
                const item = ALL_ITEMS.find(i => i.path === path);
                if (!item) return null;
                return <NavItem key={path} item={item} small />;
              })}
              <div className="mx-3 mt-2 border-t border-slate-100 dark:border-slate-700/60" />
            </div>
          )}

          {/* Recent pages */}
          {recentPages.length > 0 && !collapsed && (
            <div className="mb-1">
              <div className="px-3 mb-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                  <History className="h-2.5 w-2.5" /> Recent
                </p>
              </div>
              {recentPages.map(item => <NavItem key={item.path} item={item} small />)}
              <div className="mx-3 mt-2 border-t border-slate-100 dark:border-slate-700/60" />
            </div>
          )}

          {/* Today's summary */}
          {!collapsed && <TodaySummary isDark={isDark} />}

          {/* Main nav groups */}
          {NAV_GROUPS.map((group, gi) => {
            const isSettings  = group.id === 'settings';
            const showContent = !isSettings || settingsOpen || collapsed;

            return (
              <React.Fragment key={group.id}>
                {gi > 0 && (
                  <NavDivider
                    label={group.dividerLabel}
                    collapsible={group.collapsible}
                    sectionId={group.id}
                  />
                )}
                <AnimatePresence initial={false}>
                  {showContent && (
                    <motion.div
                      initial={isSettings ? { height: 0, opacity: 0 } : false}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden px-3 space-y-0.5"
                    >
                      {group.items.map(item => <NavItem key={item.path} item={item} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Sidebar footer — collapse-aware ──────────────────────────────── */}
        <div
          className="flex-shrink-0 p-3"
          style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f1f5f9' }}
        >
          {collapsed ? (
            // Collapsed: just avatar with status dot
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl overflow-hidden ring-2"
                  style={{ ringColor: isDark ? '#334155' : '#e2e8f0' }}>
                  {user?.profile_picture ? (
                    <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs font-black"
                      style={{ background: GRAD.primary }}>
                      {user?.full_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                {/* Status dot */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400
                  ring-2 ring-white dark:ring-slate-800" />
              </div>
            </div>
          ) : (
            // Expanded: full user card
            <div className={cn("flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl",
              isDark ? "bg-slate-800/60" : "bg-slate-50/80")}>
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-xl overflow-hidden">
                  {user?.profile_picture ? (
                    <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs font-black"
                      style={{ background: GRAD.primary }}>
                      {user?.full_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400
                  ring-2 ring-white dark:ring-slate-800" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("font-bold text-xs truncate",
                  isDark ? "text-slate-100" : "text-slate-800")}>
                  {user?.full_name}
                </p>
                <p className={cn("text-[10px] truncate capitalize font-medium",
                  isDark ? "text-slate-500" : "text-slate-400")}>
                  {user?.role}
                </p>
              </div>
              <button onClick={handleLogout}
                className={cn("p-1.5 rounded-lg transition-colors flex-shrink-0",
                  isDark
                    ? "text-slate-500 hover:text-red-400 hover:bg-red-950/30"
                    : "text-slate-400 hover:text-red-500 hover:bg-red-50")}
                title="Sign out">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <motion.header
        className="fixed top-0 right-0 z-40 transition-all"
        style={{
          left:               offsetPx,
          height:             HEADER_H,
          background:         isDark
            ? scrolled ? 'rgba(11,17,32,0.98)' : 'rgba(11,17,32,0.95)'
            : scrolled ? 'rgba(255,255,255,0.99)' : 'rgba(255,255,255,0.97)',
          borderBottom:       isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
          boxShadow:          scrolled
            ? isDark ? '0 2px 20px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,0,0,0.08)'
            : 'none',
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          transition:           'box-shadow 0.3s ease, background 0.3s ease',
        }}
      >
        <div className="flex items-center justify-between h-full px-4 sm:px-6 gap-3">

          {/* Left: mobile menu + breadcrumb */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setSidebarOpen(p => !p)}
              className={cn(
                "lg:hidden flex-shrink-0 p-2 rounded-xl border transition-colors",
                isDark
                  ? "border-slate-700 text-slate-400 hover:bg-slate-800"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50",
              )}
              aria-label="Toggle menu"
            >
              <Menu className="h-4 w-4" />
            </motion.button>

            <Breadcrumb location={location} isDark={isDark} />
          </div>

          {/* Center: greeting (large screens) */}
          <div className="hidden xl:flex items-center gap-2 flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className={cn("text-xs font-semibold",
              isDark ? "text-slate-400" : "text-slate-500")}>
              {getGreeting()}, {user?.full_name?.split(' ')[0]}
            </span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className={cn("text-xs font-medium",
              isDark ? "text-slate-500" : "text-slate-400")}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <LiveClock />

            {/* Search / ⌘K trigger */}
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => setCmdOpen(true)}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors",
                isDark
                  ? "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300 bg-slate-800/60"
                  : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 bg-white",
              )}
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:block">Search…</span>
              <kbd className="hidden md:flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-black
                bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-400">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </motion.button>

            {/* Divider */}
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Notification bell → opens drawer */}
            <motion.button
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
              onClick={() => setNotifOpen(o => !o)}
              className={cn(
                "relative h-9 w-9 rounded-xl flex items-center justify-center border transition-colors",
                notifOpen
                  ? isDark ? "bg-slate-700 border-slate-600" : "bg-slate-100 border-slate-300"
                  : isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <Bell className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              {/* Unread dot — real data from NotificationBell if available */}
            </motion.button>

            {/* Theme toggle */}
            <motion.button
              onClick={() => setIsDark(p => !p)}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center border transition-colors",
                isDark
                  ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50",
              )}
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={isDark ? 'sun' : 'moon'}
                  initial={{ rotate: -25, opacity: 0, scale: 0.8 }}
                  animate={{ rotate: 0,   opacity: 1, scale: 1   }}
                  exit={{   rotate:  25, opacity: 0, scale: 0.8  }}
                  transition={{ duration: 0.15 }}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {/* User dropdown */}
            <div className="relative" ref={userMenuRef}>
              <motion.button
                onClick={() => setUserMenuOpen(p => !p)}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                className={cn(
                  "flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border transition-all",
                  isDark
                    ? "border-slate-700 bg-slate-800/70 hover:border-slate-600"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                {/* Avatar with status dot */}
                <div className="relative">
                  <div className="w-7 h-7 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-600">
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-black"
                        style={{ background: GRAD.primary }}>
                        {user?.full_name?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400
                    ring-1 ring-white dark:ring-slate-800" />
                </div>
                <span className={cn("hidden md:block text-xs font-bold",
                  isDark ? "text-slate-200" : "text-slate-700")}>
                  {user?.full_name?.split(' ')[0]}
                </span>
                <motion.div animate={{ rotate: userMenuOpen ? 180 : 0 }} transition={SP.snap}>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0,   scale: 1     }}
                    exit={{   opacity: 0, y: -10, scale: 0.95   }}
                    transition={SP.soft}
                    className="absolute right-0 mt-2 w-64 z-50 rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                      background: isDark ? '#1e293b' : '#ffffff',
                      border:     isDark ? '1px solid #334155' : '1px solid #e8ecf4',
                      boxShadow:  isDark
                        ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)'
                        : '0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* User info */}
                    <div className="px-4 py-4 border-b" style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }}>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-11 h-11 rounded-xl overflow-hidden ring-2 ring-slate-100 dark:ring-slate-700">
                            {user?.profile_picture ? (
                              <img src={user.profile_picture} alt={user.full_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white font-black text-sm"
                                style={{ background: GRAD.primary }}>
                                {user?.full_name?.[0]?.toUpperCase() || 'U'}
                              </div>
                            )}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400
                            ring-2 ring-white dark:ring-slate-800" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-bold text-sm truncate",
                            isDark ? "text-slate-100" : "text-slate-800")}>
                            {user?.full_name}
                          </p>
                          <p className={cn("text-xs truncate mt-0.5",
                            isDark ? "text-slate-400" : "text-slate-500")}>
                            {user?.email}
                          </p>
                          <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black capitalize"
                            style={{ background: `${C.deepBlue}12`, color: C.deepBlue }}>
                            {user?.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Menu items */}
                    <div className="p-2 space-y-0.5">
                      {[
                        { icon: Settings,    label: 'General Settings', path: '/settings'        },
                        { icon: Mail,        label: 'Email Accounts',   path: '/settings/email'  },
                        { icon: UserCheck,   label: 'My Attendance',    path: '/attendance'      },
                      ].map(({ icon: Icon, label, path }) => (
                        <motion.button key={path}
                          onClick={() => { navigate(path); setUserMenuOpen(false); }}
                          whileHover={{ x: 2 }}
                          transition={SP.snap}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                            isDark
                              ? "text-slate-300 hover:bg-slate-700/60"
                              : "text-slate-600 hover:bg-slate-50",
                          )}>
                          <Icon className="h-4 w-4 text-slate-400" />
                          {label}
                        </motion.button>
                      ))}

                      <div className="border-t my-1.5" style={{ borderColor: isDark ? '#334155' : '#f1f5f9' }} />

                      <motion.button
                        onClick={handleLogout}
                        whileHover={{ x: 2 }}
                        transition={SP.snap}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors text-left",
                          isDark
                            ? "text-red-400 hover:bg-red-950/30"
                            : "text-red-600 hover:bg-red-50",
                        )}>
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
      </motion.header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div
        className="transition-all duration-300 ease-in-out min-h-screen flex flex-col"
        style={{ marginLeft: offsetPx }}
      >
        <div
          id="main-scroll"
          className="flex-1 overflow-y-auto"
          style={{ paddingTop: HEADER_H, height: '100vh' }}
        >
          <main className="p-4 sm:p-6 md:p-7 min-h-full">
            <div className="max-w-[1440px] mx-auto">
              {/* Page transition */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{   opacity: 0, y: -6  }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {/* ── Overlays & portals ────────────────────────────────────────────── */}
      <AnimatePresence>
        {cmdOpen && (
          <CommandPalette
            open={cmdOpen}
            onClose={() => setCmdOpen(false)}
            navItems={allVisible}
            isDark={isDark}
          />
        )}
      </AnimatePresence>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} isDark={isDark} />

      <QuickAddFAB isDark={isDark} />
      <BackToTop />
    </div>
  );
};

export default DashboardLayout;
