// Reminders.jsx — Dedicated Reminders & Meetings page
// WelcomeBanner + Full Calendar View + Popup Notifications

import { useDark } from '@/hooks/useDark';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WelcomeBanner } from '@/components/ui/WelcomeBanner';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  format, parseISO, isPast, isToday as dateFnsIsToday,
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth,
  addMonths, subMonths, getDay,
} from 'date-fns';
import {
  Bell, BellRing, Plus, Trash2, X, Edit2, Clock,
  Calendar as CalendarIcon, Users, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, ExternalLink,
  Settings2, Search, List, LayoutGrid,
} from 'lucide-react';
import LayoutCustomizer from '../components/layout/LayoutCustomizer';
import { usePageLayout } from '../hooks/usePageLayout';

// ── Constants ────────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber:        '#F59E0B',
  coral:        '#FF6B6B',
  purple:       '#8B5CF6',
};

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
};
const springPhysics = {
  card: { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift: { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
};

const slimScroll = {
  overflowY:      'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: '#cbd5e1 transparent',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveId(r) {
  if (!r) return null;
  const id = r.id ?? r._id ?? r['_id'] ?? null;
  return id ? String(id) : null;
}

function normalizeReminder(r) {
  if (!r) return r;
  return { ...r, id: resolveId(r) };
}

const stripHtml = (str) => (str || '').replace(/<[^>]*>/g, '');

const formatReminderTime = (isoStr) => {
  if (!isoStr) return '—';
  try { return format(new Date(isoStr), 'MMM d, yyyy · h:mm a'); } catch { return '—'; }
};

const buildGCalURL = (reminder) => {
  try {
    const start = reminder.remind_at ? new Date(reminder.remind_at) : null;
    if (!start) return '#';
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return `https://calendar.google.com/calendar/r/eventedit?dates=${fmt(start)}/${fmt(end)}&text=${encodeURIComponent(reminder.title)}&details=${encodeURIComponent(reminder.description || '')}`;
  } catch { return '#'; }
};

// ── Notification helpers ─────────────────────────────────────────────────────
function getFiredIds() {
  try {
    const stored = sessionStorage.getItem('rem_fired_ids');
    return new Set(stored ? JSON.parse(stored) : []);
  } catch { return new Set(); }
}
function addFiredId(id) {
  try {
    const set = getFiredIds();
    set.add(String(id));
    sessionStorage.setItem('rem_fired_ids', JSON.stringify([...set]));
  } catch {}
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '/favicon.ico', tag: title }); } catch {}
  }
}

