/**
 * AIDuplicateDialog
 * ─────────────────
 * A fully self-contained duplicate-detection result dialog.
 * Shared across Clients, TodoDashboard, DSCRegister, DocumentsRegister, Passvault.
 *
 * Props:
 *   open           — boolean
 *   onClose        — () => void
 *   groups         — Array<{ item_ids, confidence, reason, score, source }>
 *   items          — full data array (the page's state)
 *   getTitle       — (item) => string   primary label
 *   getSubtitle    — (item) => string   secondary label (optional)
 *   getMeta        — (item) => string[] metadata chips (optional)
 *   onEdit         — (item) => void     (optional)
 *   onDelete       — (item) => void     (optional)
 *   onView         — (item) => void     (optional)
 *   compareFields  — (itemA, itemB) => Array<{label, a, b}> side-by-side compare rows
 *   entityLabel    — string  e.g. "Client", "Todo", "DSC"
 *   accentColor    — string  hex   e.g. '#6d28d9'
 *   canDelete      — boolean
 *   canEdit        — boolean
 *   isDark         — boolean
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, AlertTriangle, X, ArrowLeftRight, Trash2, Edit2, Eye } from 'lucide-react';

const CONF_STYLE = {
  high:   { bg: 'bg-red-50 border-red-200 text-red-700',    dot: 'bg-red-500',    label: 'HIGH MATCH' },
  medium: { bg: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-400', label: 'SIMILAR'    },
  low:    { bg: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-400',    label: 'POSSIBLE'   },
};

export default function AIDuplicateDialog({
  open, onClose, groups = [], items = [],
  getTitle, getSubtitle, getMeta, compareFields,
  onEdit, onDelete, onView,
  entityLabel = 'Record', accentColor = '#6d28d9',
  canDelete = false, canEdit = false, isDark = false,
}) {
  const [compareIds, setCompareIds] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [localGroups, setLocalGroups] = useState(null);

  const displayGroups = localGroups !== null ? localGroups : groups;

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) { setCompareIds([]); setCompareMode(false); setLocalGroups(null); }
  }, [open]);

  const toggleCompare = (id) => {
    const sid = String(id);
    setCompareIds((prev) => {
      if (prev.includes(sid)) return prev.filter((i) => i !== sid);
      if (prev.length >= 2) return [prev[1], sid];
      return [...prev, sid];
    });
  };

  const removeFromGroups = (itemId) => {
    setLocalGroups(
      displayGroups
        .map((g) => ({ ...g, item_ids: g.item_ids.filter((id) => String(id) !== String(itemId)) }))
        .filter((g) => g.item_ids.length > 1)
    );
    setCompareIds((prev) => prev.filter((id) => id !== String(itemId)));
  };

  // Compare panel
  const ComparePanel = () => {
    if (compareIds.length < 2) return null;
    const itemA = items.find((i) => String(i.id) === compareIds[0]);
    const itemB = items.find((i) => String(i.id) === compareIds[1]);
    if (!itemA || !itemB) return null;
    const rows = compareFields ? compareFields(itemA, itemB) : [];
    return (
      <div className={`my-3 border rounded-xl overflow-hidden ${isDark ? 'border-emerald-800 bg-slate-800' : 'border-emerald-200 bg-emerald-50/20'}`}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500 text-white">
          <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Side-by-Side Comparison
          </span>
          <button onClick={() => { setCompareIds([]); setCompareMode(false); }} className="text-white/80 hover:text-white text-xs">
            ✕ Close
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-700' : 'border-emerald-200 bg-emerald-100/50'}`}>
                <th className="px-3 py-2 text-left font-bold text-slate-400 w-24">Field</th>
                <th className="px-3 py-2 text-left font-semibold text-blue-700 max-w-[220px]">
                  <span className="truncate block">{getTitle(itemA).slice(0, 32)}{getTitle(itemA).length > 32 ? '…' : ''}</span>
                </th>
                <th className="px-3 py-2 text-left font-semibold text-purple-700 max-w-[220px]">
                  <span className="truncate block">{getTitle(itemB).slice(0, 32)}{getTitle(itemB).length > 32 ? '…' : ''}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, a, b }) => {
                const diff = String(a || '').toLowerCase() !== String(b || '').toLowerCase();
                return (
                  <tr key={label} className={`border-b ${isDark ? 'border-slate-700' : 'border-emerald-100'} ${diff ? (isDark ? 'bg-amber-900/20' : 'bg-amber-50/60') : ''}`}>
                    <td className="px-3 py-1.5 font-bold text-slate-400 whitespace-nowrap">{label}</td>
                    <td className={`px-3 py-1.5 max-w-[220px] truncate ${diff ? 'text-blue-700 font-semibold' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>{a || '—'}</td>
                    <td className={`px-3 py-1.5 max-w-[220px] truncate ${diff ? 'text-purple-700 font-semibold' : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>{b || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 px-4 py-2.5 border-t border-emerald-200">
          {canDelete && onDelete && (
            <>
              <button onClick={() => { onDelete(itemA); removeFromGroups(itemA.id); setCompareIds([]); setCompareMode(false); }}
                className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1">
                <Trash2 className="h-2.5 w-2.5" /> Delete A
              </button>
              <button onClick={() => { onDelete(itemB); removeFromGroups(itemB.id); setCompareIds([]); setCompareMode(false); }}
                className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center gap-1">
                <Trash2 className="h-2.5 w-2.5" /> Delete B
              </button>
            </>
          )}
          <button onClick={() => setCompareIds([])} className="h-6 px-3 text-[10px] font-semibold rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 ml-auto">
            Clear
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2" style={{ color: isDark ? '#e2e8f0' : '#1e293b' }}>
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI Duplicate Detection — {entityLabel}s
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
            <span>
              {displayGroups.length
                ? `Found ${displayGroups.length} group${displayGroups.length !== 1 ? 's' : ''} of potential duplicate ${entityLabel.toLowerCase()}s.`
                : `No duplicate ${entityLabel.toLowerCase()}s detected.`}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
              ⚡ Local AI Scan
            </span>
            {displayGroups.length > 0 && compareFields && (
              <button
                onClick={() => { setCompareMode((p) => !p); setCompareIds([]); }}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                  compareMode
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                {compareMode ? '✓ Compare Mode ON' : '⇄ Compare Mode'}
              </button>
            )}
          </DialogDescription>
        </DialogHeader>

        {compareMode && compareIds.length < 2 && (
          <div className={`my-2 px-4 py-2 rounded-lg text-xs font-medium text-center ${isDark ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            {compareIds.length === 0 ? `Click any ${entityLabel.toLowerCase()} title below to select (select 2 to compare)` : `1 selected — click one more to compare`}
          </div>
        )}

        {compareMode && compareIds.length === 2 && <ComparePanel />}

        <div className="mt-2 space-y-4">
          {displayGroups.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">All Clear!</p>
              <p className="text-sm text-slate-400 mt-1">No duplicate {entityLabel.toLowerCase()}s found in your data.</p>
            </div>
          ) : displayGroups.map((group, gi) => {
            const groupItems = (group.item_ids || [])
              .map((id) => items.find((i) => String(i.id) === String(id)))
              .filter(Boolean);
            const cs = CONF_STYLE[group.confidence] || CONF_STYLE.medium;

            return (
              <div key={gi} className={`border rounded-xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                {/* Group header */}
                <div className={`px-4 py-3 flex items-center justify-between gap-2 ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xs font-bold text-slate-400">GROUP {gi + 1}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cs.bg}`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${cs.dot}`} />
                      {cs.label}
                    </span>
                    {group.score && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                        Score: {group.score}
                      </span>
                    )}
                    <span className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{group.reason}</span>
                  </div>
                  {compareFields && (
                    <button
                      onClick={() => {
                        const ids = groupItems.slice(0, 2).map((i) => String(i.id));
                        setCompareIds(ids);
                        setCompareMode(true);
                      }}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 transition-all ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-400' : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-600'}`}
                    >
                      ⇄ Compare
                    </button>
                  )}
                </div>

                {/* Items */}
                <div className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
                  {groupItems.map((item) => {
                    const isSelected = compareIds.includes(String(item.id));
                    const meta = getMeta ? getMeta(item) : [];
                    const subtitle = getSubtitle ? getSubtitle(item) : null;
                    return (
                      <div
                        key={item.id}
                        className={`px-4 py-3 flex items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? (isDark ? 'bg-emerald-900/30 border-l-2 border-emerald-500' : 'bg-emerald-50 border-l-2 border-emerald-500')
                            : (isDark ? 'bg-slate-800/60' : 'bg-white')
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${cs.dot}`} />
                          <div className="min-w-0">
                            <button
                              onClick={() => compareMode ? toggleCompare(item.id) : onView && onView(item)}
                              className={`text-sm font-semibold text-left truncate block transition-colors ${
                                compareMode
                                  ? isSelected
                                    ? 'text-emerald-600 font-bold'
                                    : (isDark ? 'text-slate-300 hover:text-emerald-400' : 'text-slate-700 hover:text-emerald-600')
                                  : (isDark ? 'text-slate-100 hover:text-blue-400 underline-offset-2 hover:underline' : 'text-slate-800 hover:text-blue-700 underline-offset-2 hover:underline')
                              }`}
                              title={compareMode ? 'Select for comparison' : `View ${entityLabel}`}
                            >
                              {isSelected && '✓ '}{getTitle(item)}
                            </button>
                            {subtitle && (
                              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
                            )}
                            {meta.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {meta.map((chip, ci) => (
                                  <span key={ci} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {onView && (
                            <button onClick={() => onView(item)}
                              className={`h-6 px-2 text-[10px] font-semibold rounded-lg border transition-colors flex items-center gap-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                              <Eye className="h-2.5 w-2.5" /> View
                            </button>
                          )}
                          {canEdit && onEdit && (
                            <button onClick={() => { onEdit(item); onClose(); }}
                              className="h-6 px-2 text-[10px] font-semibold rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1">
                              <Edit2 className="h-2.5 w-2.5" /> Edit
                            </button>
                          )}
                          {canDelete && onDelete && (
                            <button onClick={() => { onDelete(item); removeFromGroups(item.id); }}
                              className="h-6 px-2 text-[10px] font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1">
                              <Trash2 className="h-2.5 w-2.5" /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {groupItems.length === 0 && (
                    <p className={`px-4 py-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                      Records not found in current view — may be filtered.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`flex items-center justify-between pt-4 border-t mt-2 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <p className="text-[10px] text-slate-400">
            {compareMode
              ? 'Click titles to select items · Compare side-by-side · Delete duplicates directly'
              : `Click titles to view · Enable Compare Mode for side-by-side diff`}
          </p>
          <Button variant="outline" onClick={onClose} className="h-9 text-sm rounded-xl">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
