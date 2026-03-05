import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, Edit, Trash2, AlertCircle, ArrowDownCircle, ArrowUpCircle, History, Search, FileText, FileCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function DocumentRegister() {
  const [documentList, setDocumentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [fullNotesOpen, setFullNotesOpen] = useState(false);
  const [selectedFullNotes, setSelectedFullNotes] = useState({ holder_name: '', notes: '' });

  const [editingDocument, setEditingDocument] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    holder_name: '',
    document_type: 'Agreement',
    document_password: '',
    associated_with: '',
    entity_type: 'firm',
    issue_date: '',
    notes: '',
  });

  const [movementData, setMovementData] = useState({
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });

  const [editMovementData, setEditMovementData] = useState({
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });

  useEffect(() => { fetchDocuments(); }, []);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents');
      setDocumentList(response.data);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to fetch documents');
    }
  };

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

  const openLogDialog = (document) => {
    setSelectedDocument(document);
    setLogDialogOpen(true);
  };

  const openFullNotes = (doc) => {
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
      const currentStatus = getDocumentInOutStatus(editingDocument);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';
      await api.post(`/documents/${editingDocument.id}/movement`, { ...movementData, movement_type: newType });
      toast.success(`Document marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updatedDocument = response.data.find(d => d.id === editingDocument.id);
      if (updatedDocument) setEditingDocument(updatedDocument);
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
        movement_id: movementId,
        movement_type: editMovementData.movement_type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updatedDocument = response.data.find(d => d.id === editingDocument.id);
      if (updatedDocument) setEditingDocument(updatedDocument);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id || movement.timestamp);
    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  const handleEdit = (document) => {
    setEditingDocument(document);
    setFormData({
      holder_name: document.holder_name,
      document_type: document.document_type || 'Agreement',
      document_password: document.document_password || '',
      associated_with: document.associated_with || '',
      entity_type: document.entity_type || 'firm',
      issue_date: format(new Date(document.issue_date), 'yyyy-MM-dd'),
      notes: document.notes || '',
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
    setFormData({
      holder_name: '',
      document_type: 'Agreement',
      document_password: '',
      associated_with: '',
      entity_type: 'firm',
      issue_date: '',
      notes: '',
    });
    setEditingDocument(null);
  };

  const filterBySearch = (document) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      document.holder_name?.toLowerCase().includes(query) ||
      document.document_type?.toLowerCase().includes(query) ||
      document.associated_with?.toLowerCase().includes(query) ||
      document.notes?.toLowerCase().includes(query)
    );
  };

  const inDocuments = documentList.filter(doc => getDocumentInOutStatus(doc) === 'IN' && filterBySearch(doc));
  const outDocuments = documentList.filter(doc => getDocumentInOutStatus(doc) === 'OUT' && filterBySearch(doc));

  const getErrorMessage = (error) => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((err) => err.msg || err.message || JSON.stringify(err)).join(', ');
    if (detail && typeof detail === 'object') return detail.msg || detail.message || JSON.stringify(detail);
    return null;
  };

  const docTypeOptions = [
    "Agreement", "NDA", "Purchase Order", "Invoice", "Cheque", "PanCard", "Aadhar",
    "GST Certificate", "Incorporation", "MOA", "AOA", "Bank Statement", "Balance Sheet",
    "ITR", "Power of Attorney", "Lease Agreement", "License", "Trademark", "Correspondence", "Other"
  ];

  const docTypeLabels = {
    "Agreement": "Agreement / Contract", "NDA": "NDA", "Purchase Order": "Purchase Order",
    "Invoice": "Invoice / Bill", "Cheque": "Cheque / Payment Receipt", "PanCard": "PAN Card / Copy",
    "Aadhar": "Aadhaar Card / Copy", "GST Certificate": "GST Registration Certificate",
    "Incorporation": "Certificate of Incorporation", "MOA": "Memorandum of Association (MOA)",
    "AOA": "Articles of Association (AOA)", "Bank Statement": "Bank Statement",
    "Balance Sheet": "Financial Statement / Balance Sheet", "ITR": "Income Tax Return (ITR)",
    "Power of Attorney": "Power of Attorney", "Lease Agreement": "Lease / Rent Agreement",
    "License": "License / Permit", "Trademark": "Trademark / IP Document",
    "Correspondence": "Important Correspondence / Letter", "Other": "Other"
  };

  return (
    <div className="space-y-6 bg-gray-50/50 dark:bg-gray-900 min-h-screen" data-testid="document-page">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
            <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Document Register</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage documents with IN/OUT tracking</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 shadow-sm font-medium"
              data-testid="add-document-btn">
              <Plus className="mr-2 h-4 w-4" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-gray-200 dark:border-gray-700">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
                {editingDocument ? 'Edit Document' : 'Add New Document'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Holder Name <span className="text-red-500">*</span>
                  </Label>
                  <Input id="holder_name" placeholder="Document holder name"
                    value={formData.holder_name}
                    onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                    required data-testid="document-holder-name-input"
                    className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Document Type
                  </Label>
                  <Select value={formData.document_type}
                    onValueChange={(value) => setFormData({ ...formData, document_type: value })}>
                    <SelectTrigger id="document_type" data-testid="document-type-select"
                      className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {docTypeOptions.map(opt => (
                        <SelectItem key={opt} value={opt}>{docTypeLabels[opt] || opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Password</Label>
                  <Input id="document_password" type="text" placeholder="Document password (if any)"
                    value={formData.document_password}
                    onChange={(e) => setFormData({ ...formData, document_password: e.target.value })}
                    data-testid="document-password-input"
                    className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Associated With</Label>
                  <Input id="associated_with" placeholder="Firm or client name"
                    value={formData.associated_with}
                    onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                    data-testid="document-associated-input"
                    className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entity Type</Label>
                  <Select value={formData.entity_type}
                    onValueChange={(value) => setFormData({ ...formData, entity_type: value })}>
                    <SelectTrigger id="entity_type" data-testid="document-entity-type-select"
                      className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="firm">Firm</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Issue Date <span className="text-red-500">*</span>
                  </Label>
                  <Input id="issue_date" type="date" value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required data-testid="document-issue-date-input"
                    className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</Label>
                <Textarea id="notes" placeholder="Additional notes about this document"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} data-testid="document-notes-input"
                  className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700 resize-none" />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}
                  className="rounded-xl border-gray-200 dark:border-gray-600" data-testid="document-cancel-btn">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium" data-testid="document-submit-btn">
                  {loading ? 'Saving...' : editingDocument ? 'Update Document' : 'Add Document'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Stats Summary ── */}
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {[
          { label: 'Documents IN', value: inDocuments.length, bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-700 dark:text-emerald-400', Icon: ArrowDownCircle },
          { label: 'Documents OUT', value: outDocuments.length, bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800/40', text: 'text-red-700 dark:text-red-400', Icon: ArrowUpCircle },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border p-4 ${stat.bg} ${stat.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <stat.Icon className={`h-4 w-4 ${stat.text}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${stat.text}`}>{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.text}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input type="text" placeholder="Search by holder, type, company, notes..."
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-xl border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          data-testid="document-search-input" />
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700 w-fit">
          <TabsTrigger value="in"
            className="rounded-lg px-5 font-medium data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <ArrowDownCircle className="h-3.5 w-3.5 mr-1.5" />
            IN ({inDocuments.length})
          </TabsTrigger>
          <TabsTrigger value="out"
            className="rounded-lg px-5 font-medium data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
            OUT ({outDocuments.length})
          </TabsTrigger>
        </TabsList>

        {[
          { val: 'in', list: inDocuments, type: 'IN',
            headerBg: 'bg-emerald-50 dark:bg-emerald-900/10', headerBorder: 'border-emerald-200 dark:border-emerald-800/40',
            headerText: 'text-emerald-700 dark:text-emerald-400', cardBorder: 'border-emerald-200 dark:border-emerald-800/40', Icon: ArrowDownCircle,
            emptyMsg: 'No documents currently in custody' },
          { val: 'out', list: outDocuments, type: 'OUT',
            headerBg: 'bg-red-50 dark:bg-red-900/10', headerBorder: 'border-red-200 dark:border-red-800/40',
            headerText: 'text-red-700 dark:text-red-400', cardBorder: 'border-red-200 dark:border-red-800/40', Icon: ArrowUpCircle,
            emptyMsg: 'No documents currently out' },
        ].map(tab => (
          <TabsContent key={tab.val} value={tab.val} className="mt-4">
            <Card className={`rounded-2xl border shadow-sm ${tab.cardBorder} bg-white dark:bg-gray-800`}>
              <CardHeader className={`py-3 px-5 ${tab.headerBg} border-b ${tab.headerBorder} rounded-t-2xl`}>
                <CardTitle className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${tab.headerText}`}>
                  <tab.Icon className="h-3.5 w-3.5" />
                  Documents {tab.type} — {tab.list.length} Record{tab.list.length !== 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tab.list.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                    <FileCheck className="h-10 w-10 mx-auto mb-2 text-gray-200 dark:text-gray-600" />
                    <p className="text-sm">{tab.emptyMsg}</p>
                  </div>
                ) : (
                  <DocumentTable
                    documentList={tab.list}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onMovement={openMovementDialog}
                    onViewLog={openLogDialog}
                    onShowFullNotes={openFullNotes}
                    type={tab.type}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Movement Dialog ── */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent className="rounded-2xl border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
              Mark Document as {movementData.movement_type}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-0.5">Document</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{selectedDocument?.holder_name || '—'}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {movementData.movement_type === 'IN' ? 'Delivered By *' : 'Taken By *'}
              </Label>
              <Input id="person_name" placeholder="Enter person name" value={movementData.person_name}
                onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })}
                required className="rounded-xl border-gray-200 dark:border-gray-600" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</Label>
              <Textarea id="movement_notes" placeholder="Additional notes" value={movementData.notes}
                onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })}
                rows={2} className="rounded-xl border-gray-200 dark:border-gray-600 resize-none" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}
                className="rounded-xl border-gray-200 dark:border-gray-600">Cancel</Button>
              <Button type="submit" disabled={loading}
                className={`rounded-xl text-white font-medium ${movementData.movement_type === 'IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {loading ? 'Recording...' : `Mark as ${movementData.movement_type}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Log Dialog ── */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <History className="h-5 w-5 text-indigo-500" />
              Movement History
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {selectedDocument?.holder_name || '—'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selectedDocument?.movement_log?.length > 0 ? (
              selectedDocument.movement_log.map((movement, index) => (
                <div key={index} className={`p-3.5 rounded-xl border ${
                  movement.movement_type === 'IN'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${movement.movement_type === 'IN' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
                          {movement.movement_type}
                        </Badge>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{movement.person_name}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {movement.movement_type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}
                        {movement.recorded_by && ` · Recorded by: ${movement.recorded_by || '—'}`}
                      </p>
                      {movement.notes && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{movement.notes}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-400 dark:text-gray-500">
                      <p>{format(new Date(movement.timestamp), 'MMM dd, yyyy')}</p>
                      <p>{format(new Date(movement.timestamp), 'hh:mm a')}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                <History className="h-10 w-10 mx-auto mb-2 text-gray-200 dark:text-gray-600" />
                <p className="text-sm">No movement history yet</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Full Notes Modal ── */}
      <Dialog open={fullNotesOpen} onOpenChange={setFullNotesOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900 dark:text-white">
              Notes — {selectedFullNotes.holder_name}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-700 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {selectedFullNotes.notes || (
              <p className="text-gray-400 italic text-center py-8">No notes available</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullNotesOpen(false)}
              className="rounded-xl border-gray-200 dark:border-gray-600">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentTable({ documentList, onEdit, onDelete, onMovement, onViewLog, onShowFullNotes, type }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700/60">
            {['#', 'Holder Name', 'Type', 'Associated With', 'Notes', ''].map((h, i) => (
              <th key={i} className={`px-4 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ${i === 5 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
          {documentList.map((doc, index) => (
            <tr key={doc.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors"
              data-testid={`document-row-${doc.id}`}>
              <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 w-10">{index + 1}</td>
              <td className="px-4 py-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{doc.holder_name}</p>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md">
                  {doc.document_type || '—'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{doc.associated_with || '—'}</td>
              <td
                className={`px-4 py-3 max-w-xs ${doc.notes ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={() => doc.notes && onShowFullNotes(doc)}
              >
                {doc.notes ? (
                  <div className="group relative">
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-snug pr-4">{doc.notes}</p>
                    <span className="absolute right-0 top-0 text-xs text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors">↗</span>
                  </div>
                ) : (
                  <span className="text-gray-300 dark:text-gray-600 text-sm italic">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button onClick={() => onViewLog(doc)} title="View History"
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    <History className="h-4 w-4" />
                  </button>
                  <button onClick={() => onMovement(doc, type === 'IN' ? 'OUT' : 'IN')}
                    title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      type === 'IN'
                        ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 dark:text-red-400'
                        : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 dark:text-emerald-400'
                    }`}>
                    {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                  </button>
                  <button onClick={() => onEdit(doc)} title="Edit"
                    className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400 transition-colors">
                    <Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => onDelete(doc.id)} title="Delete"
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
