import React, { useState, useEffect, useRef, useCallback } from 'react';
import GifLoader, { MiniLoader } from "@/components/ui/GifLoader.jsx";
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, AlertCircle, ArrowDownCircle, ArrowUpCircle,
  History, Search, ArrowUpDown, Printer, CheckSquare, Square,
  MinusSquare, XCircle, Key, Shield, Clock, TrendingDown,
  Sparkles, Loader2, Share2, Mail, MessageCircle, Download, Eye,
  Usb, ChevronDown, ChevronUp, CheckCircle2, Lock
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { detectDscDuplicates } from '@/lib/aiDuplicateEngine';
import AIDuplicateDialog from '@/components/ui/AIDuplicateDialog';
import {
  readCertFromUsbToken,
  readCertFromWebSmartCard,
  isWebSmartCardSupported,
  parseCertificateFile,
  checkLocalAgent,
  readCertFromLocalAgent,
  diagnoseDscReader,
} from '@/lib/dscTokenReader';

// ─── Print styles ─────────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #dsc-print-area, #dsc-print-area * { visibility: visible !important; }
  #dsc-print-area { position: fixed; inset: 0; padding: 24px; background: #fff; }
  @page { margin: 16mm; }
}`;

// ─── USB Popup animation styles ───────────────────────────────────────────────
const USB_POPUP_STYLE = `
@keyframes dscSlideUp {
  from { transform: translateY(32px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0)    scale(1);    opacity: 1; }
}
@keyframes dscPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
@keyframes dscSpin {
  to { transform: rotate(360deg); }
}`;

// ─── Row highlight colours based on expiry ────────────────────────────────────
function getRowHighlight(expiryDate, isDark) {
  const daysLeft = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)   return isDark ? 'bg-red-950/40'    : 'bg-red-50';
  if (daysLeft <= 7)  return isDark ? 'bg-orange-950/40' : 'bg-orange-100';
  if (daysLeft <= 30) return isDark ? 'bg-yellow-950/30' : 'bg-yellow-50';
  return '';
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function PaginationBar({ currentPage, totalPages, totalItems, pageSize, onPageChange, isDark }) {
  if (totalPages <= 1) return null;
  const pageStart = (currentPage - 1) * pageSize;
  const pageWindow = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '…', totalPages];
    if (currentPage >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', currentPage - 1, currentPage, currentPage + 1, '…', totalPages];
  })();
  const dimBg    = isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9';
  const dimHover = isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const btnBase  = { width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, transition: 'background 0.12s' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`, background: isDark ? '#1e293b' : '#F8FAFC', flexShrink: 0 }}>
      <p style={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8', margin: 0 }}>
        <span style={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{pageStart + 1}–{Math.min(pageStart + pageSize, totalItems)}</span>{' '}of{' '}
        <span style={{ fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{totalItems}</span> records
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button disabled={currentPage === 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          style={{ ...btnBase, background: dimBg, color: currentPage === 1 ? (isDark ? '#334155' : '#cbd5e1') : (isDark ? '#94a3b8' : '#64748b'), opacity: currentPage === 1 ? 0.4 : 1 }}
          onMouseEnter={e => { if (currentPage !== 1) e.currentTarget.style.background = dimHover; }}
          onMouseLeave={e => { e.currentTarget.style.background = dimBg; }}>‹</button>
        {pageWindow.map((p, i) => p === '…'
          ? <span key={`e${i}`} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: isDark ? '#475569' : '#94a3b8' }}>…</span>
          : <button key={p} onClick={() => onPageChange(p)}
              style={{ ...btnBase, fontSize: 11, fontWeight: p === currentPage ? 700 : 500, background: p === currentPage ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : dimBg, color: p === currentPage ? '#fff' : (isDark ? '#94a3b8' : '#64748b'), boxShadow: p === currentPage ? '0 2px 8px rgba(79,70,229,0.35)' : 'none' }}
              onMouseEnter={e => { if (p !== currentPage) e.currentTarget.style.background = dimHover; }}
              onMouseLeave={e => { if (p !== currentPage) e.currentTarget.style.background = dimBg; }}>{p}</button>
        )}
        <button disabled={currentPage === totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          style={{ ...btnBase, background: dimBg, color: currentPage === totalPages ? (isDark ? '#334155' : '#cbd5e1') : (isDark ? '#94a3b8' : '#64748b'), opacity: currentPage === totalPages ? 0.4 : 1 }}
          onMouseEnter={e => { if (currentPage !== totalPages) e.currentTarget.style.background = dimHover; }}
          onMouseLeave={e => { e.currentTarget.style.background = dimBg; }}>›</button>
      </div>
      <p style={{ fontSize: 11, color: isDark ? '#475569' : '#cbd5e1', margin: 0 }}>Page {currentPage} / {totalPages}</p>
    </div>
  );
}

// ─── DSC Table ────────────────────────────────────────────────────────────────
function DSCTable({ dscList, onEdit, onDelete, onMovement, onViewLog, getDSCStatus, type, globalIndexStart, isDark, selectedIds, onToggleSelect, onToggleAll }) {
  const allSelected  = dscList.length > 0 && dscList.every(d => selectedIds.has(d.id));
  const someSelected = dscList.some(d => selectedIds.has(d.id)) && !allSelected;

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full table-fixed border-collapse" style={{minWidth:700}}>
        <colgroup>
          <col style={{ width: 36 }} />
          <col style={{ width: 40 }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: 128 }} />
        </colgroup>
        <thead className={`border-b ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          <tr>
            <th className="px-2 py-2.5">
              <button onClick={() => onToggleAll(dscList)} className="flex items-center justify-center">
                {allSelected
                  ? <CheckSquare className="h-4 w-4 text-indigo-500" />
                  : someSelected
                    ? <MinusSquare className="h-4 w-4 text-indigo-400" />
                    : <Square className="h-4 w-4 text-slate-400" />}
              </button>
            </th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#</th>
            <th className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Holder Name</th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Type</th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Associated With</th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Expiry</th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Status</th>
            <th className={`px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Last Movement</th>
            <th className={`px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Actions</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isDark ? 'divide-slate-700/60' : 'divide-slate-100'}`}>
          {dscList.map((dsc, index) => {
            const status      = getDSCStatus(dsc.expiry_date);
            const highlight   = getRowHighlight(dsc.expiry_date, isDark);
            const isSelected = selectedIds.has(dsc.id);
            const lastMove   = dsc.movement_log?.length > 0 ? dsc.movement_log[dsc.movement_log.length - 1] : null;

            return (
              <tr key={dsc.id}
                onClick={() => onViewLog(dsc)}
                className={`transition-colors cursor-pointer ${highlight} ${isSelected ? (isDark ? 'ring-1 ring-inset ring-indigo-500' : 'ring-1 ring-inset ring-indigo-300') : ''} ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80'}`}
                title="Click to view full DSC details"
                data-testid={`dsc-row-${dsc.id}`}>
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onToggleSelect(dsc.id)} className="flex items-center justify-center">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-indigo-500" /> : <Square className="h-4 w-4 text-slate-400" />}
                  </button>
                </td>
                <td className={`px-2 py-2.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{globalIndexStart + index + 1}</td>
                <td className={`px-3 py-2.5 text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`} title={dsc.holder_name}>{dsc.holder_name}</td>
                <td className={`px-2 py-2.5 text-xs truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`} title={dsc.dsc_type || ''}>{dsc.dsc_type || '—'}</td>
                <td className={`px-2 py-2.5 text-xs truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`} title={dsc.associated_with || ''}>{dsc.associated_with || '—'}</td>
                <td className={`px-2 py-2.5 text-xs whitespace-nowrap font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{format(new Date(dsc.expiry_date), 'MMM dd, yy')}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.color}`} />
                    <span className={`text-[11px] font-semibold leading-none ${status.textColor}`}>{status.text}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  {lastMove ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[9px] px-1 py-0 font-semibold leading-tight ${lastMove.movement_type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {lastMove.movement_type}
                        </Badge>
                        <span className={`text-[11px] font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{lastMove.person_name}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No movement</span>
                  )}
                </td>
                <td className="px-1 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-0">
                    <Button variant="ghost" size="sm" onClick={() => onViewLog(dsc)} className={`h-7 w-7 p-0 ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'}`} title="View Details & Share">
                      <Eye className="h-3.5 w-3.5 text-indigo-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onMovement(dsc, type === 'IN' ? 'OUT' : 'IN')}
                      className={`h-7 w-7 p-0 ${type === 'IN' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
                      title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}>
                      {type === 'IN' ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(dsc)} className={`h-7 w-7 p-0 ${isDark ? 'hover:bg-indigo-900/30' : 'hover:bg-indigo-50'} text-indigo-500`}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(dsc.id)} className={`h-7 w-7 p-0 ${isDark ? 'hover:bg-red-900/30' : 'hover:bg-red-50'} text-red-500`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Guess DSC type from device info ─────────────────────────────────────────
function guessDscType(device) {
  const combined = [device.productName || '', device.manufacturerName || ''].join(' ').toLowerCase();
  if (combined.includes('class 3') || combined.includes('cl3'))  return 'Class 3';
  if (combined.includes('class 2') || combined.includes('cl2'))  return 'Class 2';
  if (combined.includes('encrypt'))                              return 'Encryption';
  if (combined.includes('sign'))                                 return 'Signature';
  if (combined.includes('combo'))                                return 'Combo';
  return 'Class 3';   // safe default for India DSC tokens
}

// ─── Default expiry (2 years from today) ─────────────────────────────────────
function defaultExpiry() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 2);
  return format(d, 'yyyy-MM-dd');
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

// ─── Unified DSC Popup — merges "Add New DSC" + "DSC Token Detected" ─────────
// Props:
//   device      — WebUSB device object (null when opened manually via Add DSC button)
//   isDark      — dark mode flag
//   editingDSC  — DSC object when editing (null for new)
//   onDismiss   — called when user dismisses / cancels
//   onSaved     — called after successful save
//   onSubmit    — called with formData for edit flow (replaces internal API call)
function UnifiedDscPopup({ device, isDark, editingDSC, onDismiss, onSaved, onSubmit }) {
  const isTokenMode = !!device;         // true = triggered by USB plug-in
  const isEditMode  = !!editingDSC;     // true = editing existing DSC

  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [showNotes,     setShowNotes]     = useState(isEditMode);
  const [pin,           setPin]           = useState('');
  const [reading,       setReading]       = useState(false);
  const [readError,     setReadError]     = useState('');
  const [certFetched,   setCertFetched]   = useState(false);
  const [agentAutoFetching, setAgentAutoFetching] = useState(false);
  const [agentConnected,    setAgentConnected]    = useState(false);
  const [autoFillDone,      setAutoFillDone]      = useState(false);
  const certFileRef = useRef(null);

  // ── Initial form state ────────────────────────────────────────────────────
  const initForm = () => {
    if (isEditMode) {
      return {
        holder_name:     editingDSC.holder_name     || '',
        dsc_type:        editingDSC.dsc_type        || '',
        dsc_password:    editingDSC.dsc_password    || '',
        serial_number:   editingDSC.serial_number   || '',
        associated_with: editingDSC.associated_with || '',
        entity_type:     editingDSC.entity_type     || 'firm',
        issue_date:      editingDSC.issue_date ? format(new Date(editingDSC.issue_date), 'yyyy-MM-dd') : todayStr(),
        expiry_date:     editingDSC.expiry_date ? format(new Date(editingDSC.expiry_date), 'yyyy-MM-dd') : defaultExpiry(),
        notes:           editingDSC.notes           || '',
      };
    }
    return {
      holder_name:     '',
      dsc_type:        guessDscType(device),
      dsc_password:    '',
      serial_number:   '',
      associated_with: '',
      entity_type:     'firm',
      issue_date:      todayStr(),
      expiry_date:     defaultExpiry(),
      notes: device ? [
        device.productName      ? `Device: ${device.productName}`      : null,
        device.manufacturerName ? `Maker: ${device.manufacturerName}`  : null,
        device.vendorId         ? `VID: 0x${device.vendorId.toString(16).toUpperCase().padStart(4,'0')}` : null,
      ].filter(Boolean).join(' · ') : '',
    };
  };

  const [form, setForm] = useState(initForm);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // ── Auto-fetch from agent on mount ────────────────────────────────────────
  useEffect(() => {
    if (isEditMode) return; // no auto-fetch when editing
    let cancelled = false;

    async function tryAgentAutoFetch() {
      try {
        const agentOk = await checkLocalAgent();
        if (!agentOk || cancelled) return;
        if (!cancelled) { setAgentConnected(true); setAgentAutoFetching(true); }

        // Immediate attempt
        try {
          const r = await fetch('http://127.0.0.1:7432/dsc-autofill', { signal: AbortSignal.timeout(4000), cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            if (d.available && d.fields?.holder_name) {
              if (!cancelled) { applyAutofill(d.fields); toast.success('✓ DSC token auto-filled — no PIN needed!'); setAutoFillDone(true); }
              return;
            }
          }
        } catch { /* fall through to polling */ }

        // Poll up to 30s (15 × 2s)
        for (let i = 0; i < 15; i++) {
          if (cancelled) break;
          try {
            const r = await fetch('http://127.0.0.1:7432/dsc-autofill', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
            if (r.ok) {
              const d = await r.json();
              if (d.available && d.fields?.holder_name) {
                if (!cancelled) { applyAutofill(d.fields); toast.success('✓ DSC token auto-filled!'); setAutoFillDone(true); }
                return;
              }
            }
          } catch { /* keep polling */ }
          try {
            const r2 = await fetch('http://127.0.0.1:7432/dsc-status', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
            if (r2.ok) {
              const d2 = await r2.json();
              if (d2.cert?.holder_name) { if (!cancelled) applyCert(d2.cert); return; }
            }
          } catch { /* keep polling */ }
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch { /* agent not running */ }
      finally { if (!cancelled) setAgentAutoFetching(false); }
    }

    tryAgentAutoFetch();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAutofill = (fields) => {
    setForm(prev => ({
      ...prev,
      holder_name:     fields.holder_name     || prev.holder_name,
      serial_number:   fields.serial_number   || prev.serial_number,
      issue_date:      fields.issue_date      || prev.issue_date,
      expiry_date:     fields.expiry_date     || prev.expiry_date,
      associated_with: fields.associated_with || prev.associated_with,
      dsc_type:        fields.dsc_type        || prev.dsc_type,
      notes: [
        prev.notes,
        fields.issuer         ? `Issuer: ${fields.issuer}`              : null,
        fields.ca_provider    ? `CA Provider: ${fields.ca_provider}`    : null,
        fields.token_provider ? `Token: ${fields.token_provider}`       : null,
        fields.email          ? `Email: ${fields.email}`                : null,
        fields.pan            ? `PAN: ${fields.pan}`                    : null,
      ].filter(Boolean).join('\n'),
    }));
    setCertFetched(true);
  };

  const applyCert = (cert) => {
    setForm(prev => ({
      ...prev,
      holder_name:     cert.holder_name                          || prev.holder_name,
      serial_number:   cert.serial_number                        || prev.serial_number,
      issue_date:      cert.issue_date                           || prev.issue_date,
      expiry_date:     cert.expiry_date                          || prev.expiry_date,
      associated_with: cert.associated_with || cert.organization || prev.associated_with,
      dsc_type:        cert.dsc_type                             || prev.dsc_type,
      notes: [
        prev.notes,
        cert.issuer         ? `Issuer: ${cert.issuer}`              : null,
        cert.ca_provider    ? `CA Provider: ${cert.ca_provider}`    : null,
        cert.token_provider ? `Token: ${cert.token_provider}`       : null,
        cert.email          ? `Email: ${cert.email}`                : null,
        cert.pan            ? `PAN: ${cert.pan}`                    : null,
      ].filter(Boolean).join('\n'),
    }));
    setCertFetched(true);
  };

  // ── 4-tier cert read with PIN ─────────────────────────────────────────────
  const handleReadCertificate = async () => {
    if (!pin.trim()) { setReadError('Enter the token PIN first.'); return; }
    setReading(true); setReadError('');
    const errs = [];

    if (isWebSmartCardSupported()) {
      try {
        const cert = await readCertFromWebSmartCard(pin.trim());
        if (cert?.holder_name) { applyCert(cert); toast.success(`Certificate read ✓ (${cert.read_method})`); setReading(false); return; }
        errs.push('Tier 1: no cert found');
      } catch (err) {
        if (err?.message?.includes('PIN') || err?.message?.includes('blocked') || err?.message?.includes('attempt')) {
          setReadError(err.message); setReading(false); return;
        }
        errs.push(`Tier 1: ${err.message}`);
      }
    }

    const agentRunning = await checkLocalAgent();
    if (agentRunning) {
      try {
        const cert = await readCertFromLocalAgent(pin.trim());
        if (cert?.holder_name) { applyCert(cert); toast.success('Certificate read via agent ✓'); setReading(false); return; }
        errs.push('Tier 2: no cert found');
      } catch (err) {
        if (err?.message?.includes('PIN') || err?.message?.includes('blocked') || err?.message?.includes('Incorrect')) {
          setReadError(err.message); setReading(false); return;
        }
        errs.push(`Tier 2: ${err.message}`);
      }
    }

    if (device) {
      try {
        if (!device.opened) await device.open();
        const cert = await readCertFromUsbToken(device, pin.trim());
        if (cert?.holder_name) { applyCert(cert); toast.success('Certificate read via WebUSB ✓'); setReading(false); return; }
        errs.push('Tier 3: no cert found');
      } catch (err) { errs.push(`Tier 3: ${err.message}`); }
    }

    setReadError('FILE_UPLOAD_NEEDED'); setReading(false);
  };

  const handleCertFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadError(''); setReading(true);
    try {
      const cert = await parseCertificateFile(file);
      if (!cert?.holder_name) { setReadError('Could not read certificate. Make sure it is a valid .cer or .pem file.'); return; }
      applyCert(cert);
      toast.success(`Certificate read from ${file.name} ✓`);
    } catch (err) {
      setReadError('Failed to parse certificate file: ' + (err?.message || 'Unknown error'));
    } finally {
      setReading(false);
      if (certFileRef.current) certFileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.holder_name.trim() || !form.issue_date || !form.expiry_date) return;
    setSaving(true);
    try {
      const payload = {
        holder_name:     form.holder_name.trim(),
        dsc_type:        form.dsc_type,
        dsc_password:    form.dsc_password,
        serial_number:   form.serial_number,
        associated_with: form.associated_with,
        entity_type:     form.entity_type,
        issue_date:      new Date(form.issue_date).toISOString(),
        expiry_date:     new Date(form.expiry_date).toISOString(),
        notes:           form.notes,
      };

      if (isEditMode && onSubmit) {
        await onSubmit(payload);
        setSaved(true);
        setTimeout(() => onSaved(), 900);
        return;
      }

      const res = await api.post('/dsc', payload);
      const newId = res.data?.id || res.data?.data?.id;
      if (newId && isTokenMode) {
        await api.post(`/dsc/${newId}/movement`, {
          movement_type: 'IN', person_name: 'Token Inserted',
          notes: 'Auto-detected via USB — marked IN on plug-in',
        });
      }
      setSaved(true);
      toast.success(`DSC for "${form.holder_name}" ${isTokenMode ? 'added & marked IN' : 'added'} ✓`);
      setTimeout(() => onSaved(), 1200);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save DSC');
      setSaving(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const bg       = isDark ? '#0f172a' : '#ffffff';
  const surface  = isDark ? '#1e293b' : '#f8fafc';
  const border   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const labelClr = isDark ? '#94a3b8' : '#64748b';
  const textClr  = isDark ? '#f1f5f9' : '#0f172a';
  const inputBg  = isDark ? '#0f172a' : '#ffffff';
  const inputBdr = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: inputBg, border: `1px solid ${inputBdr}`,
    borderRadius: 8, padding: '7px 10px',
    fontSize: 13, color: textClr, outline: 'none', fontFamily: 'inherit',
  };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: labelClr, display: 'block', marginBottom: 4 };
  const autoInp = (filled) => ({ ...inp, background: certFetched && filled ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : inputBg, borderColor: certFetched && filled ? '#10b981' : inputBdr });

  // ── Title / subtitle for header ───────────────────────────────────────────
  const headerTitle = saved
    ? (isEditMode ? 'DSC Updated ✓' : 'DSC Added ✓')
    : isEditMode ? `Edit DSC — ${editingDSC.holder_name}`
    : isTokenMode ? 'DSC Token Detected'
    : 'Add New DSC';

  const headerSub = saved
    ? `"${form.holder_name}" ${isEditMode ? 'updated' : isTokenMode ? 'added & marked IN' : 'added'} successfully`
    : isEditMode ? 'Update certificate details below'
    : isTokenMode
      ? (device?.productName
          ? <><span style={{ color: '#818cf8', fontWeight: 600 }}>{device.productName}</span> — fill details below</>
          : 'USB token detected — fill details to register')
      : 'Fill details or plug in your DSC token to auto-fill';

  return (
    <>
      <style>{USB_POPUP_STYLE}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(5px)' }}>
        <div style={{ width: '100%', maxWidth: 680, maxHeight: '92vh', background: bg, border: `1px solid ${border}`, borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'dscSlideUp 0.26s cubic-bezier(0.34,1.4,0.64,1)' }}>

          {/* Accent bar */}
          <div style={{ height: 3, background: 'linear-gradient(90deg,#4f46e5,#6366f1,#818cf8,#4f46e5)', backgroundSize: '200% 100%' }} />

          {/* Header */}
          <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: saved ? 'linear-gradient(135deg,#10b981,#059669)' : isTokenMode ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : 'linear-gradient(135deg,#6366f1,#818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(79,70,229,0.3)', transition: 'background 0.4s' }}>
              {saved ? <CheckCircle2 style={{ width: 21, height: 21, color: '#fff' }} /> : isTokenMode ? <Usb style={{ width: 21, height: 21, color: '#fff' }} /> : <Key style={{ width: 21, height: 21, color: '#fff' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textClr }}>{headerTitle}</p>
                {isTokenMode && !saved && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'dscPulse 1.4s ease-in-out infinite', flexShrink: 0 }} />}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: labelClr, lineHeight: 1.5 }}>{headerSub}</p>
            </div>
            {!saved && (
              <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: labelClr, padding: 4, borderRadius: 6, fontSize: 18, lineHeight: 1, flexShrink: 0 }} title="Close">×</button>
            )}
          </div>

          {/* Token device pill — only in token mode */}
          {isTokenMode && !saved && (device?.manufacturerName || device?.vendorId) && (
            <div style={{ margin: '0 18px 10px', padding: '6px 12px', background: surface, borderRadius: 10, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Usb style={{ width: 12, height: 12, color: '#818cf8', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: labelClr, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[device.manufacturerName, device.vendorId ? `VID 0x${device.vendorId.toString(16).toUpperCase().padStart(4,'0')}` : null, device.productId ? `PID 0x${device.productId.toString(16).toUpperCase().padStart(4,'0')}` : null].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {/* Scrollable form body */}
          {!saved && (
            <div style={{ padding: '0 18px 4px', overflowY: 'auto', flex: 1 }}>

              {/* ── Agent status / auto-fill banner ── */}
              {!isEditMode && agentConnected && !certFetched && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: isDark ? 'rgba(99,102,241,0.12)' : '#eef2ff', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: agentAutoFetching ? '#f59e0b' : '#10b981', animation: agentAutoFetching ? 'dscPulse 1s ease-in-out infinite' : 'none' }} />
                  <span style={{ fontSize: 11, color: isDark ? '#a5b4fc' : '#4338ca', fontWeight: 600, flex: 1 }}>
                    {agentAutoFetching ? '⏳ DSC Agent connected — reading certificate from token…' : '✓ DSC Agent connected — plug in token to auto-fill all fields'}
                  </span>
                  {!agentAutoFetching && (
                    <button
                      onClick={async () => {
                        setAgentAutoFetching(true);
                        try {
                          const r = await fetch('http://127.0.0.1:7432/dsc-autofill', { signal: AbortSignal.timeout(4000), cache: 'no-store' });
                          if (r.ok) { const d = await r.json(); if (d.available && d.fields?.holder_name) { applyAutofill(d.fields); setAutoFillDone(true); toast.success('✓ DSC data auto-filled!'); return; } }
                          const r2 = await fetch('http://127.0.0.1:7432/dsc-status', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
                          if (r2.ok) { const d2 = await r2.json(); if (d2.cert?.holder_name) { applyCert(d2.cert); return; } }
                          toast.info('No token detected yet — plug in your DSC token and try again.');
                        } catch { toast.error('Could not reach agent.'); }
                        finally { setAgentAutoFetching(false); }
                      }}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(99,102,241,0.5)', background: 'transparent', color: isDark ? '#a5b4fc' : '#4338ca', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >↻ Re-fetch</button>
                  )}
                </div>
              )}

              {/* Auto-fill success banner */}
              {autoFillDone && certFetched && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: isDark ? 'rgba(16,185,129,0.10)' : '#f0fdf4', borderRadius: 8, border: '1px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>✅</span>
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, flex: 1 }}>All fields auto-filled from DSC token — verify and save.</span>
                  <button onClick={() => { setAutoFillDone(false); setCertFetched(false); }} style={{ fontSize: 10, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}>✕</button>
                </div>
              )}

              {/* ── PIN / Fetch Data section ── */}
              {!isEditMode && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: certFetched ? (isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4') : surface, borderRadius: 10, border: `1px solid ${certFetched ? '#10b981' : readError ? '#ef4444' : border}` }}>
                  <label style={{ ...lbl, marginBottom: 6, color: certFetched ? '#10b981' : readError ? '#ef4444' : labelClr }}>
                    {certFetched ? '✓ Certificate Read from Token' : agentAutoFetching ? '⏳ Reading certificate…' : 'Read Certificate from Token (Optional)'}
                  </label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      style={{ ...inp, flex: 1, letterSpacing: pin ? '0.2em' : 'normal' }}
                      type="password"
                      placeholder={agentConnected ? 'PIN only needed if auto-fill failed' : 'Enter token PIN to fetch certificate data'}
                      value={pin}
                      onChange={e => { setPin(e.target.value); setReadError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleReadCertificate(); }}
                      disabled={reading}
                    />
                    <button
                      type="button"
                      onClick={handleReadCertificate}
                      disabled={reading || !pin.trim()}
                      style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: certFetched ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: reading || !pin.trim() ? 'not-allowed' : 'pointer', opacity: !pin.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                    >
                      {reading ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'dscSpin 0.7s linear infinite' }} />Reading…</> : certFetched ? '↻ Re-read' : '⬆ Fetch Data'}
                    </button>
                  </div>
                  {readError === 'FILE_UPLOAD_NEEDED' ? (
                    <div style={{ margin: '8px 0 0', padding: '10px 12px', background: isDark ? 'rgba(251,191,36,0.08)' : '#fffbeb', borderRadius: 8, border: '1px solid rgba(251,191,36,0.35)' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: '#d97706', fontWeight: 700 }}>Auto-read failed — upload your certificate file instead</p>
                      <p style={{ margin: '0 0 6px', fontSize: 10, color: isDark ? '#fde68a' : '#92400e', lineHeight: 1.6 }}>
                        Export from <strong>mToken Manager</strong> → Certificate → <strong>Export</strong> → save as <code style={{ background: isDark ? '#1e1b4b' : '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>.cer</code>
                      </p>
                      <input ref={certFileRef} type="file" accept=".cer,.crt,.pem,.der" style={{ display: 'none' }} onChange={handleCertFileUpload} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => certFileRef.current?.click()} disabled={reading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                          📂 Upload .cer / .pem File
                        </button>
                        <button onClick={async () => { const r = await diagnoseDscReader(); alert('DSC Diagnostic\n\n' + r); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', cursor: 'pointer', color: labelClr, fontSize: 10, fontWeight: 600 }}>
                          🔍 Diagnose
                        </button>
                      </div>
                    </div>
                  ) : readError ? (
                    <div style={{ margin: '8px 0 0', padding: '8px 10px', background: isDark ? 'rgba(239,68,68,0.12)' : '#fff1f1', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
                      <p style={{ margin: 0, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>⚠ {readError}</p>
                    </div>
                  ) : !certFetched ? (
                    <p style={{ margin: '5px 0 0', fontSize: 10, color: labelClr }}>Optional — enter PIN and click "Fetch Data" to auto-fill. Or fill the form manually.</p>
                  ) : null}
                </div>
              )}

              {/* ── Form fields — 3-column compact grid ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>Holder Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={autoInp(form.holder_name)} placeholder="e.g. Rajesh Kumar Sharma" value={form.holder_name} onChange={e => set('holder_name', e.target.value)} autoFocus={!certFetched && !isEditMode} />
                </div>
                <div>
                  <label style={lbl}>DSC Type</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={form.dsc_type} onChange={e => set('dsc_type', e.target.value)}>
                    {['Class 3','Class 2','Signing','Encryption','Signing & Encryption','DGFT'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Serial Number</label>
                  <input style={{ ...autoInp(form.serial_number), fontFamily: 'monospace', fontSize: 11 }} placeholder="Auto-filled from token" value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Associated With</label>
                  <input style={inp} placeholder="Firm / client name" value={form.associated_with} onChange={e => set('associated_with', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}><Lock style={{ width: 10, height: 10, display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />Token Password</label>
                  <input style={inp} type="text" placeholder="e.g. 12345678" value={form.dsc_password} onChange={e => set('dsc_password', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Issue Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={autoInp(form.issue_date)} type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Expiry Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={autoInp(form.expiry_date)} type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Entity Type</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={form.entity_type} onChange={e => set('entity_type', e.target.value)}>
                    <option value="firm">Firm</option>
                    <option value="client">Client</option>
                  </select>
                </div>
              </div>

              {/* Notes — collapsible */}
              <div style={{ marginBottom: 14 }}>
                <button type="button" onClick={() => setShowNotes(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: labelClr, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
                  {showNotes ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
                  {showNotes ? 'Hide notes' : 'Add notes'}
                </button>
                {showNotes && <textarea style={{ ...inp, marginTop: 8, resize: 'vertical', minHeight: 56 }} placeholder="Additional notes, CA provider, token info…" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />}
              </div>
            </div>
          )}

          {/* Footer */}
          {!saved && (
            <div style={{ padding: '0 18px 18px', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button type="button" onClick={onDismiss} style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${border}`, background: surface, color: labelClr, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {isTokenMode ? 'Not a DSC' : 'Cancel'}
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !form.holder_name.trim() || !form.issue_date || !form.expiry_date}
                style={{ flex: 2, height: 40, borderRadius: 10, border: 'none', background: saving ? '#6366f1' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving || !form.holder_name.trim() ? 'not-allowed' : 'pointer', opacity: (!form.holder_name.trim() || !form.issue_date || !form.expiry_date) ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving
                  ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'dscSpin 0.7s linear infinite' }} />Saving…</>
                  : isEditMode ? <><CheckCircle2 style={{ width: 15, height: 15 }} />Update DSC</>
                  : isTokenMode ? <><ArrowDownCircle style={{ width: 15, height: 15 }} />Add to Register & Mark IN</>
                  : <><Plus style={{ width: 15, height: 15 }} />Add DSC</>}
              </button>
            </div>
          )}

          {/* Success footer */}
          {saved && (
            <div style={{ padding: '8px 18px 22px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                {isEditMode ? '✓ DSC updated successfully' : isTokenMode ? '✓ Certificate saved and marked as IN' : '✓ DSC added to register'}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
  const [saving, setSaving]             = useState(false);
  const [saved,  setSaved]              = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Certificate reading state
  const [pin,          setPin]          = useState('');
  const [reading,      setReading]      = useState(false);
  const [readError,    setReadError]    = useState('');
  const [certFetched,  setCertFetched]  = useState(false);
  const certFileRef = useRef(null);
  const [agentAutoFetching, setAgentAutoFetching] = useState(false);
  const [agentConnected,   setAgentConnected]   = useState(false); // v5: agent reachable
  const [autoFillDone,     setAutoFillDone]     = useState(false); // v5: autofill succeeded

  const [form, setForm] = useState({
    holder_name:     '',
    dsc_type:        guessDscType(device),
    dsc_password:    '',
    serial_number:   '',
    associated_with: '',
    entity_type:     'firm',
    issue_date:      todayStr(),
    expiry_date:     defaultExpiry(),
    notes:           [
      device.productName      ? `Device: ${device.productName}`      : null,
      device.manufacturerName ? `Maker: ${device.manufacturerName}`   : null,
      device.vendorId         ? `VID: 0x${device.vendorId.toString(16).toUpperCase().padStart(4,'0')}` : null,
    ].filter(Boolean).join(' · '),
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // ── v5: Auto-fetch cert from agent — tries /dsc-autofill first (direct field map),
  //   then falls back to polling /dsc-status. No PIN required.
  useEffect(() => {
    let cancelled = false;

    async function tryAgentAutoFetch() {
      try {
        // ── Step 1: Check agent is reachable ────────────────────────────────
        const agentOk = await checkLocalAgent();
        if (!agentOk || cancelled) return;
        if (!cancelled) setAgentConnected(true);

        setAgentAutoFetching(true);

        // ── Step 2: Try /dsc-autofill first — returns fields directly mapped
        //   to form state; fills everything in one shot including dsc_type, pan, etc.
        try {
          const autofillRes = await fetch('http://127.0.0.1:7432/dsc-autofill', {
            signal: AbortSignal.timeout(4000),
            cache:  'no-store',
          });
          if (autofillRes.ok) {
            const autofillData = await autofillRes.json();
            if (autofillData.available && autofillData.fields?.holder_name) {
              if (!cancelled) {
                applyAutofill(autofillData.fields);
                toast.success('✓ DSC token auto-filled — no PIN needed!');
                setAutoFillDone(true);
              }
              return; // done — no need to poll
            }
          }
        } catch { /* /dsc-autofill not available (agent < v5), fall through */ }

        // ── Step 3: Poll both /dsc-autofill AND /dsc-status every 2s for up to 30s ────
        // The agent may still be parsing the cert when the popup first opens,
        // so we keep retrying until cert data is available (up to 30s).
        for (let i = 0; i < 15; i++) {
          if (cancelled) break;
          // Prefer /dsc-autofill (direct field mapping, available in agent v5+)
          try {
            const afRes = await fetch('http://127.0.0.1:7432/dsc-autofill', {
              signal: AbortSignal.timeout(3000),
              cache:  'no-store',
            });
            if (afRes.ok) {
              const afData = await afRes.json();
              if (afData.available && afData.fields?.holder_name) {
                if (!cancelled) {
                  applyAutofill(afData.fields);
                  toast.success('✓ DSC token auto-filled — no PIN needed!');
                  setAutoFillDone(true);
                }
                return;
              }
            }
          } catch { /* keep polling */ }
          // Also try /dsc-status as fallback
          try {
            const res = await fetch('http://127.0.0.1:7432/dsc-status', {
              signal: AbortSignal.timeout(3000),
              cache:  'no-store',
            });
            if (res.ok) {
              const data = await res.json();
              if (data.cert && data.cert.holder_name) {
                if (!cancelled) {
                  applyCert(data.cert);
                  toast.success('✓ Token data auto-filled — no PIN needed!');
                }
                return;
              }
            }
          } catch { /* keep polling */ }
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch { /* agent not running */ }
      finally { if (!cancelled) setAgentAutoFetching(false); }
    }

    tryAgentAutoFetch();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── v5: Apply structured autofill from /dsc-autofill (direct field mapping) ──
  const applyAutofill = (fields) => {
    setForm(prev => ({
      ...prev,
      holder_name:     fields.holder_name     || prev.holder_name,
      serial_number:   fields.serial_number   || prev.serial_number,
      issue_date:      fields.issue_date      || prev.issue_date,
      expiry_date:     fields.expiry_date     || prev.expiry_date,
      associated_with: fields.associated_with || prev.associated_with,
      dsc_type:        fields.dsc_type        || prev.dsc_type,
      notes: [
        prev.notes,
        fields.issuer         ? `Issuer: ${fields.issuer}`              : null,
        fields.ca_provider    ? `CA Provider: ${fields.ca_provider}`    : null,
        fields.token_provider ? `Token: ${fields.token_provider}`       : null,
        fields.email          ? `Email: ${fields.email}`                : null,
        fields.pan            ? `PAN: ${fields.pan}`                    : null,
      ].filter(Boolean).join('\n'),
    }));
    setCertFetched(true);
  };

  // ── Apply parsed cert data to form (legacy /dsc-status path) ─────────────────
  const applyCert = (cert) => {
    setForm(prev => ({
      ...prev,
      holder_name:     cert.holder_name                             || prev.holder_name,
      serial_number:   cert.serial_number                           || prev.serial_number,
      issue_date:      cert.issue_date                              || prev.issue_date,
      expiry_date:     cert.expiry_date                             || prev.expiry_date,
      associated_with: cert.associated_with || cert.organization    || prev.associated_with,
      dsc_type:        cert.dsc_type                                || prev.dsc_type,
      notes: [
        prev.notes,
        cert.issuer         ? `Issuer: ${cert.issuer}`              : null,
        cert.ca_provider    ? `CA Provider: ${cert.ca_provider}`    : null,
        cert.token_provider ? `Token: ${cert.token_provider}`       : null,
        cert.email          ? `Email: ${cert.email}`                : null,
        cert.pan            ? `PAN: ${cert.pan}`                    : null,
      ].filter(Boolean).join('\n'),
    }));
    setCertFetched(true);
  };

  // ── 4-Tier certificate reading strategy ──────────────────────────────────────
  // Tier 1: navigator.smartCard  — Chrome PC/SC API (Windows + fixed API shape)
  // Tier 2: Local DSC Agent      — node process on localhost:7432 (most reliable on Windows)
  // Tier 3: WebUSB + CCID        — direct USB (Linux/Mac only)
  // Tier 4: File upload fallback — always works (.cer export from mToken Manager)
  const handleReadCertificate = async () => {
    if (!pin.trim()) { setReadError('Enter the token PIN first.'); return; }
    setReading(true);
    setReadError('');

    const tierErrors = [];

    // ── TIER 1: navigator.smartCard (Chrome 114+ on Windows) ─────────────────
    if (isWebSmartCardSupported()) {
      console.log('[DSC] Tier 1: trying navigator.smartCard…');
      try {
        const cert = await readCertFromWebSmartCard(pin.trim());
        if (cert && cert.holder_name) {
          applyCert(cert);
          toast.success(`Certificate read from token ✓ (method: ${cert.read_method})`);
          setReading(false);
          return;
        }
        tierErrors.push('Tier 1 (smartCard): no certificate found');
      } catch (err) {
        console.warn('[DSC] Tier 1 smartCard error:', err.message);
        // PIN / block errors are definitive — stop here
        if (err?.message?.includes('PIN') || err?.message?.includes('blocked') || err?.message?.includes('attempt')) {
          setReadError(err.message);
          setReading(false);
          return;
        }
        tierErrors.push(`Tier 1 (smartCard): ${err.message}`);
      }
    } else {
      tierErrors.push('Tier 1 (smartCard): not available in this browser');
      console.log('[DSC] Tier 1: navigator.smartCard not supported, skipping');
    }

    // ── TIER 2: Local DSC Agent (node on localhost:7432) ──────────────────────
    console.log('[DSC] Tier 2: checking local DSC agent…');
    const agentRunning = await checkLocalAgent();
    if (agentRunning) {
      try {
        const cert = await readCertFromLocalAgent(pin.trim());
        if (cert && cert.holder_name) {
          applyCert(cert);
          toast.success('Certificate read via local agent ✓');
          setReading(false);
          return;
        }
        tierErrors.push('Tier 2 (local agent): no certificate found');
      } catch (err) {
        console.warn('[DSC] Tier 2 local agent error:', err.message);
        if (err?.message?.includes('PIN') || err?.message?.includes('blocked') || err?.message?.includes('Incorrect')) {
          setReadError(err.message);
          setReading(false);
          return;
        }
        tierErrors.push(`Tier 2 (local agent): ${err.message}`);
      }
    } else {
      tierErrors.push('Tier 2 (local agent): not running on localhost:7432');
      console.log('[DSC] Tier 2: local agent not running');
    }

    // ── TIER 3: WebUSB + CCID (Linux / Mac) ───────────────────────────────────
    if (device) {
      console.log('[DSC] Tier 3: trying WebUSB…');
      try {
        if (!device.opened) await device.open();
        const cert = await readCertFromUsbToken(device, pin.trim());
        if (cert && cert.holder_name) {
          applyCert(cert);
          toast.success('Certificate read via WebUSB ✓');
          setReading(false);
          return;
        }
        tierErrors.push('Tier 3 (WebUSB): no certificate found');
      } catch (err) {
        console.warn('[DSC] Tier 3 WebUSB error:', err.message);
        tierErrors.push(`Tier 3 (WebUSB): ${err.message}`);
      }
    } else {
      tierErrors.push('Tier 3 (WebUSB): no USB device available');
    }

    // ── TIER 4: File upload (universal fallback) ──────────────────────────────
    console.log('[DSC] All tiers failed — showing file upload fallback');
    console.log('[DSC] Tier errors:\n' + tierErrors.join('\n'));
    setReadError('FILE_UPLOAD_NEEDED');
    setReading(false);
  };

  // ── Handle .cer / .pem file upload ───────────────────────────────────────────
  const handleCertFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadError('');
    setReading(true);
    try {
      const cert = await parseCertificateFile(file);
      if (!cert || !cert.holder_name) {
        setReadError('Could not read certificate from this file. Make sure it is a valid .cer or .pem file.');
        return;
      }
      applyCert(cert);
      toast.success(`Certificate read from ${file.name} ✓`);
    } catch (err) {
      setReadError('Failed to parse certificate file: ' + (err?.message || 'Unknown error'));
    } finally {
      setReading(false);
      if (certFileRef.current) certFileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.holder_name.trim()) { return; }
    setSaving(true);
    try {
      const payload = {
        holder_name:     form.holder_name.trim(),
        dsc_type:        form.dsc_type,
        dsc_password:    form.dsc_password,
        serial_number:   form.serial_number,
        associated_with: form.associated_with,
        entity_type:     form.entity_type,
        issue_date:      new Date(form.issue_date).toISOString(),
        expiry_date:     new Date(form.expiry_date).toISOString(),
        notes:           form.notes,
      };
      const res = await api.post('/dsc', payload);
      const newId = res.data?.id || res.data?.data?.id;

      // Auto-mark as IN immediately
      if (newId) {
        await api.post(`/dsc/${newId}/movement`, {
          movement_type: 'IN',
          person_name:   'Token Inserted',
          notes:         'Auto-detected via USB — marked IN on plug-in',
        });
      }

      setSaved(true);
      toast.success(`DSC for "${form.holder_name}" added & marked IN ✓`);
      setTimeout(() => { onSaved(); }, 1200);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save DSC');
      setSaving(false);
    }
  };

  // ── colour palette ──────────────────────────────────────────────────────────
  const bg        = isDark ? '#0f172a' : '#ffffff';
  const surface   = isDark ? '#1e293b' : '#f8fafc';
  const border    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const labelClr  = isDark ? '#94a3b8' : '#64748b';
  const textClr   = isDark ? '#f1f5f9' : '#0f172a';
  const inputBg   = isDark ? '#0f172a' : '#ffffff';
  const inputBdr  = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: inputBg, border: `1px solid ${inputBdr}`,
    borderRadius: 8, padding: '7px 10px',
    fontSize: 13, color: textClr,
    outline: 'none', fontFamily: 'inherit',
  };
  const labelStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: labelClr, display: 'block', marginBottom: 4 };
  const rowStyle   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };

  return (
    <>
      <style>{USB_POPUP_STYLE}</style>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(5px)',
        }}
      >
        <div style={{
          width: '100%', maxWidth: 720,
          maxHeight: '90vh',
          background: bg, border: `1px solid ${border}`,
          borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          animation: 'dscSlideUp 0.26s cubic-bezier(0.34,1.4,0.64,1)',
        }}>

          {/* ── Accent bar ── */}
          <div style={{ height: 3, background: 'linear-gradient(90deg,#4f46e5,#6366f1,#818cf8,#4f46e5)', backgroundSize: '200% 100%' }} />

          {/* ── Header ── */}
          <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Icon */}
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: saved ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#4f46e5,#6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79,70,229,0.35)',
              transition: 'background 0.4s',
            }}>
              {saved
                ? <CheckCircle2 style={{ width: 22, height: 22, color: '#fff' }} />
                : <Key style={{ width: 22, height: 22, color: '#fff' }} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: textClr, lineHeight: 1.2 }}>
                  {saved ? 'DSC Added ✓' : 'DSC Token Detected'}
                </p>
                {/* Live USB dot */}
                {!saved && (
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'dscPulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
                )}
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: labelClr, lineHeight: 1.5 }}>
                {saved
                  ? `"${form.holder_name}" added to DSC Register & marked IN`
                  : device.productName
                      ? <><span style={{ color: '#818cf8', fontWeight: 600 }}>{device.productName}</span> — fill details below</>
                      : 'Fill details to add this certificate to the register'}
              </p>
            </div>

            {/* Dismiss × */}
            {!saved && (
              <button
                onClick={onDismiss}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: labelClr, padding: 4, borderRadius: 6, lineHeight: 1, fontSize: 18, flexShrink: 0 }}
                title="Dismiss"
              >×</button>
            )}
          </div>

          {/* ── Device info pill ── */}
          {(device.manufacturerName || device.vendorId) && !saved && (
            <div style={{ margin: '0 20px 12px', padding: '7px 12px', background: surface, borderRadius: 10, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Usb style={{ width: 13, height: 13, color: '#818cf8', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: labelClr, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[
                  device.manufacturerName || null,
                  device.vendorId  ? `VID 0x${device.vendorId.toString(16).toUpperCase().padStart(4,'0')}`  : null,
                  device.productId ? `PID 0x${device.productId.toString(16).toUpperCase().padStart(4,'0')}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {/* ── Form ── */}
          {!saved && (
            <div style={{ padding: '0 20px 4px', overflowY: 'auto', flex: 1 }}>

              {/* ── Agent Status Banner (v5) ── */}
              {agentConnected && !certFetched && (
                <div style={{
                  marginBottom: 10, padding: '8px 12px',
                  background: isDark ? 'rgba(99,102,241,0.12)' : '#eef2ff',
                  borderRadius: 8, border: '1px solid rgba(99,102,241,0.35)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: agentAutoFetching ? '#f59e0b' : '#10b981',
                    animation: agentAutoFetching ? 'dscPulse 1s ease-in-out infinite' : 'none',
                  }} />
                  <span style={{ fontSize: 11, color: isDark ? '#a5b4fc' : '#4338ca', fontWeight: 600, flex: 1 }}>
                    {agentAutoFetching
                      ? '⏳ DSC Agent connected — reading token certificate…'
                      : '✓ DSC Agent connected — plug in your DSC token to auto-fill all fields'}
                  </span>
                  {!agentAutoFetching && (
                    <button
                      onClick={async () => {
                        setAgentAutoFetching(true);
                        try {
                          const res = await fetch('http://127.0.0.1:7432/dsc-autofill', {
                            signal: AbortSignal.timeout(4000), cache: 'no-store',
                          });
                          if (res.ok) {
                            const d = await res.json();
                            if (d.available && d.fields?.holder_name) {
                              applyAutofill(d.fields);
                              setAutoFillDone(true);
                              toast.success('✓ DSC data auto-filled!');
                              return;
                            }
                          }
                          // fallback to /dsc-status
                          const r2 = await fetch('http://127.0.0.1:7432/dsc-status', {
                            signal: AbortSignal.timeout(3000), cache: 'no-store',
                          });
                          if (r2.ok) {
                            const d2 = await r2.json();
                            if (d2.cert?.holder_name) { applyCert(d2.cert); return; }
                          }
                          toast.info('No DSC token detected yet — plug in your token and try again.');
                        } catch { toast.error('Could not reach agent.'); }
                        finally { setAgentAutoFetching(false); }
                      }}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px',
                        borderRadius: 5, border: '1px solid rgba(99,102,241,0.5)',
                        background: 'transparent', color: isDark ? '#a5b4fc' : '#4338ca',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ↻ Re-fetch
                    </button>
                  )}
                </div>
              )}

              {/* ── Auto-fill success banner ── */}
              {autoFillDone && certFetched && (
                <div style={{
                  marginBottom: 10, padding: '8px 12px',
                  background: isDark ? 'rgba(16,185,129,0.10)' : '#f0fdf4',
                  borderRadius: 8, border: '1px solid rgba(16,185,129,0.4)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 13 }}>✅</span>
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, flex: 1 }}>
                    All fields auto-filled from DSC token — verify and save.
                  </span>
                  <button
                    onClick={() => { setAutoFillDone(false); setCertFetched(false); setAgentAutoFetching(false); }}
                    style={{ fontSize: 10, background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}
                  >
                    ✕ Clear
                  </button>
                </div>
              )}

              {/* ── PIN Read Section ── */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: certFetched ? (isDark ? 'rgba(16,185,129,0.1)' : '#f0fdf4') : surface, borderRadius: 10, border: `1px solid ${certFetched ? '#10b981' : readError ? '#ef4444' : border}` }}>
                <label style={{ ...labelStyle, marginBottom: 6, color: certFetched ? '#10b981' : readError ? '#ef4444' : labelClr }}>
                  {certFetched
                    ? '✓ Certificate Read from Token'
                    : agentAutoFetching
                      ? '⏳ Reading certificate from token…'
                      : agentConnected
                        ? 'PIN required? Enter below to force-read:'
                        : 'Read Certificate from Token (Optional)'}
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...inputStyle, flex: 1, letterSpacing: pin ? '0.2em' : 'normal' }}
                    type="password"
                    placeholder={agentConnected ? 'PIN only needed if auto-fill failed above' : 'Enter token PIN / password'}
                    value={pin}
                    onChange={e => { setPin(e.target.value); setReadError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleReadCertificate(); }}
                    disabled={reading}
                  />
                  <button
                    type="button"
                    onClick={handleReadCertificate}
                    disabled={reading || !pin.trim()}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: certFetched ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#4f46e5,#6366f1)',
                      color: '#fff', fontSize: 12, fontWeight: 700, cursor: reading || !pin.trim() ? 'not-allowed' : 'pointer',
                      opacity: !pin.trim() ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                    }}
                  >
                    {reading
                      ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'dscSpin 0.7s linear infinite' }} />Reading…</>
                      : certFetched ? '↻ Re-read' : '⬆ Fetch Data'}
                  </button>
                </div>
                {readError === 'FILE_UPLOAD_NEEDED' ? (
                  /* ── Fallback: .cer file upload + local agent option ── */
                  <div style={{ margin: '8px 0 0', padding: '10px 12px', background: isDark ? 'rgba(251,191,36,0.08)' : '#fffbeb', borderRadius: 8, border: '1px solid rgba(251,191,36,0.35)' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 11, color: '#d97706', fontWeight: 700 }}>
                      🪟 Auto-read failed — upload your certificate file instead
                    </p>
                    <p style={{ margin: '0 0 6px', fontSize: 10, color: isDark ? '#fde68a' : '#92400e', lineHeight: 1.6 }}>
                      Export from <strong>mToken Manager</strong> → Certificate tab → <strong>Export</strong> → save as <code style={{ background: isDark ? '#1e1b4b' : '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>.cer</code>, then upload:
                    </p>
                    <input
                      ref={certFileRef}
                      type="file"
                      accept=".cer,.crt,.pem,.der"
                      style={{ display: 'none' }}
                      onChange={handleCertFileUpload}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => certFileRef.current?.click()}
                        disabled={reading}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                          color: '#fff', fontSize: 11, fontWeight: 700,
                        }}
                      >
                        📂 Upload .cer / .pem File
                      </button>
                      <button
                        onClick={async () => {
                          const report = await diagnoseDscReader();
                          alert('DSC Diagnostic Report\n\n' + report + '\n\nThis report was also printed to the DevTools console.');
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 6, border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                          background: 'transparent', cursor: 'pointer',
                          color: isDark ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 600,
                        }}
                        title="Run full diagnostic to see why auto-read failed"
                      >
                        🔍 Run Diagnostic
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 2px', fontSize: 9.5, color: isDark ? '#6b7280' : '#9ca3af', lineHeight: 1.5 }}>
                      💡 <strong>For Windows users:</strong> Run the <code style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '1px 3px', borderRadius: 2 }}>dsc-agent</code> locally with <code style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '1px 3px', borderRadius: 2 }}>node index.js</code> for automatic reading.
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 9, color: isDark ? '#6b7280' : '#9ca3af' }}>
                      Your private key is never exported — only the public certificate (name, dates, serial).
                    </p>
                  </div>
                ) : readError ? (
                  <div style={{ margin: '8px 0 0', padding: '8px 10px', background: isDark ? 'rgba(239,68,68,0.12)' : '#fff1f1', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#ef4444', lineHeight: 1.5, fontWeight: 600 }}>⚠ Could not read certificate</p>
                    <p style={{ margin: '3px 0 0', fontSize: 10, color: isDark ? '#fca5a5' : '#b91c1c', lineHeight: 1.5 }}>{readError}</p>
                  </div>
                ) : null}
                {!certFetched && !readError && (
                  <p style={{ margin: '5px 0 0', fontSize: 10, color: labelClr, lineHeight: 1.4 }}>
                    Optional — enter your token PIN and click “Fetch Data” to auto-fill. Or fill the form manually below.
                  </p>
                )}
              </div>

              {/* ── 3-column compact grid ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                {/* Holder Name — spans 2 cols */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Holder Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    style={{ ...inputStyle, fontSize: 13, fontWeight: 600, background: certFetched && form.holder_name ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : inputBg, borderColor: certFetched && form.holder_name ? '#10b981' : inputBdr }}
                    placeholder="e.g. Rajesh Kumar Sharma"
                    value={form.holder_name}
                    onChange={e => set('holder_name', e.target.value)}
                    autoFocus={!certFetched}
                  />
                </div>
                <div>
                  <label style={labelStyle}>DSC Type</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.dsc_type} onChange={e => set('dsc_type', e.target.value)}>
                    {['Class 3','Class 2','Signature','Encryption','Combo','DGFT'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Serial Number</label>
                  <input
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, background: certFetched && form.serial_number ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : inputBg, borderColor: certFetched && form.serial_number ? '#10b981' : inputBdr }}
                    placeholder="Auto-filled from token"
                    value={form.serial_number}
                    onChange={e => set('serial_number', e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Associated With</label>
                  <input style={inputStyle} placeholder="Firm / client name" value={form.associated_with} onChange={e => set('associated_with', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>
                    <Lock style={{ width: 10, height: 10, display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                    Token Password
                  </label>
                  <input style={inputStyle} type="text" placeholder="e.g. 12345678" value={form.dsc_password} onChange={e => set('dsc_password', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Issue Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    style={{ ...inputStyle, background: certFetched && form.issue_date ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : inputBg, borderColor: certFetched && form.issue_date ? '#10b981' : inputBdr }}
                    type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    style={{ ...inputStyle, background: certFetched && form.expiry_date ? (isDark ? 'rgba(16,185,129,0.08)' : '#f0fdf4') : inputBg, borderColor: certFetched && form.expiry_date ? '#10b981' : inputBdr }}
                    type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Entity Type</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.entity_type} onChange={e => set('entity_type', e.target.value)}>
                    <option value="firm">Firm</option>
                    <option value="client">Client</option>
                  </select>
                </div>
              </div>

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DSCRegister() {
  const isDark    = useDark();
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canDeleteDSC = isAdmin || hasPermission('can_delete_data');
  const canEditDSC   = isAdmin || hasPermission('can_edit_data');
  const searchRef = useRef(null);

  const [dscList, setDscList]                       = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [dialogOpen, setDialogOpen]                 = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen]           = useState(false);
  const [editingDSC, setEditingDSC]                 = useState(null);
  const [selectedDSC, setSelectedDSC]               = useState(null);
  const [editingMovement, setEditingMovement]       = useState(null);
  const [searchQuery, setSearchQuery]               = useState('');
  const [rowsPerPage, setRowsPerPage]               = useState(15);
  const [currentPageIn, setCurrentPageIn]           = useState(1);
  const [currentPageOut, setCurrentPageOut]         = useState(1);
  const [currentPageExpired, setCurrentPageExpired] = useState(1);
  const [sortOrder, setSortOrder]                   = useState('az');
  const [activeTab, setActiveTab]                   = useState('in');
  const [sharing, setSharing]                       = useState(false);

  const [selectedIds, setSelectedIds]           = useState(new Set());
  const [bulkDialogOpen, setBulkDialogOpen]     = useState(false);
  const [bulkMovementType, setBulkMovementType] = useState('IN');
  const [bulkPersonName, setBulkPersonName]     = useState('');
  const [bulkNotes, setBulkNotes]               = useState('');
  const [bulkLoading, setBulkLoading]           = useState(false);

  // ── AI Duplicate detection ────────────────────────────────────────────────
  const [showDupDialog, setShowDupDialog] = useState(false);
  const [dupGroups,     setDupGroups]     = useState([]);
  const [detectingDups, setDetectingDups] = useState(false);

  const [formData, setFormData] = useState({
    holder_name: '', dsc_type: '', dsc_password: '', serial_number: '',
    associated_with: '', entity_type: 'firm',
    issue_date: '', expiry_date: '', notes: '',
  });
  const [movementData, setMovementData]         = useState({ movement_type: 'IN', person_name: '', notes: '' });
  const [editMovementData, setEditMovementData] = useState({ movement_type: 'IN', person_name: '', notes: '' });

  const shareAreaRef = useRef(null);

  // ── USB state ──────────────────────────────────────────────────────────────
  const [usbPromptOpen, setUsbPromptOpen] = useState(false);
  const [usbDevice,     setUsbDevice]     = useState(null);
  const [usbDismissed,  setUsbDismissed]  = useState(false);
  const [usbSupported,  setUsbSupported]  = useState(false);
  const [usbPermission, setUsbPermission] = useState('unknown'); // 'unknown'|'granted'|'denied'
  const [usbGranting,   setUsbGranting]   = useState(false);

  // ── Unified DSC popup (Add / Edit / Token-detected) ───────────────────────
  const [unifiedPopupOpen, setUnifiedPopupOpen] = useState(false);

  // ── Status helpers ────────────────────────────────────────────────────────
  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };
  const getDocumentInOutStatus = getDSCInOutStatus;

  const getDSCStatus = (expiryDate) => {
    const daysLeft = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0)   return { color: 'bg-red-500',    text: 'Expired',           textColor: 'text-red-600' };
    if (daysLeft <= 7)  return { color: 'bg-orange-500', text: `${daysLeft}d left`, textColor: 'text-orange-600' };
    if (daysLeft <= 30) return { color: 'bg-yellow-500', text: `${daysLeft}d left`, textColor: 'text-yellow-700' };
    return               { color: 'bg-emerald-500',      text: `${daysLeft}d left`, textColor: 'text-emerald-700' };
  };

  // ── Build share text ──────────────────────────────────────────────────────
  const buildSummaryText = (dsc) => {
    if (!dsc) return '';
    const lastMove = dsc.movement_log?.length > 0 ? dsc.movement_log[dsc.movement_log.length - 1] : null;
    return [
      `*DSC Certificate Details*`,
      ``,
      `👤 Holder: ${dsc.holder_name || 'N/A'}`,
      `🏷️ Type: ${dsc.dsc_type || 'Standard'}`,
      dsc.serial_number ? `🔢 Serial No: ${dsc.serial_number}` : null,
      `🏢 Associated With: ${dsc.associated_with || 'N/A'}`,
      `📅 Issue Date: ${dsc.issue_date ? format(new Date(dsc.issue_date), 'dd MMM yyyy') : 'N/A'}`,
      `⏳ Expiry Date: ${dsc.expiry_date ? format(new Date(dsc.expiry_date), 'dd MMM yyyy') : 'N/A'}`,
      `📍 Current Status: ${getDSCInOutStatus(dsc)}`,
      dsc.dsc_password ? `🔑 Password: ${dsc.dsc_password}` : null,
      dsc.notes ? `📝 Notes: ${dsc.notes}` : null,
      lastMove ? `\nLast Movement: ${lastMove.movement_type} by ${lastMove.person_name} on ${format(new Date(lastMove.timestamp), 'dd MMM yyyy, hh:mm a')}` : null,
      ``,
      `— TaskOsphere Command Center`,
    ].filter(Boolean).join('\n');
  };

  // ── Share handler ─────────────────────────────────────────────────────────
  const handleShare = async (method) => {
    if (!shareAreaRef.current || !selectedDSC) return;
    setSharing(true);
    try {
      const canvas = await html2canvas(shareAreaRef.current, {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const summaryText = buildSummaryText(selectedDSC);
      const safeName = (selectedDSC.holder_name || 'DSC').replace(/[^a-z0-9]/gi, '_');
      const fileName = `DSC_${safeName}.png`;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

      if (method === 'whatsapp') {
        const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `DSC — ${selectedDSC.holder_name}`, text: summaryText });
            toast.success('Opened share sheet');
            return;
          } catch (err) {
            if (err?.name === 'AbortError') return;
          }
        }
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = fileName; link.href = url; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        try { await navigator.clipboard?.writeText(summaryText); toast.success('Image downloaded & details copied. Paste in WhatsApp ✓'); }
        catch { toast.success('Image downloaded. Attach it in WhatsApp.'); }
        window.open(`https://wa.me/?text=${encodeURIComponent(summaryText)}`, '_blank');
        return;
      }
      if (method === 'email') {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = fileName; link.href = url; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        window.location.href = `mailto:?subject=${encodeURIComponent('DSC Certificate Details — ' + selectedDSC.holder_name)}&body=${encodeURIComponent(summaryText)}`;
        return;
      }
      if (method === 'download') {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = fileName; link.href = dataUrl; link.click();
        toast.success('Screenshot downloaded');
        return;
      }
      if (method === 'copy') {
        try { await navigator.clipboard.writeText(summaryText); toast.success('DSC details copied to clipboard'); }
        catch { toast.error('Could not copy to clipboard'); }
        return;
      }
    } catch (err) {
      console.error('Share failed:', err);
      toast.error('Failed to capture / share. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => { fetchDSC(); }, []);
  useEffect(() => { setCurrentPageIn(1); setCurrentPageOut(1); setCurrentPageExpired(1); }, [sortOrder, searchQuery]);

  // ── USB DSC Token Detection ───────────────────────────────────────────────
  // WebUSB only fires 'connect' for devices that have been previously granted
  // permission. We must call requestDevice() at least once to get permission,
  // then the browser remembers it and fires 'connect' on future plug-ins.

  const DSC_VENDOR_IDS = [
    { vendorId: 0x0529 }, { vendorId: 0x08E6 }, { vendorId: 0x096E },
    { vendorId: 0x1FC9 }, { vendorId: 0x076B }, { vendorId: 0x04B9 },
    { vendorId: 0x073D }, { vendorId: 0x072F }, { vendorId: 0x22CD },
    { vendorId: 0x311F }, { vendorId: 0x058F }, { vendorId: 0x04E6 },
    { vendorId: 0x0DC3 }, { vendorId: 0x1D50 },
  ];

  const DSC_NAME_KEYWORDS = [
    'token', 'dsc', 'etoken', 'epass', 'safenet', 'feitian',
    'watchdata', 'smart card', 'smartcard', 'crypto', 'pkcs',
    'moser baer', 'ikey', 'crescendo', 'eutron', 'trustkey',
    'emudhra', 'sify', 'ncode', 'capricorn', 'e-mudhra', 'proxkey',
  ];

  const isDSCDevice = useCallback((device) => {
    if (DSC_VENDOR_IDS.some(f => f.vendorId === device.vendorId)) return true;
    const combined = [device.productName || '', device.manufacturerName || ''].join(' ').toLowerCase();
    if (DSC_NAME_KEYWORDS.some(kw => combined.includes(kw))) return true;
    if (device.deviceClass === 0x0B) return true;
    return false;
  }, []);

  // On mount: check if WebUSB is available and scan already-permitted devices
  useEffect(() => {
    if (!navigator.usb) { setUsbSupported(false); return; }
    setUsbSupported(true);

    const scanExistingDevices = async () => {
      try {
        const devices = await navigator.usb.getDevices();
        if (devices.length > 0) {
          setUsbPermission('granted');
          // Show popup for any previously-permitted device (user selected it, so it's their DSC)
          if (!usbDismissed) {
            setUsbDevice(devices[0]);
            setUsbPromptOpen(true);
          }
        }
      } catch (_) {}
    };
    scanExistingDevices();

    const handleConnect = (event) => {
      if (usbDismissed) return;
      setUsbPermission('granted');
      // Show popup for ANY newly plugged-in permitted device
      setUsbDevice(event.device);
      setUsbPromptOpen(true);
    };

    const handleDisconnect = () => {
      setUsbPromptOpen(false);
    };

    navigator.usb.addEventListener('connect', handleConnect);
    navigator.usb.addEventListener('disconnect', handleDisconnect);
    return () => {
      navigator.usb.removeEventListener('connect', handleConnect);
      navigator.usb.removeEventListener('disconnect', handleDisconnect);
    };
  }, [usbDismissed]);

  // Called when user clicks "Grant USB Access" button
  const handleGrantUsbAccess = useCallback(async () => {
    if (!navigator.usb) return;
    setUsbGranting(true);
    try {
      // IMPORTANT: Use empty filters [] so Chrome shows ALL connected USB devices.
      // Vendor-ID filters cause "No compatible devices found" if the token's VID
      // isn't in our list. The user picks their DSC token from the full list.
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbPermission('granted');
      if (!usbDismissed) {
        setUsbDevice(device);
        setUsbPromptOpen(true);
      }
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User closed the picker without selecting — not an error
        toast.info('No device selected. Make sure your DSC token is plugged in, then try again.');
      } else {
        setUsbPermission('denied');
        toast.error('USB access denied. Please allow USB access in browser settings.');
      }
    } finally {
      setUsbGranting(false);
    }
  }, [usbDismissed]);

  // ── Keyboard shortcut: "/" focuses search ────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = PRINT_STYLE;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  const handlePrint = () => window.print();

  // ── AI Duplicate Detection ────────────────────────────────────────────────
  const handleDetectDscDuplicates = useCallback(() => {
    if (detectingDups) return;
    setDetectingDups(true);
    setTimeout(() => {
      try {
        const groups = detectDscDuplicates(dscList);
        setDupGroups(groups);
        setShowDupDialog(true);
        if (!groups.length) toast.success(`Scanned ${dscList.length} DSCs — no duplicates found ✓`);
        else toast.info(`Found ${groups.length} duplicate group${groups.length !== 1 ? 's' : ''}`);
      } catch (e) {
        toast.error('Duplicate scan failed. Please try again.');
        console.error('DSC duplicate detection error:', e);
      } finally {
        setDetectingDups(false);
      }
    }, 60);
  }, [dscList, detectingDups]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const extractItems = (data) => {
    if (Array.isArray(data))              return data;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.dscs)) return data.dscs;
    return [];
  };

  const fetchDSC = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dsc', { params: { limit: 500 } });
      setDscList(extractItems(response.data));
    } catch (error) {
      toast.error('Failed to fetch DSC');
      setDscList([]);
    } finally {
      setLoading(false);
    }
  };

  const refetchAndSync = async (editingId) => {
    const response = await api.get('/dsc', { params: { limit: 500 } });
    const items = extractItems(response.data);
    setDscList(items);
    if (editingId) {
      const updated = items.find(d => d.id === editingId);
      if (updated) setEditingDSC(updated);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dscData = {
        holder_name:     formData.holder_name,
        dsc_type:        formData.dsc_type,
        dsc_password:    formData.dsc_password,
        serial_number:   formData.serial_number || '',
        associated_with: formData.associated_with,
        entity_type:     formData.entity_type,
        notes:           formData.notes,
        issue_date:      new Date(formData.issue_date).toISOString(),
        expiry_date:     new Date(formData.expiry_date).toISOString(),
      };
      if (editingDSC) {
        await api.put(`/dsc/${editingDSC.id}`, dscData);
        toast.success('DSC updated successfully!');
      } else {
        await api.post('/dsc', dscData);
        toast.success('DSC added successfully!');
      }
      setDialogOpen(false);
      resetForm();
      fetchDSC();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save DSC');
    } finally {
      setLoading(false);
    }
  };

  // ── Single movement ───────────────────────────────────────────────────────
  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`DSC marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchDSC();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (dsc, type) => {
    setSelectedDSC(dsc);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (dsc) => { setSelectedDSC(dsc); setLogDialogOpen(true); };

  const handleMovementInModal = async () => {
    if (!editingDSC || !movementData.person_name) return;
    setLoading(true);
    try {
      const newType = getDSCInOutStatus(editingDSC) === 'IN' ? 'OUT' : 'IN';
      await api.post(`/dsc/${editingDSC.id}/movement`, { ...movementData, movement_type: newType });
      toast.success(`DSC marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      await refetchAndSync(editingDSC.id);
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingDSC || !editMovementData.person_name) return;
    setLoading(true);
    try {
      await api.put(`/dsc/${editingDSC.id}/movement/${movementId}`, {
        movement_id:   movementId,
        movement_type: editMovementData.movement_type,
        person_name:   editMovementData.person_name,
        notes:         editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      await refetchAndSync(editingDSC.id);
    } catch (error) {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id || movement.timestamp);
    setEditMovementData({ movement_type: movement.movement_type, person_name: movement.person_name, notes: movement.notes || '' });
  };

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const handleEdit = (dsc) => {
    setEditingDSC(dsc);
    setUnifiedPopupOpen(true);
  };

  const handleDelete = async (dscId) => {
    if (!window.confirm('Are you sure you want to delete this DSC?')) return;
    try {
      await api.delete(`/dsc/${dscId}`);
      toast.success('DSC deleted successfully!');
      fetchDSC();
    } catch (error) {
      toast.error('Failed to delete DSC');
    }
  };

  const resetForm = () => {
    setFormData({ holder_name: '', dsc_type: '', dsc_password: '', serial_number: '', associated_with: '', entity_type: 'firm', issue_date: '', expiry_date: '', notes: '' });
    setEditingDSC(null);
  };

  const filterBySearch = (dsc) => {
    if (!searchQuery.trim()) return true;
    if (!dsc) return false;
    const q = searchQuery.toLowerCase();
    return dsc.holder_name?.toLowerCase().includes(q) || dsc.dsc_type?.toLowerCase().includes(q) || dsc.associated_with?.toLowerCase().includes(q);
  };

  // ── Sort ──────────────────────────────────────────────────────────────────
  const applySortOrder = (list) => {
    const arr = [...list];
    switch (sortOrder) {
      case 'az':   return arr.sort((a, b) => (a.holder_name || '').localeCompare(b.holder_name || ''));
      case 'za':   return arr.sort((a, b) => (b.holder_name || '').localeCompare(a.holder_name || ''));
      case 'fifo': return arr.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
      case 'lifo': return arr.sort((a, b) => new Date(b.expiry_date) - new Date(a.expiry_date));
      default:     return arr;
    }
  };

  const nowDate    = new Date();
  const inDSC      = applySortOrder(dscList.filter(d => new Date(d.expiry_date) >= nowDate && getDSCInOutStatus(d) === 'IN'  && filterBySearch(d)));
  const outDSC     = applySortOrder(dscList.filter(d => new Date(d.expiry_date) >= nowDate && getDSCInOutStatus(d) === 'OUT' && filterBySearch(d)));
  const expiredDSC = applySortOrder(dscList.filter(d => new Date(d.expiry_date) < nowDate  && filterBySearch(d)));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsExpiring7  = dscList.filter(d => { const dl = Math.ceil((new Date(d.expiry_date) - nowDate) / 86400000); return dl >= 0 && dl <= 7; }).length;
  const statsExpiring30 = dscList.filter(d => { const dl = Math.ceil((new Date(d.expiry_date) - nowDate) / 86400000); return dl > 7 && dl <= 30; }).length;
  const statsExpired    = dscList.filter(d => new Date(d.expiry_date) < nowDate).length;
  const statsIn         = dscList.filter(d => new Date(d.expiry_date) >= nowDate && getDSCInOutStatus(d) === 'IN').length;
  const statsOut        = dscList.filter(d => new Date(d.expiry_date) >= nowDate && getDSCInOutStatus(d) === 'OUT').length;

  // ── Pagination ────────────────────────────────────────────────────────────
  const safePage = (cur, total) => Math.min(cur, Math.max(1, total));
  const tpIn  = Math.ceil(inDSC.length      / rowsPerPage);
  const tpOut = Math.ceil(outDSC.length     / rowsPerPage);
  const tpExp = Math.ceil(expiredDSC.length / rowsPerPage);
  const spIn  = safePage(currentPageIn,      tpIn);
  const spOut = safePage(currentPageOut,     tpOut);
  const spExp = safePage(currentPageExpired, tpExp);
  const pagedIn  = inDSC.slice((spIn  - 1) * rowsPerPage, spIn  * rowsPerPage);
  const pagedOut = outDSC.slice((spOut - 1) * rowsPerPage, spOut * rowsPerPage);
  const pagedExp = expiredDSC.slice((spExp - 1) * rowsPerPage, spExp * rowsPerPage);

  // ── Bulk selection ────────────────────────────────────────────────────────
  const toggleSelect   = (id)  => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll      = (list) => {
    const allSel = list.every(d => selectedIds.has(d.id));
    setSelectedIds(prev => { const s = new Set(prev); list.forEach(d => allSel ? s.delete(d.id) : s.add(d.id)); return s; });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkMovement = async () => {
    if (!bulkPersonName.trim()) { toast.error('Person name is required'); return; }
    setBulkLoading(true);
    let success = 0; let failed = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await api.post(`/dsc/${id}/movement`, { movement_type: bulkMovementType, person_name: bulkPersonName.trim(), notes: bulkNotes.trim() });
        success++;
      } catch { failed++; }
    }
    setBulkLoading(false);
    toast.success(`${success} DSC(s) marked as ${bulkMovementType}${failed > 0 ? `, ${failed} failed` : ''}`);
    setBulkDialogOpen(false);
    setBulkPersonName(''); setBulkNotes('');
    clearSelection();
    fetchDSC();
  };

  const SORT_OPTIONS = [
    { value: 'az',   label: 'A → Z' },
    { value: 'za',   label: 'Z → A' },
    { value: 'fifo', label: 'FIFO (Expiry ↑)' },
    { value: 'lifo', label: 'LIFO (Expiry ↓)' },
  ];

  const renderFormBody = (isEdit) => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="holder_name">Holder Name <span className="text-red-500">*</span></Label>
          <Input id="holder_name" placeholder="Name of certificate holder" value={formData.holder_name}
            onChange={e => setFormData({ ...formData, holder_name: e.target.value })} required data-testid="dsc-holder-name-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dsc_type">Type</Label>
          <Input id="dsc_type" placeholder="e.g. Class 3, Signature, Encryption" value={formData.dsc_type}
            onChange={e => setFormData({ ...formData, dsc_type: e.target.value })} data-testid="dsc-type-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="serial_number">Serial Number</Label>
          <Input id="serial_number" placeholder="Certificate serial number" value={formData.serial_number}
            onChange={e => setFormData({ ...formData, serial_number: e.target.value })} className="font-mono text-xs" data-testid="dsc-serial-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dsc_password">Password</Label>
          <Input id="dsc_password" type="text" placeholder="DSC Password" value={formData.dsc_password}
            onChange={e => setFormData({ ...formData, dsc_password: e.target.value })} data-testid="dsc-password-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entity_type">Entity Type</Label>
          <Select value={formData.entity_type} onValueChange={v => setFormData({ ...formData, entity_type: v })}>
            <SelectTrigger data-testid="dsc-entity-type-select"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="firm">Firm</SelectItem>
              <SelectItem value="client">Client</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="issue_date">Issue Date <span className="text-red-500">*</span></Label>
          <Input id="issue_date" type="date" value={formData.issue_date}
            onChange={e => setFormData({ ...formData, issue_date: e.target.value })} required data-testid="dsc-issue-date-input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expiry_date">Expiry Date <span className="text-red-500">*</span></Label>
          <Input id="expiry_date" type="date" value={formData.expiry_date}
            onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} required data-testid="dsc-expiry-date-input" />
        </div>
        <div />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Additional notes" value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} data-testid="dsc-notes-input" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="dsc-cancel-btn">Cancel</Button>
        <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700" data-testid="dsc-submit-btn">
          {loading ? 'Saving...' : isEdit ? 'Update DSC' : 'Add DSC'}
        </Button>
      </DialogFooter>
    </>
  );

  const tabCard = (borderColor) => ({
    background: isDark ? '#1e293b' : '#fff',
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : borderColor,
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0f172a]' : 'bg-slate-50'}`} data-testid="dsc-page">

      {/* ── Print area ── */}
      <div id="dsc-print-area" className="hidden print:block">
        <h2 className="text-xl font-bold mb-2">DSC Register — {format(new Date(), 'dd MMM yyyy')}</h2>
        <p className="text-sm text-slate-500 mb-4">Total: {dscList.length} | IN: {statsIn} | OUT: {statsOut} | Expired: {statsExpired}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['#','Holder Name','Type','Associated With','Expiry Date','Status','Last Movement'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dscList.map((dsc, i) => {
              const s = getDSCStatus(dsc.expiry_date);
              const last = dsc.movement_log?.length > 0 ? dsc.movement_log[dsc.movement_log.length - 1] : null;
              return (
                <tr key={dsc.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{dsc.holder_name}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{dsc.dsc_type || '-'}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{dsc.associated_with || '-'}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{format(new Date(dsc.expiry_date), 'dd MMM yyyy')}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{s.text}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{last ? `${last.movement_type} — ${last.person_name} (${format(new Date(last.timestamp), 'dd MMM yy')})` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Banner Header ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 60%, #1a8fcc 100%)', boxShadow: '0 8px 32px rgba(13,59,102,0.28)' }}>
        <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
        <div className="absolute right-28 bottom-0 w-40 h-40 rounded-full mb-[-40px] opacity-5" style={{ background: 'white' }} />
        <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5" style={{ background: 'white' }} />
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mt-0.5">
              <Key className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1">Registers</p>
              <h1 className="text-2xl font-bold text-white leading-tight">DSC Register</h1>
              <p className="text-white/60 text-sm mt-0.5">Click any row to view full details & share via WhatsApp</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePrint}
              className="h-9 px-4 gap-2 rounded-xl text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 backdrop-blur-sm">
              <Printer className="h-4 w-4" />Print
            </Button>
            {/* ── USB DSC Token Button ── */}
            {usbSupported && (
              <Button
                variant="outline"
                onClick={usbPermission === 'granted' ? () => { setUsbDismissed(false); handleGrantUsbAccess(); } : handleGrantUsbAccess}
                disabled={usbGranting}
                className="h-9 px-4 gap-2 rounded-xl text-sm backdrop-blur-sm font-semibold transition-all"
                style={{
                  backgroundColor: usbPermission === 'granted' ? 'rgba(16,185,129,0.20)' : 'rgba(99,102,241,0.20)',
                  borderColor: usbPermission === 'granted' ? 'rgba(16,185,129,0.60)' : 'rgba(129,140,248,0.60)',
                  color: usbPermission === 'granted' ? '#6ee7b7' : '#c7d2fe',
                }}
                title={usbPermission === 'granted' ? 'Scan for plugged-in DSC token' : 'Grant browser permission to detect DSC USB tokens'}
              >
                {usbGranting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Scanning…</>
                  : usbPermission === 'granted'
                    ? <><Usb className="h-3.5 w-3.5" />Scan DSC Token</>
                    : <><Usb className="h-3.5 w-3.5" />Enable DSC Detection</>}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDetectDscDuplicates}
              disabled={detectingDups || dscList.length === 0}
              className="h-9 px-4 gap-2 rounded-xl text-sm backdrop-blur-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'rgba(139,92,246,0.25)', borderColor: 'rgba(167,139,250,0.6)', color: '#ede9fe' }}
            >
              {detectingDups
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Scanning…</>
                : <><Sparkles className="h-3.5 w-3.5" />AI Duplicates</>}
            </Button>
            <Button
              onClick={() => { setEditingDSC(null); setUnifiedPopupOpen(true); }}
              className="bg-white text-indigo-700 hover:bg-blue-50 font-semibold rounded-xl px-5 shadow-lg transition-all hover:scale-105 active:scale-95"
              data-testid="add-dsc-btn"
            >
              <Plus className="mr-2 h-4 w-4" />Add DSC
            </Button>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="relative px-6 pb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total IN',     value: statsIn,         icon: ArrowDownCircle, color: '#10b981' },
            { label: 'Total OUT',    value: statsOut,        icon: ArrowUpCircle,   color: '#ef4444' },
            { label: 'Expiring 7d',  value: statsExpiring7,  icon: AlertCircle,     color: '#f97316' },
            { label: 'Expiring 30d', value: statsExpiring30, icon: Clock,           color: '#f59e0b' },
            { label: 'Expired',      value: statsExpired,    icon: TrendingDown,    color: '#94a3b8' },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label}
                className="rounded-xl backdrop-blur-sm px-4 py-3 flex items-center gap-3 cursor-default transition-all hover:scale-[1.03]"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${stat.color}30` }}>
                  <Icon className="h-4 w-4" style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest leading-none">{stat.label}</p>
                  <p className="text-white text-2xl font-black tabular-nums leading-tight mt-0.5" style={{ fontFamily: "'Roboto Mono', monospace" }}>{stat.value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="px-6 py-6 space-y-5">

        {/* Alert banner */}
        {dscList.filter(d => getDSCStatus(d.expiry_date).color !== 'bg-emerald-500').length > 0 && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${isDark ? 'bg-orange-900/20 border-orange-700/40' : 'bg-orange-50 border-orange-200'}`}>
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className={`text-sm font-semibold ${isDark ? 'text-orange-300' : 'text-orange-900'}`}>Attention Required</p>
              <p className={`text-sm mt-0.5 ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>
                {dscList.filter(d => getDSCStatus(d.expiry_date).color === 'bg-red-500' || getDSCStatus(d.expiry_date).color === 'bg-orange-500').length} certificate(s) expired or expiring within 7 days.{' '}
                {dscList.filter(d => getDSCStatus(d.expiry_date).color === 'bg-yellow-500').length} expiring within 30 days.
              </p>
            </div>
          </div>
        )}

        {/* Controls bar */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
          <Select value={rowsPerPage.toString()} onValueChange={v => { setRowsPerPage(Number(v)); setCurrentPageIn(1); setCurrentPageOut(1); setCurrentPageExpired(1); }}>
            <SelectTrigger className={`w-[140px] focus:border-indigo-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}>
              <SelectValue placeholder="Rows per page" />
            </SelectTrigger>
            <SelectContent>
              {[15,30,50,100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
            </SelectContent>
          </Select>

          <div className={`flex items-center gap-2 border rounded-xl px-3 h-10 ${isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
            <ArrowUpDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSortOrder(opt.value)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: sortOrder === opt.value ? 'linear-gradient(135deg,#4f46e5,#6366f1)' : 'transparent', color: sortOrder === opt.value ? '#fff' : (isDark ? '#94a3b8' : '#64748b') }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input ref={searchRef} type="text" placeholder='Search… (press "/" to focus)' value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`pl-10 pr-16 focus:border-indigo-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200'}`}
              data-testid="dsc-search-input" />
            {!searchQuery && (
              <kbd className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDark ? 'bg-slate-700 border-slate-500 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>/</kbd>
            )}
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDark ? 'bg-indigo-900/30 border-indigo-700' : 'bg-indigo-50 border-indigo-200'}`}>
            <CheckSquare className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <span className={`text-sm font-semibold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>{selectedIds.size} DSC selected</span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" onClick={() => { setBulkMovementType('IN'); setBulkDialogOpen(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-lg gap-1">
                <ArrowDownCircle className="h-3.5 w-3.5" />Mark all IN
              </Button>
              <Button size="sm" onClick={() => { setBulkMovementType('OUT'); setBulkDialogOpen(true); }}
                className="bg-red-600 hover:bg-red-700 text-white h-8 px-3 text-xs rounded-lg gap-1">
                <ArrowUpCircle className="h-3.5 w-3.5" />Mark all OUT
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}
                className={`h-8 px-3 text-xs rounded-lg ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Row colour legend */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Row colours:</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-200 inline-block border border-orange-300" />Expiring ≤ 7 days</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 inline-block border border-yellow-300" />Expiring ≤ 30 days</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block border border-red-300" />Expired</span>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`inline-flex h-11 items-center rounded-xl p-1 gap-1 ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
            <TabsTrigger value="in"
              className="rounded-lg px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md">
              <ArrowDownCircle className="h-4 w-4 mr-1.5 inline" />IN ({inDSC.length})
            </TabsTrigger>
            <TabsTrigger value="out"
              className="rounded-lg px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=active]:shadow-md">
              <ArrowUpCircle className="h-4 w-4 mr-1.5 inline" />OUT ({outDSC.length})
            </TabsTrigger>
            <TabsTrigger value="expired"
              className="rounded-lg px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:shadow-md">
              <AlertCircle className="h-4 w-4 mr-1.5 inline" />EXPIRED ({expiredDSC.length})
            </TabsTrigger>
          </TabsList>

          {/* IN tab */}
          <TabsContent value="in" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#d1fae5')}>
              <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3 flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-emerald-700 flex-shrink-0" />
                <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">DSC IN — Available ({inDSC.length})</p>
              </div>
              {loading && inDSC.length === 0
                ? <MiniLoader />
                : inDSC.length === 0
                  ? <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      <ArrowDownCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No DSC certificates currently IN</p>
                    </div>
                  : <DSCTable dscList={pagedIn} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog}
                      onViewLog={openLogDialog} getDSCStatus={getDSCStatus} type="IN"
                      globalIndexStart={(spIn-1)*rowsPerPage} isDark={isDark}
                      selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
              }
              <PaginationBar currentPage={spIn} totalPages={tpIn} totalItems={inDSC.length} pageSize={rowsPerPage} onPageChange={setCurrentPageIn} isDark={isDark} />
            </div>
          </TabsContent>

          {/* OUT tab */}
          <TabsContent value="out" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#fecaca')}>
              <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-red-700 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-700 uppercase tracking-wider">DSC OUT — Taken ({outDSC.length})</p>
              </div>
              {loading && outDSC.length === 0
                ? <MiniLoader />
                : outDSC.length === 0
                  ? <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      <ArrowUpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No DSC certificates currently OUT</p>
                    </div>
                  : <DSCTable dscList={pagedOut} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog}
                      onViewLog={openLogDialog} getDSCStatus={getDSCStatus} type="OUT"
                      globalIndexStart={(spOut-1)*rowsPerPage} isDark={isDark}
                      selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
              }
              <PaginationBar currentPage={spOut} totalPages={tpOut} totalItems={outDSC.length} pageSize={rowsPerPage} onPageChange={setCurrentPageOut} isDark={isDark} />
            </div>
          </TabsContent>

          {/* EXPIRED tab */}
          <TabsContent value="expired" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#fde68a')}>
              <div className="bg-amber-50 border-b border-amber-300 px-5 py-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-700 flex-shrink-0" />
                <p className="text-sm font-semibold text-amber-700 uppercase tracking-wider">DSC EXPIRED ({expiredDSC.length})</p>
              </div>
              {loading && expiredDSC.length === 0
                ? <MiniLoader />
                : expiredDSC.length === 0
                  ? <div className={`text-center py-16 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No expired DSC certificates</p>
                    </div>
                  : <DSCTable dscList={pagedExp} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog}
                      onViewLog={openLogDialog} getDSCStatus={getDSCStatus} type="EXPIRED"
                      globalIndexStart={(spExp-1)*rowsPerPage} isDark={isDark}
                      selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
              }
              <PaginationBar currentPage={spExp} totalPages={tpExp} totalItems={expiredDSC.length} pageSize={rowsPerPage} onPageChange={setCurrentPageExpired} isDark={isDark} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Bulk Movement Dialog ── */}
      <Dialog open={bulkDialogOpen} onOpenChange={open => { setBulkDialogOpen(open); if (!open) { setBulkPersonName(''); setBulkNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">Bulk Mark as {bulkMovementType}</DialogTitle>
            <DialogDescription>{selectedIds.size} DSC certificate(s) selected will be marked as {bulkMovementType}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{bulkMovementType === 'IN' ? 'Delivered By *' : 'Taken By *'}</Label>
              <Input placeholder="Enter person name" value={bulkPersonName} onChange={e => setBulkPersonName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Additional notes" value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button disabled={bulkLoading || !bulkPersonName.trim()} onClick={handleBulkMovement}
              className={bulkMovementType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
              {bulkLoading ? 'Processing...' : `Mark ${selectedIds.size} as ${bulkMovementType}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Single Movement Dialog ── */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">Mark DSC as {movementData.movement_type}</DialogTitle>
            <DialogDescription>{movementData.movement_type === 'IN' ? 'Record when DSC is delivered/returned' : 'Record when DSC is taken out'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>DSC Certificate</Label>
              <p className="text-sm font-semibold">{selectedDSC?.holder_name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="person_name">{movementData.movement_type === 'IN' ? 'Delivered By *' : 'Taken By *'}</Label>
              <Input id="person_name" placeholder="Enter person name" value={movementData.person_name}
                onChange={e => setMovementData({ ...movementData, person_name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movement_notes">Notes</Label>
              <Textarea id="movement_notes" placeholder="Additional notes" value={movementData.notes}
                onChange={e => setMovementData({ ...movementData, notes: e.target.value })} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}
                className={movementData.movement_type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
                {loading ? 'Recording...' : `Mark as ${movementData.movement_type}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DSC Details / Share Dialog ── */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-xl p-0 border-none bg-transparent shadow-none overflow-visible">
          <DialogHeader className="sr-only">
            <DialogTitle>DSC Details — {selectedDSC?.holder_name}</DialogTitle>
            <DialogDescription>Full details of the selected DSC. Use the buttons to share via WhatsApp, email, or download the screenshot.</DialogDescription>
          </DialogHeader>

          <div ref={shareAreaRef} className={`rounded-2xl overflow-hidden border shadow-2xl ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="relative px-6 py-5" style={{ background: 'linear-gradient(135deg,#0f1f4d,#1e3a8a)' }}>
              <div className="flex items-center gap-3">
                <div className="h-13 w-13 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.18em] text-white/60 uppercase">DSC Details</p>
                  <h2 className="text-xl font-bold text-white truncate">{selectedDSC?.holder_name || '—'}</h2>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${getDocumentInOutStatus(selectedDSC) === 'IN' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                  {getDocumentInOutStatus(selectedDSC) === 'IN' ? 'Available' : 'Out'}
                </span>
                {selectedDSC?.dsc_type && (
                  <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-600 capitalize">{selectedDSC.dsc_type}</span>
                )}
                {selectedDSC?.entity_type && (
                  <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 capitalize">{selectedDSC.entity_type}</span>
                )}
                {selectedDSC?.expiry_date && (
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${getDSCStatus(selectedDSC.expiry_date).textColor} ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    {getDSCStatus(selectedDSC.expiry_date).label || 'Expiry'}
                  </span>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase mb-1.5">Associated With</p>
                <div className={`rounded-lg px-3 py-2.5 text-sm font-semibold capitalize ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
                  {selectedDSC?.associated_with || 'N/A'}
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <Shield className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Holder Name</p>
                    <p className="text-sm font-semibold capitalize">{selectedDSC?.holder_name || '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <Key className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Security Password</p>
                    <p className="text-sm font-mono">{selectedDSC?.dsc_password || '********'}</p>
                  </div>
                </div>
                {selectedDSC?.serial_number && (
                  <div className="flex items-start gap-3">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <Shield className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Serial Number</p>
                      <p className="text-xs font-mono text-indigo-500 break-all">{selectedDSC.serial_number}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Issue Date</p>
                    <p className="text-sm font-semibold">{selectedDSC?.issue_date ? format(new Date(selectedDSC.issue_date), 'dd MMM, yyyy') : '—'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <AlertCircle className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Expiry Date</p>
                    <p className={`text-sm font-bold ${selectedDSC ? getDSCStatus(selectedDSC.expiry_date).textColor : ''}`}>
                      {selectedDSC?.expiry_date ? format(new Date(selectedDSC.expiry_date), 'dd MMM, yyyy') : '—'}
                    </p>
                  </div>
                </div>
                {selectedDSC?.movement_log?.length > 0 && (() => {
                  const lastMove = selectedDSC.movement_log[selectedDSC.movement_log.length - 1];
                  return (
                    <div className="flex items-start gap-3">
                      <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                        <History className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Last Movement</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className={`text-[10px] px-2 py-0.5 font-bold ${lastMove.movement_type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {lastMove.movement_type}
                          </Badge>
                          <p className="text-sm font-semibold capitalize">{lastMove.person_name}</p>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{format(new Date(lastMove.timestamp), 'dd MMM yyyy, hh:mm a')}</p>
                        {lastMove.notes && <p className="text-xs text-slate-500 mt-0.5 italic capitalize">{lastMove.notes}</p>}
                      </div>
                    </div>
                  );
                })()}
                {selectedDSC?.notes && (
                  <div className="flex items-start gap-3">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center mt-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <History className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">Notes</p>
                      <p className="text-sm capitalize">{selectedDSC.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={`px-6 py-4 border-t flex gap-2 print:hidden ${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
              <Button size="sm" variant="outline" disabled={sharing} onClick={() => handleShare('whatsapp')} className="flex-1 gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                WhatsApp
              </Button>
              <Button size="sm" variant="outline" disabled={sharing} onClick={() => handleShare('download')} className="flex-1 gap-1.5 text-slate-700 border-slate-200 hover:bg-slate-100">
                <Download className="h-3.5 w-3.5" />Screenshot
              </Button>
              <Button size="sm" variant="outline" disabled={sharing} onClick={() => handleShare('email')} className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50">
                <Mail className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={sharing} onClick={() => handleShare('copy')} className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── USB DSC Token Popup (unified with Add DSC) ── */}
      {usbPromptOpen && usbDevice && (
        <UnifiedDscPopup
          device={usbDevice}
          isDark={isDark}
          editingDSC={null}
          onDismiss={() => {
            setUsbPromptOpen(false);
            setUsbDismissed(true);
          }}
          onSaved={() => {
            setUsbPromptOpen(false);
            fetchDSC();
            setActiveTab('in');
          }}
        />
      )}

      {/* ── Add / Edit DSC Popup (unified) ── */}
      {unifiedPopupOpen && !usbPromptOpen && (
        <UnifiedDscPopup
          device={null}
          isDark={isDark}
          editingDSC={editingDSC}
          onDismiss={() => { setUnifiedPopupOpen(false); setEditingDSC(null); }}
          onSaved={() => { setUnifiedPopupOpen(false); setEditingDSC(null); fetchDSC(); }}
          onSubmit={editingDSC ? async (payload) => {
            await api.put(`/dsc/${editingDSC.id}`, payload);
            toast.success('DSC updated successfully!');
          } : null}
        />
      )}

      {/* ── AI Duplicate Detection Dialog ── */}
      <AIDuplicateDialog
        open={showDupDialog}
        onClose={() => setShowDupDialog(false)}
        groups={dupGroups}
        items={dscList}
        entityLabel="DSC"
        accentColor="#4f46e5"
        isDark={isDark}
        canDelete={canDeleteDSC}
        canEdit={canEditDSC}
        getTitle={(d) => d.holder_name || 'Unknown Holder'}
        getSubtitle={(d) => [d.pan ? `PAN: ${d.pan}` : null, d.email].filter(Boolean).join(' · ') || null}
        getMeta={(d) => [
          d.dsc_type  ? d.dsc_type.toUpperCase()  : null,
          d.dsc_class ? `Class ${d.dsc_class}`    : null,
          d.status    ? d.status.toUpperCase()    : null,
          d.expiry_date ? `Exp: ${format(new Date(d.expiry_date), 'MMM yyyy')}` : null,
        ].filter(Boolean)}
        compareFields={(a, b) => [
          { label: 'Holder',     a: a.holder_name,   b: b.holder_name },
          { label: 'PAN',        a: a.pan,           b: b.pan },
          { label: 'Email',      a: a.email,         b: b.email },
          { label: 'Serial No.', a: a.serial_number, b: b.serial_number },
          { label: 'Type',       a: a.dsc_type,      b: b.dsc_type },
          { label: 'Class',      a: a.dsc_class,     b: b.dsc_class },
          { label: 'Status',     a: a.status,        b: b.status },
          { label: 'Expiry',     a: a.expiry_date ? format(new Date(a.expiry_date), 'MMM dd, yyyy') : '—', b: b.expiry_date ? format(new Date(b.expiry_date), 'MMM dd, yyyy') : '—' },
          { label: 'Associated', a: a.associated_with, b: b.associated_with },
        ]}
        onEdit={(d) => { handleEdit(d); setShowDupDialog(false); }}
        onDelete={async (d) => {
          if (!window.confirm(`Delete DSC for "${d.holder_name}"?`)) return;
          try {
            await api.delete(`/dsc/${d.id}`);
            setDscList((prev) => prev.filter((x) => x.id !== d.id));
            toast.success('DSC deleted');
          } catch { toast.error('Failed to delete DSC'); }
        }}
        onView={(d) => { setSelectedDSC(d); setLogDialogOpen(true); setShowDupDialog(false); }}
      />
    </div>
  );
}
