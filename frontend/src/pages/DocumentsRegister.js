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

export default function DSCRegister() {
  const [dscList, setDscList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingDSC, setEditingDSC] = useState(null);
  const [selectedDSC, setSelectedDSC] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // Search state

  const [formData, setFormData] = useState({
    holder_name: '',
    dsc_Document Type: '', // Not compulsory
    dsc_Access Code: '', // Second field
    associated_with: '', // Not compulsory
    entity_Document Type: 'firm',
    issue_date: '',
    expiry_date: '',
    notes: '',
  });

  const [movementData, setMovementData] = useState({
    movement_Document Type: 'IN',
    person_name: '',
    notes: '',
  });

  const [editMovementData, setEditMovementData] = useState({
    movement_Document Type: 'IN',
    person_name: '',
    notes: '',
  });

  useEffect(() => {
    fetchDSC();
  }, []);

  const fetchDSC = async () => {
    try {
      const response = await api.get('/dsc');
      setDscList(response.data);
    } catch (error) {
      toast.error('Failed to fetch DSC');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dscData = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        expiry_date: new Date(formData.expiry_date).toISOString(),
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

  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`DSC marked as ${movementData.movement_Document Type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_Document Type: 'IN', person_name: '', notes: '' });
      fetchDSC();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (dsc, Document Type) => {
    setSelectedDSC(dsc);
    setMovementData({ ...movementData, movement_Document Type: Document Type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (dsc) => {
    setSelectedDSC(dsc);
    setLogDialogOpen(true);
  };

  // Helper to get DSC current IN/OUT status
  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  // Handle movement from within the edit modal
  const handleMovementInModal = async () => {
    if (!editingDSC || !movementData.person_name) return;
    setLoading(true);

    try {
      const currentStatus = getDSCInOutStatus(editingDSC);
      const newDocument Type = currentStatus === 'IN' ? 'OUT' : 'IN';
      await api.post(`/dsc/${editingDSC.id}/movement`, {
        ...movementData,
        movement_Document Type: newDocument Type,
      });
      toast.success(`DSC marked as ${newDocument Type}!`);
      setMovementData({ movement_Document Type: 'IN', person_name: '', notes: '' });
      
      // Refresh the DSC data and update editingDSC
      const response = await api.get('/dsc');
      setDscList(response.data);
      const updatedDSC = response.data.find(d => d.id === editingDSC.id);
      if (updatedDSC) {
        setEditingDSC(updatedDSC);
      }
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  // Handle updating an existing movement log entry
  const handleUpdateMovement = async (movementId) => {
    if (!editingDSC || !editMovementData.person_name) return;
    setLoading(true);

    try {
      await api.put(`/dsc/${editingDSC.id}/movement/${movementId}`, {
        movement_id: movementId,
        movement_Document Type: editMovementData.movement_Document Type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);
      
      // Refresh the DSC data and update editingDSC
      const response = await api.get('/dsc');
      setDscList(response.data);
      const updatedDSC = response.data.find(d => d.id === editingDSC.id);
      if (updatedDSC) {
        setEditingDSC(updatedDSC);
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
      movement_Document Type: movement.movement_Document Type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  const handleEdit = (dsc) => {
    setEditingDSC(dsc);
    setFormData({
      holder_name: dsc.holder_name,
      dsc_Document Type: dsc.dsc_Document Type || '',
      dsc_Access Code: dsc.dsc_Access Code || '',
      associated_with: dsc.associated_with || '',
      entity_Document Type: dsc.entity_Document Type || 'firm',
      issue_date: format(new Date(dsc.issue_date), 'yyyy-MM-dd'),
      expiry_date: format(new Date(dsc.expiry_date), 'yyyy-MM-dd'),
      notes: dsc.notes || '',
    });
    setMovementData({ movement_Document Type: 'IN', person_name: '', notes: '' }); // Reset movement data
    setEditingMovement(null); // Reset editing movement
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
    setFormData({
      holder_name: '',
      dsc_Document Type: '',
      dsc_Access Code: '',
      associated_with: '',
      entity_Document Type: 'firm',
      issue_date: '',
      expiry_date: '',
      notes: '',
    });
    setEditingDSC(null);
  };

  const getDSCStatus = (expiryDate) => {
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
  const filterBySearch = (dsc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      dsc.holder_name?.toLowerCase().includes(query) ||
      dsc.dsc_Document Type?.toLowerCase().includes(query) ||
      dsc.associated_with?.toLowerCase().includes(query)
    );
  };

  const inDSC = dscList.filter(dsc => getDSCInOutStatus(dsc) === 'IN' && filterBySearch(dsc));
  const outDSC = dscList.filter(dsc => getDSCInOutStatus(dsc) === 'OUT' && filterBySearch(dsc));

  return (
    <div className="space-y-6" data-testid="dsc-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-outfit text-slate-900">DSC Register</h1>
          <p className="text-slate-600 mt-1">Manage digital signature certificates with IN/OUT tracking</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
              data-testid="add-dsc-btn"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add DSC
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-outfit text-2xl">
                {editingDSC ? 'Edit DSC' : 'Add New DSC'}
              </DialogTitle>
              <DialogDescription>
                {editingDSC ? 'Update DSC details and track IN/OUT status.' : 'Fill in the details to add a new DSC certificate.'}
              </DialogDescription>
            </DialogHeader>
            
            {/* Show tabs only when editing */}
            {editingDSC ? (
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
                        <Label htmlFor="holder_name">Document Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="holder_name"
                          placeholder="Name of certificate holder"
                          value={formData.holder_name}
                          onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                          required
                          data-testid="dsc-holder-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dsc_Document Type">Document Type</Label>
                        <Input
                          id="dsc_Document Type"
                          placeholder="e.g. Class 3, Signature, Encryption"
                          value={formData.dsc_Document Type}
                          onChange={(e) => setFormData({ ...formData, dsc_Document Type: e.target.value })}
                          data-testid="dsc-Document Type-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dsc_Access Code">Access Code</Label>
                        <Input
                          id="dsc_Access Code"
                          Document Type="text"
                          placeholder="DSC Access Code"
                          value={formData.dsc_Access Code}
                          onChange={(e) => setFormData({ ...formData, dsc_Access Code: e.target.value })}
                          data-testid="dsc-Access Code-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                        <Input
                          id="associated_with"
                          placeholder="Firm or client name"
                          value={formData.associated_with}
                          onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                          data-testid="dsc-associated-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="entity_Document Type">Entity Document Type</Label>
                        <Select
                          value={formData.entity_Document Type}
                          onValueChange={(value) => setFormData({ ...formData, entity_Document Type: value })}
                        >
                          <SelectTrigger data-testid="dsc-entity-Document Type-select">
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
                          Document Type="date"
                          value={formData.issue_date}
                          onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                          required
                          data-testid="dsc-issue-date-input"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiry_date">Expiry Date <span className="text-red-500">*</span></Label>
                        <Input
                          id="expiry_date"
                          Document Type="date"
                          value={formData.expiry_date}
                          onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                          required
                          data-testid="dsc-expiry-date-input"
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
                        data-testid="dsc-notes-input"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        Document Type="button"
                        variant="outline"
                        onClick={() => {
                          setDialogOpen(false);
                          resetForm();
                        }}
                        data-testid="dsc-cancel-btn"
                      >
                        Cancel
                      </Button>
                      <Button
                        Document Type="submit"
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-700"
                        data-testid="dsc-submit-btn"
                      >
                        {loading ? 'Saving...' : 'Update DSC'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                
                <TabsContent value="status" className="mt-4 space-y-4">
                  {/* Current Status Display */}
                  <Card className={`p-4 ${getDSCInOutStatus(editingDSC) === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600">Current Status</p>
                        <div className="flex items-center gap-2 mt-1">
                          {getDSCInOutStatus(editingDSC) === 'IN' ? (
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
                      {getDSCInOutStatus(editingDSC) === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    </h4>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      handleMovementInModal();
                    }} className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="inline_person">
                          {getDSCInOutStatus(editingDSC) === 'IN' ? 'Taken By *' : 'Delivered By *'}
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
                        Document Type="submit"
                        disabled={loading}
                        className={getDSCInOutStatus(editingDSC) === 'IN' ? 'bg-red-600 hover:bg-red-700 w-full' : 'bg-emerald-600 hover:bg-emerald-700 w-full'}
                      >
                        {getDSCInOutStatus(editingDSC) === 'IN' ? (
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
                    {editingDSC?.movement_log && editingDSC.movement_log.length > 0 ? (
                      editingDSC.movement_log.slice().reverse().map((movement, index) => {
                        const movementKey = movement.id || movement.timestamp;
                        const isEditing = editingMovement === movementKey;
                        
                        return (
                          <Card key={index} className={`p-3 ${movement.movement_Document Type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            {isEditing ? (
                              // Editing mode
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <Label className="text-sm font-medium">Status:</Label>
                                  <div className="flex gap-2">
                                    <Button
                                      Document Type="button"
                                      size="sm"
                                      variant={editMovementData.movement_Document Type === 'IN' ? 'default' : 'outline'}
                                      className={editMovementData.movement_Document Type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                                      onClick={() => setEditMovementData({ ...editMovementData, movement_Document Type: 'IN' })}
                                    >
                                      <ArrowDownCircle className="h-4 w-4 mr-1" />
                                      IN
                                    </Button>
                                    <Button
                                      Document Type="button"
                                      size="sm"
                                      variant={editMovementData.movement_Document Type === 'OUT' ? 'default' : 'outline'}
                                      className={editMovementData.movement_Document Type === 'OUT' ? 'bg-red-600 hover:bg-red-700' : ''}
                                      onClick={() => setEditMovementData({ ...editMovementData, movement_Document Type: 'OUT' })}
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
                                    Document Type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingMovement(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    Document Type="button"
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
                                    {movement.movement_Document Type === 'IN' ? (
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
                                      Document Type="button"
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
              /* New DSC Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="holder_name">Document Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="holder_name"
                      placeholder="Name of certificate holder"
                      value={formData.holder_name}
                      onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                      required
                      data-testid="dsc-holder-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dsc_Document Type">Document Type</Label>
                    <Input
                      id="dsc_Document Type"
                      placeholder="e.g. Class 3, Signature, Encryption"
                      value={formData.dsc_Document Type}
                      onChange={(e) => setFormData({ ...formData, dsc_Document Type: e.target.value })}
                      data-testid="dsc-Document Type-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dsc_Access Code">Access Code</Label>
                    <Input
                      id="dsc_Access Code"
                      Document Type="text"
                      placeholder="DSC Access Code"
                      value={formData.dsc_Access Code}
                      onChange={(e) => setFormData({ ...formData, dsc_Access Code: e.target.value })}
                      data-testid="dsc-Access Code-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="associated_with">Associated With (Firm/Client)</Label>
                    <Input
                      id="associated_with"
                      placeholder="Firm or client name"
                      value={formData.associated_with}
                      onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                      data-testid="dsc-associated-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entity_Document Type">Entity Document Type</Label>
                    <Select
                      value={formData.entity_Document Type}
                      onValueChange={(value) => setFormData({ ...formData, entity_Document Type: value })}
                    >
                      <SelectTrigger data-testid="dsc-entity-Document Type-select">
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
                      Document Type="date"
                      value={formData.issue_date}
                      onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                      required
                      data-testid="dsc-issue-date-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiry_date">Expiry Date <span className="text-red-500">*</span></Label>
                    <Input
                      id="expiry_date"
                      Document Type="date"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                      required
                      data-testid="dsc-expiry-date-input"
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
                    data-testid="dsc-notes-input"
                  />
                </div>

                <DialogFooter>
                  <Button
                    Document Type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                    data-testid="dsc-cancel-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    Document Type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid="dsc-submit-btn"
                  >
                    {loading ? 'Saving...' : 'Add DSC'}
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
          Document Type="text"
          placeholder="Search by Document Name, type, or client..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-white border-slate-200 focus:border-indigo-500"
          data-testid="dsc-search-input"
        />
      </div>

      {/* IN/OUT Tabs */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="in" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            IN ({inDSC.length})
          </TabsTrigger>
          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            OUT ({outDSC.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in" className="mt-6">
          <Card className="border border-emerald-200 bg-emerald-50/30">
            <CardHeader className="bg-emerald-50 border-b border-emerald-200">
              <CardTitle className="text-sm font-medium text-emerald-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                Document IN - Available ({inDSC.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inDSC.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently IN</p>
                </div>
              ) : (
                <DSCTable dscList={inDSC} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} getDSCStatus={getDSCStatus} Document Type="IN" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out" className="mt-6">
          <Card className="border border-red-200 bg-red-50/30">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-sm font-medium text-red-700 uppercase tracking-wider flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" />
                Document OUT - Taken ({outDSC.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {outDSC.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No documents currently OUT</p>
                </div>
              ) : (
                <DSCTable dscList={outDSC} onEdit={handleEdit} onDelete={handleDelete} onMovement={openMovementDialog} onViewLog={openLogDialog} getDSCStatus={getDSCStatus} Document Type="OUT" />
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
              Mark Document as {movementData.movement_Document Type}
            </DialogTitle>
            <DialogDescription>
              {movementData.movement_Document Type === 'IN' 
                ? 'Record when DSC is delivered/returned' 
                : 'Record when DSC is taken out'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="space-y-2">
              <Label>DSC Certificate</Label>
              <p className="text-sm font-medium">{selectedDSC?.certificate_number} - {selectedDSC?.holder_name}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="person_name">
                {movementData.movement_Document Type === 'IN' ? 'Delivered By *' : 'Taken By *'}
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
              <Button Document Type="button" variant="outline" onClick={() => setMovementDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                Document Type="submit"
                disabled={loading}
                className={movementData.movement_Document Type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {loading ? 'Recording...' : `Mark as ${movementData.movement_Document Type}`}
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
              {selectedDSC?.certificate_number} - {selectedDSC?.holder_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedDSC?.movement_log && selectedDSC.movement_log.length > 0 ? (
              selectedDSC.movement_log.map((movement, index) => (
                <Card key={index} className={`p-4 ${movement.movement_Document Type === 'IN' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {movement.movement_Document Type === 'IN' ? (
                          <Badge className="bg-emerald-600">IN</Badge>
                        ) : (
                          <Badge className="bg-red-600">OUT</Badge>
                        )}
                        <span className="text-sm font-medium">{movement.person_name}</span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {movement.movement_Document Type === 'IN' ? 'Delivered by' : 'Taken by'}: {movement.person_name}
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

      {/* DSC Expiry Alert */}
      {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color !== 'bg-emerald-500').length > 0 && (
        <Card className="border-2 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-orange-900">Attention Required</h3>
                <p className="text-sm text-orange-700 mt-1">
                  {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-red-500').length} certificate(s) expired or expiring within 7 days.
                  {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-yellow-500').length} certificate(s) expiring within 30 days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// DSC Table Component
function DSCTable({ dscList, onEdit, onDelete, onMovement, onViewLog, getDSCStatus, Document Type }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Document Name
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Document Type
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
          {dscList.map((dsc) => {
            const status = getDSCStatus(dsc.expiry_date);
            return (
              <tr
                key={dsc.id}
                className="hover:bg-slate-50 transition-colors"
                data-testid={`dsc-row-${dsc.id}`}
              >
                <td className="px-6 py-4 font-medium text-slate-900">{dsc.holder_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{dsc.dsc_Document Type || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{dsc.associated_with || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {format(new Date(dsc.expiry_date), 'MMM dd, yyyy')}
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
                      onClick={() => onViewLog(dsc)}
                      className="hover:bg-slate-100"
                      title="View Movement Log"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onMovement(dsc, Document Type === 'IN' ? 'OUT' : 'IN')}
                      className={Document Type === 'IN' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-emerald-50 hover:text-emerald-600'}
                      title={Document Type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                    >
                      {Document Type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(dsc)}
                      data-testid={`edit-dsc-${dsc.id}`}
                      className="hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(dsc.id)}
                      data-testid={`delete-dsc-${dsc.id}`}
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
