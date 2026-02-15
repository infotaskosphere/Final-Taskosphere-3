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

export default function DocumentsRegister() {
  const [documentList, setdocumentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingdocument, setEditingdocument] = useState(null);
  const [selecteddocument, setSelecteddocument] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    document_name: '',
    document_type: '',
    document_password: '',
    associated_with: '',
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
    fetchdocument();
  }, []);

  const fetchdocument = async () => {
    try {
      const response = await api.get('/documents');
      setdocumentList(response.data);
    } catch (error) {
      toast.error('Failed to fetch document');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const documentData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        valid_upto: new Date(formData.valid_upto).toISOString(),
      };

      if (editingdocument) {
        await api.put(`/documents/${editingdocument.id}`, documentData);
        toast.success('document updated successfully!');
      } else {
        await api.post('/documents', documentData);
        toast.success('document added successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchdocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post(`/documents/${selecteddocument.id}/movement`, movementData);
      toast.success(`document marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchdocument();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (document, type) => {
    setSelecteddocument(document);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (document) => {
    setSelecteddocument(document);
    setLogDialogOpen(true);
  };

  const getdocumentInOutStatus = (document) => {
    if (!document) return 'OUT';
    if (document.current_status) return document.current_status;
    return document.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  const handleMovementInModal = async () => {
    if (!editingdocument || !movementData.person_name) return;
    setLoading(true);

    try {
      const currentStatus = getdocumentInOutStatus(editingdocument);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';

      await api.post(`/documents/${editingdocument.id}/movement`, {
        ...movementData,
        movement_type: newType,
      });

      toast.success(`document marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });

      const response = await api.get('/documents');
      setdocumentList(response.data);
      const updateddocument = response.data.find(d => d.id === editingdocument.id);
      if (updateddocument) {
        setEditingdocument(updateddocument);
      }

    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingdocument || !editMovementData.person_name) return;
    setLoading(true);

    try {
      await api.put(`/documents/${editingdocument.id}/movement/${movementId}`, {
        movement_id: movementId,
        movement_type: editMovementData.movement_type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });

      toast.success('Movement log updated successfully!');
      setEditingMovement(null);

      const response = await api.get('/documents');
      setdocumentList(response.data);
      const updateddocument = response.data.find(d => d.id === editingdocument.id);
      if (updateddocument) {
        setEditingdocument(updateddocument);
      }

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

  const handleEdit = (document) => {
    setEditingdocument(document);
    setFormData({
      document_name: document.document_name,
      document_type: document.document_type || '',
      document_password: document.document_password || '',
      associated_with: document.associated_with || '',
      entity_type: document.entity_type || 'firm',
      issue_date: format(new Date(document.issue_date), 'yyyy-MM-dd'),
      valid_upto: format(new Date(document.valid_upto), 'yyyy-MM-dd'),
      notes: document.notes || '',
    });
    setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
    setEditingMovement(null);
    setDialogOpen(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;

    const handleDelete = async (documentId) => {
  if (!window.confirm('Are you sure you want to delete this document?')) return;

  try {
    await api.delete(`/documents/${documentId}`);
    toast.success('document deleted successfully!');
    fetchdocument();
  } catch (error) {
    toast.error('Failed to delete document');
  }
};
///// PART 2 START

  const getdocumentStatus = (expiryDate) => {
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

  const filterBySearch = (document) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      document.document_name?.toLowerCase().includes(query) ||
      document.document_type?.toLowerCase().includes(query) ||
      document.associated_with?.toLowerCase().includes(query)
    );
  };

  const indocument = documentList.filter(document =>
    getdocumentInOutStatus(document) === 'IN' && filterBySearch(document)
  );

  const outdocument = documentList.filter(document =>
    getdocumentInOutStatus(document) === 'OUT' && filterBySearch(document)
  );

  return (
    <div className="space-y-6" data-testid="document-page">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">
            Documents Register
          </h1>
          <p className="text-slate-600 mt-1">
            Manage office documents with IN/OUT tracking
          </p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95">
              <Plus className="mr-2 h-5 w-5" />
              Add Document
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl">
                {editingdocument ? 'Edit Document' : 'Add New Document'}
              </DialogTitle>
              <DialogDescription>
                {editingdocument
                  ? 'Update document details and track IN/OUT status.'
                  : 'Fill in the details to add a new document.'}
              </DialogDescription>
            </DialogHeader>

            {editingdocument ? (
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
                        <Label>Document Name *</Label>
                        <Input
                          value={formData.document_name}
                          onChange={(e) =>
                            setFormData({ ...formData, document_name: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Document Type</Label>
                        <Input
                          value={formData.document_type}
                          onChange={(e) =>
                            setFormData({ ...formData, document_type: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          value={formData.document_password}
                          onChange={(e) =>
                            setFormData({ ...formData, document_password: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Associated With</Label>
                        <Input
                          value={formData.associated_with}
                          onChange={(e) =>
                            setFormData({ ...formData, associated_with: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Entity Type</Label>
                        <Select
                          value={formData.entity_type}
                          onValueChange={(value) =>
                            setFormData({ ...formData, entity_type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="firm">Firm</SelectItem>
                            <SelectItem value="client">Client</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Issue Date *</Label>
                        <Input
                          type="date"
                          value={formData.issue_date}
                          onChange={(e) =>
                            setFormData({ ...formData, issue_date: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Valid Upto *</Label>
                        <Input
                          type="date"
                          value={formData.valid_upto}
                          onChange={(e) =>
                            setFormData({ ...formData, valid_upto: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={2}
                      />
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                        {loading ? 'Saving...' : 'Update Document'}
                      </Button>
                    </DialogFooter>

                  </form>
                </TabsContent>

                <TabsContent value="status" className="mt-4 space-y-4">

                  <Card
                    className={`p-4 ${
                      getdocumentInOutStatus(editingdocument) === 'IN'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {getdocumentInOutStatus(editingdocument) === 'IN' ? (
                        <>
                          <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
                          <Badge className="bg-emerald-600 text-white">
                            IN - Available
                          </Badge>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="h-5 w-5 text-red-600" />
                          <Badge className="bg-red-600 text-white">
                            OUT - Taken
                          </Badge>
                        </>
                      )}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h4 className="font-medium mb-3">
                      {getdocumentInOutStatus(editingdocument) === 'IN'
                        ? 'Mark as OUT'
                        : 'Mark as IN'}
                    </h4>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleMovementInModal();
                      }}
                      className="space-y-3"
                    >
                      <Input
                        placeholder="Person Name"
                        value={movementData.person_name}
                        onChange={(e) =>
                          setMovementData({
                            ...movementData,
                            person_name: e.target.value,
                          })
                        }
                        required
                      />

                      <Input
                        placeholder="Notes"
                        value={movementData.notes}
                        onChange={(e) =>
                          setMovementData({
                            ...movementData,
                            notes: e.target.value,
                          })
                        }
                      />

                      <Button
                        type="submit"
                        className={
                          getdocumentInOutStatus(editingdocument) === 'IN'
                            ? 'bg-red-600 hover:bg-red-700 w-full'
                            : 'bg-emerald-600 hover:bg-emerald-700 w-full'
                        }
                      >
                        {getdocumentInOutStatus(editingdocument) === 'IN'
                          ? 'Mark as OUT'
                          : 'Mark as IN'}
                      </Button>
                    </form>
                  </Card>

                </TabsContent>

///// PART 3 CONTINUES IN NEXT MESSAGE
                <TabsContent value="history" className="mt-4">

                  <div className="space-y-3 max-h-80 overflow-y-auto">

                    {editingdocument?.movement_log &&
                    editingdocument.movement_log.length > 0 ? (

                      editingdocument.movement_log
                        .slice()
                        .reverse()
                        .map((movement, index) => {

                          const movementKey = movement.id;
                          const isEditing = editingMovement === movementKey;

                          return (
                            <Card
                              key={movementKey}
                              className={`p-3 ${
                                movement.movement_type === 'IN'
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-red-50 border-red-200'
                              }`}
                            >

                              {isEditing ? (

                                <div className="space-y-3">

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant={
                                        editMovementData.movement_type === 'IN'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={
                                        editMovementData.movement_type === 'IN'
                                          ? 'bg-emerald-600'
                                          : ''
                                      }
                                      onClick={() =>
                                        setEditMovementData({
                                          ...editMovementData,
                                          movement_type: 'IN',
                                        })
                                      }
                                    >
                                      IN
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant={
                                        editMovementData.movement_type === 'OUT'
                                          ? 'default'
                                          : 'outline'
                                      }
                                      className={
                                        editMovementData.movement_type === 'OUT'
                                          ? 'bg-red-600'
                                          : ''
                                      }
                                      onClick={() =>
                                        setEditMovementData({
                                          ...editMovementData,
                                          movement_type: 'OUT',
                                        })
                                      }
                                    >
                                      OUT
                                    </Button>
                                  </div>

                                  <Input
                                    value={editMovementData.person_name}
                                    onChange={(e) =>
                                      setEditMovementData({
                                        ...editMovementData,
                                        person_name: e.target.value,
                                      })
                                    }
                                    placeholder="Person Name"
                                  />

                                  <Input
                                    value={editMovementData.notes}
                                    onChange={(e) =>
                                      setEditMovementData({
                                        ...editMovementData,
                                        notes: e.target.value,
                                      })
                                    }
                                    placeholder="Notes"
                                  />

                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingMovement(null)}
                                    >
                                      Cancel
                                    </Button>

                                    <Button
                                      size="sm"
                                      className="bg-indigo-600"
                                      onClick={() =>
                                        handleUpdateMovement(movement.id)
                                      }
                                    >
                                      Save
                                    </Button>
                                  </div>

                                </div>

                              ) : (

                                <div className="flex justify-between items-start">

                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge
                                        className={
                                          movement.movement_type === 'IN'
                                            ? 'bg-emerald-600'
                                            : 'bg-red-600'
                                        }
                                      >
                                        {movement.movement_type}
                                      </Badge>

                                      <span className="font-medium">
                                        {movement.person_name}
                                      </span>
                                    </div>

                                    {movement.notes && (
                                      <p className="text-xs text-slate-600">
                                        {movement.notes}
                                      </p>
                                    )}

                                    {movement.edited_at && (
                                      <p className="text-xs text-slate-400 mt-1">
                                        Edited by {movement.edited_by}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex flex-col items-end gap-2">
                                    <span className="text-xs text-slate-500">
                                      {format(
                                        new Date(movement.timestamp),
                                        'MMM dd, yyyy hh:mm a'
                                      )}
                                    </span>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        startEditingMovement(movement)
                                      }
                                    >
                                      Edit
                                    </Button>
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
              /* IN / OUT Tabs */
      <Tabs defaultValue="in" className="w-full">

        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger 
            value="in" 
            className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
          >
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            IN ({indocument.length})
          </TabsTrigger>

          <TabsTrigger 
            value="out" 
            className="data-[state=active]:bg-red-500 data-[state=active]:text-white"
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            OUT ({outdocument.length})
          </TabsTrigger>
        </TabsList>


        {/* IN TAB */}
        <TabsContent value="in" className="mt-6">
          <Card className="border border-emerald-200 bg-emerald-50/30">
            <CardHeader className="bg-emerald-50 border-b border-emerald-200">
              <CardTitle className="text-sm font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                DOCUMENTS IN — Available ({indocument.length})
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              {indocument.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently IN</p>
                </div>
              ) : (
                <DocumentTable
                  documentList={indocument}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMovement={openMovementDialog}
                  onViewLog={openLogDialog}
                  getdocumentStatus={getdocumentStatus}
                  type="IN"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* OUT TAB */}
        <TabsContent value="out" className="mt-6">
          <Card className="border border-red-200 bg-red-50/30">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-sm font-medium text-red-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                DOCUMENTS OUT — Taken ({outdocument.length})
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              {outdocument.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently OUT</p>
                </div>
              ) : (
                <DocumentTable
                  documentList={outdocument}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onMovement={openMovementDialog}
                  onViewLog={openLogDialog}
                  getdocumentStatus={getdocumentStatus}
                  type="OUT"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
  );
}

function DocumentTable({
  documentList,
  onEdit,
  onDelete,
  onMovement,
  onViewLog,
  getdocumentStatus,
  type,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Holder Name
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
          {documentList.map((document) => {
            const status = getdocumentStatus(document.valid_upto);

            return (
              <tr
                key={document.id}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4 font-medium text-slate-900">
                  {document.document_name}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {document.document_type || "-"}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {document.associated_with || "-"}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {format(new Date(document.valid_upto), "MMM dd, yyyy")}
                </td>

                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status.color}`} />
                    <span
                      className={`text-sm font-medium ${status.textColor}`}
                    >
                      {status.text}
                    </span>
                  </div>
                </td>

                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">

                    {/* Movement Log */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewLog(document)}
                      className="hover:bg-slate-100"
                    >
                      <History className="h-4 w-4" />
                    </Button>

                    {/* IN/OUT Toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onMovement(document, type === "IN" ? "OUT" : "IN")
                      }
                      className={
                        type === "IN"
                          ? "hover:bg-red-50 hover:text-red-600"
                          : "hover:bg-emerald-50 hover:text-emerald-600"
                      }
                    >
                      {type === "IN" ? (
                        <ArrowUpCircle className="h-4 w-4" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4" />
                      )}
                    </Button>

                    {/* Edit */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(document)}
                      className="hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(document.id)}
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
