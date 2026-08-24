/**
 * MergeClientsDialog
 * ──────────────────
 * Merge two or more duplicate clients into one "primary" client.
 * Shows an editable form for the merged record — every field starts
 * pre-filled from whichever client is picked as primary, but can be
 * freely retyped (name, type, email, address, everything) before the
 * merge is confirmed. Quick-fill chips let you grab a value from one
 * of the duplicates with one click, then keep editing by hand.
 *
 * Supports 3+ clients per group: click a chip to load it as the primary,
 * or hit "Remove" on a chip to exclude that client from this merge
 * entirely (it's left untouched — useful when only 2 of 3+ matched
 * clients are actually the same entity).
 *
 * After a successful merge the dialog stays open and automatically
 * advances to the next remaining duplicate group, so a whole batch of
 * duplicates can be cleared without reopening the AI Duplicate Detection
 * dialog each time. It only closes when every group has been resolved
 * or the user explicitly closes it.
 *
 * Props:
 *   open       — boolean
 *   onClose    — () => void
 *   clients    — full clients array
 *   groups     — duplicate groups from detectClientDuplicates (each has item_ids)
 *   startIndex — optional index into `groups` to open on (default 0)
 *   onMerge    — async (primaryId, secondaryIds, fieldOverrides) => void
 *   isDark     — boolean
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Merge, AlertTriangle, Crown, Loader2, Pencil, X, RotateCcw, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// Editable fields shown in the merge form, in display order.
// `required` fields block the merge if left blank.
const MERGE_FIELDS = [
  { key: 'company_name', label: 'Company / Client Name', required: true },
  {
    key: 'client_type', label: 'Client Type', type: 'select',
    options: [
      { value: 'proprietor',  label: 'Proprietor' },
      { value: 'pvt_ltd',     label: 'Pvt Ltd' },
      { value: 'llp',         label: 'LLP' },
      { value: 'public_ltd',  label: 'Public Ltd' },
      { value: 'partnership', label: 'Partnership' },
      { value: 'huf',         label: 'HUF' },
      { value: 'trust',       label: 'Trust' },
      { value: 'section_8',   label: 'Section 8' },
      { value: 'other',       label: 'Other' },
    ],
  },
  { key: 'email',       label: 'Email' },
  { key: 'phone',       label: 'Phone' },
  { key: 'address',     label: 'Address' },
  { key: 'city',        label: 'City' },
  { key: 'state',       label: 'State' },
  { key: 'gstin',       label: 'GSTIN' },
  { key: 'pan',         label: 'PAN' },
  { key: 'referred_by', label: 'Referred By' },
  { key: 'website',     label: 'Website' },
  { key: 'cin',         label: 'CIN' },
  { key: 'llpin',       label: 'LLPIN' },
  { key: 'msme_number', label: 'Udyam / MSME No.' },
  { key: 'proprietor_name', label: 'Proprietor Name' },
  { key: 'notes',       label: 'Notes', type: 'textarea' },
];

const CONF_STYLE = {
  high:      { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#EF4444', label: 'HIGH MATCH' },
  medium:    { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', dot: '#F59E0B', label: 'SIMILAR' },
  low:       { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', dot: '#60A5FA', label: 'POSSIBLE' },
  duplicate: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#EF4444', label: '🔴 DUPLICATE' },
  possible:  { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', dot: '#F59E0B', label: '🟠 POSSIBLE DUPLICATE' },
  related:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB', dot: '#60A5FA', label: '🔵 RELATED CLIENT' },
};

function ClientChip({ client, isPrimary, isExcluded, onClick, onToggleExclude, isDark }) {
  const initials = (client.company_name || '?').slice(0, 2).toUpperCase();
  return (
    <div
      className={`flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border-2 transition-all ${
        isExcluded
          ? isDark ? 'border-slate-700 bg-slate-800/40 opacity-50' : 'border-slate-200 bg-slate-100/60 opacity-50'
          : isPrimary
            ? 'border-blue-500 bg-blue-50'
            : isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        onClick={onClick}
        disabled={isExcluded}
        className="flex items-center gap-2 text-left disabled:cursor-not-allowed"
        title={isExcluded ? 'Excluded from this merge' : "Click to load this client's details into the merge form"}
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: isPrimary && !isExcluded ? 'linear-gradient(135deg, #1D4ED8, #3B82F6)' : 'linear-gradient(135deg, #475569, #64748B)' }}
        >{initials}</span>
        <div className="min-w-0">
          <p className={`text-xs font-bold truncate max-w-[140px] ${isExcluded ? 'line-through' : ''} ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
            {client.company_name}
          </p>
          <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{client.phone || client.email || '—'}</p>
        </div>
        {isPrimary && !isExcluded && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">
            <Crown className="w-2.5 h-2.5" /> KEEPING
          </span>
        )}
      </button>
      <button
        onClick={onToggleExclude}
        title={isExcluded ? 'Add back to this merge' : 'Remove from this merge (leave untouched)'}
        className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
          isExcluded
            ? isDark ? 'text-emerald-400 hover:bg-emerald-900/30' : 'text-emerald-600 hover:bg-emerald-50'
            : isDark ? 'text-slate-400 hover:bg-red-900/30 hover:text-red-400' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
        }`}
      >
        {isExcluded ? <RotateCcw className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function MergeClientsDialog({
  open, onClose, clients = [], groups = [], startIndex = 0, onMerge, isDark = false,
}) {
  const [localGroups, setLocalGroups] = useState([]);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0);
  const [primaryId, setPrimaryId] = useState(null);
  const [excludedIds, setExcludedIds] = useState([]);
  const [editedFields, setEditedFields] = useState({});
  // Background merges in flight — each is { id, label, status: 'pending'|'error' }.
  // "Merge Now" no longer blocks the dialog: the group is removed from view
  // immediately and the actual API call + refetch happens quietly here while
  // the dialog stays in the forefront and lets you keep working on the next
  // group right away.
  const [backgroundMerges, setBackgroundMerges] = useState([]);
  const bgIdRef = React.useRef(0);

  // Build group data from whichever groups list is currently active locally
  // (starts as a copy of the `groups` prop, then shrinks as merges complete —
  // this is what lets the dialog stay open and move to the next group).
  const groupsWithClients = useMemo(() =>
    localGroups.map(g => ({
      ...g,
      clients: (g.item_ids || []).map(id => clients.find(c => c.id === id)).filter(Boolean),
    })), [localGroups, clients]);

  const activeGroup = groupsWithClients[selectedGroupIdx];

  // Load a client's values into the editable form
  const loadIntoForm = useCallback((client) => {
    if (!client) return;
    const initial = {};
    MERGE_FIELDS.forEach(f => { initial[f.key] = client[f.key] || ''; });
    setEditedFields(initial);
  }, []);

  // Reset local groups + start index whenever the dialog (re)opens.
  React.useEffect(() => {
    if (!open) return;
    setLocalGroups(groups);
    const startAt = Math.min(Math.max(startIndex, 0), Math.max(groups.length - 1, 0));
    setSelectedGroupIdx(startAt);
    setExcludedIds([]);
    const g = groups[startAt];
    const first = (g?.item_ids || []).map(id => clients.find(c => c.id === id)).filter(Boolean)[0];
    if (first) {
      setPrimaryId(first.id);
      loadIntoForm(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-seed the form when the user switches which group they're merging
  React.useEffect(() => {
    setExcludedIds([]);
    if (activeGroup?.clients?.length) {
      const first = activeGroup.clients[0];
      setPrimaryId(first.id);
      loadIntoForm(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupIdx, localGroups.length]);

  const primaryClient = useMemo(() =>
    activeGroup?.clients?.find(c => c.id === primaryId) || activeGroup?.clients?.[0],
    [activeGroup, primaryId]);

  // Only non-excluded, non-primary clients are actually merged/deleted.
  // Excluded clients stay in the group visually (so they can be added back)
  // but are left completely untouched by the merge.
  const secondaryClients = useMemo(() =>
    (activeGroup?.clients || []).filter(c => c.id !== primaryId && !excludedIds.includes(c.id)),
    [activeGroup, primaryId, excludedIds]);

  const toggleExclude = useCallback((clientId) => {
    if (clientId === primaryId) {
      toast.error('The client being kept can\'t be removed — pick a different one to keep first.');
      return;
    }
    setExcludedIds(prev => prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]);
  }, [primaryId]);

  // For a given field, other values present among this group's clients —
  // shown as quick-fill chips under the input.
  const fieldSuggestions = useCallback((key) => {
    if (!activeGroup) return [];
    const current = (editedFields[key] || '').toString().trim();
    const vals = [];
    activeGroup.clients.forEach(c => {
      const v = (c[key] || '').toString().trim();
      if (v && v !== current && !vals.includes(v)) vals.push(v);
    });
    return vals;
  }, [activeGroup, editedFields]);

  const setField = (key, value) => setEditedFields(prev => ({ ...prev, [key]: value }));

  const handleMerge = useCallback(() => {
    if (!primaryClient) return;
    if (!(editedFields.company_name || '').trim()) {
      toast.error('Client name is required');
      return;
    }
    if (secondaryClients.length === 0) {
      toast.error('Nothing to merge — all other clients in this group are removed.');
      return;
    }

    // Snapshot everything needed for this merge BEFORE we advance the UI —
    // once we move to the next group, primaryClient/secondaryClients/
    // editedFields will all switch to referring to that next group.
    const secondaryIds = secondaryClients.map(c => c.id);
    const overrides = {};
    MERGE_FIELDS.forEach(f => { overrides[f.key] = (editedFields[f.key] ?? '').toString(); });
    const mergedLabel = overrides.company_name;
    const groupBeingMerged = localGroups[selectedGroupIdx];
    const primaryIdSnapshot = primaryClient.id;

    // Advance the dialog immediately — drop this group from the list and
    // move to the next one right away. The actual network call + list
    // refresh happen below without blocking this.
    setLocalGroups(prev => prev.filter((_, i) => i !== selectedGroupIdx));
    setSelectedGroupIdx(prev => Math.max(0, Math.min(prev, groupsWithClients.length - 2)));

    const bgId = ++bgIdRef.current;
    setBackgroundMerges(prev => [...prev, { id: bgId, label: mergedLabel, status: 'pending' }]);

    (async () => {
      try {
        await onMerge(primaryIdSnapshot, secondaryIds, overrides);
        toast.success(`Merged ${secondaryIds.length + 1} clients into "${mergedLabel}"`);
        setBackgroundMerges(prev => prev.filter(m => m.id !== bgId));
      } catch (e) {
        toast.error(`Merge failed for "${mergedLabel}" — ${e?.response?.data?.detail || 'please retry from the list'}`);
        setBackgroundMerges(prev => prev.filter(m => m.id !== bgId));
        // Put the group back so it isn't silently lost on failure.
        if (groupBeingMerged) {
          setLocalGroups(prev => [...prev, groupBeingMerged]);
        }
      }
    })();
  }, [primaryClient, secondaryClients, editedFields, onMerge, selectedGroupIdx, groupsWithClients.length, localGroups]);

  if (!open) return null;

  const fieldCls = (extra = '') => `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-100 ${
    isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
  } ${extra}`;

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
                {localGroups.length > 0
                  ? `${localGroups.length} duplicate group${localGroups.length !== 1 ? 's' : ''} remaining · Pick a starting record, then edit any field before merging`
                  : 'All duplicate groups resolved'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: group list */}
          {groupsWithClients.length > 1 && (
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
            {!activeGroup && (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                </div>
                <p className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>All duplicate groups resolved!</p>
                <p className="text-sm text-slate-400 mt-1">Nothing left to merge in this batch.</p>
              </div>
            )}
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

                {/* Client chips — click to load that client's data into the form.
                    3+ clients in a group? Hit the ✕ on any chip to remove it from
                    this merge (it's left untouched) while the rest still merge. */}
                <div>
                  <p className={`text-xs font-bold mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Click a client to load its details as the starting point below{activeGroup.clients.length > 2 ? ' · use ✕ to remove one from this merge' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeGroup.clients.map(c => (
                      <ClientChip
                        key={c.id}
                        client={c}
                        isPrimary={c.id === primaryId}
                        isExcluded={excludedIds.includes(c.id)}
                        onClick={() => { setPrimaryId(c.id); loadIntoForm(c); }}
                        onToggleExclude={() => toggleExclude(c.id)}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                </div>

                {/* Editable merged record */}
                <div>
                  <p className={`text-xs font-bold mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <Pencil className="w-3 h-3" /> Merged Client Details — edit anything before saving
                  </p>
                  <div className={`rounded-xl border p-3 space-y-3 ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50/60'}`}>
                    {MERGE_FIELDS.map(f => {
                      const suggestions = fieldSuggestions(f.key);
                      return (
                        <div key={f.key}>
                          <label className={`text-[11px] font-semibold mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select
                              value={editedFields[f.key] || ''}
                              onChange={e => setField(f.key, e.target.value)}
                              className={fieldCls()}
                            >
                              <option value="">— Select —</option>
                              {f.options.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          ) : f.type === 'textarea' ? (
                            <textarea
                              value={editedFields[f.key] || ''}
                              onChange={e => setField(f.key, e.target.value)}
                              rows={3}
                              className={fieldCls('resize-none')}
                            />
                          ) : (
                            <input
                              type="text"
                              value={editedFields[f.key] || ''}
                              onChange={e => setField(f.key, e.target.value)}
                              className={fieldCls()}
                            />
                          )}
                          {suggestions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <span className="text-[9px] text-slate-400 mt-1">from duplicates:</span>
                              {suggestions.map(v => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setField(f.key, v)}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                    isDark
                                      ? 'border-slate-600 text-slate-300 hover:border-violet-400 hover:text-violet-300'
                                      : 'border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700'
                                  }`}
                                  title="Use this value"
                                >
                                  {v.length > 40 ? `${v.slice(0, 40)}…` : v}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* What happens summary */}
                <div className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-slate-700/40 border-slate-600 text-slate-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <p className="font-bold mb-1">What will happen:</p>
                  <ul className="space-y-0.5 list-disc list-inside opacity-90">
                    <li>
                      One client record will be kept, saved with the details entered above
                    </li>
                    <li>
                      {secondaryClients.length > 0
                        ? `${secondaryClients.map(c => c.company_name).join(', ')} will be deleted`
                        : 'Nothing selected to delete — add at least one client back to merge'}
                    </li>
                    <li>Services, DSC details, contacts & assignments from all clients will be combined</li>
                    <li>Tasks and other records linked to deleted clients will be re-linked to the kept client</li>
                    {excludedIds.length > 0 && (
                      <li>
                        {activeGroup.clients.filter(c => excludedIds.includes(c.id)).map(c => c.company_name).join(', ')}
                        {' '}will be left untouched — not merged, not deleted
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Background merge status strip — merges no longer block the dialog;
            this shows what's still finishing up in the background while you
            keep working through the next groups. */}
        {backgroundMerges.length > 0 && (
          <div className={`flex-shrink-0 px-6 py-2 border-t flex items-center gap-2 flex-wrap ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-blue-50/60'}`}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
            <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-blue-700'}`}>
              Merging in background:
            </span>
            {backgroundMerges.map(m => (
              <span key={m.id} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-white text-blue-700 border border-blue-200'}`}>
                {m.label}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {activeGroup
              ? <>This action <strong>cannot be undone</strong>. Non-excluded duplicates will be permanently deleted.</>
              : 'You can close this dialog now, or reopen AI Duplicate Detection to scan again.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}
              className={isDark ? 'border-slate-600 text-slate-300' : ''}>
              {activeGroup ? 'Cancel' : 'Close'}
            </Button>
            {activeGroup && (
              <Button
                size="sm"
                onClick={handleMerge}
                disabled={!primaryClient || secondaryClients.length === 0 || !(editedFields.company_name || '').trim()}
                className="bg-gradient-to-r from-blue-600 to-violet-600 text-white border-0 min-w-[110px]"
              >
                <Merge className="w-3.5 h-3.5 mr-1" />Merge Now
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
