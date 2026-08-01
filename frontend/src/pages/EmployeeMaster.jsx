// EmployeeMaster.jsx — People Matrix HRMS Phase 1.
//
// Three tabs backed by backend/hr_core.py:
//   • Employees    → reads/writes the EXISTING users collection (no new
//                    employee store — this is a richer view over Users).
//   • Departments   → new "departments" collection.
//   • Designations  → new "designations" collection.
//
// Permission gating mirrors every other People Matrix page: the route is
// wrapped in <PageGuard module="people_matrix" page="can_view_hr"> (see
// AppRoutes.jsx), and every create/edit/delete action here additionally
// checks can_manage_hr via useAuth().hasPermission — the same flags the
// Permission Governance matrix already exposes for "HR".
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Pencil, Trash2, Plus, Loader2, Users2, Building2, IdCard, Search,
} from 'lucide-react';

const EMPTY_EMPLOYEE_FORM = {
  employee_code: '', designation: '', department_id: '', reporting_manager_id: '',
  employment_type: '', grade: '', cost_centre: '',
  joining_date: '', confirmation_date: '', training_period_end: '', payroll_date: '',
  monthly_salary: '',
  pan_number: '', aadhaar_number: '', uan_number: '', pf_number: '', esic_number: '',
  bank_account_number: '', bank_name: '', ifsc_code: '',
};

const EMPTY_DEPT_FORM = { name: '', code: '', description: '', head_user_id: '' };
const EMPTY_DESIG_FORM = { title: '', department_id: '', grade: '', description: '' };

