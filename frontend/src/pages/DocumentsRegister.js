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
import { Plus, Edit, Trash2, AlertCircle, ArrowDownCircle, ArrowUpCircle, History, Search } from 'lucide-react';
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
  const [editingMovement, setEditingMovement] = useState(null);           // ← kept even if unused
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

  const [editMovementData, setEditMovementData] = useState({           // ← kept even if unused
    movement_type: 'IN',
    person_name: '',
    notes: '',
  });

  useEffect(() => {
    fetchDocuments();
  }, []);

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
      const documentData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
      };

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
    setSelectedFullNotes({
      holder_name: doc.holder_name || '—',
      notes: doc.notes,
    });
    setFullNotesOpen(true);
  };

  const getDocumentInOutStatus = (document) => {
    if (!document) return 'OUT';
    if (document.current_status) return document.current_status;
    return document.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // Kept even if currently unused in render flow
  const handleMovementInModal = async () => {
    if (!editingDocument || !movementData.person_name) return;
    setLoading(true);

    try {
      const currentStatus = getDocumentInOutStatus(editingDocument);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';
      await api.post(`/documents/${editingDocument.id}/movement`, {
        ...movementData,
        movement_type: newType,
      });
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

  // Kept even if currently unused
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

  // Kept even if currently unused
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

  return (
    <div className="space-y-6" data-testid="document-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Document Register</h1>
          <p className="text-slate-600 mt-1">Manage documents with IN/OUT tracking</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
              data-testid="add-document-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl">
                {editingDocument ? 'Edit Document' : 'Add New Document'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="holder_name">Holder Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="holder_name"
                    placeholder="Name of document holder"
                    value={formData.holder_name}
                    onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                    required
                    data-testid="document-holder-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select
                    value={formData.document_type}
                    onValueChange={(value) => setFormData({ ...formData, document_type: value })}
                  >
                    <SelectTrigger id="document_type" data-testid="document-type-select">
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="Agreement">Agreement / Contract</SelectItem>
                      <SelectItem value="NDA">NDA</SelectItem>
                      <SelectItem value="Purchase Order">Purchase Order</SelectItem>
                      <SelectItem value="Invoice">Invoice / Bill</SelectItem>
                      <SelectItem value="Cheque">Cheque / Payment Receipt</SelectItem>
                      <SelectItem value="PanCard">PAN Card / Copy</SelectItem>
                      <SelectItem value="Aadhar">Aadhaar Card / Copy</SelectItem>
                      <SelectItem value="GST Certificate">GST Registration Certificate</SelectItem>
                      <SelectItem value="Incorporation">Certificate of Incorporation</SelectItem>
                      <SelectItem value="MOA">Memorandum of Association (MOA)</SelectItem>
                      <SelectItem value="AOA">Articles of Association (AOA)</SelectItem>
                      <SelectItem value="Bank Statement">Bank Statement</SelectItem>
                      <SelectItem value="Balance Sheet">Financial Statement / Balance Sheet</SelectItem>
                      <SelectItem value="ITR">Income Tax Return (ITR)</SelectItem>
                      <SelectItem value="Power of Attorney">Power of Attorney</SelectItem>
                      <SelectItem value="Lease Agreement">Lease / Rent Agreement</SelectItem>
                      <SelectItem value="License">License / Permit</SelectItem>
                      <SelectItem value="Trademark">Trademark / IP Document</SelectItem>
                      <SelectItem value="Correspondence">Important Correspondence / Letter</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="document_password">Password</Label>
                  <Input
                    id="document_password"
                    type="text"
                    placeholder="Document Password (if any)"
                    value={formData.document_password}
                    onChange={(e) => setFormData({ ...formData, document_password: e.target.value })}
                    data-testid="document-password-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                  <Input
                    id="associated_with"
                    placeholder="Firm or client name"
                    value={formData.associated_with}
                    onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                    data-testid="document-associated-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entity_type">Entity Type</Label>
                  <Select
                    value={formData.entity_type}
                    onValueChange={(value) => setFormData({ ...formData, entity_type: value })}
                  >
                    <SelectTrigger id="entity_type" data-testid="document-entity-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="firm">Firm</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issue_date">Issue Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="issue_date"
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                    data-testid="document-issue-date-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  data-testid="document-notes-input"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setDialogOpen(false); resetForm(); }}
                  data-testid="document-cancel-btn"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="document-submit-btn"
                >
                  {loading ? 'Saving...' : editingDocument ? 'Update Document' : 'Add Document'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search by holder name, type, company, notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200 focus:border-indigo-500"
          data-testid="document-search-input"
        />
      </div>

      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            IN ({inDocuments.length})
          </TabsTrigger>
          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            OUT ({outDocuments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="mt-6">
          <Card className="border border-emerald-200 bg-emerald-50/30">
            <CardHeader className="bg-emerald-50 border-b border-emerald-200">
              <CardTitle className="text-sm font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                Documents IN - Available ({inDocuments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inDocuments.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently IN</p>
                </div>
              ) : (
                <DocumentTable
                  documentList={inDocuments}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMovement={openMovementDialog}
                  onViewLog={openLogDialog}
                  onShowFullNotes={openFullNotes}
                  type="IN"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out" className="mt-6">
          <Card className="border border-red-200 bg-red-50/30">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-sm font-medium text-red-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Documents OUT - Taken ({outDocuments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {outDocuments.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently OUT</p>
                </div>
              ) : (
                <DocumentTable
                  documentList={outDocuments}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMovement={openMovementDialog}
                  onViewLog={openLogDialog}
                  onShowFullNotes={openFullNotes}
                  type="OUT"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Movement Dialog */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">
              Mark Document as {movementData.movement_type}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>Document</Label>
              <p className="text-sm font-medium">
                {selectedDocument?.holder_name || '—'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="person_name">
                {movementData.movement_type === 'IN' ? 'Delivered By *' : 'Taken By *'}
              </Label>
              <Input
                id="person_name"
                placeholder="Enter person name"
                value={movementData.person_name}
                onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movement_notes">Notes</Label>
              <Textarea
                id="movement_notes"
                placeholder="Additional notes"
                value={movementData.notes}
                onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className={movementData.movement_type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {loading ? 'Recording...' : `Mark as ${movementData.movement_type}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <History className="h-6 w-6" />
              Movement Log
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.holder_name || '—'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDocument?.movement_log?.length > 0 ? (
              selectedDocument.movement_log.map((movement, index) => (
                <Card key={index} className={`p-4 ${movement.movement_type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {movement.movement_type === 'IN' ? (
                          <Badge className="bg-emerald-600">IN</Badge>
                        ) : (
                          <Badge className="bg-red-600">OUT</Badge>
                        )}
                        <span className="text-sm font-medium">{movement.person_name}</span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {movement.movement_type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Recorded by: {movement.recorded_by || '—'}
                      </p>
                      {movement.notes && (
                        <p className="text-sm text-slate-600 mt-2">{movement.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        {format(new Date(movement.timestamp), 'MMM dd, yyyy')}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(movement.timestamp), 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                <History className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p>No movement history yet</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Notes Modal */}
      <Dialog open={fullNotesOpen} onOpenChange={setFullNotesOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Notes — {selectedFullNotes.holder_name}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 p-5 bg-slate-50 rounded-lg border max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {selectedFullNotes.notes || (
              <p className="text-slate-400 italic text-center py-10">No notes available</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullNotesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentTable({ documentList, onEdit, onDelete, onMovement, onViewLog, onShowFullNotes, type }) {
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-12">
              S.No
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[150px]">
              Holder Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[150px]">
              Associated With
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[260px]">
              Notes
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-44">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {documentList.map((doc, index) => (
            <tr
              key={doc.id}
              className="hover:bg-slate-50 transition-colors"
              data-testid={`document-row-${doc.id}`}
            >
              <td className="px-4 py-3 text-sm text-slate-500">{index + 1}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900 break-words leading-tight">
                {doc.holder_name}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 truncate">
                {doc.document_type || '—'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 break-words leading-tight">
                {doc.associated_with || '—'}
              </td>

              <td
                className={`px-4 py-3 text-sm text-slate-600 break-words leading-tight cursor-pointer hover:bg-slate-50/80 transition-colors group relative ${doc.notes ? '' : 'cursor-default'}`}
                onClick={() => doc.notes && onShowFullNotes(doc)}
              >
                {doc.notes ? (
                  <>
                    <div className="line-clamp-3 pr-10" title="Click to view full notes">
                      {doc.notes}
                    </div>
                    <div className="absolute right-3 top-3 opacity-50 group-hover:opacity-80 transition-opacity text-xs text-slate-400 pointer-events-none">
                      …
                    </div>
                  </>
                ) : (
                  <span className="text-slate-400 italic">—</span>
                )}
              </td>

              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewLog(doc)}
                    className="h-8 w-8 p-0 hover:bg-slate-100"
                    title="View Log"
                  >
                    <History className="h-4 w-4 text-slate-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onMovement(doc, type === 'IN' ? 'OUT' : 'IN')}
                    className={`h-8 w-8 p-0 ${type === 'IN' ? 'hover:bg-red-50 text-red-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
                    title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                  >
                    {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(doc)}
                    className="h-8 w-8 p-0 hover:bg-indigo-50 text-indigo-600"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(doc.id)}
                    className="h-8 w-8 p-0 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
