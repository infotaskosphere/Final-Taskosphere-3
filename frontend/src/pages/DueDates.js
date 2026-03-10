import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Search, Calendar, Building2, User,
  AlertCircle, CheckCircle, Clock, Filter, Upload, Sparkles,
  FileImage, FileText, X, CheckSquare, MinusSquare, ChevronDown,
  ChevronUp, Loader2, Eye, SkipForward
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  accent: '#F4A261',
};

const CATEGORIES = ['GST', 'Income Tax', 'TDS', 'ROC', 'Audit', 'Trademark', 'RERA', 'FEMA', 'Other'];
const DEPARTMENTS = ['GST', 'IT', 'ACC', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'OTHER'];

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400', label: 'Pending' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-400', label: 'Completed' },
  overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-400', label: 'Overdue' },
  upcoming: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400', label: 'Upcoming' },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } }
};

// ─── AI Import Modal ────────────────────────────────────────────────
function AIImportModal({ open, onClose, clients, users, user, onImportDone }) {
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedDates, setExtractedDates] = useState([]);
  const [step, setStep] = useState('upload'); // 'upload' | 'review'
  const [selectedItems, setSelectedItems] = useState({});
  const [saving, setSaving] = useState(false);
  const dropRef = useRef();

  const resetState = () => {
    setFile(null);
    setFilePreview(null);
    setExtracting(false);
    setExtractedDates([]);
    setStep('upload');
    setSelectedItems({});
  };

  const handleClose = () => { resetState(); onClose(); };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer?.files[0] || e.target.files[0];
    if (!dropped) return;
    setFile(dropped);
    if (dropped.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(dropped);
    } else {
      setFilePreview(null);
    }
  };

  const toBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  const extractDates = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      let messages;
      const isPDF = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      const isDoc = file.name.endsWith('.docx') || file.name.endsWith('.doc');

      const base64 = await toBase64(file);
      const prompt = `You are a compliance expert assistant. Analyze the provided document and extract ALL compliance due dates, deadlines, and filing requirements mentioned in it.

For each item found, return a JSON array with objects having these exact fields:
- title: string (descriptive title of the compliance task)
- due_date: string (ISO date format YYYY-MM-DD, use current year 2026 if only month/day given, use relative calculation if "within X days")
- category: one of [GST, Income Tax, TDS, ROC, Audit, Trademark, RERA, FEMA, Other]
- department: one of [GST, IT, ACC, TDS, ROC, TM, MSME, FEMA, DSC, OTHER]
- description: string (brief description of the compliance requirement)
- status: "pending"

Return ONLY a valid JSON array, no markdown, no explanation, no code fences. If no dates found, return [].`;

      if (isImage) {
        messages = [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }];
      } else if (isPDF) {
        messages = [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: prompt }
          ]
        }];
      } else {
        // For docx or unknown, send as text prompt describing limitation
        messages = [{
          role: 'user',
          content: `${prompt}\n\nNote: The file is a Word document named "${file.name}". I'm unable to parse binary .docx directly. Please return [] and inform the user to convert to PDF or image.`
        }];
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages
        })
      });

      const data = await response.json();
      const rawText = data.content?.map(c => c.text || '').join('') || '[]';

      let parsed = [];
      try {
        const cleaned = rawText.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch { parsed = []; }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        toast.error('No compliance dates found in this document. Try a clearer image or PDF.');
        setExtracting(false);
        return;
      }

      // Add unique IDs and default selections
      const withIds = parsed.map((item, i) => ({
        ...item,
        _id: `extracted_${i}`,
        reminder_days: 30,
        assigned_to: 'unassigned',
        client_id: 'no_client',
      }));

      const selMap = {};
      withIds.forEach(item => { selMap[item._id] = true; });

      setExtractedDates(withIds);
      setSelectedItems(selMap);
      setStep('review');
    } catch (err) {
      console.error(err);
      toast.error('Failed to extract dates. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  const toggleItem = (id) => setSelectedItems(prev => ({ ...prev, [id]: !prev[id] }));
  const selectAll = () => {
    const all = {};
    extractedDates.forEach(d => { all[d._id] = true; });
    setSelectedItems(all);
  };
  const deselectAll = () => {
    const none = {};
    extractedDates.forEach(d => { none[d._id] = false; });
    setSelectedItems(none);
  };

  const handleImport = async () => {
    const toImport = extractedDates.filter(d => selectedItems[d._id]);
    if (toImport.length === 0) { toast.error('Select at least one item to import'); return; }
    setSaving(true);
    let successCount = 0;
    for (const item of toImport) {
      try {
        const payload = {
          title: item.title,
          description: item.description || '',
          due_date: new Date(item.due_date).toISOString(),
          reminder_days: item.reminder_days || 30,
          category: item.category || 'Other',
          department: item.department || 'OTHER',
          assigned_to: item.assigned_to === 'unassigned' ? null : item.assigned_to,
          client_id: item.client_id === 'no_client' ? null : item.client_id,
          status: 'pending',
        };
        await api.post('/duedates', payload);
        successCount++;
      } catch { /* skip failed */ }
    }
    setSaving(false);
    toast.success(`${successCount} due date${successCount !== 1 ? 's' : ''} imported successfully!`);
    onImportDone();
    handleClose();
  };

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg font-outfit">AI Smart Import</h2>
              <p className="text-blue-200 text-xs">Upload a document to extract compliance dates automatically</p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${step === 'upload' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}>
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
              Upload
            </div>
            <div className="h-px w-6 bg-white/30" />
            <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${step === 'review' ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}>
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
              Review & Import
            </div>
          </div>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {/* Drop Zone */}
                <div
                  ref={dropRef}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById('ai-file-input').click()}
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                    file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    id="ai-file-input"
                    type="file"
                    accept="image/*,.pdf,.docx,.doc"
                    className="hidden"
                    onChange={handleFileDrop}
                  />
                  {file ? (
                    <div className="space-y-3">
                      {filePreview ? (
                        <img src={filePreview} alt="Preview" className="max-h-48 mx-auto rounded-xl shadow-md object-contain" />
                      ) : (
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-blue-500" />
                        </div>
                      )}
                      <p className="font-semibold text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); setFilePreview(null); }}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Upload className="h-7 w-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 mb-1">Drop your file here or click to browse</p>
                        <p className="text-xs text-slate-400">Supports PNG, JPG, PDF, DOCX</p>
                      </div>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        {[
                          { icon: FileImage, label: 'Image', color: 'text-purple-500', bg: 'bg-purple-50' },
                          { icon: FileText, label: 'PDF', color: 'text-red-500', bg: 'bg-red-50' },
                          { icon: FileText, label: 'Word', color: 'text-blue-500', bg: 'bg-blue-50' },
                        ].map(({ icon: Icon, label, color, bg }) => (
                          <span key={label} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${bg} ${color}`}>
                            <Icon className="h-3.5 w-3.5" />{label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-100 flex gap-3">
                  <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Our AI will scan your document and extract all compliance deadlines, filing dates, and due dates automatically. You'll be able to review each one before importing.
                  </p>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={extractDates}
                    disabled={!file || extracting}
                    className="text-white px-6"
                    style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
                  >
                    {extracting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" />Extract Dates</>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                {/* Summary bar */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-slate-800">{extractedDates.length}</span> dates found ·{' '}
                    <span className="font-bold" style={{ color: COLORS.mediumBlue }}>{selectedCount}</span> selected
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline font-medium">Select All</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={deselectAll} className="text-xs text-slate-500 hover:underline font-medium">Deselect All</button>
                  </div>
                </div>

                {/* Extracted items */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {extractedDates.map((item) => {
                    const isSelected = selectedItems[item._id];
                    return (
                      <motion.div
                        key={item._id}
                        layout
                        className={`rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-slate-200 bg-white opacity-60'
                        }`}
                        onClick={() => toggleItem(item._id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border-2 transition-all ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <CheckSquare className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                              <Badge className="text-[10px] px-2 py-0" style={{ background: '#EEF4FF', color: COLORS.mediumBlue }}>
                                {item.category}
                              </Badge>
                              <Badge className="text-[10px] px-2 py-0 bg-slate-100 text-slate-600">
                                {item.department}
                              </Badge>
                            </div>
                            {item.description && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                            )}
                            <div className="flex items-center gap-1 mt-2">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              <span className="text-xs font-medium text-slate-600">
                                {item.due_date ? format(new Date(item.due_date), 'dd MMM yyyy') : 'Date TBD'}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleItem(item._id); }}
                            className={`flex-shrink-0 text-xs px-2 py-1 rounded-lg font-medium transition-all ${
                              isSelected
                                ? 'bg-red-50 text-red-500 hover:bg-red-100'
                                : 'bg-blue-50 text-blue-500 hover:bg-blue-100'
                            }`}
                          >
                            {isSelected ? (
                              <span className="flex items-center gap-1"><SkipForward className="h-3 w-3" />Ignore</span>
                            ) : (
                              <span className="flex items-center gap-1"><Plus className="h-3 w-3" />Add</span>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setStep('upload')}>← Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button
                      onClick={handleImport}
                      disabled={saving || selectedCount === 0}
                      className="text-white px-6"
                      style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, #17a34a 100%)` }}
                    >
                      {saving ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-2" />Import {selectedCount} Date{selectedCount !== 1 ? 's' : ''}</>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function DueDates() {
  const { user } = useAuth();
  const [dueDates, setDueDates] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [formData, setFormData] = useState({
    title: '', description: '', due_date: '', reminder_days: 30,
    category: '', department: '', assigned_to: 'unassigned',
    client_id: 'no_client', status: 'pending',
  });

  useEffect(() => {
    fetchDueDates();
    fetchClients();
    if (user?.role === 'admin' || user?.role === 'manager') fetchUsers();
  }, [user]);

  const fetchDueDates = async () => {
    try {
      const response = await api.get('/duedates');
      setDueDates(response.data);
    } catch { toast.error('Failed to fetch due dates'); }
  };

  const fetchClients = async () => {
    try { const r = await api.get('/clients'); setClients(r.data); } catch {}
  };

  const fetchUsers = async () => {
    try { const r = await api.get('/users'); setUsers(r.data); } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dueDateData = {
        ...formData,
        assigned_to: formData.assigned_to === 'unassigned' ? null : formData.assigned_to,
        client_id: formData.client_id === 'no_client' ? null : (formData.client_id || null),
        due_date: new Date(formData.due_date).toISOString(),
      };
      if (editingDueDate) {
        await api.put(`/duedates/${editingDueDate.id}`, dueDateData);
        toast.success('Due date updated successfully!');
      } else {
        await api.post('/duedates', dueDateData);
        toast.success('Due date created successfully!');
      }
      setDialogOpen(false);
      resetForm();
      fetchDueDates();
    } catch { toast.error('Failed to save due date'); } finally { setLoading(false); }
  };

  const handleEdit = (dueDate) => {
    setEditingDueDate(dueDate);
    setFormData({
      title: dueDate.title, description: dueDate.description || '',
      due_date: format(new Date(dueDate.due_date), 'yyyy-MM-dd'),
      reminder_days: dueDate.reminder_days, category: dueDate.category || '',
      department: dueDate.department || '', assigned_to: dueDate.assigned_to || 'unassigned',
      client_id: dueDate.client_id || 'no_client', status: dueDate.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this due date?')) return;
    try {
      await api.delete(`/duedates/${id}`);
      toast.success('Deleted successfully!');
      fetchDueDates();
    } catch { toast.error('Failed to delete due date'); }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', due_date: '', reminder_days: 30, category: '', department: '', assigned_to: 'unassigned', client_id: 'no_client', status: 'pending' });
    setEditingDueDate(null);
  };

  const getUserName = (userId) => users.find(u => u.id === userId)?.full_name || 'Unassigned';
  const getClientName = (clientId) => clients.find(c => c.id === clientId)?.company_name || '-';

  const getDisplayStatus = (dueDate) => {
    if (dueDate.status === 'completed') return 'completed';
    const daysLeft = differenceInDays(new Date(dueDate.due_date), new Date());
    if (daysLeft < 0) return 'overdue';
    if (daysLeft <= 7) return 'upcoming';
    return 'pending';
  };

  const filteredDueDates = dueDates.filter(dd => {
    const matchesSearch = dd.title.toLowerCase().includes(searchQuery.toLowerCase());
    const displayStatus = getDisplayStatus(dd);
    const matchesStatus = filterStatus === 'all' || displayStatus === filterStatus;
    const matchesCategory = filterCategory === 'all' || dd.category === filterCategory;
    let matchesMonth = true;
    if (filterMonth !== 'all') {
      matchesMonth = new Date(dd.due_date).getMonth() === parseInt(filterMonth);
    }
    return matchesSearch && matchesStatus && matchesCategory && matchesMonth;
  });

  const stats = {
    total: dueDates.length,
    upcoming: dueDates.filter(dd => { const d = differenceInDays(new Date(dd.due_date), new Date()); return dd.status !== 'completed' && d >= 0 && d <= 7; }).length,
    pending: dueDates.filter(dd => { const d = differenceInDays(new Date(dd.due_date), new Date()); return dd.status !== 'completed' && d > 7; }).length,
    overdue: dueDates.filter(dd => { const d = differenceInDays(new Date(dd.due_date), new Date()); return dd.status !== 'completed' && d < 0; }).length,
    completed: dueDates.filter(dd => dd.status === 'completed').length,
  };

  const months = [
    { value: '0', label: 'January' }, { value: '1', label: 'February' }, { value: '2', label: 'March' },
    { value: '3', label: 'April' }, { value: '4', label: 'May' }, { value: '5', label: 'June' },
    { value: '6', label: 'July' }, { value: '7', label: 'August' }, { value: '8', label: 'September' },
    { value: '9', label: 'October' }, { value: '10', label: 'November' }, { value: '11', label: 'December' },
  ];

  const addToCalendar = (dueDate) => {
    const title = encodeURIComponent(dueDate.title);
    const description = encodeURIComponent(dueDate.description || '');
    const startDate = format(new Date(dueDate.due_date), 'yyyyMMdd');
    const endDate = format(new Date(new Date(dueDate.due_date).getTime() + 86400000), 'yyyyMMdd');
    window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${startDate}/${endDate}`, '_blank');
  };

  const StatCard = ({ label, value, color, status, ring }) => (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
      <Card
        className={`border cursor-pointer transition-all duration-200 hover:shadow-lg ${
          filterStatus === status ? `ring-2 ${ring}` : 'border-slate-200'
        }`}
        onClick={() => setFilterStatus(filterStatus === status ? 'all' : status)}
        style={{ boxShadow: filterStatus === status ? undefined : '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <CardContent className="p-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
          <p className={`text-4xl font-bold tabular-nums ${color}`}>{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  );

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit tracking-tight" style={{ color: COLORS.deepBlue }}>
            Compliance Calendar
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Track and manage all statutory filing deadlines</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* AI Import Button */}
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="border-2 gap-2 font-semibold transition-all hover:scale-105 hover:shadow-md"
            style={{ borderColor: COLORS.mediumBlue, color: COLORS.mediumBlue }}
          >
            <Sparkles className="h-4 w-4" />
            AI Import
          </Button>

          {/* Add New Button */}
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button
                className="text-white gap-2 font-semibold px-5 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
              >
                <Plus className="h-4 w-4" />
                New Due Date
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-outfit text-2xl" style={{ color: COLORS.deepBlue }}>
                  {editingDueDate ? 'Edit Due Date' : 'Add New Due Date'}
                </DialogTitle>
                <DialogDescription>
                  {editingDueDate ? 'Update compliance due date details.' : 'Create a new compliance due date reminder.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" placeholder="e.g., GST Return Filing" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Department *</Label>
                  <Select value={formData.department} onValueChange={(value) => setFormData({ ...formData, department: value })}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={formData.category || undefined} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_date">Due Date *</Label>
                    <Input id="due_date" type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={formData.client_id || 'no_client'} onValueChange={(value) => setFormData({ ...formData, client_id: value === 'no_client' ? '' : value })}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_client">No Client</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {(user?.role === 'admin' || user?.role === 'manager') && (
                    <div className="space-y-2">
                      <Label>Assign To</Label>
                      <Select value={formData.assigned_to} onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}>
                        <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="reminder_days">Remind Before (days)</Label>
                    <Input id="reminder_days" type="number" min="1" value={formData.reminder_days} onChange={(e) => setFormData({ ...formData, reminder_days: parseInt(e.target.value) || 30 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" placeholder="Additional notes..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit" disabled={loading} className="text-white" style={{ background: COLORS.deepBlue }}>
                    {loading ? 'Saving...' : editingDueDate ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total" value={stats.total} color={`font-bold`} status="all" ring="ring-slate-400" />
        <StatCard label="Upcoming" value={stats.upcoming} color="text-blue-600" status="upcoming" ring="ring-blue-400" />
        <StatCard label="Pending" value={stats.pending} color="text-amber-500" status="pending" ring="ring-amber-400" />
        <StatCard label="Overdue" value={stats.overdue} color="text-red-500" status="overdue" ring="ring-red-400" />
        <StatCard label="Completed" value={stats.completed} color="text-emerald-500" status="completed" ring="ring-emerald-400" />
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search due dates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-white border-slate-200" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 bg-white border-slate-200">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 bg-white border-slate-200">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-36 bg-white border-slate-200">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemVariants}>
        <Card className="border border-slate-200 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'linear-gradient(to right, #f8fafc, #f1f5f9)' }}>
                  {['Status', 'Title & Description', 'Category', 'Client', 'Due Date', 'Assigned To', 'Days Left', ''].map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-5 py-3.5 border-b border-slate-200">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDueDates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Calendar className="h-6 w-6 text-slate-300" />
                        </div>
                        <p className="text-slate-400 text-sm font-medium">No due dates found</p>
                        <p className="text-slate-300 text-xs">Try adjusting your filters or add a new due date</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredDueDates.map((dueDate, idx) => {
                  const displayStatus = getDisplayStatus(dueDate);
                  const statusStyle = STATUS_STYLES[displayStatus];
                  const daysLeft = differenceInDays(new Date(dueDate.due_date), new Date());

                  return (
                    <motion.tr
                      key={dueDate.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-slate-50/70 transition-colors group border-b border-slate-100 last:border-0"
                    >
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm" style={{ color: COLORS.deepBlue }}>{dueDate.title}</p>
                          {dueDate.assigned_to === user?.id && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-0">You</Badge>
                          )}
                        </div>
                        {dueDate.description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{dueDate.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className="text-[11px] font-medium" style={{ borderColor: COLORS.mediumBlue + '60', color: COLORS.mediumBlue, background: '#EEF4FF' }}>
                          {dueDate.category || 'Other'}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">
                        {dueDate.client_id ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-300" />
                            <span className="text-xs">{getClientName(dueDate.client_id)}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {format(new Date(dueDate.due_date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-300" />
                          <span className="text-xs text-slate-500">{getUserName(dueDate.assigned_to)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {dueDate.status === 'completed' ? (
                          <span className="text-xs text-emerald-500 font-semibold">✓ Done</span>
                        ) : (
                          <span className={`text-xs font-bold tabular-nums ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-slate-500'}`}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {(user?.role === 'admin' || dueDate.assigned_to === user?.id) && (
                          <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 rounded-lg" onClick={() => handleEdit(dueDate)}>
                              <Edit className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 rounded-lg" onClick={() => handleDelete(dueDate.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-50 rounded-lg" onClick={() => addToCalendar(dueDate)}>
                              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredDueDates.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing <span className="font-semibold text-slate-600">{filteredDueDates.length}</span> of <span className="font-semibold text-slate-600">{dueDates.length}</span> due dates
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* AI Import Modal */}
      <AIImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clients={clients}
        users={users}
        user={user}
        onImportDone={fetchDueDates}
      />
    </motion.div>
  );
}
