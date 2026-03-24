import React, { useState, useEffect, useRef } from 'react';
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
  Plus, Edit, Trash2, ArrowDownCircle, ArrowUpCircle,
  History, Search, ArrowUpDown, Printer,
  CheckSquare, Square, MinusSquare, XCircle,
  FileText, ArrowDownUp, LayoutList,
} from 'lucide-react';
import { format } from 'date-fns';

// ─── Print styles ─────────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #doc-print-area, #doc-print-area * { visibility: visible !important; }
  #doc-print-area { position: fixed; inset: 0; padding: 24px; background: #fff; }
  @page { margin: 16mm; }
}`;

// ─── Row highlight: brown for out > 30 days, yellow for recent out ────────────
// For documents: highlight based on how long they've been OUT
// No expiry on documents — we highlight based on current_status and issue_date
function getDocRowHighlight(doc, isDark) {
  if (doc.current_status === 'OUT' || doc.current_location === 'taken_by_client') {
    // Check how long it's been out using last movement timestamp
    const log = doc.movement_log || [];
    const lastOut = [...log].reverse().find(m => m.movement_type === 'OUT');
    if (lastOut) {
      const daysOut = Math.ceil((new Date() - new Date(lastOut.timestamp)) / (1000 * 60 * 60 * 24));
      if (daysOut > 30) return isDark ? 'bg-orange-950/40' : 'bg-orange-100';  // brown-ish, out long time
      if (daysOut > 7)  return isDark ? 'bg-yellow-950/30' : 'bg-yellow-50';   // yellow, out a week+
    }
  }
  return '';
}

// ─── Client-page style Pagination ────────────────────────────────────────────
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

// ─── Document Table with checkboxes + row highlight + last movement ───────────
function DocumentTable({ documentList, onEdit, onDelete, onMovement, onViewLog, onShowFullNotes, type, isDark, selectedIds, onToggleSelect, onToggleAll }) {
  const allSelected  = documentList.length > 0 && documentList.every(d => selectedIds.has(d.id));
  const someSelected = documentList.some(d => selectedIds.has(d.id)) && !allSelected;

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead className={`border-b ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          <tr>
            <th className="px-3 py-3 w-10">
              <button onClick={() => onToggleAll(documentList)} className="flex items-center justify-center">
                {allSelected
                  ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                  : someSelected
                    ? <MinusSquare className="h-4 w-4 text-indigo-400" />
                    : <Square className="h-4 w-4 text-slate-400" />}
              </button>
            </th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider w-10 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>S.No</th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider min-w-[140px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Holder Name</th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider w-28 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Type</th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider min-w-[130px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Associated With</th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider min-w-[130px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Last Movement</th>
            <th className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider min-w-[200px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Notes</th>
            <th className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider w-44 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Actions</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
          {documentList.map((doc, index) => {
            const highlight  = getDocRowHighlight(doc, isDark);
            const isSelected = selectedIds.has(doc.id);
            const lastMove   = doc.movement_log?.length > 0 ? doc.movement_log[doc.movement_log.length - 1] : null;

            return (
              <tr key={doc.id}
                className={`transition-colors ${highlight} ${isSelected ? (isDark ? 'ring-1 ring-inset ring-indigo-500' : 'ring-1 ring-inset ring-indigo-300') : ''} ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50/80'}`}
                data-testid={`document-row-${doc.id}`}>

                {/* Checkbox */}
                <td className="px-3 py-3">
                  <button onClick={() => onToggleSelect(doc.id)} className="flex items-center justify-center">
                    {isSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                  </button>
                </td>

                <td className={`px-4 py-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{index + 1}</td>

                <td className={`px-4 py-3 text-sm font-medium break-words leading-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{doc.holder_name}</td>

                <td className={`px-4 py-3 text-sm truncate ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{doc.document_type || '—'}</td>

                <td className={`px-4 py-3 text-sm break-words leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{doc.associated_with || '—'}</td>

                {/* Last movement inline */}
                <td className="px-4 py-3">
                  {lastMove ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <Badge className={`text-[10px] px-1.5 py-0 ${lastMove.movement_type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {lastMove.movement_type}
                        </Badge>
                        <span className={`text-xs font-medium truncate max-w-[90px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{lastMove.person_name}</span>
                      </div>
                      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {format(new Date(lastMove.timestamp), 'dd MMM yy')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No movement</span>
                  )}
                </td>

                <td className={`px-4 py-3 text-sm break-words leading-tight transition-colors group relative ${isDark ? 'text-slate-300' : 'text-slate-600'} ${doc.notes ? 'cursor-pointer hover:bg-slate-50/80' : 'cursor-default'}`}
                  onClick={() => doc.notes && onShowFullNotes(doc)}>
                  {doc.notes
                    ? <><div className="line-clamp-2 pr-6" title="Click to view full notes">{doc.notes}</div>
                        <div className="absolute right-3 top-3 opacity-50 group-hover:opacity-80 text-xs text-slate-400 pointer-events-none">…</div></>
                    : <span className="text-slate-400 italic">—</span>
                  }
                </td>

                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onViewLog(doc)} className="h-8 w-8 p-0 hover:bg-slate-100" title="View Log">
                      <History className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onMovement(doc, type === 'IN' ? 'OUT' : 'IN')}
                      className={`h-8 w-8 p-0 ${type === 'IN' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
                      title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}>
                      {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(doc)} className="h-8 w-8 p-0 hover:bg-indigo-50 text-indigo-600"><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(doc.id)} className="h-8 w-8 p-0 hover:bg-red-50 text-red-600"><Trash2 className="h-4 w-4" /></Button>
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

// ─── Document type options ─────────────────────────────────────────────────────
const DOC_TYPE_OPTIONS = [
  { value: 'Agreement',       label: 'Agreement / Contract' },
  { value: 'NDA',             label: 'NDA' },
  { value: 'Purchase Order',  label: 'Purchase Order' },
  { value: 'Invoice',         label: 'Invoice / Bill' },
  { value: 'Cheque',          label: 'Cheque / Payment Receipt' },
  { value: 'PanCard',         label: 'PAN Card / Copy' },
  { value: 'Aadhar',          label: 'Aadhaar Card / Copy' },
  { value: 'GST Certificate', label: 'GST Registration Certificate' },
  { value: 'Incorporation',   label: 'Certificate of Incorporation' },
  { value: 'MOA',             label: 'Memorandum of Association (MOA)' },
  { value: 'AOA',             label: 'Articles of Association (AOA)' },
  { value: 'Bank Statement',  label: 'Bank Statement' },
  { value: 'Balance Sheet',   label: 'Financial Statement / Balance Sheet' },
  { value: 'ITR',             label: 'Income Tax Return (ITR)' },
  { value: 'Power of Attorney', label: 'Power of Attorney' },
  { value: 'Lease Agreement', label: 'Lease / Rent Agreement' },
  { value: 'License',         label: 'License / Permit' },
  { value: 'Trademark',       label: 'Trademark / IP Document' },
  { value: 'Correspondence',  label: 'Important Correspondence / Letter' },
  { value: 'Other',           label: 'Other' },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DocumentRegister() {
  const isDark = useDark();
  const searchRef = useRef(null);

  const [documentList, setDocumentList]             = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [dialogOpen, setDialogOpen]                 = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen]           = useState(false);
  const [fullNotesOpen, setFullNotesOpen]           = useState(false);
  const [selectedFullNotes, setSelectedFullNotes]   = useState({ holder_name: '', notes: '' });
  const [editingDocument, setEditingDocument]       = useState(null);
  const [selectedDocument, setSelectedDocument]     = useState(null);
  const [editingMovement, setEditingMovement]       = useState(null);
  const [searchQuery, setSearchQuery]               = useState('');
  const [rowsPerPage, setRowsPerPage]               = useState(15);
  const [currentPageIn, setCurrentPageIn]           = useState(1);
  const [currentPageOut, setCurrentPageOut]         = useState(1);
  // 'az'|'za'|'fifo'|'lifo'
  const [sortOrder, setSortOrder]                   = useState('az');

  // ── NEW: bulk ──────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]               = useState(new Set());
  const [bulkDialogOpen, setBulkDialogOpen]         = useState(false);
  const [bulkMovementType, setBulkMovementType]     = useState('IN');
  const [bulkPersonName, setBulkPersonName]         = useState('');
  const [bulkNotes, setBulkNotes]                   = useState('');
  const [bulkLoading, setBulkLoading]               = useState(false);

  const [formData, setFormData] = useState({
    holder_name: '', document_type: 'Agreement', document_password: '',
    associated_with: '', entity_type: 'firm', issue_date: '', notes: '',
  });
  const [movementData, setMovementData]         = useState({ movement_type: 'IN', person_name: '', notes: '' });
  const [editMovementData, setEditMovementData] = useState({ movement_type: 'IN', person_name: '', notes: '' });

  useEffect(() => { fetchDocuments(); }, []);
  useEffect(() => { setCurrentPageIn(1); setCurrentPageOut(1); }, [sortOrder, searchQuery]);

  // ── Keyboard shortcut "/" to focus search ─────────────────────────────────
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

  // ── Print styles ──────────────────────────────────────────────────────────
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.innerHTML = PRINT_STYLE;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  const handlePrint = () => window.print();

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents');
      setDocumentList(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to fetch documents');
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const documentData = { ...formData, issue_date: new Date(formData.issue_date).toISOString() };
      if (editingDocument) {
        await api.put(`/documents/${editingDocument.id}`, documentData);
        toast.success('Document updated successfully!');
      } else {
        await api.post('/documents', documentData);
        toast.success('Document added successfully!');
      }
      setDialogOpen(false);
      resetForm();
      fetchDocuments();
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  // ── Movement ──────────────────────────────────────────────────────────────
  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/documents/${selectedDocument.id}/movement`, movementData);
      toast.success(`Document marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchDocuments();
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (document, type) => {
    setSelectedDocument(document);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog    = (document) => { setSelectedDocument(document); setLogDialogOpen(true); };
  const openFullNotes    = (doc) => {
    if (!doc.notes) return;
    setSelectedFullNotes({ holder_name: doc.holder_name || '—', notes: doc.notes });
    setFullNotesOpen(true);
  };

  const getDocumentInOutStatus = (document) => {
    if (!document) return 'OUT';
    if (document.current_status) return document.current_status;
    return document.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  const handleMovementInModal = async () => {
    if (!editingDocument || !movementData.person_name) return;
    setLoading(true);
    try {
      const newType = getDocumentInOutStatus(editingDocument) === 'IN' ? 'OUT' : 'IN';
      await api.post(`/documents/${editingDocument.id}/movement`, { ...movementData, movement_type: newType });
      toast.success(`Document marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updated = response.data.find(d => d.id === editingDocument.id);
      if (updated) setEditingDocument(updated);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingDocument || !editMovementData.person_name) return;
    setLoading(true);
    try {
      await api.put(`/documents/${editingDocument.id}/movement/${movementId}`, {
        movement_id:   movementId,
        movement_type: editMovementData.movement_type,
        person_name:   editMovementData.person_name,
        notes:         editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updated = response.data.find(d => d.id === editingDocument.id);
      if (updated) setEditingDocument(updated);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id || movement.timestamp);
    setEditMovementData({ movement_type: movement.movement_type, person_name: movement.person_name, notes: movement.notes || '' });
  };

  // ── Edit / Delete ─────────────────────────────────────────────────────────
  const handleEdit = (document) => {
    setEditingDocument(document);
    setFormData({
      holder_name:       document.holder_name,
      document_type:     document.document_type || 'Agreement',
      document_password: document.document_password || '',
      associated_with:   document.associated_with || '',
      entity_type:       document.entity_type || 'firm',
      issue_date:        format(new Date(document.issue_date), 'yyyy-MM-dd'),
      notes:             document.notes || '',
    });
    setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
    setEditingMovement(null);
    setDialogOpen(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/documents/${documentId}`);
      toast.success('Document deleted successfully!');
      fetchDocuments();
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to delete document');
    }
  };

  const resetForm = () => {
    setFormData({ holder_name: '', document_type: 'Agreement', document_password: '', associated_with: '', entity_type: 'firm', issue_date: '', notes: '' });
    setEditingDocument(null);
  };

  const getErrorMessage = (error) => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
    if (detail && typeof detail === 'object') return detail.msg || detail.message || JSON.stringify(detail);
    return null;
  };

  const filterBySearch = (document) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      document.holder_name?.toLowerCase().includes(q) ||
      document.document_type?.toLowerCase().includes(q) ||
      document.associated_with?.toLowerCase().includes(q) ||
      document.notes?.toLowerCase().includes(q)
    );
  };

  // ── Sort — FIFO/LIFO by issue_date ────────────────────────────────────────
  const applySortOrder = (list) => {
    const arr = [...list];
    switch (sortOrder) {
      case 'az':   return arr.sort((a, b) => (a.holder_name || '').localeCompare(b.holder_name || ''));
      case 'za':   return arr.sort((a, b) => (b.holder_name || '').localeCompare(a.holder_name || ''));
      case 'fifo': return arr.sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));
      case 'lifo': return arr.sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date));
      default:     return arr;
    }
  };

  const inDocuments  = applySortOrder(documentList.filter(doc => getDocumentInOutStatus(doc) === 'IN'  && filterBySearch(doc)));
  const outDocuments = applySortOrder(documentList.filter(doc => getDocumentInOutStatus(doc) === 'OUT' && filterBySearch(doc)));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsIn      = inDocuments.length;
  const statsOut     = outDocuments.length;
  const statsTotal   = documentList.length;
  // Out > 30 days
  const statsLongOut = documentList.filter(doc => {
    if (getDocumentInOutStatus(doc) !== 'OUT') return false;
    const log  = doc.movement_log || [];
    const last = [...log].reverse().find(m => m.movement_type === 'OUT');
    if (!last) return false;
    return Math.ceil((new Date() - new Date(last.timestamp)) / (1000 * 60 * 60 * 24)) > 30;
  }).length;

  // ── Pagination ─────────────────────────────────────────────────────────────
  const safePage = (cur, total) => Math.min(cur, Math.max(1, total));
  const tpIn  = Math.ceil(inDocuments.length  / rowsPerPage);
  const tpOut = Math.ceil(outDocuments.length / rowsPerPage);
  const spIn  = safePage(currentPageIn,  tpIn);
  const spOut = safePage(currentPageOut, tpOut);
  const pagedIn  = inDocuments.slice((spIn  - 1) * rowsPerPage, spIn  * rowsPerPage);
  const pagedOut = outDocuments.slice((spOut - 1) * rowsPerPage, spOut * rowsPerPage);

  // ── Bulk helpers ──────────────────────────────────────────────────────────
  const toggleSelect = (id) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll    = (list) => {
    const allSel = list.every(d => selectedIds.has(d.id));
    setSelectedIds(prev => {
      const s = new Set(prev);
      list.forEach(d => allSel ? s.delete(d.id) : s.add(d.id));
      return s;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkMovement = async () => {
    if (!bulkPersonName.trim()) { toast.error('Person name is required'); return; }
    setBulkLoading(true);
    let success = 0; let failed = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await api.post(`/documents/${id}/movement`, { movement_type: bulkMovementType, person_name: bulkPersonName.trim(), notes: bulkNotes.trim() });
        success++;
      } catch { failed++; }
    }
    setBulkLoading(false);
    toast.success(`${success} document(s) marked as ${bulkMovementType}${failed > 0 ? `, ${failed} failed` : ''}`);
    setBulkDialogOpen(false);
    setBulkPersonName(''); setBulkNotes('');
    clearSelection();
    fetchDocuments();
  };

  const SORT_OPTIONS = [
    { value: 'az',   label: 'A → Z' },
    { value: 'za',   label: 'Z → A' },
    { value: 'fifo', label: 'FIFO (Oldest ↑)' },
    { value: 'lifo', label: 'LIFO (Newest ↓)' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-6 min-h-screen p-1 rounded-2xl ${isDark ? 'bg-[#0f172a]' : ''}`} data-testid="document-page">

      {/* ── Print area ── */}
      <div id="doc-print-area" className="hidden print:block">
        <h2 className="text-xl font-bold mb-2">Document Register — {format(new Date(), 'dd MMM yyyy')}</h2>
        <p className="text-sm text-slate-500 mb-4">Total: {statsTotal} | IN: {statsIn} | OUT: {statsOut}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['#','Holder Name','Type','Associated With','Issue Date','Status','Last Movement'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'left', border: '1px solid #e2e8f0', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documentList.map((doc, i) => {
              const last = doc.movement_log?.length > 0 ? doc.movement_log[doc.movement_log.length - 1] : null;
              return (
                <tr key={doc.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{doc.holder_name}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{doc.document_type || '-'}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{doc.associated_with || '-'}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{doc.issue_date ? format(new Date(doc.issue_date), 'dd MMM yyyy') : '-'}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{getDocumentInOutStatus(doc)}</td>
                  <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>{last ? `${last.movement_type} — ${last.person_name} (${format(new Date(last.timestamp), 'dd MMM yy')})` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-3xl font-bold font-outfit ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Document Register</h1>
          <p className={`mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Manage documents with IN/OUT tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handlePrint} className={`h-9 px-4 gap-2 rounded-xl text-sm ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : ''}`}>
            <Printer className="h-4 w-4" />Print
          </Button>

          <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95" data-testid="add-document-btn">
                <Plus className="mr-2 h-5 w-5" />Add Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-outfit text-2xl">{editingDocument ? 'Edit Document' : 'Add New Document'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="holder_name">Holder Name <span className="text-red-500">*</span></Label>
                    <Input id="holder_name" placeholder="Name of document holder" value={formData.holder_name}
                      onChange={e => setFormData({ ...formData, holder_name: e.target.value })} required data-testid="document-holder-name-input" />
                  </div>
                  <div className="space-y-2">
                    <Label>Document Type</Label>
                    <Select value={formData.document_type} onValueChange={v => setFormData({ ...formData, document_type: v })}>
                      <SelectTrigger id="document_type" data-testid="document-type-select"><SelectValue placeholder="Select document type" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {DOC_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="document_password">Password</Label>
                    <Input id="document_password" type="text" placeholder="Document Password (if any)" value={formData.document_password}
                      onChange={e => setFormData({ ...formData, document_password: e.target.value })} data-testid="document-password-input" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                    <Input id="associated_with" placeholder="Firm or client name" value={formData.associated_with}
                      onChange={e => setFormData({ ...formData, associated_with: e.target.value })} data-testid="document-associated-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entity_type">Entity Type</Label>
                    <Select value={formData.entity_type} onValueChange={v => setFormData({ ...formData, entity_type: v })}>
                      <SelectTrigger id="entity_type" data-testid="document-entity-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="firm">Firm</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issue_date">Issue Date <span className="text-red-500">*</span></Label>
                    <Input id="issue_date" type="date" value={formData.issue_date}
                      onChange={e => setFormData({ ...formData, issue_date: e.target.value })} required data-testid="document-issue-date-input" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" placeholder="Additional notes" value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} data-testid="document-notes-input" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} data-testid="document-cancel-btn">Cancel</Button>
                  <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700" data-testid="document-submit-btn">
                    {loading ? 'Saving...' : editingDocument ? 'Update Document' : 'Add Document'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Stats Cards — compliance-calendar style ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total IN',      value: statsIn,      color: 'text-emerald-500' },
          { label: 'Total OUT',     value: statsOut,     color: 'text-red-500'     },
          { label: 'Total Records', value: statsTotal,   color: 'text-slate-700'   },
          { label: 'Out > 30 days', value: statsLongOut, color: 'text-orange-500'  },
        ].map(stat => (
          <Card
            key={stat.label}
            className={`border transition-all hover:shadow-lg hover:-translate-y-0.5 ${isDark ? 'bg-slate-800 border-slate-700' : 'border-slate-200'}`}
            style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
          >
            <CardContent className="p-5">
              <p className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{stat.label}</p>
              <p className={`text-4xl font-bold tabular-nums ${isDark && stat.color === 'text-slate-700' ? 'text-slate-200' : stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Controls bar ── */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
        <Select value={rowsPerPage.toString()} onValueChange={v => { setRowsPerPage(Number(v)); setCurrentPageIn(1); setCurrentPageOut(1); }}>
          <SelectTrigger className={`w-[140px] focus:border-indigo-500 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`}>
            <SelectValue placeholder="Rows per page" />
          </SelectTrigger>
          <SelectContent>
            {[15,30,50,100].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Sort pills */}
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

        {/* Search with "/" hint */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input ref={searchRef} type="text" placeholder='Search… (press "/" to focus)' value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`pl-10 pr-16 focus:border-indigo-500 ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200'}`}
            data-testid="document-search-input" />
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
          <CheckSquare className="h-4 w-4 text-indigo-600 flex-shrink-0" />
          <span className={`text-sm font-semibold ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>{selectedIds.size} document(s) selected</span>
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
        <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Row colours:</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-200 inline-block border border-orange-300" />OUT &gt; 30 days</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 inline-block border border-yellow-300" />OUT &gt; 7 days</span>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in"  className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"><ArrowDownCircle className="h-4 w-4 mr-2" />IN ({inDocuments.length})</TabsTrigger>
          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white"><ArrowUpCircle className="h-4 w-4 mr-2" />OUT ({outDocuments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="mt-6">
          <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col"
            style={{ background: isDark ? '#1e293b' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#d1fae5' }}>
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3 flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Documents IN - Available ({inDocuments.length})</p>
            </div>
            {inDocuments.length === 0
              ? <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>No documents currently IN</div>
              : <DocumentTable documentList={pagedIn} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog}
                  onViewLog={openLogDialog} onShowFullNotes={openFullNotes} type="IN" isDark={isDark}
                  selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
            }
            <PaginationBar currentPage={spIn} totalPages={tpIn} totalItems={inDocuments.length} pageSize={rowsPerPage} onPageChange={setCurrentPageIn} isDark={isDark} />
          </div>
        </TabsContent>

        <TabsContent value="out" className="mt-6">
          <div className="rounded-2xl border shadow-sm overflow-hidden flex flex-col"
            style={{ background: isDark ? '#1e293b' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#fecaca' }}>
            <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-red-700" />
              <p className="text-sm font-medium text-red-700 uppercase tracking-wider">Documents OUT - Taken ({outDocuments.length})</p>
            </div>
            {outDocuments.length === 0
              ? <div className={`text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>No documents currently OUT</div>
              : <DocumentTable documentList={pagedOut} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog}
                  onViewLog={openLogDialog} onShowFullNotes={openFullNotes} type="OUT" isDark={isDark}
                  selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll} />
            }
            <PaginationBar currentPage={spOut} totalPages={tpOut} totalItems={outDocuments.length} pageSize={rowsPerPage} onPageChange={setCurrentPageOut} isDark={isDark} />
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Bulk Movement Dialog ── */}
      <Dialog open={bulkDialogOpen} onOpenChange={open => { setBulkDialogOpen(open); if (!open) { setBulkPersonName(''); setBulkNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">Bulk Mark as {bulkMovementType}</DialogTitle>
            <DialogDescription>{selectedIds.size} document(s) selected will be marked as {bulkMovementType}.</DialogDescription>
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
            <DialogTitle className="font-outfit text-2xl">Mark Document as {movementData.movement_type}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>Document</Label>
              <p className="text-sm font-medium">{selectedDocument?.holder_name || '—'}</p>
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
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2"><History className="h-6 w-6" />Movement Log</DialogTitle>
            <DialogDescription>{selectedDocument?.holder_name || '—'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDocument?.movement_log?.length > 0
              ? selectedDocument.movement_log.map((movement, index) => (
                  <Card key={index} className={`p-4 ${movement.movement_type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={movement.movement_type === 'IN' ? 'bg-emerald-600' : 'bg-red-600'}>{movement.movement_type}</Badge>
                          <span className="text-sm font-medium">{movement.person_name}</span>
                        </div>
                        <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{movement.movement_type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}</p>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Recorded by: {movement.recorded_by || '—'}</p>
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

      {/* ── Full Notes Modal ── */}
      <Dialog open={fullNotesOpen} onOpenChange={setFullNotesOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader><DialogTitle>Notes — {selectedFullNotes.holder_name}</DialogTitle></DialogHeader>
          <div className={`mt-4 p-5 rounded-lg border max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50'}`}>
            {selectedFullNotes.notes || <p className={`italic text-center py-10 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No notes available</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFullNotesOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
