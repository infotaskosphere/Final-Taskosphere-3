/**
 * MergeClientsDialog
 * ──────────────────
 * Merge two or more duplicate clients into one "primary" client.
 * Shows a side-by-side field comparison and lets the user pick which
 * value to keep for each conflicting field.
 *
 * Props:
 *   open       — boolean
 *   onClose    — () => void
 *   clients    — full clients array
 *   groups     — duplicate groups from detectClientDuplicates (each has item_ids)
 *   onMerge    — async (primaryId, secondaryIds, fieldOverrides) => void
 *   isDark     — boolean
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Merge, CheckCircle2, AlertTriangle, X, ArrowLeftRight,
  ChevronDown, ChevronUp, Crown, Loader2, Users, Check,
} from 'lucide-react';
import { toast } from 'sonner';

const MERGE_FIELDS = [
  { key: 'email',              label: 'Email' },
  { key: 'phone',              label: 'Phone' },
  { key: 'address',            label: 'Address' },
  { key: 'city',               label: 'City' },
  { key: 'state',              label: 'State' },
  { key: 'gstin',              label: 'GSTIN' },
  { key: 'pan',                label: 'PAN' },
  { key: 'referred_by',        label: 'Referred By' },
  { key: 'website',            label: 'Website' },
  { key: 'cin',                label: 'CIN' },
  { key: 'notes',              label: 'Notes' },
];

const CONF_STYLE = {
  high:   { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#EF4444', label: 'HIGH MATCH' },
  medium: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', dot: '#F59E0B', label: 'SIMILAR' },
  low:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', dot: '#60A5FA', label: 'POSSIBLE' },
};

function ClientChip({ client, isPrimary, onClick, isDark }) {
  const initials = (client.company_name || '?').slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-left ${
        isPrimary
          ? 'border-blue-500 bg-blue-50'
          : isDark ? 'border-slate-600 bg-slate-700 hover:border-slate-500' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
      title="Click to set as primary"
    >
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ background: isPrimary ? 'linear-gradient(135deg, #1D4ED8, #3B82F6)' : 'linear-gradient(135deg, #475569, #64748B)' }}
      >{initials}</span>
      <div className="min-w-0">
        <p className={`text-xs font-bold truncate max-w-[140px] ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
          {client.company_name}
        </p>
        <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{client.phone || client.email || '—'}</p>
      </div>
      {isPrimary && (
        <span className="flex items-center gap-0.5 text-[9px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
          <Crown className="w-2.5 h-2.5" /> PRIMARY
        </span>
      )}
    </button>
  );
}

export default function MergeClientsDialog({
  open, onClose, clients = [], groups = [], onMerge, isDark = false,
}) {
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [primaryId, setPrimaryId] = useState(null);
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [merging, setMerging] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Build group data
  const groupsWithClients = useMemo(() =>
    groups.map(g => ({
      ...g,
      clients: (g.item_ids || []).map(id => clients.find(c => c.id === id)).filter(Boolean),
    })), [groups, clients]);

  const activeGroup = groupsWithClients[selectedGroupIdx];

  // Auto-set primary to first client when group changes
  React.useEffect(() => {
    if (activeGroup?.clients?.length) {
      setPrimaryId(activeGroup.clients[0].id);
      setFieldOverrides({});
    }
  }, [selectedGroupIdx]);

  const primaryClient = useMemo(() =>
    activeGroup?.clients?.find(c => c.id === primaryId) || activeGroup?.clients?.[0],
    [activeGroup, primaryId]);

  const secondaryClients = useMemo(() =>
    (activeGroup?.clients || []).filter(c => c.id !== primaryId),
    [activeGroup, primaryId]);

  // Fields with conflicts
  const conflictFields = useMemo(() => {
    if (!primaryClient || !secondaryClients.length) return [];
    return MERGE_FIELDS.filter(f => {
      const pVal = (primaryClient[f.key] || '').toString().trim();
      const anyDiff = secondaryClients.some(sc => {
        const sVal = (sc[f.key] || '').toString().trim();
        return sVal && sVal !== pVal;
      });
      return anyDiff;
    });
  }, [primaryClient, secondaryClients]);

  const handleMerge = useCallback(async () => {
    if (!primaryClient) return;
    setMerging(true);
    try {
      const secondaryIds = secondaryClients.map(c => c.id);
      await onMerge(primaryClient.id, secondaryIds, fieldOverrides);
      toast.success(`Merged ${secondaryIds.length + 1} clients into "${primaryClient.company_name}"`);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Merge failed. Please try again.');
    } finally {
      setMerging(false);
    }
  }, [primaryClient, secondaryClients, fieldOverrides, onMerge, onClose]);

  if (!groups.length) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className={`max-w-3xl max-h-[90vh] flex flex-col overflow-hidden p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}
        style={{ borderRadius: 20 }}
      >
        {/* Header */}
        <DialogHeader className={`flex-shrink-0 px-6 pt-5 pb-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)' }}>
              <Merge className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Merge Duplicate Clients</DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found · Select a group and choose which client to keep as primary
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: group list */}
          {groups.length > 1 && (
            <div className={`w-48 flex-shrink-0 border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2">Groups</p>
              {groupsWithClients.map((g, i) => {
                const cs = CONF_STYLE[g.confidence] || CONF_STYLE.medium;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedGroupIdx(i)}
                    className={`w-full text-left px-3 py-2.5 transition-all border-l-2 ${
                      i === selectedGroupIdx
                        ? isDark ? 'bg-slate-700 border-blue-400' : 'bg-blue-50 border-blue-500'
                        : 'border-transparent hover:bg-slate-100'
                    }`}
                  >
                    <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {g.clients[0]?.company_name?.slice(0, 20) || `Group ${i + 1}`}
                    </p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block"
                      style={{ background: cs.bg, color: cs.text, border: `1px solid ${cs.border}` }}>
                      {cs.label} · {g.clients.length} clients
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Right: merge workspace */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {activeGroup && (
              <>
                {/* Confidence badge */}
                {(() => {
                  const cs = CONF_STYLE[activeGroup.confidence] || CONF_STYLE.medium;
                  return (
                    <div className="flex items-start gap-2 p-3 rounded-xl border" style={{ background: cs.bg, borderColor: cs.border }}>
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: cs.text }} />
                      <div>
                        <p className="text-xs font-bold" style={{ color: cs.text }}>{cs.label} — {activeGroup.reason}</p>
                        {activeGroup.score != null && (
                          <p className="text-[10px] mt-0.5" style={{ color: cs.text, opacity: 0.75 }}>Match score: {activeGroup.score}%</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Client chips — click to set primary */}
                <div>
                  <p className={`text-xs font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Click a client to set it as primary (the one that survives the merge)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeGroup.clients.map(c => (
                      <ClientChip
                        key={c.id}
                        client={c}
                        isPrimary={c.id === primaryId}
                        onClick={() => { setPrimaryId(c.id); setFieldOverrides({}); }}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                </div>

                {/* Conflicting fields */}
                {conflictFields.length > 0 && (
                  <div>
                    <p className={`text-xs font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      Conflicting fields — click a value to prefer it in the merged record
                    </p>
                    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                      {conflictFields.map((f, fi) => {
                        const primaryVal = (primaryClient[f.key] || '').toString().trim() || '—';
                        const chosenVal = fieldOverrides[f.key];
                        return (
                          <div key={f.key} className={`${fi !== 0 ? `border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}` : ''}`}>
                            <div className={`px-3 py-1 ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                              <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{f.label}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 p-2">
                              {/* Primary value */}
                              <button
                                onClick={() => {
                                  const overrides = { ...fieldOverrides };
                                  delete overrides[f.key];
                                  setFieldOverrides(overrides);
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                                  !chosenVal
                                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold'
                                    : isDark ? 'border-slate-600 text-slate-300 hover:border-blue-400' : 'border-slate-200 text-slate-600 hover:border-blue-300'
                                }`}
                              >
                                {!chosenVal && <Check className="w-3 h-3" />}
                                <Crown className="w-3 h-3 opacity-60" />
                                <span className="max-w-[200px] truncate">{primaryVal}</span>
                                <span className="text-[9px] opacity-60">(primary)</span>
                              </button>
                              {/* Secondary values */}
                              {secondaryClients.map(sc => {
                                const scVal = (sc[f.key] || '').toString().trim();
                                if (!scVal || scVal === (primaryClient[f.key] || '').toString().trim()) return null;
                                const isChosen = chosenVal === scVal;
                                return (
                                  <button
                                    key={sc.id}
                                    onClick={() => setFieldOverrides(prev => ({ ...prev, [f.key]: scVal }))}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                                      isChosen
                                        ? 'border-violet-400 bg-violet-50 text-violet-700 font-semibold'
                                        : isDark ? 'border-slate-600 text-slate-300 hover:border-violet-400' : 'border-slate-200 text-slate-600 hover:border-violet-300'
                                    }`}
                                  >
                                    {isChosen && <Check className="w-3 h-3" />}
                                    <span className="max-w-[200px] truncate">{scVal}</span>
                                    <span className="text-[9px] opacity-60">(from duplicate)</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* What happens summary */}
                <div className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-slate-700/40 border-slate-600 text-slate-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <p className="font-bold mb-1">What will happen:</p>
                  <ul className="space-y-0.5 list-disc list-inside opacity-90">
                    <li>
                      <strong>{primaryClient?.company_name}</strong> will be kept as the merged record
                    </li>
                    <li>
                      {secondaryClients.map(c => c.company_name).join(', ')} will be deleted
                    </li>
                    <li>Services, DSC details, contacts & assignments from all clients will be combined</li>
                    <li>Tasks and other records linked to deleted clients will be re-linked to the primary</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            This action <strong>cannot be undone</strong>. Secondary clients will be permanently deleted.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={merging}
              className={isDark ? 'border-slate-600 text-slate-300' : ''}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleMerge}
              disabled={!primaryClient || secondaryClients.length === 0 || merging}
              className="bg-gradient-to-r from-blue-600 to-violet-600 text-white border-0 min-w-[110px]"
            >
              {merging ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Merging…</> : <><Merge className="w-3.5 h-3.5 mr-1" />Merge Now</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
