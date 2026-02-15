import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DocumentsRegister() {
  const [documents, setDocuments] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  const [formData, setFormData] = useState({
    holder_name: '',
    document_type: '',
    associated_with: '',
    issue_date: '',
    valid_upto: '',
    notes: ''
  });

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    const res = await api.get('/documents');
    setDocuments(res.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...formData,
      issue_date: formData.issue_date ? new Date(formData.issue_date).toISOString() : null,
      valid_upto: formData.valid_upto ? new Date(formData.valid_upto).toISOString() : null
    };

    if (editingDocument) {
      await api.put(`/documents/${editingDocument.id}`, payload);
      toast.success("Document updated");
    } else {
      await api.post("/documents", payload);
      toast.success("Document added");
    }

    setDialogOpen(false);
    setEditingDocument(null);
    fetchDocuments();
  };

  const handleDelete = async (id) => {
    await api.delete(`/documents/${id}`);
    toast.success("Deleted successfully");
    fetchDocuments();
  };

  const handleMovement = async (doc, type) => {
    await api.post(`/documents/${doc.id}/movement`, {
      movement_type: type,
      person_name: "Admin"
    });

    toast.success(`Marked as ${type}`);
    fetchDocuments();
  };

  const inDocs = documents.filter(d => d.current_status === "IN");
  const outDocs = documents.filter(d => d.current_status === "OUT");

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">Documents Register</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Document
        </Button>
      </div>

      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">IN ({inDocs.length})</TabsTrigger>
          <TabsTrigger value="out">OUT ({outDocs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <DocumentTable data={inDocs} onEdit={setEditingDocument} onDelete={handleDelete} onMove={handleMovement} />
        </TabsContent>

        <TabsContent value="out">
          <DocumentTable data={outDocs} onEdit={setEditingDocument} onDelete={handleDelete} onMove={handleMovement} />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen || editingDocument} onOpenChange={() => { setDialogOpen(false); setEditingDocument(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDocument ? "Edit Document" : "Add Document"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input placeholder="Holder Name" required
              value={formData.holder_name}
              onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
            />
            <Input placeholder="Document Type"
              value={formData.document_type}
              onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
            />
            <Input type="date"
              value={formData.issue_date}
              onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
            />
            <Input type="date"
              value={formData.valid_upto}
              onChange={(e) => setFormData({ ...formData, valid_upto: e.target.value })}
            />
            <Textarea placeholder="Notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            <DialogFooter>
              <Button type="submit">{editingDocument ? "Update" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentTable({ data, onEdit, onDelete, onMove }) {
  return (
    <Card>
      <CardContent>
        <table className="w-full">
          <thead>
            <tr>
              <th>Holder</th>
              <th>Type</th>
              <th>Valid Upto</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map(doc => (
              <tr key={doc.id}>
                <td>{doc.holder_name}</td>
                <td>{doc.document_type}</td>
                <td>{doc.valid_upto ? format(new Date(doc.valid_upto), 'MMM dd, yyyy') : '-'}</td>
                <td>
                  <Badge>{doc.current_status}</Badge>
                </td>
                <td className="flex gap-2">
                  <Button size="sm" onClick={() => onMove(doc, doc.current_status === "IN" ? "OUT" : "IN")}>
                    {doc.current_status === "IN" ? <ArrowUpCircle size={16}/> : <ArrowDownCircle size={16}/>}
                  </Button>
                  <Button size="sm" onClick={() => onEdit(doc)}>
                    <Edit size={16}/>
                  </Button>
                  <Button size="sm" onClick={() => onDelete(doc.id)}>
                    <Trash2 size={16}/>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

