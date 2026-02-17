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
import { Plus, Edit, Trash2, ArrowDownCircle, ArrowUpCircle, History, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function DocumentsRegister() {
  const [documentList, setDocumentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    document_name: '',
    document_type: '', 
    reference_number: '', // Replaced dsc_password with reference_number
    associated_with: '', 
    entity_type: 'firm',
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
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await api.get('/documents');
      setDocumentList(response.data);
    } catch (error) {
      toast.error('Failed to fetch Documents');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingDocument) {
        await api.put(`/documents/${editingDocument.id}`, formData);
        toast.success('Document updated successfully!');
      } else {
        await api.post('/documents', formData);
        toast.success('Document added successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchDocuments();
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
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (doc, type) => {
    setSelectedDocument(doc);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (doc) => {
    setSelectedDocument(doc);
    setLogDialogOpen(true);
  };

  const getDocInOutStatus = (doc) => {
    if (!doc) return 'OUT';
    if (doc.current_status) return doc.current_status;
    return doc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // FULL CLONE OF MOVEMENT LOG EDITING LOGIC
  const handleMovementInModal = async () => {
    if (!editingDocument || !movementData.person_name) return;
    setLoading(true);
    try {
      const currentStatus = getDocInOutStatus(editingDocument);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';
      await api.post(`/documents/${editingDocument.id}/movement`, {
        ...movementData,
        movement_type: newType,
      });
      toast.success(`Document marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      
      const response = await api.get('/documents');
      setDocumentList(response.data);
      const updatedDoc = response.data.find(d => d.id === editingDocument.id);
      if (updatedDoc) setEditingDocument(updatedDoc);
    } catch (error) {
      toast.error('Failed to record movement');
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
      const updatedDoc = response.data.find(d => d.id === editingDocument.id);
      if (updatedDoc) setEditingDocument(updatedDoc);
    } catch (error) {
      toast.error('Failed to update movement');
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

  const handleEdit = (doc) => {
    setEditingDocument(doc);
    setFormData({
      document_name: doc.document_name,
      document_type: doc.document_type || '',
      reference_number: doc.reference_number || '',
      associated_with: doc.associated_with || '',
      entity_type: doc.entity_type || 'firm',
      notes: doc.notes || '',
    });
    setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
    setEditingMovement(null);
    setDialogOpen(true);
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Document deleted successfully!');
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  const resetForm = () => {
    setFormData({
      document_name: '', document_type: '', reference_number: '',
      associated_with: '', entity_type: 'firm', notes: '',
    });
    setEditingDocument(null);
  };

  const filterBySearch = (doc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      doc.document_name?.toLowerCase().includes(query) ||
      doc.document_type?.toLowerCase().includes(query) ||
      doc.associated_with?.toLowerCase().includes(query)
    );
  };

  const inDocs = documentList.filter(doc => getDocInOutStatus(doc) === 'IN' && filterBySearch(doc));
  const outDocs = documentList.filter(doc => getDocInOutStatus(doc) === 'OUT' && filterBySearch(doc));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">Document Register</h1>
          <p className="text-slate-600 mt-1">Manage digital signature certificates with IN/OUT tracking</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-6 shadow-md transition-all hover:scale-105">
              <Plus className="mr-2 h-5 w-5" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl">{editingDocument ? 'Edit Document' : 'Add New Document'}</DialogTitle>
            </DialogHeader>
            
            {editingDocument ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="status">IN/OUT Status</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="mt-4 space-y-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Document Name *</Label>
                        <Input value={formData.document_name} onChange={(e) => setFormData({ ...formData, document_name: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Input value={formData.document_type} onChange={(e) => setFormData({ ...formData, document_type: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Reference Number</Label>
                        <Input value={formData.reference_number} onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Associated With</Label>
                        <Input value={formData.associated_with} onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Entity Type</Label>
                        <Select value={formData.entity_type} onValueChange={(v) => setFormData({ ...formData, entity_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="firm">Firm</SelectItem><SelectItem value="client">Client</SelectItem></SelectContent>
                        </Select>
                    </div>
                    <Textarea placeholder="Notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                    <DialogFooter>
                      <Button type="submit" disabled={loading} className="bg-indigo-600">Update Document</Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                
                <TabsContent value="status" className="mt-4 space-y-4">
                  <Card className={`p-4 ${getDocInOutStatus(editingDocument) === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      <Badge className={getDocInOutStatus(editingDocument) === 'IN' ? 'bg-emerald-600' : 'bg-red-600'}>
                        {getDocInOutStatus(editingDocument) === 'IN' ? 'IN - Available' : 'OUT - Taken'}
                      </Badge>
                    </div>
                  </Card>
                  <Card className="p-4 space-y-3">
                    <Label>{getDocInOutStatus(editingDocument) === 'IN' ? 'Taken By *' : 'Delivered By *'}</Label>
                    <Input value={movementData.person_name} onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })} required />
                    <Button onClick={handleMovementInModal} disabled={loading} className={getDocInOutStatus(editingDocument) === 'IN' ? 'bg-red-600 w-full' : 'bg-emerald-600 w-full'}>
                      Confirm {getDocInOutStatus(editingDocument) === 'IN' ? 'OUT' : 'IN'}
                    </Button>
                  </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {editingDocument?.movement_log?.slice().reverse().map((movement, index) => {
                      const isEditing = editingMovement === (movement.id || movement.timestamp);
                      return (
                        <Card key={index} className={`p-3 ${movement.movement_type === 'IN' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input size="sm" value={editMovementData.person_name} onChange={(e) => setEditMovementData({ ...editMovementData, person_name: e.target.value })} />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => setEditingMovement(null)}>Cancel</Button>
                                <Button size="sm" className="bg-indigo-600" onClick={() => handleUpdateMovement(movement.id)}>Save</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center">
                              <div>
                                <Badge className={movement.movement_type === 'IN' ? 'bg-emerald-600' : 'bg-red-600'}>{movement.movement_type}</Badge>
                                <span className="ml-2 font-medium">{movement.person_name}</span>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => startEditingMovement(movement)}><Edit className="h-3 w-3" /></Button>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Document Name *</Label>
                    <Input value={formData.document_name} onChange={(e) => setFormData({ ...formData, document_name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Input value={formData.document_type} onChange={(e) => setFormData({ ...formData, document_type: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={loading} className="bg-indigo-600">Add Document</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search by Document Name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
      </div>

      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"><ArrowDownCircle className="mr-2 h-4 w-4"/> IN ({inDocs.length})</TabsTrigger>
          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white"><ArrowUpCircle className="mr-2 h-4 w-4"/> OUT ({outDocs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="mt-6">
          <Card className="border-emerald-200">
            <CardHeader className="bg-emerald-50 border-b border-emerald-200 py-3">
              <CardTitle className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">DOCUMENT IN - AVAILABLE ({inDocs.length})</CardTitle>
            </CardHeader>
            <DocTable list={inDocs} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} type="IN" />
          </Card>
        </TabsContent>

        <TabsContent value="out" className="mt-6">
          <Card className="border-red-200">
            <CardHeader className="bg-red-50 border-b border-red-200 py-3">
              <CardTitle className="text-sm font-semibold text-red-800 uppercase tracking-wider">DOCUMENT OUT - TAKEN ({outDocs.length})</CardTitle>
            </CardHeader>
            <DocTable list={outDocs} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} type="OUT" />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DocTable({ list, onEdit, onDelete, onMovement, onViewLog, type }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="px-6 py-4 text-left text-slate-500">S.No</th>
            <th className="px-6 py-4 text-left text-slate-500">Document Name</th>
            <th className="px-6 py-4 text-left text-slate-500">Type</th>
            <th className="px-6 py-4 text-left text-slate-500">Associated With</th>
            <th className="px-6 py-4 text-left text-slate-500">Status</th>
            <th className="px-6 py-4 text-right text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((doc, index) => (
            <tr key={doc.id} className="hover:bg-slate-50">
              <td className="px-6 py-4">{index + 1}</td>
              <td className="px-6 py-4 font-medium">{doc.document_name}</td>
              <td className="px-6 py-4">{doc.document_type || '-'}</td>
              <td className="px-6 py-4">{doc.associated_with || '-'}</td>
              <td className="px-6 py-4"><Badge className={type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>{type}</Badge></td>
              <td className="px-6 py-4 text-right space-x-2">
                <Button variant="ghost" size="sm" onClick={() => onViewLog(doc)}><History className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onMovement(doc, type === 'IN' ? 'OUT' : 'IN')} className={type === 'IN' ? 'text-red-500' : 'text-emerald-500'}><ArrowUpCircle className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(doc)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(doc.id)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
