import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isPast, parseISO, isToday, isTomorrow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Zap, Trash2, CheckCircle2, Sparkles, ShieldCheck,
  RefreshCw, Target, TrendingUp, AlertCircle,
  Calendar as CalendarIcon, History, Users, Search, X,
  User as UserIcon, Activity, Layers, CheckSquare, Circle,
  ChevronRight, Briefcase, Clock, FileText, Tag, ArrowUpRight,
} from 'lucide-react';

// ── Brand Colors ──────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue:    '#0D3B66',
  mediumBlue:  '#1F6FB2',
  emeraldGreen:'#1FAF5A',
  lightGreen:  '#5CCB5F',
  coral:       '#FF6B6B',
  amber:       '#F59E0B',
};

// ── Spring Physics ─────────────────────────────────────────────────────────────
const springPhysics = {
  card:   { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 },
  lift:   { type: 'spring', stiffness: 320, damping: 24, mass: 0.9  },
  button: { type: 'spring', stiffness: 400, damping: 28 },
  icon:   { type: 'spring', stiffness: 450, damping: 25 },
  tap:    { type: 'spring', stiffness: 500, damping: 30 },
};

// ── Animation Variants ─────────────────────────────────────────────────────────
const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.3 } },
};

const rowVariant = {
  hidden:  { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: 10, transition: { duration: 0.18 } },
};

// ── Slim scroll injection ─────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('todo-slim-scroll')) {
  const s = document.createElement('style');
  s.id = 'todo-slim-scroll';
  s.textContent = `
    .todo-slim::-webkit-scrollbar { width: 3px; }
    .todo-slim::-webkit-scrollbar-track { background: transparent; }
    .todo-slim::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .todo-slim::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .dark .todo-slim::-webkit-scrollbar-thumb { background: #475569; }
  `;
  document.head.appendChild(s);
}

// ── DUE LABEL HELPER ──────────────────────────────────────────────────────────
const getDueLabel = (due_date) => {
  if (!due_date) return null;
  try {
    const d = parseISO(due_date);
    if (isToday(d))    return { label: 'Today',    color: COLORS.amber  };
    if (isTomorrow(d)) return { label: 'Tomorrow', color: '#1F6FB2'     };
    if (isPast(d))     return { label: 'Overdue',  color: COLORS.coral  };
    return { label: format(d, 'MMM d'), color: '#94A3B8' };
  } catch { return null; }
};

