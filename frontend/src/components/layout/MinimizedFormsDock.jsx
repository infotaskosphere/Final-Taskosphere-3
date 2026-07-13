/**
 * MinimizedFormsDock.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Persistent floating dock that lists every minimized form as a small
 * pill, regardless of which page you're currently on. Mounted once at
 * the app root (outside the router's route-switching area) so it's
 * always visible.
 *
 * Each pill shows: icon, title, which page it belongs to, how long ago
 * it was minimized, a restore (maximize) button, and a discard (x)
 * button. Clicking the body of the pill also restores it.
 *
 * The whole dock itself can be collapsed to a single round badge when
 * it's in the way — handy when several forms are minimized at once.
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  Maximize2, X, ClipboardList, UserPlus, Building2, FileEdit,
  ChevronDown, ChevronUp, Layers, Mail, ShieldCheck, Receipt,
} from 'lucide-react';
import { useMinimizedForms } from '@/contexts/MinimizedFormsContext';

const ICONS = {
  ClipboardList, UserPlus, Building2, FileEdit, Mail, ShieldCheck, Receipt, Layers,
};

const PAGE_LABELS = {
  '/tasks': 'Tasks',
  '/clients': 'Clients',
  '/users': 'Users',
  '/compliance': 'Compliance',
  '/invoicing': 'Sale',
  '/purchase': 'Purchase',
  '/trademark-sphere': 'Trademark Sphere',
};

function pageLabel(path) {
  return PAGE_LABELS[path] || (path || '').replace(/^\//, '').replace(/-/g, ' ') || 'this page';
}

function timeAgo(ts) {
  try { return formatDistanceToNowStrict(new Date(ts), { addSuffix: true }); } catch { return ''; }
}

export default function MinimizedFormsDock() {
  const { forms, restoreForm, discardForm, discardAll } = useMinimizedForms();
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null); // key awaiting confirm

  if (!forms || forms.length === 0) return null;

  const sorted = [...forms].sort((a, b) => b.minimizedAt - a.minimizedAt);

  return (
    <div
      className="fixed z-[70] flex flex-col items-start gap-2"
      style={{ left: 16, bottom: 16 }}
    >
      {/* Collapsed badge */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
          title="Show minimized forms"
        >
          <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold">
            {sorted.length}
          </span>
          <span className="text-xs font-semibold text-slate-700">Minimized {sorted.length === 1 ? 'form' : 'forms'}</span>
          <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
        </button>
      ) : (
        <div className="w-72 rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden">
          {/* Dock header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-700">
                Minimized {sorted.length === 1 ? 'form' : `forms (${sorted.length})`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {sorted.length > 1 && (
                <button
                  onClick={discardAll}
                  className="text-[10px] font-medium text-slate-400 hover:text-red-500 px-1.5 transition-colors"
                  title="Discard all"
                >
                  clear all
                </button>
              )}
              <button
                onClick={() => setCollapsed(true)}
                className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                title="Collapse dock"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Pills */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            <AnimatePresence initial={false}>
              {sorted.map((f) => {
                const Icon = ICONS[f.icon] || FileEdit;
                const confirming = confirmDiscard === f.key;
                return (
                  <motion.div
                    key={f.key}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-blue-50/60 group transition-colors">
                      <button
                        onClick={() => restoreForm(f.key)}
                        className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 text-blue-600"
                        title="Restore"
                      >
                        <Icon className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => restoreForm(f.key)}
                        className="flex-1 min-w-0 text-left"
                        title="Click to restore where you left off"
                      >
                        <div className="text-xs font-semibold text-slate-800 truncate">{f.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {pageLabel(f.path)} · {timeAgo(f.minimizedAt)}
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => restoreForm(f.key)}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors"
                          title="Maximize / resume"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        {confirming ? (
                          <button
                            onClick={() => { discardForm(f.key); setConfirmDiscard(null); }}
                            className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg px-2 py-1.5 transition-colors"
                          >
                            Discard?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDiscard(f.key)}
                            onBlur={() => setConfirmDiscard(null)}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                            title="Discard this form"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
