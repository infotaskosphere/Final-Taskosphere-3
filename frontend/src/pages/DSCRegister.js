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
import { Plus, Edit, Trash2, AlertCircle, ArrowDownCircle, ArrowUpCircle, History, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export default function DSCRegister() {

  // ============================
  // STATE
  // ============================

  const [activeTab, setActiveTab] = useState('in');
  const [dscList, setDscList] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPagesBackend, setTotalPagesBackend] = useState(1);

  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPageIn, setCurrentPageIn] = useState(1);
  const [currentPageOut, setCurrentPageOut] = useState(1);
  const [currentPageExpired, setCurrentPageExpired] = useState(1);

  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);

  const [editingDSC, setEditingDSC] = useState(null);
  const [selectedDSC, setSelectedDSC] = useState(null);
  const [editingMovement, setEditingMovement] = useState(null);

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

  // ============================
  // FETCH DATA (BACKEND DRIVEN)
  // ============================

  const fetchDSC = async (statusParam = activeTab, pageParam = 1) => {
    try {
      const statusMap = {
        in: 'IN',
        out: 'OUT',
        expired: 'EXPIRED'
      };

      const response = await api.get('/dsc', {
        params: {
          status: statusMap[statusParam],
          page: pageParam,
          page_size: rowsPerPage,
          search: searchQuery || undefined
        }
      });

      setDscList(response.data?.data || []);
      setTotalRecords(response.data?.total || 0);

      const pages = Math.ceil((response.data?.total || 0) / rowsPerPage);
      setTotalPagesBackend(pages || 1);

    } catch (error) {
      toast.error('Failed to fetch DSC');
    }
  };

  useEffect(() => {
    fetchDSC(activeTab, 1);
  }, [activeTab, rowsPerPage]);

  // ============================
  // FORM SUBMIT
  // ============================

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
      fetchDSC(activeTab, 1);

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save DSC');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (dscId) => {
    if (!window.confirm('Are you sure you want to delete this DSC?')) return;
    try {
      await api.delete(`/dsc/${dscId}`);
      toast.success('DSC deleted successfully!');
      fetchDSC(activeTab, 1);
    } catch {
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

  // ============================
  // PAGINATION HANDLER
  // ============================

  const handlePageChange = (page) => {
    if (activeTab === 'in') setCurrentPageIn(page);
    if (activeTab === 'out') setCurrentPageOut(page);
    if (activeTab === 'expired') setCurrentPageExpired(page);

    fetchDSC(activeTab, page);
  };

  // ============================
  // STATUS BADGE
  // ============================

  const getDSCStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return { color: 'bg-red-500', text: 'Expired', textColor: 'text-red-700' };
    } else if (daysLeft <= 7) {
      return { color: 'bg-red-500', text: `${daysLeft} Days left`, textColor: 'text-red-700' };
    } else if (daysLeft <= 30) {
      return { color: 'bg-yellow-500', text: `${daysLeft} Days left`, textColor: 'text-yellow-700' };
    }
    return { color: 'bg-emerald-500', text: `${daysLeft} Days left`, textColor: 'text-emerald-700' };
  };

  // ============================
  // RENDER (LAYOUT IDENTICAL)
  // ============================

  return (
    <div className="space-y-6" data-testid="dsc-page">

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value)}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="in" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
            <ArrowDownCircle className="h-4 w-4 mr-2" />
            IN ({activeTab === 'in' ? totalRecords : 0})
          </TabsTrigger>

          <TabsTrigger value="out" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            OUT ({activeTab === 'out' ? totalRecords : 0})
          </TabsTrigger>

          <TabsTrigger value="expired" className="data-[state=active]:bg-amber-700 data-[state=active]:text-white">
            <AlertCircle className="h-4 w-4 mr-2" />
            EXPIRED ({activeTab === 'expired' ? totalRecords : 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card className="border">
            <CardContent className="p-0">
              {dscList.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No DSC certificates found</p>
                </div>
              ) : (
                <>
                  <DSCTable
                    dscList={dscList}
                    onEdit={setEditingDSC}
                    onDelete={handleDelete}
                    getDSCStatus={getDSCStatus}
                  />

                  <Pagination
                    currentPage={
                      activeTab === 'in' ? currentPageIn :
                      activeTab === 'out' ? currentPageOut :
                      currentPageExpired
                    }
                    totalPages={totalPagesBackend}
                    onPageChange={handlePageChange}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================
// PAGINATION COMPONENT
// ============================

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center py-4 border-t border-slate-200">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="mx-2 text-sm text-slate-600">
        Page {currentPage} of {totalPages}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================
// TABLE COMPONENT
// ============================

function DSCTable({ dscList, onEdit, onDelete, getDSCStatus }) {
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-auto border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Holder Name
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Expiry Date
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {dscList.map((dsc) => {
            const status = getDSCStatus(dsc.expiry_date);
            return (
              <tr key={dsc.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {dsc.holder_name}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {dsc.dsc_type || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {format(new Date(dsc.expiry_date), 'MMM dd, yyyy')}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${status.textColor}`}>
                    {status.text}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(dsc)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(dsc.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
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
