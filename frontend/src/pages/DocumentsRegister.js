import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import {
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Search
} from 'lucide-react';
import { format } from 'date-fns';

export default function DocumentRegister() {

  /* ---------------- STATE ---------------- */

  const [DocumentList, setDocumentList] = useState([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const [editingDocument, setEditingDocument] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    holder_name: '',
    Document_type: '',
    Document_password: '',
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

  /* ---------------- FETCH + NORMALIZATION ---------------- */

  const fetchDocument = async () => {
    try {
      const response = await api.get('/documents');

      const normalized = response.data.map(doc => ({
        ...doc,
        id: doc.id || doc._id,
        holder_name: doc.holder_name || doc.document_name,
      }));

      setDocumentList(normalized);
    } catch {
      toast.error('Failed to fetch Document');
    }
  };

  useEffect(() => {
    fetchDocument();
  }, []);

  /* ---------------- EDIT PREFILL ---------------- */

  useEffect(() => {
    if (!editingDocument) return;

    setFormData({
      holder_name: editingDocument.holder_name || '',
      Document_type: editingDocument.Document_type || '',
      Document_password: editingDocument.Document_password || '',
      associated_with: editingDocument.associated_with || '',
      entity_type: editingDocument.entity_type || 'firm',
      issue_date: editingDocument.issue_date
        ? format(new Date(editingDocument.issue_date), 'yyyy-MM-dd')
        : '',
      valid_upto: editingDocument.valid_upto
        ? format(new Date(editingDocument.valid_upto), 'yyyy-MM-dd')
        : '',
      notes: editingDocument.notes || '',
    });
  }, [editingDocument]);

  /* ---------------- HELPERS ---------------- */

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

  const getDocumentInOutStatus = (doc) => {
    if (!doc) return 'OUT';
    if (doc.current_status) return doc.current_status;
    return doc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  const getDocumentStatus = (expiryDate) => {
    if (!expiryDate) {
      return {
        color: 'bg-gray-400',
        text: 'No Expiry',
        textColor: 'text-gray-600',
      };
    }

    const now = new Date();
    const expiry = new Date(expiryDate);
    now.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    } else if (daysLeft <= 7) {
      return { color: 'bg-red-500', text: `${daysLeft}d left`, textColor: 'text-red-700' };
    } else if (daysLeft <= 30) {
      return { color: 'bg-yellow-500', text: `${daysLeft}d left`, textColor: 'text-yellow-700' };
    } else {
      return { color: 'bg-green-500', text: 'Active', textColor: 'text-green-700' };
    }
  };
  /* ---------------- SEARCH FILTER ---------------- */

  const filterBySearch = useCallback((doc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();

    return (
      doc.holder_name?.toLowerCase().includes(query) ||
      doc.Document_type?.toLowerCase().includes(query) ||
      doc.associated_with?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  /* ---------------- MEMOIZED IN / OUT ---------------- */

  const inDocument = useMemo(() =>
    DocumentList.filter(
      doc =>
        getDocumentInOutStatus(doc) === 'IN' &&
        filterBySearch(doc)
    ),
    [DocumentList, filterBySearch]
  );

  const outDocument = useMemo(() =>
    DocumentList.filter(
      doc =>
        getDocumentInOutStatus(doc) === 'OUT' &&
        filterBySearch(doc)
    ),
    [DocumentList, filterBySearch]
  );

  /* ---------------- EXPIRY COUNTS ---------------- */

  const { expiredCount, warningCount } = useMemo(() => {
    let expired = 0;
    let warning = 0;

    DocumentList.forEach(doc => {
      const status = getDocumentStatus(doc.valid_upto);
      if (status.color === 'bg-red-500') expired++;
      if (status.color === 'bg-yellow-500') warning++;
    });

    return { expiredCount: expired, warningCount: warning };
  }, [DocumentList]);

  /* ---------------- SUBMIT ---------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      document_name: formData.holder_name,
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
      notes: formData.notes || "",
    };

    try {
      if (editingDocument) {
        await api.put(`/documents/${editingDocument.id}`, payload);
        toast.success('Document updated successfully!');
      } else {
        await api.post('/documents', payload);
        toast.success('Document added successfully!');
      }

      setDialogOpen(false);
      resetForm();
      await fetchDocument();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save Document');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- DELETE ---------------- */

  const handleDelete = async (documentId) => {
    if (!window.confirm('Are you sure you want to delete this Document?')) return;

    try {
      await api.delete(`/documents/${documentId}`);
      toast.success('Document deleted successfully!');
      await fetchDocument();
    } catch {
      toast.error('Failed to delete Document');
    }
  };

  /* ---------------- MOVEMENT ---------------- */

  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post(
        `/documents/${selectedDocument.id}/movement`,
        movementData
      );

      toast.success(`Document marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      await fetchDocument();
    } catch {
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

  /* ---------------- INLINE MOVEMENT IN EDIT TAB ---------------- */

  const handleMovementInModal = async () => {
    if (!editingDocument || !movementData.person_name) return;

    setLoading(true);

    try {
      const currentStatus = getDocumentInOutStatus(editingDocument);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';

      await api.post(
        `/documents/${editingDocument.id}/movement`,
        {
          ...movementData,
          movement_type: newType,
        }
      );

      toast.success(`Document marked as ${newType}!`);

      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      await fetchDocument();

      const updated = DocumentList.find(
        d => d.id === editingDocument.id
      );

      if (updated) setEditingDocument(updated);

    } catch {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- MOVEMENT EDITING ---------------- */

  const startEditingMovement = (movement) => {
    const movementKey = movement.id || movement.timestamp;
    setEditingMovement(movementKey);

    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingDocument || !editMovementData.person_name) return;

    setLoading(true);

    try {
      await api.put(
        `/documents/${editingDocument.id}/movement/${movementId}`,
        {
          movement_id: movementId,
          movement_type: editMovementData.movement_type,
          person_name: editMovementData.person_name,
          notes: editMovementData.notes,
        }
      );

      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      await fetchDocument();

    } catch {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };
  /* ---------------- UI ---------------- */

  return (
    <div className="space-y-6" data-testid="Document-page">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">
            Document Register
          </h1>
          <p className="text-slate-600 mt-1">
            Manage digital signature certificates with IN/OUT tracking
          </p>
        </div>

        {/* ADD / EDIT DIALOG */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
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
                {editingDocument
                  ? 'Update Document details and track IN/OUT status.'
                  : 'Fill in the details to add a new Document certificate.'}
              </DialogDescription>
            </DialogHeader>

            {editingDocument ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="status">IN/OUT Status</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                {/* DETAILS TAB */}
                <TabsContent value="details" className="mt-4">
                  <form onSubmit={handleSubmit} className="space-y-4">

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Name of Document Holder *</Label>
                        <Input
                          value={formData.holder_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              holder_name: e.target.value,
                            })
                          }
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Input
                          value={formData.Document_type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              Document_type: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        type="date"
                        value={formData.issue_date}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            issue_date: e.target.value,
                          })
                        }
                        required
                      />
                      <Input
                        type="date"
                        value={formData.valid_upto}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            valid_upto: e.target.value,
                          })
                        }
                      />
                    </div>

                    <Textarea
                      placeholder="Additional notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          notes: e.target.value,
                        })
                      }
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        {loading ? 'Saving...' : 'Update Document'}
                      </Button>
                    </DialogFooter>

                  </form>
                </TabsContent>

                {/* STATUS TAB */}
                <TabsContent value="status" className="mt-4 space-y-4">

                  <Card
                    className={`p-4 ${
                      getDocumentInOutStatus(editingDocument) === 'IN'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">
                          Current Status
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {getDocumentInOutStatus(editingDocument) ===
                          'IN' ? (
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
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h4 className="font-medium text-slate-900 mb-3">
                      {getDocumentInOutStatus(editingDocument) === 'IN'
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
                        placeholder="Enter person name"
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
                        placeholder="Notes (optional)"
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
                        disabled={loading}
                        className={
                          getDocumentInOutStatus(editingDocument) === 'IN'
                            ? 'bg-red-600 hover:bg-red-700 w-full'
                            : 'bg-emerald-600 hover:bg-emerald-700 w-full'
                        }
                      >
                        {getDocumentInOutStatus(editingDocument) ===
                        'IN'
                          ? 'Mark as OUT'
                          : 'Mark as IN'}
                      </Button>
                    </form>
                  </Card>
                </TabsContent>

                {/* HISTORY TAB */}
                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3 max-h-80 overflow-y-auto">

                    {editingDocument?.movement_log &&
                    editingDocument.movement_log.length > 0 ? (
                      editingDocument.movement_log
                        .slice()
                        .reverse()
                        .map((movement, index) => {

                          const movementKey =
                            movement.id || movement.timestamp;

                          const isEditing =
                            editingMovement === movementKey;

                          return (
                            <Card
                              key={index}
                              className={`p-3 ${
                                movement.movement_type === 'IN'
                                  ? 'bg-emerald-50 border-emerald-200'
                                  : 'bg-red-50 border-red-200'
                              }`}
                            >
                              {isEditing ? (
                                <div className="space-y-3">
                                  <Input
                                    value={editMovementData.person_name}
                                    onChange={(e) =>
                                      setEditMovementData({
                                        ...editMovementData,
                                        person_name:
                                          e.target.value,
                                      })
                                    }
                                  />

                                  <Input
                                    value={editMovementData.notes}
                                    onChange={(e) =>
                                      setEditMovementData({
                                        ...editMovementData,
                                        notes: e.target.value,
                                      })
                                    }
                                  />

                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setEditingMovement(null)
                                      }
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleUpdateMovement(
                                          movement.id
                                        )
                                      }
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-between items-center">
                                  <div>
                                    <Badge
                                      className={
                                        movement.movement_type ===
                                        'IN'
                                          ? 'bg-emerald-600'
                                          : 'bg-red-600'
                                      }
                                    >
                                      {movement.movement_type}
                                    </Badge>
                                    <span className="ml-2 text-sm font-medium">
                                      {movement.person_name}
                                    </span>
                                  </div>

                                  {movement.id && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        startEditingMovement(
                                          movement
                                        )
                                      }
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  )}
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
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* same as original simple form */}
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* SEARCH */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200 focus:border-indigo-500"
          placeholder="Search by Document Name..."
        />
      </div>

      {/* IN / OUT TABS */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in">
            IN ({inDocument.length})
          </TabsTrigger>
          <TabsTrigger value="out">
            OUT ({outDocument.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <DocumentTable
            DocumentList={inDocument}
            onEdit={setEditingDocument}
            onDelete={handleDelete}
            onMovement={openMovementDialog}
            onViewLog={openLogDialog}
            getDocumentStatus={getDocumentStatus}
            type="IN"
          />
        </TabsContent>

        <TabsContent value="out">
          <DocumentTable
            DocumentList={outDocument}
            onEdit={setEditingDocument}
            onDelete={handleDelete}
            onMovement={openMovementDialog}
            onViewLog={openLogDialog}
            getDocumentStatus={getDocumentStatus}
            type="OUT"
          />
        </TabsContent>
      </Tabs>

      {/* EXPIRY ALERT */}
      {(expiredCount > 0 || warningCount > 0) && (
        <Card className="border-2 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900">
                  Attention Required
                </h3>
                <p className="text-sm text-orange-700 mt-1">
                  {expiredCount} expired. {warningCount} expiring within 30 days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
      {/* MOVEMENT DIALOG */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl">
              Mark Document as {movementData?.movement_type}
            </DialogTitle>
            <DialogDescription>
              {movementData?.movement_type === 'IN'
                ? 'Record when Document is delivered/returned'
                : 'Record when Document is taken out'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>Document Certificate</Label>
              <p className="text-sm font-medium">
                {selectedDocument?.holder_name}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                {movementData?.movement_type === 'IN'
                  ? 'Delivered By *'
                  : 'Taken By *'}
              </Label>
              <Input
                value={movementData.person_name}
                onChange={(e) =>
                  setMovementData({
                    ...movementData,
                    person_name: e.target.value,
                  })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={movementData.notes}
                onChange={(e) =>
                  setMovementData({
                    ...movementData,
                    notes: e.target.value,
                  })
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovementDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className={
                  movementData?.movement_type === 'IN'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }
              >
                {loading
                  ? 'Recording...'
                  : `Mark as ${movementData.movement_type}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* MOVEMENT LOG DIALOG */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <History className="h-6 w-6" />
              Movement Log
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.holder_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selectedDocument?.movement_log &&
            selectedDocument.movement_log.length > 0 ? (
              selectedDocument.movement_log.map((movement, index) => (
                <Card
                  key={index}
                  className={`p-4 ${
                    movement.movement_type === 'IN'
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge
                        className={
                          movement.movement_type === 'IN'
                            ? 'bg-emerald-600'
                            : 'bg-red-600'
                        }
                      >
                        {movement.movement_type}
                      </Badge>
                      <span className="ml-2 font-medium">
                        {movement.person_name}
                      </span>

                      {movement.notes && (
                        <p className="text-sm text-slate-600 mt-2">
                          {movement.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      {format(new Date(movement.timestamp), 'MMM dd, yyyy')}
                      <br />
                      {format(new Date(movement.timestamp), 'hh:mm a')}
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
              
         </div>
       );
     }
function DocumentTable({
  DocumentList,
  onEdit,
  onDelete,
  onMovement,
  onViewLog,
  getDocumentStatus,
  type
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">

        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">S.No</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Document Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Associated With</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expiry Date</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {DocumentList.map((doc, index) => {
            const status = getDocumentStatus(doc.valid_upto);

            return (
              <tr key={doc.id}>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {index + 1}
                </td>

                <td className="px-6 py-4 font-medium text-slate-900">
                  {doc.holder_name}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {doc.Document_type || '-'}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {doc.associated_with || '-'}
                </td>

                <td className="px-6 py-4 text-sm text-slate-600">
                  {doc.valid_upto
                    ? format(new Date(doc.valid_upto), 'MMM dd, yyyy')
                    : '-'}
                </td>

                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status.color}`} />
                    <span className={`text-sm font-medium ${status.textColor}`}>
                      {status.text}
                    </span>
                  </div>
                </td>

                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewLog(doc)}
                    >
                      <History className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onMovement(doc, type === 'IN' ? 'OUT' : 'IN')
                      }
                    >
                      {type === 'IN'
                        ? <ArrowUpCircle className="h-4 w-4" />
                        : <ArrowDownCircle className="h-4 w-4" />}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(doc)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(doc.id)}
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
