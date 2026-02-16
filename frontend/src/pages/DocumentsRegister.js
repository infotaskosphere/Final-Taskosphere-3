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
  const [DocumentList, setDocumentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // Search state

  const [formData, setFormData] = useState({
    holder_name: '',
    Document_type: '', // Not compulsory
    Document_password: '', // Second field
    associated_with: '', // Not compulsory
    entity_type: 'firm',
    issue_date: '',
    valid_upto: '',
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

  useEffect(() => {
    fetchDocument();
  }, []);

  const fetchDocument = async () => {
    try {
      const response = await api.get('/documents');
      setDocumentList(response.data);
    } catch (error) {
      toast.error('Failed to fetch Document');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
 const DocumentData = {
  document_name: formData.holder_name,   // ✅ required by backend
  Document_type: formData.Document_type,
  Document_password: formData.Document_password,
  associated_with: formData.associated_with,
  entity_type: formData.entity_type,
  issue_date: formData.issue_date
    ? new Date(formData.issue_date).toISOString()
    : null,
  valid_upto: formData.valid_upto
    ? new Date(formData.valid_upto).toISOString()
    : null,
  notes: formData.notes || ""
};
      
      if (editingDocument) {
        await api.put(`/documents/${editingDocument.id}`, DocumentData);
        toast.success('Document updated successfully!');
      } else {
        await api.post('/documents', DocumentData);
        toast.success('Document added successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save Document');
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
      fetchDocument();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (Document, type) => {
    setSelectedDocument(Document);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (Document) => {
    setSelectedDocument(Document);
    setLogDialogOpen(true);
  };

  // Helper to get Document current IN/OUT status
  const getDocumentInOutStatus = (Document) => {
    if (!Document) return 'OUT';
    if (Document.current_status) return Document.current_status;
    return Document.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // Handle movement from within the edit modal
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
      
      // Refresh the Document data and update editingDocument
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updatedDocument = response.data.find(d => d.id === editingDocument.id);
      if (updatedDocument) {
        setEditingDocument(updatedDocument);
      }
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  // Handle updating an existing movement log entry
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
      
      // Refresh the Document data and update editingDocument
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updatedDocument = response.data.find(d => d.id === editingDocument.id);
      if (updatedDocument) {
        setEditingDocument(updatedDocument);
      }
    } catch (error) {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  // Start editing a movement
  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id || movement.timestamp); // Use id or timestamp as fallback
    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  const handleEdit = (Document) => {
setFormData({
  holder_name: Document.holder_name || '',
  Document_type: Document.Document_type || '',
  Document_password: Document.Document_password || '',
  associated_with: Document.associated_with || '',
  entity_type: Document.entity_type || 'firm',
  issue_date: format(new Date(Document.issue_date), 'yyyy-MM-dd'),
  valid_upto: Document.valid_upto
    ? format(new Date(Document.valid_upto), 'yyyy-MM-dd')
    : "",
  notes: Document.notes || '',
});

    setMovementData({ movement_type: 'IN', person_name: '', notes: '' }); // Reset movement data
    setEditingMovement(null); // Reset editing movement
    setDialogOpen(true);
  };

  const handleDelete = async (DocumentId) => {
    if (!window.confirm('Are you sure you want to delete this Document?')) return;

    try {
      await api.delete(`/documents/${DocumentId}`);
      toast.success('Document deleted successfully!');
      fetchDocument();
    } catch (error) {
      toast.error('Failed to delete Document');
    }
  };

  const resetForm = () => {
    setFormData({
      holder_name: '',
      Document_type: '',
      Document_password: '',
      associated_with: '',
      entity_type: 'firm',
      issue_date: '',
      valid_upto: '',
      notes: '',
    });
    setEditingDocument(null);
  };

  const getDocumentStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    } else if (daysLeft <= 7) {
      return { color: 'bg-red-500', text: `${daysLeft}d left`, textColor: 'text-red-700' };
    } else if (daysLeft <= 30) {
      return { color: 'bg-yellow-500', text: `${daysLeft}d left`, textColor: 'text-yellow-700' };
    }
    return { color: 'bg-emerald-500', text: `${daysLeft}d left`, textColor: 'text-emerald-700' };
  };

  // Filter by search query
  const filterBySearch = (Document) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      Document.holder_name?.toLowerCase().includes(query) ||
      Document.Document_type?.toLowerCase().includes(query) ||
      Document.associated_with?.toLowerCase().includes(query)
    );
  };

  const inDocument = DocumentList.filter(Document => getDocumentInOutStatus(Document) === 'IN' && filterBySearch(Document));
  const outDocument = DocumentList.filter(Document => getDocumentInOutStatus(Document) === 'OUT' && filterBySearch(Document));

  return (
    <div className="space-y-6" data-testid="Document-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Document Register</h1>
          <p className="text-slate-600 mt-1">Manage digital signature certificates with IN/OUT tracking</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
              data-testid="add-Document-btn"
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
              <DialogDescription>
                {editingDocument ? 'Update Document details and track IN/OUT status.' : 'Fill in the details to add a new Document certificate.'}
              </DialogDescription>
            </DialogHeader>
            
            {/* Show tabs only when editing */}
            {editingDocument ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="status">IN/OUT Status</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="mt-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="holder_name">Name of Document Holder <span className="text-red-500">*</span></Label>
                        <Input
                          id="holder_name"
                          placeholder="Name of certificate holder"
                          value={formData.holder_name}
                          onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                          required
                          data-testid="Document-holder-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="Document_type">Type</Label>
                        <Input
                          id="Document_type"
                          placeholder="e.g. Class 3, Signature, Encryption"
                          value={formData.Document_type}
                          onChange={(e) => setFormData({ ...formData, Document_type: e.target.value })}
                          data-testid="Document-type-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="Document_password">Password</Label>
                        <Input
                          id="Document_password"
                          type="text"
                          placeholder="Document Password"
                          value={formData.Document_password}
                          onChange={(e) => setFormData({ ...formData, Document_password: e.target.value })}
                          data-testid="Document-password-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                        <Input
                          id="associated_with"
                          placeholder="Firm or client name"
                          value={formData.associated_with}
                          onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                          data-testid="Document-associated-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">

  {/* Entity Type */}
  <div className="space-y-2">
    <Label htmlFor="entity_type">Entity Type</Label>
    <Select
      value={formData.entity_type}
      onValueChange={(value) =>
        setFormData({ ...formData, entity_type: value })
      }
    >
      <SelectTrigger data-testid="Document-entity-type-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60 overflow-y-auto">
        <SelectItem value="firm">Firm</SelectItem>
        <SelectItem value="client">Client</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* Issue Date */}
  <div className="space-y-2">
    <Label htmlFor="issue_date">
      Issue Date <span className="text-red-500">*</span>
    </Label>
    <Input
      id="issue_date"
      type="date"
      value={formData.issue_date}
      onChange={(e) =>
        setFormData({ ...formData, issue_date: e.target.value })
      }
      required
      data-testid="Document-issue-date-input"
    />
  </div>

</div>

{/* Valid Upto Row */}
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label htmlFor="valid_upto">
      Valid Upto
    </Label>
    <Input
      id="valid_upto"
      type="date"
      value={formData.valid_upto}
      onChange={(e) =>
        setFormData({ ...formData, valid_upto: e.target.value })
      }
      data-testid="Document-valid-upto-input"
    />
  </div>
  <div></div>
</div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Additional notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={2}
                        data-testid="Document-notes-input"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDialogOpen(false);
                          resetForm();
                        }}
                        data-testid="Document-cancel-btn"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-700"
                        data-testid="Document-submit-btn"
                      >
                        {loading ? 'Saving...' : 'Update Document'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                
                <TabsContent value="status" className="mt-4 space-y-4">
                  {/* Current Status Display */}
                  <Card className={`p-4 ${getDocumentInOutStatus(editingDocument) === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Current Status</p>
                        <div className="flex items-center gap-2 mt-1">
                          {getDocumentInOutStatus(editingDocument) === 'IN' ? (
                            <>
                              <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
                              <Badge className="bg-emerald-600 text-white">IN - Available</Badge>
                            </>
                          ) : (
                            <>
                              <ArrowUpCircle className="h-5 w-5 text-red-600" />
                              <Badge className="bg-red-600 text-white">OUT - Taken</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* Quick Movement Form */}
                  <Card className="p-4">
                    <h4 className="font-medium text-slate-900 mb-3">
                      {getDocumentInOutStatus(editingDocument) === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    </h4>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      handleMovementInModal();
                    }} className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="inline_person">
                          {getDocumentInOutStatus(editingDocument) === 'IN' ? 'Taken By *' : 'Delivered By *'}
                        </Label>
                        <Input
                          id="inline_person"
                          placeholder="Enter person name"
                          value={movementData.person_name}
                          onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inline_notes">Notes</Label>
                        <Input
                          id="inline_notes"
                          placeholder="Optional notes"
                          value={movementData.notes}
                          onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={loading}
                        className={getDocumentInOutStatus(editingDocument) === 'IN' ? 'bg-red-600 hover:bg-red-700 w-full' : 'bg-emerald-600 hover:bg-emerald-700 w-full'}
                      >
                        {getDocumentInOutStatus(editingDocument) === 'IN' ? (
                          <>
                            <ArrowUpCircle className="h-4 w-4 mr-2" />
                            Mark as OUT
                          </>
                        ) : (
                          <>
                            <ArrowDownCircle className="h-4 w-4 mr-2" />
                            Mark as IN
                          </>
                        )}
                      </Button>
                    </form>
                  </Card>
                </TabsContent>
                
                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {editingDocument?.movement_log && editingDocument.movement_log.length > 0 ? (
                      editingDocument.movement_log.slice().reverse().map((movement, index) => {
                        const movementKey = movement.id || movement.timestamp;
                        const isEditing = editingMovement === movementKey;
                        
                        return (
                          <Card key={index} className={`p-3 ${movement.movement_type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            {isEditing ? (
                              // Editing mode
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <Label className="text-sm font-medium">Status:</Label>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={editMovementData.movement_type === 'IN' ? 'default' : 'outline'}
                                      className={editMovementData.movement_type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                      onClick={() => setEditMovementData({ ...editMovementData, movement_type: 'IN' })}
                                    >
                                      <ArrowDownCircle className="h-4 w-4 mr-1" />
                                      IN
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={editMovementData.movement_type === 'OUT' ? 'default' : 'outline'}
                                      className={editMovementData.movement_type === 'OUT' ? 'bg-red-600 hover:bg-red-700' : ''}
                                      onClick={() => setEditMovementData({ ...editMovementData, movement_type: 'OUT' })}
                                    >
                                      <ArrowUpCircle className="h-4 w-4 mr-1" />
                                      OUT
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Person Name</Label>
                                  <Input
                                    size="sm"
                                    value={editMovementData.person_name}
                                    onChange={(e) => setEditMovementData({ ...editMovementData, person_name: e.target.value })}
                                    placeholder="Person name"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">Notes</Label>
                                  <Input
                                    size="sm"
                                    value={editMovementData.notes}
                                    onChange={(e) => setEditMovementData({ ...editMovementData, notes: e.target.value })}
                                    placeholder="Notes (optional)"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingMovement(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => handleUpdateMovement(movement.id)}
                                    disabled={loading || !editMovementData.person_name}
                                  >
                                    {loading ? 'Saving...' : 'Save'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              // Display mode
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {movement.movement_type === 'IN' ? (
                                      <Badge className="bg-emerald-600 text-xs">IN</Badge>
                                    ) : (
                                      <Badge className="bg-red-600 text-xs">OUT</Badge>
                                    )}
                                    <span className="text-sm font-medium">{movement.person_name}</span>
                                  </div>
                                  {movement.notes && (
                                    <p className="text-xs text-slate-600">{movement.notes}</p>
                                  )}
                                  {movement.edited_at && (
                                    <p className="text-xs text-slate-400 mt-1">
                                      Edited by {movement.edited_by} on {format(new Date(movement.edited_at), 'MMM dd, yyyy')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <div className="text-xs text-slate-500">
                                    {format(new Date(movement.timestamp), 'MMM dd, yyyy hh:mm a')}
                                  </div>
                                  {movement.id && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs text-slate-500 hover:text-indigo-600"
                                      onClick={() => startEditingMovement(movement)}
                                    >
                                      <Edit className="h-3 w-3 mr-1" />
                                      Edit
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-slate-500">
                        <History className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                        <p>No movement history yet</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              /* New Document Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="holder_name">Name of Document Holder <span className="text-red-500">*</span></Label>
                    <Input
                      id="holder_name"
                      placeholder="Name of certificate holder"
                      value={formData.holder_name}
                      onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                      required
                      data-testid="Document-holder-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="Document_type">Type</Label>
                    <Input
                      id="Document_type"
                      placeholder="e.g. Class 3, Signature, Encryption"
                      value={formData.Document_type}
                      onChange={(e) => setFormData({ ...formData, Document_type: e.target.value })}
                      data-testid="Document-type-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="Document_password">Password</Label>
                    <Input
                      id="Document_password"
                      type="text"
                      placeholder="Document Password"
                      value={formData.Document_password}
                      onChange={(e) => setFormData({ ...formData, Document_password: e.target.value })}
                      data-testid="Document-password-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                    <Input
                      id="associated_with"
                      placeholder="Firm or client name"
                      value={formData.associated_with}
                      onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                      data-testid="Document-associated-input"
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
                      <SelectTrigger data-testid="Document-entity-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
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
                      data-testid="Document-issue-date-input"
                    />
                
                <Input
                  id="valid_upto"
                  type="date"
                  value={formData.valid_upto}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_upto: e.target.value })
                  }
                  data-testid="Document-valid-upto-input"
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
                    data-testid="Document-notes-input"
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                    data-testid="Document-cancel-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid="Document-submit-btn"
                  >
                    {loading ? 'Saving...' : 'Add Document'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search by Document Name, certificate number, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200 focus:border-indigo-500"
          data-testid="Document-search-input"
        />
      </div>

      {/* IN/OUT Tabs */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            IN ({inDocument.length})
          </TabsTrigger>
          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            OUT ({outDocument.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="mt-6">
          <Card className="border border-emerald-200 bg-emerald-50/30">
            <CardHeader className="bg-emerald-50 border-b border-emerald-200">
              <CardTitle className="text-sm font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                Document IN - Available ({inDocument.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inDocument.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No Document certificates currently IN</p>
                </div>
              ) : (
                <DocumentTable DocumentList={inDocument} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} getDocumentStatus={getDocumentStatus} type="IN" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out" className="mt-6">
          <Card className="border border-red-200 bg-red-50/30">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-sm font-medium text-red-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Document OUT - Taken ({outDocument.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {outDocument.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No Document certificates currently OUT</p>
                </div>
              ) : (
                <DocumentTable DocumentList={outDocument} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} getDocumentStatus={getDocumentStatus} type="OUT" />
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
            <DialogDescription>
              {movementData.movement_type === 'IN' 
                ? 'Record when Document is delivered/returned' 
                : 'Record when Document is taken out'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>Document Certificate</Label>
              <p className="text-sm font-medium">{selectedDocument?.certificate_number} - {selectedDocument?.holder_name}</p>
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

      {/* Movement Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <History className="h-6 w-6" />
              Movement Log
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.certificate_number} - {selectedDocument?.holder_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDocument?.movement_log && selectedDocument.movement_log.length > 0 ? (
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
                        Recorded by: {movement.recorded_by}
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

      {/* Document Expiry Alert */}
      {DocumentList.filter(Document => getDocumentStatus(Document.valid_upto).color !== 'bg-emerald-500').length > 0 && (
        <Card className="border-2 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900">Attention Required</h3>
                <p className="text-sm text-orange-700 mt-1">
                  {DocumentList.filter(Document => getDocumentStatus(Document.valid_upto).color === 'bg-red-500').length} certificate(s) expired or expiring within 7 days.
                  {DocumentList.filter(Document => getDocumentStatus(Document.valid_upto).color === 'bg-yellow-500').length} certificate(s) expiring within 30 days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Document Table Component
function DocumentTable({ DocumentList, onEdit, onDelete, onMovement, onViewLog, getDocumentStatus, type }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Document Name
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Type
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Associated With
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Expiry Date
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Status
            </th>
            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {DocumentList.map((Document) => {
            const status = getDocumentStatus(Document.valid_upto);
            return (
              <tr
                key={Document.id}
                className="hover:bg-slate-50 transition-colors"
                data-testid={`Document-row-${Document.id}`}
              >
                <td className="px-6 py-4 font-medium text-slate-900">{Document.holder_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Document.Document_type || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{Document.associated_with || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {format(new Date(Document.valid_upto), 'MMM dd, yyyy')}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                    <span className={`text-sm font-medium ${status.textColor}`}>{status.text}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewLog(Document)}
                      className="hover:bg-slate-100"
                      title="View Movement Log"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMovement(Document, type === 'IN' ? 'OUT' : 'IN')}
                      className={type === 'IN' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-emerald-50 hover:text-emerald-600'}
                      title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    >
                      {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(Document)}
                      data-testid={`edit-Document-${Document.id}`}
                      className="hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(Document.id)}
                      data-testid={`delete-Document-${Document.id}`}
                      className="hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
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