// ── Layout Primitives ────────────────────────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeaderRow({ iconBg, icon, title, subtitle, action, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500 text-white leading-none">{badge}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex items-center gap-1.5 flex-shrink-0">{action}</div>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function Reminders() {
  const isDark = useDark();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State
  const [reminders, setReminders] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showListView, setShowListView] = useState(false);
  const [calendarPopupReminder, setCalendarPopupReminder] = useState(null);

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDatetime, setFormDatetime] = useState('');

  // Layout customizer
  const REM_SECTIONS = ['overview', 'calendar_view', 'reminders_list'];
  const REM_LABELS = {
    overview:       { name: 'Overview Stats', icon: '📊', desc: 'Reminder statistics' },
    calendar_view:  { name: 'Calendar View', icon: '📅', desc: 'Monthly calendar with reminders' },
    reminders_list: { name: 'Reminders List', icon: '🔔', desc: 'All reminders and meetings' },
  };
  const { order: remOrder, moveSection: remMove, resetOrder: remReset } = usePageLayout('reminders', REM_SECTIONS);
  const [showCustomize, setShowCustomize] = useState(false);

  // Request notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  // Fetch users for admin dropdown
  useEffect(() => {
    if (!isAdmin) return;
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users');
        if (Array.isArray(res.data)) setAllUsers(res.data);
      } catch {}
    };
    fetchUsers();
  }, [isAdmin]);

  // Fetch reminders
  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const uid = isAdmin && selectedUserId ? selectedUserId : undefined;
      const url = uid ? `/email/reminders?user_id=${uid}` : '/email/reminders';
      const res = await api.get(url);
      const raw = Array.isArray(res.data) ? res.data : [];
      setReminders(raw.map(normalizeReminder));
    } catch {
      console.error('Failed to fetch reminders');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedUserId]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  // ── Popup Reminder Notifications ──────────────────────────────────────────
  useEffect(() => {
    if (!reminders.length) return;
    const checkReminders = () => {
      const firedIds = getFiredIds();
      const now = new Date();
      reminders.forEach(rem => {
        if (rem.is_dismissed) return;
        const remId = resolveId(rem);
        if (!remId || firedIds.has(remId)) return;
        if (!rem.remind_at) return;
        try {
          const remDate = new Date(rem.remind_at);
          const diffMs = remDate.getTime() - now.getTime();
          // Fire if within 1 minute window (past or upcoming)
          if (diffMs <= 60000 && diffMs >= -300000) {
            addFiredId(remId);
            // In-app toast notification
            toast.warning(`🔔 Reminder: ${rem.title}`, {
              description: rem.description ? stripHtml(rem.description).slice(0, 100) : formatReminderTime(rem.remind_at),
              duration: 10000,
              action: {
                label: 'Dismiss',
                onClick: () => handleDismiss(remId),
              },
            });
            // Browser notification
            sendBrowserNotification(
              `🔔 ${rem.title}`,
              rem.description ? stripHtml(rem.description).slice(0, 100) : `Due: ${formatReminderTime(rem.remind_at)}`
            );
          }
        } catch {}
      });
    };
    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [reminders]);

  // Dismiss reminder
  const handleDismiss = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/email/reminders/${id}`, { is_dismissed: true });
      setReminders(prev => prev.map(r => resolveId(r) === String(id) ? { ...r, is_dismissed: true } : r));
    } catch {}
  };

  // Create reminder
  const handleCreate = async () => {
    if (!formTitle.trim() || !formDatetime) {
      toast.error('Title and date/time are required');
      return;
    }
    try {
      await api.post('/email/save-as-reminder', {
        title: formTitle.trim(),
        description: formDesc.trim() || '',
        remind_at: new Date(formDatetime).toISOString(),
      });
      toast.success('Reminder created');
      resetForm();
      await fetchReminders();
    } catch {
      toast.error('Failed to create reminder');
    }
  };

  // Update reminder
  const handleUpdate = async () => {
    if (!editingReminder) return;
    const remId = resolveId(editingReminder);
    if (!remId) { toast.error('Cannot update: ID missing'); return; }
    try {
      await api.patch(`/email/reminders/${remId}`, {
        title: formTitle.trim(),
        description: formDesc.trim(),
        remind_at: formDatetime ? new Date(formDatetime).toISOString() : undefined,
      });
      toast.success('Reminder updated');
      resetForm();
      await fetchReminders();
    } catch {
      toast.error('Failed to update reminder');
    }
  };

  // Delete reminder
  const handleDelete = async (id) => {
    if (!id) return;
    try {
      await api.delete(`/email/reminders/${id}`);
      toast.success('Reminder deleted');
      setReminders(prev => prev.filter(r => resolveId(r) !== String(id)));
    } catch {
      try {
        await api.patch(`/email/reminders/${id}`, { is_dismissed: true });
        toast.success('Reminder dismissed');
        setReminders(prev => prev.filter(r => resolveId(r) !== String(id)));
      } catch {
        toast.error('Failed to delete reminder');
      }
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingReminder(null);
    setFormTitle('');
    setFormDesc('');
    setFormDatetime('');
  };

  const startEdit = (rem) => {
    setEditingReminder(rem);
    setFormTitle(rem.title || '');
    setFormDesc(stripHtml(rem.description || ''));
    try {
      setFormDatetime(new Date(rem.remind_at).toISOString().slice(0, 16));
    } catch { setFormDatetime(''); }
    setShowForm(true);
  };

  // Filtered reminders
  const filteredReminders = useMemo(() => {
    let list = Array.isArray(reminders) ? reminders : [];

    if (filterStatus === 'upcoming') {
      list = list.filter(r => !r.is_dismissed && r.remind_at && !isPast(new Date(r.remind_at)));
    } else if (filterStatus === 'overdue') {
      list = list.filter(r => !r.is_dismissed && r.remind_at && isPast(new Date(r.remind_at)));
    } else if (filterStatus === 'dismissed') {
      list = list.filter(r => r.is_dismissed);
    } else {
      list = list.filter(r => !r.is_dismissed);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(r => (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    }

    return list.sort((a, b) => {
      const da = a.remind_at ? new Date(a.remind_at).getTime() : 0;
      const db = b.remind_at ? new Date(b.remind_at).getTime() : 0;
      return da - db;
    });
  }, [reminders, filterStatus, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const active = reminders.filter(r => !r.is_dismissed);
    const overdue = active.filter(r => r.remind_at && isPast(new Date(r.remind_at)));
    const upcoming = active.filter(r => r.remind_at && !isPast(new Date(r.remind_at)));
    const todayCount = active.filter(r => {
      try { return dateFnsIsToday(new Date(r.remind_at)); } catch { return false; }
    });
    return { total: active.length, overdue: overdue.length, upcoming: upcoming.length, today: todayCount.length };
  }, [reminders]);

  // Calendar data — reminders grouped by date
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [calendarMonth]);

  const remindersByDate = useMemo(() => {
    const map = {};
    const active = reminders.filter(r => !r.is_dismissed && r.remind_at);
    active.forEach(r => {
      try {
        const dateKey = format(new Date(r.remind_at), 'yyyy-MM-dd');
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(r);
      } catch {}
    });
    return map;
  }, [reminders]);

  const isViewingOther = isAdmin && selectedUserId && selectedUserId !== user?.id;
  const startDayOfWeek = getDay(startOfMonth(calendarMonth)); // 0=Sun

  return (
    <>
      <LayoutCustomizer
        isOpen={showCustomize}
        onClose={() => setShowCustomize(false)}
        sections={REM_SECTIONS}
        labels={REM_LABELS}
        order={remOrder}
        onMove={remMove}
        onReset={remReset}
      />

      <motion.div
        className="space-y-4 pb-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* WELCOME BANNER */}
        <motion.div variants={itemVariants}>
          <WelcomeBanner
            title="Reminders & Meetings"
            subtitle={isViewingOther ? "Viewing another user's reminders" : 'Manage your reminders and meetings'}
            icon={BellRing}
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin && (
                  <Select value={selectedUserId || 'all'} onValueChange={(v) => setSelectedUserId(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm rounded-xl bg-white/15 border-white/20 text-white placeholder:text-white/50">
                      <SelectValue placeholder="All Users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">My Reminders</SelectItem>
                      {allUsers.map(u => (
                        <SelectItem key={u.id || u._id} value={String(u.id || u._id)}>
                          {u.full_name || u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  onClick={() => { resetForm(); setShowForm(true); }}
                  className="h-9 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20"
                >
                  <Plus className="h-4 w-4 mr-1" /> New Reminder
                </Button>
                <button
                  onClick={() => setShowListView(v => !v)}
                  title={showListView ? 'Show Calendar Only' : 'Show List View'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/70 border border-white/15 transition-all"
                >
                  {showListView ? <CalendarIcon size={13} /> : <List size={13} />}
                  {showListView ? 'Calendar' : 'List View'}
                </button>
                <button
                  onClick={() => setShowCustomize(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white/70 border border-white/15 transition-all"
                >
                  <Settings2 size={13} /> Customize
                </button>
              </div>
            }
          />
        </motion.div>

        {/* ORDERED SECTIONS */}
        {remOrder.map((sectionId) => {
          if (sectionId === 'overview') return (
            <motion.div key="overview" variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Active', value: stats.total, color: COLORS.purple, icon: Bell },
                { label: 'Today', value: stats.today, color: COLORS.mediumBlue, icon: CalendarIcon },
                { label: 'Upcoming', value: stats.upcoming, color: COLORS.emeraldGreen, icon: Clock },
                { label: 'Overdue', value: stats.overdue, color: COLORS.coral, icon: AlertTriangle },
              ].map((s) => (
                <motion.div key={s.label} whileHover={{ y: -3, transition: springPhysics.card }}
                  className={`rounded-2xl shadow-sm border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
                      <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: s.color }}>{s.value}</p>
                    </div>
                    <div className="p-2 rounded-xl" style={{ backgroundColor: `${s.color}18` }}>
                      <s.icon className="h-4 w-4" style={{ color: s.color }} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          );

          // ── BIG CALENDAR VIEW ──────────────────────────────────────────────
          if (sectionId === 'calendar_view') return !showListView ? (
            <motion.div key="calendar_view" variants={itemVariants}>
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                  icon={<CalendarIcon className="h-4 w-4 text-blue-500" />}
                  title="Reminder Calendar"
                  subtitle={format(calendarMonth, 'MMMM yyyy')}
                  action={
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                        <ChevronLeft className="h-4 w-4 text-slate-400" />
                      </button>
                      <button onClick={() => setCalendarMonth(new Date())}
                        className={`px-2 py-1 text-xs font-semibold rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-blue-400' : 'hover:bg-slate-100 text-blue-500'}`}>
                        Today
                      </button>
                      <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </button>
                    </div>
                  }
                />
                <div className="p-4">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 py-2">{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {/* Empty cells for days before month start */}
                    {Array.from({ length: startDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px]" />
                    ))}
                    {calendarDays.map(day => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const dayReminders = remindersByDate[dateKey] || [];
                      const isToday = dateFnsIsToday(day);
                      const hasOverdue = dayReminders.some(r => isPast(new Date(r.remind_at)));
                      return (
                        <motion.div
                          key={dateKey}
                          whileHover={{ scale: 1.02 }}
                          className={`min-h-[80px] sm:min-h-[100px] rounded-xl border p-1.5 transition-all cursor-pointer ${
                            isToday
                              ? isDark ? 'border-blue-500 bg-blue-900/20' : 'border-blue-400 bg-blue-50'
                              : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => {
                            if (dayReminders.length === 0) {
                              const dt = format(day, "yyyy-MM-dd'T'09:00");
                              setFormDatetime(dt);
                              resetForm();
                              setFormDatetime(dt);
                              setShowForm(true);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                              isToday
                                ? 'bg-blue-500 text-white'
                                : isDark ? 'text-slate-300' : 'text-slate-700'
                            }`}>
                              {format(day, 'd')}
                            </span>
                            {dayReminders.length > 0 && (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${
                                hasOverdue ? 'bg-red-500 text-white' : 'bg-purple-500 text-white'
                              }`}>
                                {dayReminders.length}
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5 overflow-hidden">
                            {dayReminders.slice(0, 2).map(rem => (
                              <div
                                key={resolveId(rem)}
                                onClick={(e) => { e.stopPropagation(); setCalendarPopupReminder(rem); }}
                                className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded-md truncate cursor-pointer transition-all hover:opacity-80 ${
                                  isPast(new Date(rem.remind_at))
                                    ? isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600'
                                    : isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-700'
                                }`}
                              >
                                {rem.title}
                              </div>
                            ))}
                            {dayReminders.length > 2 && (
                              <p className={`text-[9px] font-medium text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                +{dayReminders.length - 2} more
                              </p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </SectionCard>
            </motion.div>
          ) : null;

          if (sectionId === 'reminders_list') return showListView ? (
            <motion.div key="reminders_list" variants={itemVariants}>
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-purple-900/40' : 'bg-purple-50'}
                  icon={<BellRing className="h-4 w-4 text-purple-500" />}
                  title="All Reminders"
                  subtitle={`${filteredReminders.length} reminder${filteredReminders.length !== 1 ? 's' : ''}`}
                  badge={stats.overdue > 0 ? stats.overdue : undefined}
                  action={
                    <div className="flex items-center gap-2">
                      <div className={`flex gap-0.5 rounded-lg p-0.5 ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                        {['all', 'upcoming', 'overdue', 'dismissed'].map(f => (
                          <button key={f} onClick={() => setFilterStatus(f)}
                            className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all capitalize ${
                              filterStatus === f
                                ? isDark ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm'
                                : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                            }`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                />

                {/* Search bar */}
                <div className="px-4 pt-3">
                  <div className="relative">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search reminders..."
                      className={`w-full pl-9 pr-4 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400 focus:ring-purple-900/40 focus:border-purple-500'
                               : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-purple-100 focus:border-purple-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Reminders list */}
                <div className="p-4">
                  {loading ? (
                    <div className={`text-center py-12 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Loading...</div>
                  ) : filteredReminders.length === 0 ? (
                    <div className={`text-center py-12 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {searchTerm ? 'No reminders match your search' : 'No reminders found'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                        {filteredReminders.map(rem => {
                          const remId = resolveId(rem);
                          const isDue = rem.remind_at && isPast(new Date(rem.remind_at));
                          const gcalUrl = buildGCalURL(rem);

                          return (
                            <div key={remId}
                              className={`relative p-4 rounded-xl border transition-colors ${
                                isDue
                                  ? isDark ? 'bg-red-900/15 border-red-800 hover:border-red-700' : 'bg-red-50/70 border-red-200 hover:border-red-300'
                                  : isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
                                    isDue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-purple-50 dark:bg-purple-900/30'
                                  }`}>
                                    <BellRing className={`h-4 w-4 ${isDue ? 'text-red-500' : 'text-purple-500'}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                                        {rem.title || 'Untitled'}
                                      </h4>
                                      {isDue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white">OVERDUE</span>}
                                      {rem.source === 'email_auto' && (
                                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Email</span>
                                      )}
                                    </div>
                                    {rem.description && (
                                      <p className={`text-xs mb-2 line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {stripHtml(rem.description)}
                                      </p>
                                    )}
                                    <div className={`flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                      <Clock className="h-3 w-3" />
                                      <span className={isDue ? 'text-red-500 font-medium' : ''}>
                                        {formatReminderTime(rem.remind_at)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <a href={gcalUrl} target="_blank" rel="noopener noreferrer"
                                    className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}
                                    title="Add to Google Calendar">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                  {!isViewingOther && (
                                    <>
                                      <button onClick={() => startEdit(rem)}
                                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button onClick={() => handleDelete(remId)}
                                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </SectionCard>
            </motion.div>
          ) : null;

          return null;
        })}
      </motion.div>

      {/* CALENDAR REMINDER POPUP */}
      <AnimatePresence>
        {calendarPopupReminder && (() => {
          const rem = calendarPopupReminder;
          const remId = resolveId(rem);
          const isDue = rem.remind_at && isPast(new Date(rem.remind_at));
          const gcalUrl = buildGCalURL(rem);
          return (
            <motion.div
              key="cal-popup"
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(10px)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setCalendarPopupReminder(null)}
            >
              <motion.div
                initial={{ scale: 0.88, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.88, y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                className={`w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}
                onClick={e => e.stopPropagation()}
              >
                {/* Popup Header */}
                <div className="px-6 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${isDue ? COLORS.coral : COLORS.purple}, ${COLORS.mediumBlue})` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                        <BellRing className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">Reminder</p>
                        <h2 className="text-lg font-bold text-white truncate max-w-[220px]">{rem.title || 'Untitled'}</h2>
                      </div>
                    </div>
                    <button onClick={() => setCalendarPopupReminder(null)}
                      className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>

                {/* Popup Body */}
                <div className="px-6 py-5 space-y-3">
                  {rem.description && (
                    <div>
                      <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Description</p>
                      <p className={`text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{stripHtml(rem.description)}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className={`h-4 w-4 flex-shrink-0 ${isDue ? 'text-red-500' : isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                    <span className={`text-sm font-medium ${isDue ? 'text-red-500' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {formatReminderTime(rem.remind_at)}
                    </span>
                    {isDue && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white ml-1">OVERDUE</span>}
                  </div>
                  {rem.source === 'email_auto' && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">From Email</span>
                  )}
                </div>

                {/* Popup Footer — same buttons as list view */}
                <div className={`px-6 py-4 flex gap-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  <a href={gcalUrl} target="_blank" rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                      isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Add to Google Calendar">
                    <ExternalLink className="h-3.5 w-3.5" /> Google Cal
                  </a>
                  {!isViewingOther && (
                    <>
                      <button
                        onClick={() => { setCalendarPopupReminder(null); startEdit(rem); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => { setCalendarPopupReminder(null); handleDelete(remId); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          isDark ? 'border-red-800 text-red-400 hover:bg-red-900/30' : 'border-red-200 text-red-500 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => setCalendarPopupReminder(null)} className="ml-auto rounded-xl text-xs">
                    Close
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* CREATE / EDIT MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={resetForm}
          >
            <motion.div
              initial={{ scale: 0.88, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.88, y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              className={`w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.purple}, ${COLORS.mediumBlue})` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
                        {editingReminder ? 'Edit Reminder' : 'New Reminder'}
                      </p>
                      <h2 className="text-lg font-bold text-white">
                        {editingReminder ? 'Update Details' : 'Create Reminder'}
                      </h2>
                    </div>
                  </div>
                  <button onClick={resetForm}
                    className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Title *</label>
                  <Input
                    value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    placeholder="Reminder title"
                    className={`rounded-xl ${isDark ? 'bg-slate-700 border-slate-600' : ''}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Description</label>
                  <Textarea
                    value={formDesc} onChange={e => setFormDesc(e.target.value)}
                    placeholder="Optional description..."
                    rows={3}
                    className={`rounded-xl ${isDark ? 'bg-slate-700 border-slate-600' : ''}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-semibold mb-1.5 block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Date & Time *</label>
                  <Input
                    type="datetime-local"
                    value={formDatetime} onChange={e => setFormDatetime(e.target.value)}
                    className={`rounded-xl ${isDark ? 'bg-slate-700 border-slate-600' : ''}`}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`px-6 py-4 flex gap-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                <Button variant="outline" onClick={resetForm} className="flex-1 rounded-xl">Cancel</Button>
                <Button
                  onClick={editingReminder ? handleUpdate : handleCreate}
                  disabled={!formTitle.trim() || !formDatetime}
                  className="flex-1 rounded-xl font-semibold"
                  style={{ background: `linear-gradient(135deg, ${COLORS.purple}, ${COLORS.mediumBlue})` }}
                >
                  {editingReminder ? 'Update' : 'Create'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
