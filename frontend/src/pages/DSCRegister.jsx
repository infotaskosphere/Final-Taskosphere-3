import React, { useState, useEffect, useRef, useCallback } from 'react';
import GifLoader, { MiniLoader } from "@/components/ui/GifLoader.jsx";
import { useDark } from '@/hooks/useDark';
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
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Print styles ─────────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #dsc-print-area, #dsc-print-area * { visibility: visible !important; }
  #dsc-print-area { position: fixed; inset: 0; padding: 24px; background: #fff; }
  @page { margin: 16mm; }
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
            const status     = getDSCStatus(dsc.expiry_date);
            const highlight  = getRowHighlight(dsc.expiry_date, isDark);
            const isSelected = selectedIds.has(dsc.id);
            const lastMove   = dsc.movement_log?.length > 0 ? dsc.movement_log[dsc.movement_log.length - 1] : null;

            return (
              <tr key={dsc.id}
                className={`transition-colors ${highlight} ${isSelected ? (isDark ? 'ring-1 ring-inset ring-indigo-500' : 'ring-1 ring-inset ring-indigo-300') : ''} ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80'}`}
                data-testid={`dsc-row-${dsc.id}`}>
                <td className="px-2 py-2.5">
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
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {format(new Date(lastMove.timestamp), 'dd MMM yy')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No movement</span>
                  )}
                </td>
                <td className="px-1 py-2.5 text-right">
                  <div className="flex justify-end gap-0">
                    <Button variant="ghost" size="sm" onClick={() => onViewLog(dsc)} className={`h-7 w-7 p-0 ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-100'}`} title="View Log">
                      <History className="h-3.5 w-3.5 text-slate-500" />
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DSCRegister() {
  const isDark    = useDark();
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

  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkMovementType, setBulkMovementType] = useState('IN');
  const [bulkPersonName, setBulkPersonName] = useState('');
  const [bulkNotes, setBulkNotes]           = useState('');
  const [bulkLoading, setBulkLoading]       = useState(false);

  const [formData, setFormData] = useState({
    holder_name: '', dsc_type: '', dsc_password: '',
    associated_with: '', entity_type: 'firm',
    issue_date: '', expiry_date: '', notes: '',
  });
  const [movementData, setMovementData]         = useState({ movement_type: 'IN', person_name: '', notes: '' });
  const [editMovementData, setEditMovementData] = useState({ movement_type: 'IN', person_name: '', notes: '' });

  useEffect(() => { fetchDSC(); }, []);
  useEffect(() => { setCurrentPageIn(1); setCurrentPageOut(1); setCurrentPageExpired(1); }, [sortOrder, searchQuery]);

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
        try { localStorage.removeItem(DSC_DRAFT_KEY); } catch {}
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

  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

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
    setFormData({
      holder_name:     dsc.holder_name,
      dsc_type:        dsc.dsc_type || '',
      dsc_password:    dsc.dsc_password || '',
      associated_with: dsc.associated_with || '',
      entity_type:     dsc.entity_type || 'firm',
      issue_date:      format(new Date(dsc.issue_date), 'yyyy-MM-dd'),
      expiry_date:     format(new Date(dsc.expiry_date), 'yyyy-MM-dd'),
      notes:           dsc.notes || '',
    });
    setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
    setEditingMovement(null);
    setDialogOpen(true);
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
    setFormData({ holder_name: '', dsc_type: '', dsc_password: '', associated_with: '', entity_type: 'firm', issue_date: '', expiry_date: '', notes: '' });
    setEditingDSC(null);
  };

  // ── Draft persistence for add-DSC form ───────────────────────────────────
  const DSC_DRAFT_KEY = 'taskosphere_dsc_add_draft';
  useEffect(() => {
    if (dialogOpen && !editingDSC) {
      try { localStorage.setItem(DSC_DRAFT_KEY, JSON.stringify(formData)); } catch {}
    }
  }, [formData, dialogOpen, editingDSC]);

  const openAddDSCDialog = useCallback(() => {
    setEditingDSC(null);
    try {
      const saved = localStorage.getItem(DSC_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.holder_name?.trim()) setFormData(prev => ({ ...prev, ...parsed }));
        else setFormData({ holder_name: '', dsc_type: '', dsc_password: '', associated_with: '', entity_type: 'firm', issue_date: '', expiry_date: '', notes: '' });
      }
    } catch {}
    setDialogOpen(true);
  }, []);

  // ── Status ────────────────────────────────────────────────────────────────
  const getDSCStatus = (expiryDate) => {
    const daysLeft = Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0)   return { color: 'bg-red-500',    text: 'Expired',              textColor: 'text-red-600' };
    if (daysLeft <= 7)  return { color: 'bg-orange-500', text: `${daysLeft}d left`,    textColor: 'text-orange-600' };
    if (daysLeft <= 30) return { color: 'bg-yellow-500', text: `${daysLeft}d left`,    textColor: 'text-yellow-700' };
    return               { color: 'bg-emerald-500',      text: `${daysLeft}d left`,    textColor: 'text-emerald-700' };
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
  const tpIn     = Math.ceil(inDSC.length      / rowsPerPage);
  const tpOut    = Math.ceil(outDSC.length     / rowsPerPage);
  const tpExp    = Math.ceil(expiredDSC.length / rowsPerPage);
  const spIn     = safePage(currentPageIn,      tpIn);
  const spOut    = safePage(currentPageOut,     tpOut);
  const spExp    = safePage(currentPageExpired, tpExp);
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
          <Label htmlFor="dsc_password">Password</Label>
          <Input id="dsc_password" type="text" placeholder="DSC Password" value={formData.dsc_password}
            onChange={e => setFormData({ ...formData, dsc_password: e.target.value })} data-testid="dsc-password-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
          <Input id="associated_with" placeholder="Firm or client name" value={formData.associated_with}
            onChange={e => setFormData({ ...formData, associated_with: e.target.value })} data-testid="dsc-associated-input" />
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

  // ─── Shared tab container style ───────────────────────────────────────────
  const tabCard = (borderColor, bg) => ({
    background: isDark ? '#1e293b' : '#fff',
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : borderColor,
  });

  const tabHeaderClass = (bg, border, text) =>
    `${bg} border-b ${border} px-5 py-3 flex items-center gap-2`;

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

      {/* ── Dashboard-style Banner Header ── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #0D3B66 0%, #1F6FB2 60%, #1a8fcc 100%)', boxShadow: '0 8px 32px rgba(13,59,102,0.28)' }}>
        <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
        <div className="absolute right-28 bottom-0 w-40 h-40 rounded-full mb-[-40px] opacity-5"
          style={{ background: 'white' }} />
        <div className="absolute left-0 bottom-0 w-48 h-48 rounded-full -ml-20 -mb-20 opacity-5"
          style={{ background: 'white' }} />
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mt-0.5">
              <Key className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-1">Registers</p>
              <h1 className="text-2xl font-bold text-white leading-tight">DSC Register</h1>
              <p className="text-white/60 text-sm mt-0.5">Manage digital signature certificates with IN/OUT tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePrint}
              className="h-9 px-4 gap-2 rounded-xl text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 backdrop-blur-sm">
              <Printer className="h-4 w-4" />Print
            </Button>
            <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={openAddDSCDialog} className="bg-white text-indigo-700 hover:bg-blue-50 font-semibold rounded-xl px-5 shadow-lg transition-all hover:scale-105 active:scale-95" data-testid="add-dsc-btn">
                  <Plus className="mr-2 h-4 w-4" />Add DSC
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-outfit text-2xl">{editingDSC ? 'Edit DSC' : 'Add New DSC'}</DialogTitle>
                  <DialogDescription>{editingDSC ? 'Update DSC details and track IN/OUT status.' : 'Fill in the details to add a new DSC certificate.'}</DialogDescription>
                </DialogHeader>

                {editingDSC ? (
                  <Tabs defaultValue="details" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="status">IN/OUT Status</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="mt-4">
                      <form onSubmit={handleSubmit} className="space-y-4">{renderFormBody(true)}</form>
                    </TabsContent>

                    <TabsContent value="status" className="mt-4 space-y-4">
                      <Card className={`p-4 ${getDSCInOutStatus(editingDSC) === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-sm text-slate-600 mb-1">Current Status</p>
                        <div className="flex items-center gap-2">
                          {getDSCInOutStatus(editingDSC) === 'IN'
                            ? <><ArrowDownCircle className="h-5 w-5 text-emerald-600" /><Badge className="bg-emerald-600 text-white">IN — Available</Badge></>
                            : <><ArrowUpCircle className="h-5 w-5 text-red-600" /><Badge className="bg-red-600 text-white">OUT — Taken</Badge></>}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <h4 className={`font-medium mb-3 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {getDSCInOutStatus(editingDSC) === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                        </h4>
                        <form onSubmit={e => { e.preventDefault(); handleMovementInModal(); }} className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="inline_person">{getDSCInOutStatus(editingDSC) === 'IN' ? 'Taken By *' : 'Delivered By *'}</Label>
                            <Input id="inline_person" placeholder="Enter person name" value={movementData.person_name}
                              onChange={e => setMovementData({ ...movementData, person_name: e.target.value })} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="inline_notes">Notes</Label>
                            <Input id="inline_notes" placeholder="Optional notes" value={movementData.notes}
                              onChange={e => setMovementData({ ...movementData, notes: e.target.value })} />
                          </div>
                          <Button type="submit" disabled={loading}
                            className={getDSCInOutStatus(editingDSC) === 'IN' ? 'bg-red-600 hover:bg-red-700 w-full' : 'bg-emerald-600 hover:bg-emerald-700 w-full'}>
                            {getDSCInOutStatus(editingDSC) === 'IN'
                              ? <><ArrowUpCircle className="h-4 w-4 mr-2" />Mark as OUT</>
                              : <><ArrowDownCircle className="h-4 w-4 mr-2" />Mark as IN</>}
                          </Button>
                        </form>
                      </Card>
                    </TabsContent>

                    <TabsContent value="history" className="mt-4">
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {editingDSC?.movement_log?.length > 0
                          ? editingDSC.movement_log.slice().reverse().map((movement, index) => {
                              const mKey   = movement.id || movement.timestamp;
                              const isEdit = editingMovement === mKey;
                              return (
                                <Card key={index} className={`p-3 ${movement.movement_type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                  {isEdit ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-3">
                                        <Label className="text-sm font-medium">Status:</Label>
                                        <div className="flex gap-2">
                                          <Button type="button" size="sm"
                                            variant={editMovementData.movement_type === 'IN' ? 'default' : 'outline'}
                                            className={editMovementData.movement_type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                            onClick={() => setEditMovementData({ ...editMovementData, movement_type: 'IN' })}>
                                            <ArrowDownCircle className="h-4 w-4 mr-1" />IN
                                          </Button>
                                          <Button type="button" size="sm"
                                            variant={editMovementData.movement_type === 'OUT' ? 'default' : 'outline'}
                                            className={editMovementData.movement_type === 'OUT' ? 'bg-red-600 hover:bg-red-700' : ''}
                                            onClick={() => setEditMovementData({ ...editMovementData, movement_type: 'OUT' })}>
                                            <ArrowUpCircle className="h-4 w-4 mr-1" />OUT
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Person Name</Label>
                                        <Input size="sm" value={editMovementData.person_name}
                                          onChange={e => setEditMovementData({ ...editMovementData, person_name: e.target.value })} placeholder="Person name" />
                                      </div>
                                      <div className="space-y-2">
                                        <Label className="text-xs">Notes</Label>
                                        <Input size="sm" value={editMovementData.notes}
                                          onChange={e => setEditMovementData({ ...editMovementData, notes: e.target.value })} placeholder="Notes (optional)" />
                                      </div>
                                      <div className="flex gap-2 justify-end">
                                        <Button type="button" size="sm" variant="outline" onClick={() => setEditingMovement(null)}>Cancel</Button>
                                        <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700"
                                          onClick={() => handleUpdateMovement(movement.id)} disabled={loading || !editMovementData.person_name}>
                                          {loading ? 'Saving...' : 'Save'}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Badge className={movement.movement_type === 'IN' ? 'bg-emerald-600 text-xs' : 'bg-red-600 text-xs'}>{movement.movement_type}</Badge>
                                          <span className="text-sm font-medium">{movement.person_name}</span>
                                        </div>
                                        {movement.notes && <p className="text-xs text-slate-600">{movement.notes}</p>}
                                        {movement.edited_at && (
                                          <p className="text-xs text-slate-400 mt-1">Edited by {movement.edited_by} on {format(new Date(movement.edited_at), 'MMM dd, yyyy')}</p>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                          {format(new Date(movement.timestamp), 'MMM dd, yyyy hh:mm a')}
                                        </span>
                                        {movement.id && (
                                          <Button type="button" size="sm" variant="ghost"
                                            className="h-7 px-2 text-xs text-slate-500 hover:text-indigo-600"
                                            onClick={() => startEditingMovement(movement)}>
                                            <Edit className="h-3 w-3 mr-1" />Edit
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Card>
                              );
                            })
                          : <div className="text-center py-8 text-slate-500"><History className="h-12 w-12 mx-auto mb-3 text-slate-300" /><p>No movement history yet</p></div>
                        }
                      </div>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">{renderFormBody(false)}</form>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ── Stats strip inside banner ── */}
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

        {/* ── Alert banner ── */}
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

        {/* ── Controls bar ── */}
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

        {/* ── Bulk action bar ── */}
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

        {/* ── Row colour legend ── */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Row colours:</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-200 inline-block border border-orange-300" />Expiring ≤ 7 days</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 inline-block border border-yellow-300" />Expiring ≤ 30 days</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block border border-red-300" />Expired</span>
        </div>

        {/* ── Tabs ── */}
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

          {/* IN */}
          <TabsContent value="in" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#d1fae5', '')}>
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

          {/* OUT */}
          <TabsContent value="out" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#fecaca', '')}>
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

          {/* EXPIRED */}
          <TabsContent value="expired" className="mt-4">
            <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col" style={tabCard('#fde68a', '')}>
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

      {/* ── Log Dialog ── */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <History className="h-6 w-6 text-indigo-500" />Movement Log
            </DialogTitle>
            <DialogDescription className="font-medium">{selectedDSC?.holder_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDSC?.movement_log?.length > 0
              ? selectedDSC.movement_log.map((movement, index) => (
                  <Card key={index} className={`p-4 ${movement.movement_type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={movement.movement_type === 'IN' ? 'bg-emerald-600' : 'bg-red-600'}>{movement.movement_type}</Badge>
                          <span className="text-sm font-semibold">{movement.person_name}</span>
                        </div>
                        <p className="text-sm text-slate-600">{movement.movement_type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recorded by: {movement.recorded_by}</p>
                        {movement.notes && <p className="text-sm text-slate-600 mt-2">{movement.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{format(new Date(movement.timestamp), 'MMM dd, yyyy')}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{format(new Date(movement.timestamp), 'hh:mm a')}</p>
                      </div>
                    </div>
                  </Card>
                ))
              : <div className="text-center py-8 text-slate-500"><History className="h-12 w-12 mx-auto mb-3 text-slate-300" /><p>No movement history yet</p></div>
            }
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