export default function EmployeeMaster() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('can_manage_hr');

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, deptRes, desigRes] = await Promise.all([
        api.get('/people-matrix/employees'),
        api.get('/people-matrix/departments'),
        api.get('/people-matrix/designations'),
      ]);
      setEmployees(empRes.data || []);
      setDepartments(deptRes.data || []);
      setDesignations(desigRes.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load Employee Master data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deptById = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments]);
  const empById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      [e.full_name, e.email, e.employee_code, e.designation]
        .filter(Boolean).some(v => v.toLowerCase().includes(q))
    );
  }, [employees, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6" /> Employee Master
          </h1>
          <p className="text-sm text-muted-foreground">
            Employee records, Departments and Designations for People Matrix.
          </p>
        </div>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <EmployeesTab
            loading={loading}
            employees={filteredEmployees}
            departments={departments}
            deptById={deptById}
            empById={empById}
            search={search}
            setSearch={setSearch}
            canManage={canManage}
            onSaved={fetchAll}
          />
        </TabsContent>

        <TabsContent value="departments">
          <DepartmentsTab
            loading={loading}
            departments={departments}
            employees={employees}
            canManage={canManage}
            onSaved={fetchAll}
          />
        </TabsContent>

        <TabsContent value="designations">
          <DesignationsTab
            loading={loading}
            designations={designations}
            departments={departments}
            deptById={deptById}
            canManage={canManage}
            onSaved={fetchAll}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// EMPLOYEES TAB
// ─────────────────────────────────────────────────────────────────────────
function EmployeesTab({ loading, employees, departments, deptById, empById, search, setSearch, canManage, onSaved }) {
  const [editing, setEditing] = useState(null); // employee object or null
  const [form, setForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [saving, setSaving] = useState(false);

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({
      ...EMPTY_EMPLOYEE_FORM,
      ...Object.fromEntries(
        Object.keys(EMPTY_EMPLOYEE_FORM).map(k => [k, emp[k] ?? ''])
      ),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.monthly_salary === '') delete payload.monthly_salary;
      else payload.monthly_salary = parseFloat(payload.monthly_salary);
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      await api.put(`/people-matrix/employees/${editing.id}`, payload);
      toast.success('Employee record updated');
      setEditing(null);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, employee code, designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Reports To</TableHead>
                <TableHead>Joining Date</TableHead>
                <TableHead>Monthly Salary</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="font-medium">{emp.full_name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{emp.email}</div>
                  </TableCell>
                  <TableCell>{emp.employee_code || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{emp.designation || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {emp.department_id
                      ? <Badge variant="outline">{deptById[emp.department_id]?.name || 'Unknown'}</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{empById[emp.reporting_manager_id]?.full_name || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{emp.joining_date || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{emp.monthly_salary != null ? `₹${emp.monthly_salary.toLocaleString('en-IN')}` : <span className="text-muted-foreground">—</span>}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee — {editing?.full_name}</DialogTitle>
            <DialogDescription>
              Employee Master fields only. Email, password and role are managed on the Users page.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              <FieldGroup title="Role & Reporting">
                <Field label="Employee Code"><Input value={form.employee_code} onChange={v => setForm(f => ({ ...f, employee_code: v }))} /></Field>
                <Field label="Designation"><Input value={form.designation} onChange={v => setForm(f => ({ ...f, designation: v }))} /></Field>
                <Field label="Department">
                  <Select value={form.department_id || undefined} onValueChange={v => setForm(f => ({ ...f, department_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Reporting Manager">
                  <Select value={form.reporting_manager_id || undefined} onValueChange={v => setForm(f => ({ ...f, reporting_manager_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      {Object.values(empById).filter(e => e.id !== editing.id).map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Employment Type">
                  <Select value={form.employment_type || undefined} onValueChange={v => setForm(f => ({ ...f, employment_type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {['full_time', 'part_time', 'contract', 'intern'].map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Grade"><Input value={form.grade} onChange={v => setForm(f => ({ ...f, grade: v }))} /></Field>
                <Field label="Cost Centre"><Input value={form.cost_centre} onChange={v => setForm(f => ({ ...f, cost_centre: v }))} /></Field>
              </FieldGroup>

              <FieldGroup title="Employment Dates & Salary">
                <Field label="Joining Date"><Input type="date" value={form.joining_date} onChange={v => setForm(f => ({ ...f, joining_date: v }))} /></Field>
                <Field label="Confirmation Date"><Input type="date" value={form.confirmation_date} onChange={v => setForm(f => ({ ...f, confirmation_date: v }))} /></Field>
                <Field label="Training Period End"><Input type="date" value={form.training_period_end} onChange={v => setForm(f => ({ ...f, training_period_end: v }))} /></Field>
                <Field label="Payroll Date"><Input type="date" value={form.payroll_date} onChange={v => setForm(f => ({ ...f, payroll_date: v }))} /></Field>
                <Field label="Monthly Salary (₹)"><Input type="number" value={form.monthly_salary} onChange={v => setForm(f => ({ ...f, monthly_salary: v }))} /></Field>
              </FieldGroup>

              <FieldGroup title="Statutory IDs">
                <Field label="PAN"><Input value={form.pan_number} onChange={v => setForm(f => ({ ...f, pan_number: v }))} /></Field>
                <Field label="Aadhaar"><Input value={form.aadhaar_number} onChange={v => setForm(f => ({ ...f, aadhaar_number: v }))} /></Field>
                <Field label="UAN (PF)"><Input value={form.uan_number} onChange={v => setForm(f => ({ ...f, uan_number: v }))} /></Field>
                <Field label="PF Number"><Input value={form.pf_number} onChange={v => setForm(f => ({ ...f, pf_number: v }))} /></Field>
                <Field label="ESIC Number"><Input value={form.esic_number} onChange={v => setForm(f => ({ ...f, esic_number: v }))} /></Field>
              </FieldGroup>

              <FieldGroup title="Bank Details">
                <Field label="Account Number"><Input value={form.bank_account_number} onChange={v => setForm(f => ({ ...f, bank_account_number: v }))} /></Field>
                <Field label="Bank Name"><Input value={form.bank_name} onChange={v => setForm(f => ({ ...f, bank_name: v }))} /></Field>
                <Field label="IFSC Code"><Input value={form.ifsc_code} onChange={v => setForm(f => ({ ...f, ifsc_code: v }))} /></Field>
              </FieldGroup>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DEPARTMENTS TAB
// ─────────────────────────────────────────────────────────────────────────
function DepartmentsTab({ loading, departments, employees, canManage, onSaved }) {
  const [editing, setEditing] = useState(null); // 'new' | department object | null
  const [form, setForm] = useState(EMPTY_DEPT_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing('new'); setForm(EMPTY_DEPT_FORM); };
  const openEdit = (d) => { setEditing(d); setForm({ name: d.name || '', code: d.code || '', description: d.description || '', head_user_id: d.head_user_id || '' }); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (editing === 'new') {
        await api.post('/people-matrix/departments', payload);
        toast.success('Department created');
      } else {
        await api.put(`/people-matrix/departments/${editing.id}`, payload);
        toast.success('Department updated');
      }
      setEditing(null);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete department "${d.name}"?`)) return;
    try {
      await api.delete(`/people-matrix/departments/${d.id}`);
      toast.success('Department deleted');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete department');
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {canManage && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Department</Button>
        )}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Description</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{d.name}</TableCell>
                  <TableCell>{d.code || '—'}</TableCell>
                  <TableCell>{employees.find(e => e.id === d.head_user_id)?.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{d.description || '—'}</TableCell>
                  {canManage && (
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {departments.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No departments yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'New Department' : 'Edit Department'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Name"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} /></Field>
            <Field label="Code"><Input value={form.code} onChange={v => setForm(f => ({ ...f, code: v }))} /></Field>
            <Field label="Head of Department">
              <Select value={form.head_user_id || undefined} onValueChange={v => setForm(f => ({ ...f, head_user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description"><Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DESIGNATIONS TAB
// ─────────────────────────────────────────────────────────────────────────
function DesignationsTab({ loading, designations, departments, deptById, canManage, onSaved }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DESIG_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing('new'); setForm(EMPTY_DESIG_FORM); };
  const openEdit = (d) => { setEditing(d); setForm({ title: d.title || '', department_id: d.department_id || '', grade: d.grade || '', description: d.description || '' }); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (editing === 'new') {
        await api.post('/people-matrix/designations', payload);
        toast.success('Designation created');
      } else {
        await api.put(`/people-matrix/designations/${editing.id}`, payload);
        toast.success('Designation updated');
      }
      setEditing(null);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save designation');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete designation "${d.title}"?`)) return;
    try {
      await api.delete(`/people-matrix/designations/${d.id}`);
      toast.success('Designation deleted');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete designation');
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {canManage && (
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Designation</Button>
        )}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Description</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {designations.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium flex items-center gap-2"><IdCard className="h-4 w-4 text-muted-foreground" />{d.title}</TableCell>
                  <TableCell>{d.department_id ? (deptById[d.department_id]?.name || 'Unknown') : '—'}</TableCell>
                  <TableCell>{d.grade || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{d.description || '—'}</TableCell>
                  {canManage && (
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {designations.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No designations yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'New Designation' : 'Edit Designation'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Title"><Input value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} /></Field>
            <Field label="Department (optional)">
              <Select value={form.department_id || undefined} onValueChange={v => setForm(f => ({ ...f, department_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Any department" /></SelectTrigger>
                <SelectContent>
                  {departments.map(dep => <SelectItem key={dep.id} value={dep.id}>{dep.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Grade"><Input value={form.grade} onChange={v => setForm(f => ({ ...f, grade: v }))} /></Field>
            <Field label="Description"><Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Small shared form helpers
// ─────────────────────────────────────────────────────────────────────────
function FieldGroup({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  // Clones the single Input/Select child to wire up value/onChange as plain
  // (label, value) props without every call-site repeating boilerplate.
  const child = React.Children.only(children);
  const isInput = child.type?.displayName === 'Input' || child.type === undefined;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {React.cloneElement(child, isInput ? {
        onChange: (e) => child.props.onChange(e.target.value),
      } : {})}
    </div>
  );
}
