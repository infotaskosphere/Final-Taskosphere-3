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
import { Plus, Edit, Trash2, AlertCircle, ArrowDownCircle, ArrowUpCircle, History, Search, ChevronLeft, ChevronRight, Key, Shield } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [currentPageIn, setCurrentPageIn] = useState(1);
  const [currentPageOut, setCurrentPageOut] = useState(1);
  const [currentPageExpired, setCurrentPageExpired] = useState(1);
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
    setLoading(true);
    try {
      const response = await api.get('/dsc');
      console.log("API Response:", response.data);
      // ── BUG FIX: Backend returns DSCListResponse { data: [...], total, page, limit }
      const actualData = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.dscs || []);
      setDscList(actualData);
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Failed to fetch DSC');
      setDscList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
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
    e.stopPropagation();
    setLoading(true);
    try {
      await api.post(`/dsc/${selectedDSC.id}/movement`, movementData);
      toast.success(`DSC marked as ${movementData.movement_type}!`);
      setMovementDialogOpen(false);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
      fetchDSC();
    } catch (error) {
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const openMovementDialog = (dsc, type) => {
    setSelectedDSC(dsc);
    setMovementData({ ...movementData, movement_type: type });
    setMovementDialogOpen(true);
  };

  const openLogDialog = (dsc) => {
    setSelectedDSC(dsc);
    setLogDialogOpen(true);
  };

  const getDSCInOutStatus = (dsc) => {
    if (!dsc) return 'OUT';
    if (dsc.current_status) return dsc.current_status;
    return dsc.current_location === 'with_company' ? 'IN' : 'OUT';
  };

  const handleMovementInModal = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!editingDSC || !movementData.person_name) return;
    setLoading(true);
    try {
      const currentStatus = getDSCInOutStatus(editingDSC);
      const newType = currentStatus === 'IN' ? 'OUT' : 'IN';
      await api.post(`/dsc/${editingDSC.id}/movement`, {
        ...movementData,
        movement_type: newType,
      });
      toast.success(`DSC marked as ${newType}!`);
      setMovementData({ movement_type: 'IN', person_name: '', notes: '' });

      const response = await api.get('/dsc');
      const actualData = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.dscs || []);
      setDscList(actualData);
      const updatedDSC = actualData.find(d => d.id === editingDSC.id);
      if (updatedDSC) setEditingDSC(updatedDSC);
    } catch (error) {
      console.error('Movement error:', error);
      toast.error('Failed to record movement');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMovement = async (movementId) => {
    if (!editingDSC || !editMovementData.person_name || !movementId) return;
    setLoading(true);
    try {
      await api.put(`/dsc/${editingDSC.id}/movement/${movementId}`, {
        movement_id: movementId,
        movement_type: editMovementData.movement_type,
        person_name: editMovementData.person_name,
        notes: editMovementData.notes,
      });
      toast.success('Movement log updated successfully!');
      setEditingMovement(null);

      const response = await api.get('/dsc');
      const actualData = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || response.data?.dscs || []);
      setDscList(actualData);
      const updatedDSC = actualData.find(d => d.id === editingDSC.id);
      if (updatedDSC) setEditingDSC(updatedDSC);
    } catch (error) {
      toast.error('Failed to update movement');
    } finally {
      setLoading(false);
    }
  };

  const startEditingMovement = (movement) => {
    const key = movement.id || movement.timestamp;
    setEditingMovement(key);
    setEditMovementData({
      movement_type: movement.movement_type,
      person_name: movement.person_name,
      notes: movement.notes || '',
    });
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
    setMovementData({ movement_type: 'IN', person_name: '', notes: '' });
    setEditingMovement(null);
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

  const getDSCStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
    if (daysLeft <= 7) return { color: 'bg-red-500', text: `${daysLeft}d left`, textColor: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
    if (daysLeft <= 30) return { color: 'bg-yellow-500', text: `${daysLeft}d left`, textColor: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' };
    return { color: 'bg-emerald-500', text: `${daysLeft}d left`, textColor: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
  };

  const filterBySearch = (dsc) => {
    if (!searchQuery.trim()) return true;
    if (!dsc) return false;
    const query = searchQuery.toLowerCase();
    return (
      dsc.holder_name?.toLowerCase().includes(query) ||
      dsc.dsc_type?.toLowerCase().includes(query) ||
      dsc.associated_with?.toLowerCase().includes(query)
    );
  };

  const inDSC = dscList.filter(dsc => {
    const notExpired = new Date(dsc.expiry_date) >= new Date();
    return notExpired && getDSCInOutStatus(dsc) === 'IN' && filterBySearch(dsc);
  }).sort((a, b) => a.holder_name.localeCompare(b.holder_name));

  const outDSC = dscList.filter(dsc => {
    const notExpired = new Date(dsc.expiry_date) >= new Date();
    return notExpired && getDSCInOutStatus(dsc) === 'OUT' && filterBySearch(dsc);
  }).sort((a, b) => a.holder_name.localeCompare(b.holder_name));

  const expiredDSC = dscList.filter(dsc => {
    return new Date(dsc.expiry_date) < new Date() && filterBySearch(dsc);
  }).sort((a, b) => a.holder_name.localeCompare(b.holder_name));

  const paginatedInDSC = inDSC.slice((currentPageIn - 1) * rowsPerPage, currentPageIn * rowsPerPage);
  const paginatedOutDSC = outDSC.slice((currentPageOut - 1) * rowsPerPage, currentPageOut * rowsPerPage);
  const paginatedExpiredDSC = expiredDSC.slice((currentPageExpired - 1) * rowsPerPage, currentPageExpired * rowsPerPage);
  const totalPagesIn = Math.ceil(inDSC.length / rowsPerPage);
  const totalPagesOut = Math.ceil(outDSC.length / rowsPerPage);
  const totalPagesExpired = Math.ceil(expiredDSC.length / rowsPerPage);

  const FormFields = ({ isEdit = false }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Holder Name <span className="text-red-500">*</span>
          </Label>
          <Input id="holder_name" placeholder="Certificate holder name"
            value={formData.holder_name}
            onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
            required data-testid="dsc-holder-name-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Type</Label>
          <Input id="dsc_type" placeholder="e.g. Class 3, Signature"
            value={formData.dsc_type}
            onChange={(e) => setFormData({ ...formData, dsc_type: e.target.value })}
            data-testid="dsc-type-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Password</Label>
          <Input id="dsc_password" type="text" placeholder="DSC Password"
            value={formData.dsc_password}
            onChange={(e) => setFormData({ ...formData, dsc_password: e.target.value })}
            data-testid="dsc-password-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Associated With</Label>
          <Input id="associated_with" placeholder="Firm or client name"
            value={formData.associated_with}
            onChange={(e) => setFormData({ ...formData, associated_with: e.target.value })}
            data-testid="dsc-associated-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Entity Type</Label>
          <Select value={formData.entity_type} onValueChange={(value) => setFormData({ ...formData, entity_type: value })}>
            <SelectTrigger data-testid="dsc-entity-type-select"
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
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Issue Date <span className="text-red-500">*</span>
          </Label>
          <Input id="issue_date" type="date" value={formData.issue_date}
            onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
            required data-testid="dsc-issue-date-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Expiry Date <span className="text-red-500">*</span>
          </Label>
          <Input id="expiry_date" type="date" value={formData.expiry_date}
            onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
            required data-testid="dsc-expiry-date-input"
            className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700" />
        </div>
        <div></div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Notes</Label>
        <Textarea id="notes" placeholder="Additional notes" value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2} data-testid="dsc-notes-input"
          className="rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 focus:bg-white dark:focus:bg-gray-700 resize-none" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 bg-gray-50/50 dark:bg-gray-900 min-h-screen" data-testid="dsc-page">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <Key className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">DSC Register</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage digital signature certificates with IN/OUT tracking</p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 shadow-sm font-medium"
              data-testid="add-dsc-btn">
              <Plus className="mr-2 h-4 w-4" />
              Add DSC
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border-gray-200 dark:border-gray-700"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
                {editingDSC ? 'Edit DSC Certificate' : 'Add New DSC Certificate'}
              </DialogTitle>
              <DialogDescription className="text-gray-500 dark:text-gray-400">
                {editingDSC ? 'Update certificate details and manage IN/OUT status.' : 'Fill in the details to register a new DSC certificate.'}
              </DialogDescription>
            </DialogHeader>

            {editingDSC ? (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1">
                  <TabsTrigger value="details" className="rounded-lg text-sm font-medium">Details</TabsTrigger>
                  <TabsTrigger value="status" className="rounded-lg text-sm font-medium">IN/OUT Status</TabsTrigger>
                  <TabsTrigger value="history" className="rounded-lg text-sm font-medium">History</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <FormFields isEdit />
                    <DialogFooter className="pt-2">
                      <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}
                        className="rounded-xl border-gray-200 dark:border-gray-600" data-testid="dsc-cancel-btn">Cancel</Button>
                      <Button type="submit" disabled={loading}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white" data-testid="dsc-submit-btn">
                        {loading ? 'Saving...' : 'Update DSC'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>

                <TabsContent value="status" className="mt-4 space-y-4">
                  <div className={`p-4 rounded-xl border ${getDSCInOutStatus(editingDSC) === 'IN'
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Current Status</p>
                    <div className="flex items-center gap-2">
                      {getDSCInOutStatus(editingDSC) === 'IN' ? (
                        <>
                          <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
                          <Badge className="bg-emerald-600 text-white">IN — Available</Badge>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="h-5 w-5 text-red-600" />
                          <Badge className="bg-red-600 text-white">OUT — Taken</Badge>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">
                      {getDSCInOutStatus(editingDSC) === 'IN' ? 'Mark as OUT (Issue)' : 'Mark as IN (Return)'}
                    </h4>
                    <form onSubmit={handleMovementInModal} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {getDSCInOutStatus(editingDSC) === 'IN' ? 'Taken By *' : 'Delivered By *'}
                        </Label>
                        <Input id="inline_person" placeholder="Enter person name"
                          value={movementData.person_name}
                          onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })}
                          required className="rounded-lg border-gray-200 dark:border-gray-600" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</Label>
                        <Input id="inline_notes" placeholder="Optional notes"
                          value={movementData.notes}
                          onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })}
                          className="rounded-lg border-gray-200 dark:border-gray-600" />
                      </div>
                      <Button type="submit" disabled={loading} className={`w-full rounded-xl font-medium ${
                        getDSCInOutStatus(editingDSC) === 'IN'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}>
                        {getDSCInOutStatus(editingDSC) === 'IN' ? (
                          <><ArrowUpCircle className="h-4 w-4 mr-2" />Mark as OUT</>
                        ) : (
                          <><ArrowDownCircle className="h-4 w-4 mr-2" />Mark as IN</>
                        )}
                      </Button>
                    </form>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {editingDSC?.movement_log && editingDSC.movement_log.length > 0 ? (
                      editingDSC.movement_log.slice().reverse().map((movement, index) => {
                        const movementKey = movement.id || movement.timestamp;
                        const isEditing = editingMovement === movementKey;
                        return (
                          <div key={index} className={`p-3 rounded-xl border ${
                            movement.movement_type === 'IN'
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40'
                          }`}>
                            {isEditing ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status:</Label>
                                  <div className="flex gap-1.5">
                                    {['IN', 'OUT'].map(t => (
                                      <button key={t} type="button"
                                        onClick={() => setEditMovementData({ ...editMovementData, movement_type: t })}
                                        className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${
                                          editMovementData.movement_type === t
                                            ? t === 'IN' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600'
                                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                        }`}>
                                        {t === 'IN' ? <><ArrowDownCircle className="inline h-3 w-3 mr-1" />IN</> : <><ArrowUpCircle className="inline h-3 w-3 mr-1" />OUT</>}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <Input value={editMovementData.person_name}
                                  onChange={(e) => setEditMovementData({ ...editMovementData, person_name: e.target.value })}
                                  placeholder="Person name" className="rounded-lg text-sm" />
                                <Input value={editMovementData.notes}
                                  onChange={(e) => setEditMovementData({ ...editMovementData, notes: e.target.value })}
                                  placeholder="Notes (optional)" className="rounded-lg text-sm" />
                                <div className="flex gap-2 justify-end">
                                  <Button type="button" size="sm" variant="outline"
                                    className="rounded-lg" onClick={() => setEditingMovement(null)}>Cancel</Button>
                                  <Button type="button" size="sm"
                                    className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => handleUpdateMovement(movement.id)}
                                    disabled={loading || !editMovementData.person_name || !movement.id}>
                                    {loading ? 'Saving...' : 'Save'}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className={`text-xs ${movement.movement_type === 'IN' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
                                      {movement.movement_type}
                                    </Badge>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{movement.person_name}</span>
                                  </div>
                                  {movement.notes && <p className="text-xs text-gray-500 dark:text-gray-400">{movement.notes}</p>}
                                  {movement.edited_at && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      Edited by {movement.edited_by}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    {format(new Date(movement.timestamp), 'MMM dd, hh:mm a')}
                                  </span>
                                  {movement.id && (
                                    <button type="button"
                                      className="text-xs text-blue-500 dark:text-blue-400 hover:underline font-medium"
                                      onClick={() => startEditingMovement(movement)}>
                                      Edit
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                        <History className="h-10 w-10 mx-auto mb-2 text-gray-200 dark:text-gray-600" />
                        <p className="text-sm">No movement history yet</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormFields />
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}
                    className="rounded-xl border-gray-200 dark:border-gray-600" data-testid="dsc-cancel-btn">Cancel</Button>
                  <Button type="submit" disabled={loading}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white" data-testid="dsc-submit-btn">
                    {loading ? 'Saving...' : 'Add DSC'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Stats Summary ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Available (IN)', value: inDSC.length, color: 'emerald', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-700 dark:text-emerald-400', icon: ArrowDownCircle },
          { label: 'Taken Out', value: outDSC.length, color: 'red', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800/40', text: 'text-red-700 dark:text-red-400', icon: ArrowUpCircle },
          { label: 'Expired', value: expiredDSC.length, color: 'amber', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/40', text: 'text-amber-700 dark:text-amber-400', icon: AlertCircle },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border p-4 ${stat.bg} ${stat.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`h-4 w-4 ${stat.text}`} />
              <span className={`text-xs font-semibold uppercase tracking-wide ${stat.text}`}>{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.text}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={rowsPerPage.toString()} onValueChange={(value) => setRowsPerPage(Number(value))}>
          <SelectTrigger className="w-36 rounded-xl border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
            <SelectValue placeholder="Rows" />
          </SelectTrigger>
          <SelectContent>
            {[15, 30, 50, 100].map(n => <SelectItem key={n} value={n.toString()}>{n} rows</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input type="text" placeholder="Search holder, type, or company..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
            data-testid="dsc-search-input" />
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="in" className="w-full">
        <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700 w-fit">
          <TabsTrigger value="in"
            className="rounded-lg px-5 font-medium data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <ArrowDownCircle className="h-3.5 w-3.5 mr-1.5" />
            IN ({inDSC.length})
          </TabsTrigger>
          <TabsTrigger value="out"
            className="rounded-lg px-5 font-medium data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />
            OUT ({outDSC.length})
          </TabsTrigger>
          <TabsTrigger value="expired"
            className="rounded-lg px-5 font-medium data-[state=active]:bg-amber-600 data-[state=active]:text-white">
            <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
            EXPIRED ({expiredDSC.length})
          </TabsTrigger>
        </TabsList>

        {[
          { val: 'in', list: paginatedInDSC, full: inDSC, pages: totalPagesIn, page: currentPageIn, setPage: setCurrentPageIn, type: 'IN',
            headerBg: 'bg-emerald-50 dark:bg-emerald-900/10', headerBorder: 'border-emerald-200 dark:border-emerald-800/40',
            headerText: 'text-emerald-700 dark:text-emerald-400', cardBorder: 'border-emerald-200 dark:border-emerald-800/40', Icon: ArrowDownCircle },
          { val: 'out', list: paginatedOutDSC, full: outDSC, pages: totalPagesOut, page: currentPageOut, setPage: setCurrentPageOut, type: 'OUT',
            headerBg: 'bg-red-50 dark:bg-red-900/10', headerBorder: 'border-red-200 dark:border-red-800/40',
            headerText: 'text-red-700 dark:text-red-400', cardBorder: 'border-red-200 dark:border-red-800/40', Icon: ArrowUpCircle },
          { val: 'expired', list: paginatedExpiredDSC, full: expiredDSC, pages: totalPagesExpired, page: currentPageExpired, setPage: setCurrentPageExpired, type: 'EXPIRED',
            headerBg: 'bg-amber-50 dark:bg-amber-900/10', headerBorder: 'border-amber-200 dark:border-amber-800/40',
            headerText: 'text-amber-700 dark:text-amber-400', cardBorder: 'border-amber-200 dark:border-amber-800/40', Icon: AlertCircle },
        ].map(tab => (
          <TabsContent key={tab.val} value={tab.val} className="mt-4">
            <Card className={`rounded-2xl border shadow-sm ${tab.cardBorder} bg-white dark:bg-gray-800`}>
              <CardHeader className={`py-3 px-5 ${tab.headerBg} border-b ${tab.headerBorder} rounded-t-2xl`}>
                <CardTitle className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${tab.headerText}`}>
                  <tab.Icon className="h-3.5 w-3.5" />
                  DSC {tab.type} — {tab.full.length} Certificate{tab.full.length !== 1 ? 's' : ''}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tab.list.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                    <Shield className="h-10 w-10 mx-auto mb-2 text-gray-200 dark:text-gray-600" />
                    <p className="text-sm">No DSC certificates in this category</p>
                  </div>
                ) : (
                  <>
                    <DSCTable dscList={tab.list} onEdit={handleEdit} onDelete={handleDelete}
                      onMovement={openMovementDialog} onViewLog={openLogDialog}
                      getDSCStatus={getDSCStatus} type={tab.type}
                      globalIndexStart={(tab.page - 1) * rowsPerPage} />
                    <Pagination currentPage={tab.page} totalPages={tab.pages} onPageChange={tab.setPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Movement Dialog ── */}
      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent
          className="rounded-2xl border-gray-200 dark:border-gray-700"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
              Mark DSC as {movementData.movement_type}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {movementData.movement_type === 'IN' ? 'Record certificate return/delivery' : 'Record certificate issuance'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMovement} className="space-y-4">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide mb-0.5">Certificate</p>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">{selectedDSC?.holder_name}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                {movementData.movement_type === 'IN' ? 'Delivered By *' : 'Taken By *'}
              </Label>
              <Input id="person_name" placeholder="Enter person name"
                value={movementData.person_name}
                onChange={(e) => setMovementData({ ...movementData, person_name: e.target.value })}
                required className="rounded-xl border-gray-200 dark:border-gray-600" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Notes</Label>
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
              <History className="h-5 w-5 text-blue-500" />
              Movement History
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {selectedDSC?.holder_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {selectedDSC?.movement_log && selectedDSC.movement_log.length > 0 ? (
              selectedDSC.movement_log.map((movement, index) => (
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
                        {movement.recorded_by && ` · Recorded by: ${movement.recorded_by}`}
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

      {/* ── Attention Banner ── */}
      {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color !== 'bg-emerald-500').length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/15">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-orange-900 dark:text-orange-300 text-sm">Attention Required</h3>
            <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5">
              {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-red-500').length} certificate(s) expired or expiring within 7 days.{' '}
              {dscList.filter(dsc => getDSCStatus(dsc.expiry_date).color === 'bg-yellow-500').length} expiring within 30 days.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center py-4 border-t border-gray-100 dark:border-gray-700/60 gap-3">
      <Button variant="ghost" size="sm" onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1} className="h-8 w-8 p-0 rounded-lg">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
        Page {currentPage} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages} className="h-8 w-8 p-0 rounded-lg">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DSCTable({ dscList, onEdit, onDelete, onMovement, onViewLog, getDSCStatus, type, globalIndexStart }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700/60">
            {['#', 'Holder Name', 'Type', 'Associated With', 'Expiry Date', 'Status', ''].map((h, i) => (
              <th key={i} className={`px-4 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ${i === 6 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
          {dscList.map((dsc, index) => {
            const status = getDSCStatus(dsc.expiry_date);
            return (
              <tr key={dsc.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors" data-testid={`dsc-row-${dsc.id}`}>
                <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 w-10">
                  {globalIndexStart + index + 1}
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{dsc.holder_name}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{dsc.dsc_type || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{dsc.associated_with || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {format(new Date(dsc.expiry_date), 'MMM dd, yyyy')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></div>
                    <span className={`text-xs font-semibold ${status.textColor}`}>{status.text}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => onViewLog(dsc)} title="View History"
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      <History className="h-4 w-4" />
                    </button>
                    {type !== 'EXPIRED' && (
                      <button onClick={() => onMovement(dsc, type === 'IN' ? 'OUT' : 'IN')}
                        title={type === 'IN' ? 'Mark as OUT' : 'Mark as IN'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          type === 'IN'
                            ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400'
                            : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                        }`}>
                        {type === 'IN' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                      </button>
                    )}
                    <button onClick={() => onEdit(dsc)} title="Edit"
                      className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 dark:text-blue-400 transition-colors">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => onDelete(dsc.id)} title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
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
