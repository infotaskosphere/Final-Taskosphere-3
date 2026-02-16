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
  const [dscList, setDscList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingDSC, setEditingDSC] = useState(null);
  const [selectedDSC, setSelectedDSC] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    holder_name: '',
    dsc_type: '',
    dsc_password: '',
    associated_with: '',
    entity_type: 'firm',
    issue_date: '',
    expiry_date: '',
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
    fetchDSC();
  }, []);

  const fetchDSC = async () => {
    try {
      const response = await api.get('/dsc');
      setDscList(response.data);
    } catch {
      toast.error('Failed to fetch documents');
    }
  };

  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  const getDSCStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    if (daysLeft <= 7) return { color: 'bg-red-500', text: `${daysLeft}d left`, textColor: 'text-red-700' };
    if (daysLeft <= 30) return { color: 'bg-yellow-500', text: `${daysLeft}d left`, textColor: 'text-yellow-700' };
    return { color: 'bg-emerald-500', text: `${daysLeft}d left`, textColor: 'text-emerald-700' };
  };

  const filterBySearch = (dsc) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      dsc.holder_name?.toLowerCase().includes(query) ||
      dsc.dsc_type?.toLowerCase().includes(query) ||
      dsc.associated_with?.toLowerCase().includes(query)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        expiry_date: new Date(formData.expiry_date).toISOString(),
      };

      if (editingDSC) {
        await api.put(`/dsc/${editingDSC.id}`, payload);
        toast.success('Document updated successfully!');
      } else {
        await api.post('/dsc', payload);
        toast.success('Document added successfully!');
      }

      setDialogOpen(false);
      resetForm();
      fetchDSC();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save document');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/dsc/${id}`);
      toast.success('Document deleted successfully!');
      fetchDSC();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const resetForm = () => {
    setFormData({
      holder_name: '',
      dsc_type: '',
      dsc_password: '',
      associated_with: '',
      entity_type: 'firm',
      issue_date: '',
      expiry_date: '',
      notes: '',
    });
    setEditingDSC(null);
  };

  const handleEdit = (dsc) => {
    setEditingDSC(dsc);
    setFormData({
      holder_name: dsc.holder_name,
      dsc_type: dsc.dsc_type || '',
      dsc_password: dsc.dsc_password || '',
      associated_with: dsc.associated_with || '',
      entity_type: dsc.entity_type || 'firm',
      issue_date: format(new Date(dsc.issue_date), 'yyyy-MM-dd'),
      expiry_date: format(new Date(dsc.expiry_date), 'yyyy-MM-dd'),
      notes: dsc.notes || '',
    });
    setDialogOpen(true);
  };

  const openMovementDialog = (dsc, type) => {
    setSelectedDSC(dsc);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };
  const handleMovement = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`Document marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchDSC();
    } catch {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const handleMovementInModal = async () => {
    if (!editingDSC || !movementData.person_name) return;
    setLoading(true);
    try {
      const currentStatus = getDSCInOutStatus(editingDSC);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';

      await api.post(`/dsc/${editingDSC.id}/movement`, {
        ...movementData,
        movement_type: newType,
      });

      toast.success(`Document marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchDSC();
    } catch {
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
        movement_id: movementId,
        movement_type: editMovementData.movement_type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });
      toast.success('Movement updated successfully!');
      setEditingMovement(null);
      fetchDSC();
    } catch {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    setEditingMovement(movement.id);
    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
  };

  const inDSC = dscList.filter(d => getDSCInOutStatus(d) === 'IN' && filterBySearch(d));
  const outDSC = dscList.filter(d => getDSCInOutStatus(d) === 'OUT' && filterBySearch(d));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Document Register</h1>
          <p className="text-slate-600">Manage documents with IN/OUT tracking</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingDSC ? 'Edit Document' : 'Add New Document'}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Document Name *</Label>
                  <Input
                    value={formData.holder_name}
                    onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Document Type</Label>
                  <Input
                    value={formData.dsc_type}
                    onChange={(e) => setFormData({ ...formData, dsc_type: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Access Code</Label>
                  <Input
                    value={formData.dsc_password}
                    onChange={(e) => setFormData({ ...formData, dsc_password: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Associated Client</Label>
                  <Input
                    value={formData.associated_with}
                    onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Date *</Label>
                  <Input
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Expiry Date *</Label>
                  <Input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : editingDSC ? 'Update Document' : 'Add Document'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search by Document Name, type, or client..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">IN ({inDSC.length})</TabsTrigger>
          <TabsTrigger value="out">OUT ({outDSC.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <DSCTable
            dscList={inDSC}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMovement={openMovementDialog}
            getDSCStatus={getDSCStatus}
            type="IN"
          />
        </TabsContent>

        <TabsContent value="out">
          <DSCTable
            dscList={outDSC}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMovement={openMovementDialog}
            getDSCStatus={getDSCStatus}
            type="OUT"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DSCTable({ dscList, onEdit, onDelete, onMovement, getDSCStatus, type }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full border">
        <thead>
          <tr className="bg-slate-100">
            <th className="p-3 text-left">Document Name</th>
            <th className="p-3 text-left">Document Type</th>
            <th className="p-3 text-left">Associated Client</th>
            <th className="p-3 text-left">Expiry Date</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {dscList.map((dsc) => {
            const status = getDSCStatus(dsc.expiry_date);
            return (
              <tr key={dsc.id} className="border-t">
                <td className="p-3">{dsc.holder_name}</td>
                <td className="p-3">{dsc.dsc_type || '-'}</td>
                <td className="p-3">{dsc.associated_with || '-'}</td>
                <td className="p-3">
                  {format(new Date(dsc.expiry_date), 'MMM dd, yyyy')}
                </td>
                <td className="p-3">
                  <Badge className={`${status.color} text-white`}>
                    {status.text}
                  </Badge>
                </td>
                <td className="p-3 text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(dsc)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onMovement(dsc, type === 'IN' ? 'OUT' : 'IN')}
                  >
                    {type === 'IN' ? (
                      <ArrowUpCircle className="h-4 w-4" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(dsc.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