// ── SECTION CARD ──────────────────────────────────────────────────────────────
function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── CARD HEADER ROW ───────────────────────────────────────────────────────────
function CardHeaderRow({ iconBg, icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

// ── METRIC CARD ───────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, accent, progress, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -3, transition: springPhysics.card }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className="rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer group border bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400">{label}</p>
            <p className="text-2xl font-bold mt-1 tracking-tight" style={{ color: accent }}>{value}</p>
            {sub && <p className="text-[10px] mt-0.5 text-slate-400 dark:text-slate-500">{sub}</p>}
          </div>
          <div className="p-2 rounded-xl group-hover:scale-110 transition-transform" style={{ backgroundColor: `${accent}18` }}>
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-2.5 h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700">
            <motion.div
              className="h-full rounded-full transition-all duration-700"
              style={{ background: `linear-gradient(90deg, ${accent}, ${accent}bb)` }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── TODO DETAIL MODAL ─────────────────────────────────────────────────────────
function TodoDetailModal({ todo, isDark, onClose, onToggle, onPromote, onDelete, ownerName }) {
  if (!todo) return null;
  const isCompleted = todo.is_completed === true || todo.status === 'completed';
  const due         = getDueLabel(todo.due_date);
  const isOverdue   = due?.label === 'Overdue';

  const safeFormat = (dt) => {
    if (!dt) return '—';
    try { return format(new Date(dt), 'MMM d, yyyy · h:mm a'); } catch { return '—'; }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(7,15,30,0.72)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={`w-full max-w-md rounded-3xl overflow-hidden shadow-2xl ${isDark ? 'bg-slate-900' : 'bg-white'}`}
        initial={{ scale: 0.9, y: 32 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 32 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative px-6 py-5 overflow-hidden"
          style={{
            background: isOverdue && !isCompleted
              ? `linear-gradient(135deg, #B91C1C, #EF4444)`
              : isCompleted
              ? `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`
              : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
          }}
        >
          <div className="absolute right-0 top-0 w-40 h-40 rounded-full -mr-10 -mt-10 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                {isCompleted
                  ? <CheckCircle2 className="w-5 h-5 text-white" />
                  : isOverdue
                  ? <AlertCircle className="w-5 h-5 text-white" />
                  : <CheckSquare className="w-5 h-5 text-white" />
                }
              </div>
              <div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-0.5">
                  {isCompleted ? 'Completed Todo' : isOverdue ? 'Overdue Todo' : 'Active Todo'}
                </p>
                <h2 className="text-lg font-bold text-white leading-tight pr-8">{todo.title || 'Untitled'}</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors active:scale-90"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* Description */}
          {todo.description && (
            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <FileText size={10} /> Description
              </p>
              <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{todo.description}</p>
            </div>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Due Date */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                <CalendarIcon size={9} /> Due Date
              </p>
              {due ? (
                <span
                  className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${due.color}18`, color: due.color }}
                >
                  {due.label === 'Overdue' || due.label === 'Today' || due.label === 'Tomorrow'
                    ? due.label
                    : format(parseISO(todo.due_date), 'MMM d, yyyy')
                  }
                </span>
              ) : (
                <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No due date</p>
              )}
            </div>

            {/* Status */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                <Activity size={9} /> Status
              </p>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                isCompleted
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                  : isOverdue
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                  : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'
              }`}>
                {isCompleted ? '✓ Done' : isOverdue ? '⚠ Overdue' : '⏳ Pending'}
              </span>
            </div>

            {/* Owner */}
            {ownerName && (
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                  <UserIcon size={9} /> Owner
                </p>
                <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{ownerName}</p>
              </div>
            )}

            {/* Created */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
                <Clock size={9} /> Created
              </p>
              <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {todo.created_at ? format(new Date(todo.created_at), 'MMM d, yyyy') : '—'}
              </p>
            </div>

            {/* Completed at */}
            {isCompleted && todo.completed_at && (
              <div className={`col-span-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 ${isDark ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                  <CheckCircle2 size={9} /> Completed At
                </p>
                <p className={`text-xs font-medium ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{safeFormat(todo.completed_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between gap-3 ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { onDelete(todo.id || todo._id); onClose(); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700 transition-all"
            >
              <Trash2 size={14} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { onPromote(todo.id || todo._id); onClose(); }}
              disabled={isCompleted}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Zap size={12} /> Promote
            </motion.button>
          </div>
          <button
            onClick={() => { onToggle(todo.id || todo._id); onClose(); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-all active:scale-95"
            style={{
              background: isCompleted
                ? `linear-gradient(135deg, #64748B, #94A3B8)`
                : `linear-gradient(135deg, ${COLORS.emeraldGreen}, ${COLORS.lightGreen})`,
            }}
          >
            <CheckCircle2 size={14} />
            {isCompleted ? 'Mark Pending' : 'Mark Done'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── TODO ITEM (with click to open detail) ────────────────────────────────────
function TodoItem({ todo, onToggle, onPromote, onDelete, showOwner, ownerName, onClickDetail }) {
  const isCompleted = todo.is_completed === true || todo.status === 'completed';
  const due         = getDueLabel(todo.due_date);
  const isOverdue   = due?.label === 'Overdue';

  return (
    <motion.div
      layout
      variants={rowVariant}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={{ y: -1 }}
      className={`relative flex items-center gap-3 px-4 py-3 border-b last:border-b-0 transition-all group cursor-pointer
        ${isOverdue && !isCompleted
          ? 'bg-red-50/70 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
        }
      `}
      onClick={() => onClickDetail(todo)}
    >
      {/* Overdue left accent bar */}
      {isOverdue && !isCompleted && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r bg-red-400" />
      )}

      {/* Checkbox — stop propagation so clicking it doesn't also open popup */}
      <motion.button
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.88 }}
        transition={springPhysics.button}
        onClick={(e) => { e.stopPropagation(); onToggle(todo.id || todo._id); }}
        className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background:  isCompleted ? COLORS.emeraldGreen : 'transparent',
          borderColor: isCompleted ? COLORS.emeraldGreen : '#CBD5E1',
        }}
      >
        {isCompleted && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={springPhysics.button}>
            <CheckCircle2 size={11} color="#fff" />
          </motion.div>
        )}
      </motion.button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium truncate max-w-[260px] ${
            isCompleted
              ? 'line-through text-slate-400 dark:text-slate-500'
              : 'text-slate-800 dark:text-slate-100'
          }`}>
            {todo.title || 'Untitled'}
          </span>
          {showOwner && ownerName && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <UserIcon size={9} />{ownerName}
            </span>
          )}
          {due && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${due.color}18`, color: due.color }}
            >
              <CalendarIcon size={9} />{due.label}
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
              ✓ Done
            </span>
          )}
        </div>
        {todo.description && (
          <p className="text-xs mt-0.5 line-clamp-1 text-slate-400 dark:text-slate-500">{todo.description}</p>
        )}
      </div>

      {/* Hover hint */}
      <ChevronRight size={13} className="text-slate-300 dark:text-slate-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Actions — visible on hover, stop propagation */}
      <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={e => e.stopPropagation()}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={(e) => { e.stopPropagation(); onPromote(todo.id || todo._id); }}
          disabled={isCompleted}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-all ${
            isCompleted
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600 cursor-not-allowed'
              : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30'
          }`}
        >
          <Zap size={11} /> Promote
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id || todo._id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 transition-all"
        >
          <Trash2 size={13} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── LOG EVENT BADGE ────────────────────────────────────────────────────────────
function EventBadge({ entry }) {
  const safeFormat = (dt) => { try { return format(new Date(dt), 'MMM d, h:mm a'); } catch { return '—'; } };
  if (entry.event === 'deleted' || entry.deleted_at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 whitespace-nowrap">
        <X size={10} /> Deleted · {safeFormat(entry.deleted_at || Date.now())}
      </span>
    );
  }
  if (entry.event === 'uncompleted') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 whitespace-nowrap">
        ↩ Reopened
      </span>
    );
  }
  if (entry.completed_at) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 size={10} /> Completed · {safeFormat(entry.completed_at)}
      </span>
    );
  }
  return null;
}

// ── SEARCH INPUT ──────────────────────────────────────────────────────────────
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-8 pr-8 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ── TAB PILL ──────────────────────────────────────────────────────────────────
function TabPill({ id, label, icon: Icon, count, activeTab, setActiveTab }) {
  const active = activeTab === id;
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
        active
          ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      <Icon size={13} />
      {label}
      {count > 0 && (
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
          active
            ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── FILTER CHIP ───────────────────────────────────────────────────────────────
function FilterChip({ id, label, count, todoFilter, setTodoFilter }) {
  const active = todoFilter === id;
  return (
    <button
      onClick={() => setTodoFilter(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
      }`}
    >
      {label}
      {count !== undefined && <span className="text-[9px] font-black opacity-75">{count}</span>}
    </button>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function TodoDashboard() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const isAdmin     = user?.role === 'admin';
  const isManager   = user?.role === 'manager';

  // ── Dark mode observer (matching Dashboard.jsx) ───────────────────────────
  const [isDark, setIsDark] = useState(() =>
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // ── Form state ───────────────────────────────────────────────────────────
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [dueDate,     setDueDate]     = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('todos');
  const [selectedUser, setSelectedUser] = useState('self');
  const [todoFilter,   setTodoFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [logSearch,    setLogSearch]    = useState('');

  // ── Detail popup state ────────────────────────────────────────────────────
  const [selectedTodo, setSelectedTodo] = useState(null);

  // ── In-memory todo activity log ───────────────────────────────────────────
  const [todoLog, setTodoLog] = useState([]);

  // ── Fetch all users ───────────────────────────────────────────────────────
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    enabled:  isAdmin || isManager,
    queryFn:  async () => {
      const res = await api.get('/users');
      return res.data || [];
    },
  });

  // ── "Everyone" visibility ─────────────────────────────────────────────────
  const canSeeEveryone = useMemo(() => {
    if (isAdmin) return true;
    const list = Array.isArray(user?.permissions?.view_other_todos)
      ? user.permissions.view_other_todos
      : [];
    return list.includes('everyone');
  }, [isAdmin, user]);

  // ── Permitted user list ───────────────────────────────────────────────────
  const permittedUsers = useMemo(() => {
    const selfId = user?.id;
    if (isAdmin) return allUsers.filter(u => (u.id || u._id) !== selfId);
    if (isManager) return allUsers.filter(u => (u.id || u._id) !== selfId);
    const list = Array.isArray(user?.permissions?.view_other_todos)
      ? user.permissions.view_other_todos.filter(id => id !== 'everyone')
      : [];
    return allUsers.filter(u => list.includes(u.id || u._id) && (u.id || u._id) !== selfId);
  }, [isAdmin, isManager, allUsers, user]);

  const showDropdown = isAdmin || isManager || permittedUsers.length > 0 || canSeeEveryone;

  // ── Resolve query user_id ─────────────────────────────────────────────────
  const resolvedUserId = useMemo(() => {
    if (selectedUser === 'self')     return user?.id ?? null;
    if (selectedUser === 'everyone') return 'all';
    return selectedUser;
  }, [selectedUser, user?.id]);

  // ── Fetch todos ───────────────────────────────────────────────────────────
  const { data: todosRaw = [], isLoading } = useQuery({
    queryKey: ['todos', 'page', resolvedUserId],
    enabled:  !!resolvedUserId,
    queryFn:  async () => {
      const res = await api.get('/todos', { params: { user_id: resolvedUserId } });
      return res.data || [];
    },
  });

  const todos = useMemo(() => todosRaw, [todosRaw]);

  // ── User map ──────────────────────────────────────────────────────────────
  const userMap = useMemo(() => {
    const map = {};
    allUsers.forEach(u => {
      const id = u.id || u._id;
      if (id) map[id] = u.full_name || u.user_name || 'Unknown';
    });
    if (user?.id) map[user.id] = user.full_name || user.email || 'Me';
    return map;
  }, [allUsers, user]);

  const resolveUserName = useCallback((userId) => {
    if (!userId) return 'Unknown';
    if (userId === user?.id) return user?.full_name || 'Me';
    return userMap[userId] || userId;
  }, [userMap, user]);

  // ── Seed log from completed todos ─────────────────────────────────────────
  useEffect(() => {
    const completed = todos.filter(t => t.is_completed === true || t.status === 'completed');
    if (!completed.length) return;
    setTodoLog(prev => {
      const existingIds = new Set(prev.map(e => e.id));
      const fresh = completed
        .filter(t => !existingIds.has(t.id || t._id))
        .map(t => ({
          id:            t.id || t._id,
          title:         t.title || 'Untitled',
          created_by_id: t.user_id || t.created_by || null,
          owner_id:      t.user_id || null,
          created_at:    t.created_at || null,
          completed_at:  t.completed_at
            ? new Date(t.completed_at)
            : t.updated_at ? new Date(t.updated_at) : new Date(),
          deleted_at:    null,
          event:         'completed',
        }));
      if (!fresh.length) return prev;
      return [...fresh, ...prev]
        .sort((a, b) => {
          const at = a.completed_at || a.deleted_at || new Date(a.created_at || 0);
          const bt = b.completed_at || b.deleted_at || new Date(b.created_at || 0);
          return bt - at;
        })
        .slice(0, 200);
    });
  }, [todos]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = todos.length;
    const completed = todos.filter(t => t.is_completed === true || t.status === 'completed').length;
    const pending   = total - completed;
    const overdue   = todos.filter(t => {
      if (!t.due_date) return false;
      if (t.is_completed === true || t.status === 'completed') return false;
      try { return isPast(parseISO(t.due_date)); } catch { return false; }
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const healthScore    = Math.max(0, Math.min(100, 100 - (overdue * 10)));
    return { total, completed, pending, overdue, completionRate, healthScore };
  }, [todos]);

  // ── Filtered todos ────────────────────────────────────────────────────────
  const filteredTodos = useMemo(() => {
    let list = todos;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    switch (todoFilter) {
      case 'pending':   list = list.filter(t => !(t.is_completed === true || t.status === 'completed')); break;
      case 'completed': list = list.filter(t => t.is_completed === true || t.status === 'completed'); break;
      case 'overdue':
        list = list.filter(t => {
          if (!t.due_date || t.is_completed === true || t.status === 'completed') return false;
          try { return isPast(parseISO(t.due_date)); } catch { return false; }
        });
        break;
      default: break;
    }
    return list;
  }, [todos, search, todoFilter]);

  // ── Filtered log ──────────────────────────────────────────────────────────
  const filteredLog = useMemo(() => {
    let list = todoLog;
    if (logSearch) {
      const q = logSearch.toLowerCase();
      list = list.filter(e => (e.title || '').toLowerCase().includes(q));
    }
    if (selectedUser === 'self') {
      list = list.filter(e => e.owner_id === user?.id);
    } else if (selectedUser !== 'everyone') {
      list = list.filter(e => e.owner_id === selectedUser);
    }
    return list;
  }, [todoLog, logSearch, selectedUser, user?.id]);

  // ── Dropdown label ────────────────────────────────────────────────────────
  const selectedUserLabel = useMemo(() => {
    if (selectedUser === 'self')     return `My Todos — ${user?.full_name || 'Me'}`;
    if (selectedUser === 'everyone') return 'Everyone — All Users';
    const u = allUsers.find(u => (u.id || u._id) === selectedUser);
    return u ? `${u.full_name || u.user_name}'s Todos` : 'Selected User';
  }, [selectedUser, allUsers, user]);

  // ── Notification helper ───────────────────────────────────────────────────
  const sendNotification = useCallback(async ({ title: t, message }) => {
    try { await api.post('/notifications/send', { title: t, message, type: 'todo' }); } catch (_) {}
  }, []);

  // ── Invalidate ────────────────────────────────────────────────────────────
  const invalidateTodos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todos', 'page', resolvedUserId] });
    queryClient.invalidateQueries({ queryKey: ['todos', 'dashboard-card', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  }, [queryClient, resolvedUserId, user?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (payload) => api.post('/todos', payload),
    onSuccess: (_, vars) => {
      invalidateTodos();
      toast.success('Todo created');
      setTitle(''); setDescription(''); setDueDate('');
      sendNotification({ title: '📝 New Todo', message: `"${vars.title}" created by ${user?.full_name || 'a user'}.` });
    },
    onError: () => toast.error('Failed to create todo'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id }) => {
      const todo = todos.find(t => (t.id || t._id) === id);
      if (!todo) throw new Error('Todo not found');
      const nowCompleted = !(todo.is_completed === true || todo.status === 'completed');
      return api.patch(`/todos/${id}`, { is_completed: nowCompleted });
    },
    onSuccess: (_, { id }) => {
      const todo = todos.find(t => (t.id || t._id) === id);
      if (todo) {
        const wasCompleted = todo.is_completed === true || todo.status === 'completed';
        setTodoLog(prev => [{
          id:            todo.id || todo._id,
          title:         todo.title || 'Untitled',
          created_by_id: todo.user_id || todo.created_by || null,
          owner_id:      todo.user_id || null,
          created_at:    todo.created_at || null,
          completed_at:  wasCompleted ? null : new Date(),
          deleted_at:    null,
          event:         wasCompleted ? 'uncompleted' : 'completed',
        }, ...prev].slice(0, 200));
        if (!wasCompleted) {
          sendNotification({ title: '✅ Todo Completed', message: `"${todo.title}" completed by ${user?.full_name || 'a user'}.` });
        }
      }
      invalidateTodos();
    },
    onError: () => toast.error('Failed to update todo'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id) => api.post(`/todos/${id}/promote-to-task`),
    onSuccess: (_, id) => {
      toast.success('Promoted to Master Task!');
      invalidateTodos();
      const todo = todos.find(t => (t.id || t._id) === id);
      sendNotification({ title: '⚡ Todo Promoted', message: `"${todo?.title || 'A todo'}" promoted by ${user?.full_name || 'a user'}.` });
    },
    onError: () => toast.error('Failed to promote todo'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/todos/${id}`),
    onSuccess: (_, id) => {
      const deleted = todos.find(t => (t.id || t._id) === id);
      if (deleted) {
        setTodoLog(prev => [{
          id:            deleted.id || deleted._id,
          title:         deleted.title || 'Untitled',
          created_by_id: deleted.user_id || deleted.created_by || null,
          owner_id:      deleted.user_id || null,
          created_at:    deleted.created_at || null,
          completed_at:  null,
          deleted_at:    new Date(),
          event:         'deleted',
        }, ...prev].slice(0, 200));
      }
      invalidateTodos();
      toast.success('Todo deleted');
    },
    onError: () => toast.error('Failed to delete todo'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAdd     = () => {
    if (!title.trim()) return;
    addMutation.mutate({
      title:        title.trim(),
      description:  description.trim(),
      due_date:     dueDate ? new Date(dueDate).toISOString() : null,
      is_completed: false,
    });
  };
  const handleToggle  = (id) => toggleMutation.mutate({ id });
  const handlePromote = (id) => promoteMutation.mutate(id);
  const handleDelete  = (id) => deleteMutation.mutate(id);

  // ── User selector ─────────────────────────────────────────────────────────
  const UserSelector = () => (
    showDropdown ? (
      <Select value={selectedUser} onValueChange={setSelectedUser}>
        <SelectTrigger className="h-9 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium" style={{ minWidth: 200 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="self">My Todos ({user?.full_name || 'Me'})</SelectItem>
          {canSeeEveryone && (
            <SelectItem value="everyone">
              <span className="flex items-center gap-2"><Users size={12} className="text-blue-500" />Everyone — All Users</span>
            </SelectItem>
          )}
          {permittedUsers.map(u => (
            <SelectItem key={u.id || u._id} value={u.id || u._id}>
              {u.full_name || u.user_name} ({u.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Todo Detail Popup ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTodo && (
          <TodoDetailModal
            todo={selectedTodo}
            isDark={isDark}
            onClose={() => setSelectedTodo(null)}
            onToggle={(id) => { handleToggle(id); setSelectedTodo(null); }}
            onPromote={(id) => { handlePromote(id); setSelectedTodo(null); }}
            onDelete={(id) => { handleDelete(id); setSelectedTodo(null); }}
            ownerName={selectedTodo.user_id ? resolveUserName(selectedTodo.user_id) : null}
          />
        )}
      </AnimatePresence>

      {/* ── Page Header Banner ────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{
            background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`,
            boxShadow: `0 8px 32px rgba(13,59,102,0.28)`,
          }}
        >
          <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="absolute right-24 bottom-0 w-32 h-32 rounded-full mb-[-30px] opacity-5"
            style={{ background: 'white' }} />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
                {selectedUser !== 'self' && selectedUser !== 'everyone' && (() => {
                  const u = allUsers.find(u => (u.id || u._id) === selectedUser);
                  return u ? ` · ${u.full_name || u.user_name}'s list` : '';
                })()}
                {selectedUser === 'everyone' && ' · All users view'}
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">Todo Management</h1>
              <p className="text-white/60 text-sm mt-1">
                {stats.total === 0
                  ? 'No todos yet — add some to get started'
                  : stats.overdue > 0
                    ? `${stats.overdue} overdue item${stats.overdue === 1 ? '' : 's'} need attention`
                    : stats.completionRate === 100
                      ? 'All todos completed — great work!'
                      : `${stats.pending} remaining · ${stats.completionRate}% complete`
                }
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
              <TabPill id="todos" label="Todos"    icon={CheckSquare} count={stats.pending}      activeTab={activeTab} setActiveTab={setActiveTab} />
              <TabPill id="log"   label="Activity" icon={History}     count={filteredLog.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Key Metrics ──────────────────────────────────────────────────── */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3" variants={itemVariants}>
        <MetricCard icon={Layers}      label="Total"        value={stats.total}                sub="todos tracked"                              accent={COLORS.deepBlue} />
        <MetricCard icon={AlertCircle} label="Overdue"      value={stats.overdue}              sub="need attention"                             accent={stats.overdue > 0 ? COLORS.coral : '#94A3B8'} />
        <MetricCard icon={TrendingUp}  label="Completion"   value={`${stats.completionRate}%`} sub={`${stats.completed} of ${stats.total}`}     accent={COLORS.emeraldGreen} progress={stats.completionRate} />
        <MetricCard icon={Sparkles}    label="Health Score" value={`${stats.healthScore}%`}    sub={stats.healthScore >= 80 ? 'On track' : 'Needs focus'} accent={stats.healthScore >= 80 ? '#1F6FB2' : COLORS.amber} progress={stats.healthScore} />
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ─────────────────── TODOS TAB ─────────────────────────────────── */}
        {activeTab === 'todos' && (
          <motion.div key="todos" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

              {/* LEFT — Create form + stats */}
              <div className="xl:col-span-4 space-y-4">

                {/* Create card */}
                <motion.div variants={itemVariants}>
                  <SectionCard>
                    <CardHeaderRow
                      iconBg="bg-emerald-50 dark:bg-emerald-900/40"
                      icon={<Plus className="h-4 w-4 text-emerald-600" />}
                      title="New Todo"
                      subtitle="Add to your list"
                    />
                    <div className="p-4 space-y-4">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-slate-400">Title *</label>
                        <input
                          type="text" value={title} onChange={e => setTitle(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAdd()}
                          placeholder="What needs to get done?"
                          className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-600 px-3 text-sm font-medium placeholder:font-normal bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-slate-400">Notes</label>
                        <textarea
                          value={description} onChange={e => setDescription(e.target.value)}
                          placeholder="Additional context…" rows={3}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 px-3 py-2.5 text-sm resize-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-slate-400">Due Date</label>
                        <input
                          type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                          className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-600 px-3 text-sm bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                        />
                      </div>
                      <Button
                        onClick={handleAdd}
                        disabled={!title.trim() || addMutation.isPending}
                        className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
                      >
                        {addMutation.isPending
                          ? <><RefreshCw size={14} className="animate-spin" /> Creating…</>
                          : <><Plus size={14} /> Create Todo</>
                        }
                      </Button>
                    </div>
                  </SectionCard>
                </motion.div>

                {/* Quick stats strip */}
                <motion.div variants={itemVariants}>
                  <SectionCard>
                    <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-700">
                      {[
                        { label: 'Done',  value: `${stats.completionRate}%`, color: COLORS.emeraldGreen },
                        { label: 'Alert', value: stats.overdue,              color: COLORS.amber         },
                        { label: 'Left',  value: stats.pending,              color: COLORS.deepBlue      },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="px-3 py-4 text-center">
                          <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
                          <div className="text-[9px] font-semibold uppercase tracking-widest mt-0.5 text-slate-400">{label}</div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </motion.div>

                {/* Progress bar card */}
                <motion.div variants={itemVariants}>
                  <SectionCard>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Overall Progress</span>
                        <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{stats.completionRate}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden flex gap-0.5 bg-slate-100 dark:bg-slate-700">
                        {stats.total > 0 ? (
                          <>
                            {stats.completed > 0 && (
                              <motion.div className="h-full rounded-l-full" style={{ background: COLORS.emeraldGreen, width: `${(stats.completed / stats.total) * 100}%`, minWidth: 4 }}
                                initial={{ width: 0 }} animate={{ width: `${(stats.completed / stats.total) * 100}%` }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }} />
                            )}
                            {stats.overdue > 0 && (
                              <motion.div className="h-full" style={{ background: COLORS.coral, width: `${(stats.overdue / stats.total) * 100}%`, minWidth: 4 }}
                                initial={{ width: 0 }} animate={{ width: `${(stats.overdue / stats.total) * 100}%` }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.25 }} />
                            )}
                            {(stats.pending - stats.overdue) > 0 && (
                              <motion.div className="h-full rounded-r-full flex-1 bg-slate-200 dark:bg-slate-600" style={{ minWidth: 4 }}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.4 }} />
                            )}
                          </>
                        ) : (
                          <div className="h-full w-full rounded-full bg-slate-200 dark:bg-slate-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                        {[
                          { color: COLORS.emeraldGreen, label: 'Completed', count: stats.completed,               hide: false },
                          { color: COLORS.coral,        label: 'Overdue',   count: stats.overdue,                 hide: stats.overdue === 0 },
                          { color: '#CBD5E1',            label: 'Pending',   count: stats.pending - stats.overdue, hide: false },
                        ].filter(i => !i.hide).map(({ color, label, count }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span className="text-[10px] font-medium text-slate-400">
                              {label} <span className="font-bold text-slate-600 dark:text-slate-300">{count}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </motion.div>

                {/* AI Audit card */}
                <motion.div variants={itemVariants}>
                  <SectionCard>
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/40">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">AI Audit</h3>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {stats.total === 0 ? 'No todos yet — add some to get started'
                              : stats.overdue > 0 ? `⚠️ ${stats.overdue} overdue ${stats.overdue === 1 ? 'todo' : 'todos'} need attention`
                              : stats.completionRate === 100 ? '🎉 All todos completed — great work!'
                              : stats.completionRate >= 75 ? `✅ ${stats.completionRate}% done — almost there!`
                              : `📋 ${stats.pending} remaining · ${stats.completionRate}% on track`
                            }
                          </p>
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            background: stats.overdue > 0 ? COLORS.coral : stats.completionRate >= 75 ? COLORS.emeraldGreen : COLORS.amber,
                            boxShadow:  `0 0 0 3px ${(stats.overdue > 0 ? COLORS.coral : stats.completionRate >= 75 ? COLORS.emeraldGreen : COLORS.amber)}28`,
                          }}
                        />
                      </div>
                      {stats.total > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-start gap-2">
                          <AlertCircle size={12} style={{ color: stats.overdue > 0 ? COLORS.coral : COLORS.mediumBlue, marginTop: 1, flexShrink: 0 }} />
                          <p className="text-[11px] font-medium leading-relaxed text-slate-400 dark:text-slate-500">
                            {stats.overdue > 0
                              ? `Address your ${stats.overdue} overdue ${stats.overdue === 1 ? 'item' : 'items'} first to improve your health score from ${stats.healthScore}%.`
                              : stats.pending > 0
                                ? `${stats.pending} ${stats.pending === 1 ? 'todo' : 'todos'} left. Health score: ${stats.healthScore}% — keep the momentum!`
                                : `Perfect score! Health at ${stats.healthScore}%. Consider adding new goals.`
                            }
                          </p>
                        </div>
                      )}
                    </div>
                  </SectionCard>
                </motion.div>
              </div>

              {/* RIGHT — User filter + Todo list */}
              <div className="xl:col-span-8 space-y-4">

                {/* User filter card */}
                {showDropdown && (
                  <motion.div variants={itemVariants}>
                    <SectionCard>
                      <CardHeaderRow
                        iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                        icon={<Users className="h-4 w-4 text-blue-500" />}
                        title={isAdmin ? 'Filter by Team Member' : 'View Todo List'}
                        subtitle="Switch between user views"
                        action={
                          isAdmin && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-widest bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              Admin
                            </span>
                          )
                        }
                      />
                      <div className="p-4">
                        <UserSelector />
                      </div>
                    </SectionCard>
                  </motion.div>
                )}

                {/* Todo list card */}
                <motion.div variants={itemVariants}>
                  <SectionCard>
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{selectedUserLabel}</h3>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{filteredTodos.length} items · click any row for details</p>
                          </div>
                        </div>
                        <div className="flex-shrink-0 w-full sm:w-52">
                          <SearchInput value={search} onChange={setSearch} placeholder="Search todos…" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <FilterChip id="all"       label="All"       count={todos.length}    todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        <FilterChip id="pending"   label="Pending"   count={stats.pending}   todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        <FilterChip id="completed" label="Completed" count={stats.completed} todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        {stats.overdue > 0 && (
                          <FilterChip id="overdue" label="Overdue" count={stats.overdue} todoFilter={todoFilter} setTodoFilter={setTodoFilter} />
                        )}
                      </div>
                    </div>

                    {/* Column header */}
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 grid grid-cols-[20px_1fr_auto] gap-4 items-center bg-slate-50/80 dark:bg-slate-700/30">
                      <div />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Task · Click for details</span>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Actions</span>
                    </div>

                    <div style={{ maxHeight: 560, overflowY: 'auto' }} className="todo-slim">
                      {isLoading ? (
                        <div className="py-16 flex flex-col items-center gap-3">
                          <RefreshCw size={22} className="animate-spin text-slate-400" />
                          <p className="text-xs font-medium text-slate-400">Loading todos…</p>
                        </div>
                      ) : filteredTodos.length === 0 ? (
                        <div className="py-16 flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 dark:bg-slate-700">
                            <CheckSquare size={24} className="text-slate-300 dark:text-slate-500" />
                          </div>
                          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                            {search || todoFilter !== 'all' ? 'No matching todos' : 'No todos yet'}
                          </p>
                          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                            {search || todoFilter !== 'all' ? 'Try adjusting your filters' : 'Create one using the form on the left'}
                          </p>
                        </div>
                      ) : (
                        <AnimatePresence>
                          {filteredTodos.map(todo => (
                            <TodoItem
                              key={todo.id || todo._id}
                              todo={todo}
                              onToggle={handleToggle}
                              onPromote={handlePromote}
                              onDelete={handleDelete}
                              showOwner={selectedUser === 'everyone'}
                              ownerName={resolveUserName(todo.user_id)}
                              onClickDetail={setSelectedTodo}
                            />
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  </SectionCard>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─────────────────── LOG TAB ────────────────────────────────────── */}
        {activeTab === 'log' && (
          <motion.div key="log" variants={containerVariants} initial="hidden" animate="visible" exit={{ opacity: 0 }} className="space-y-4">

            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 min-w-0 max-w-sm">
                <SearchInput value={logSearch} onChange={setLogSearch} placeholder="Search activity log…" />
              </div>
              {showDropdown && (
                <div className="flex-shrink-0 w-64"><UserSelector /></div>
              )}
              <div className="flex-shrink-0">
                <span className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                  {filteredLog.length} entries
                </span>
              </div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <SectionCard>
                <CardHeaderRow
                  iconBg={isDark ? 'bg-blue-900/40' : 'bg-blue-50'}
                  icon={<Activity className="h-4 w-4 text-blue-500" />}
                  title="Todo Activity Log"
                  subtitle={
                    selectedUser === 'everyone' ? 'All users'
                      : selectedUser === 'self' ? 'My activity'
                      : (() => { const u = allUsers.find(u => (u.id||u._id) === selectedUser); return u ? `${u.full_name || u.user_name}'s activity` : 'Selected user'; })()
                  }
                  action={
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                      {filteredLog.length}
                    </span>
                  }
                />

                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/30">
                  <div className="grid gap-4 items-center" style={{ gridTemplateColumns: '1fr 150px 150px 190px' }}>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Todo Title</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Owner</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Created On</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Event</span>
                  </div>
                </div>

                {filteredLog.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 dark:bg-slate-700">
                      <History size={24} className="text-slate-300 dark:text-slate-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No activity yet</p>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Complete or delete a todo and it will appear here</p>
                  </div>
                ) : (
                  <div style={{ maxHeight: 600, overflowY: 'auto' }} className="todo-slim">
                    <AnimatePresence>
                      {filteredLog.map((entry, idx) => {
                        const ownerName   = resolveUserName(entry.owner_id || entry.created_by_id);
                        const createdDate = entry.created_at
                          ? (() => { try { return format(new Date(entry.created_at), 'MMM d, yyyy'); } catch { return '—'; } })()
                          : '—';
                        return (
                          <motion.div
                            key={`${entry.id}-${idx}`}
                            variants={rowVariant}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                          >
                            <div className="grid gap-4 items-center" style={{ gridTemplateColumns: '1fr 150px 150px 190px' }}>
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate" title={entry.title}>{entry.title}</p>
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-900/30">
                                  <UserIcon size={10} className="text-blue-500" />
                                </div>
                                <span className="text-xs font-medium truncate text-slate-600 dark:text-slate-300">{ownerName}</span>
                              </div>
                              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{createdDate}</span>
                              <div className="flex justify-start"><EventBadge entry={entry} /></div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </SectionCard>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
