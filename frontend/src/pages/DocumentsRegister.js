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
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    holder_name: '',
    Document_type: '',
    Document_password: '',
    associated_with: '',
    entity_type: 'firm',
    issue_date: '',
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
<TabsContent value="details" className="mt-4">
  <form onSubmit={handleSubmit} className="space-y-4">

    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="holder_name">
          Name of Document Holder <span className="text-red-500">*</span>
        </Label>
        <Input
          id="holder_name"
          placeholder="Name of certificate holder"
          value={formData.holder_name}
          onChange={(e) =>
            setFormData({ ...formData, holder_name: e.target.value })
          }
          required
          data-testid="Document-holder-name-input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="Document_type">Nature of Document</Label>
        <Input
          id="Document_type"
          placeholder="Enter nature of document"
          value={formData.Document_type}
          onChange={(e) =>
            setFormData({ ...formData, Document_type: e.target.value })
          }
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
          onChange={(e) =>
            setFormData({ ...formData, Document_password: e.target.value })
          }
          data-testid="Document-password-input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="associated_with">
          Associated With (Firm/Client)
        </Label>
        <Input
          id="associated_with"
          placeholder="Firm or client name"
          value={formData.associated_with}
          onChange={(e) =>
            setFormData({ ...formData, associated_with: e.target.value })
          }
          data-testid="Document-associated-input"
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
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

    <div className="space-y-2">
      <Label htmlFor="notes">Notes</Label>
      <Textarea
        id="notes"
        placeholder="Additional notes"
        value={formData.notes}
        onChange={(e) =>
          setFormData({ ...formData, notes: e.target.value })
        }
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
        {loading ? "Saving..." : "Update Document"}
      </Button>
    </DialogFooter>

  </form>
</TabsContent>
/* New Document Form */
<form onSubmit={handleSubmit} className="space-y-4">

  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label htmlFor="holder_name">
        Name of Document Holder <span className="text-red-500">*</span>
      </Label>
      <Input
        id="holder_name"
        placeholder="Name of certificate holder"
        value={formData.holder_name}
        onChange={(e) =>
          setFormData({ ...formData, holder_name: e.target.value })
        }
        required
        data-testid="Document-holder-name-input"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="Document_type">Nature of Document</Label>
      <Input
        id="Document_type"
        placeholder="Enter nature of document"
        value={formData.Document_type}
        onChange={(e) =>
          setFormData({ ...formData, Document_type: e.target.value })
        }
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
        onChange={(e) =>
          setFormData({ ...formData, Document_password: e.target.value })
        }
        data-testid="Document-password-input"
      />
    </div>

    <div className="space-y-2">
      <Label htmlFor="associated_with">
        Associated With (Firm/Client)
      </Label>
      <Input
        id="associated_with"
        placeholder="Firm or client name"
        value={formData.associated_with}
        onChange={(e) =>
          setFormData({ ...formData, associated_with: e.target.value })
        }
        data-testid="Document-associated-input"
      />
    </div>
  </div>

  <div className="grid grid-cols-2 gap-4">
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

  <div className="space-y-2">
    <Label htmlFor="notes">Notes</Label>
    <Textarea
      id="notes"
      placeholder="Additional notes"
      value={formData.notes}
      onChange={(e) =>
        setFormData({ ...formData, notes: e.target.value })
      }
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
<TabsContent value="status" className="mt-4 space-y-4">

  <Card
    className={`p-4 ${
      getDocumentInOutStatus(editingDocument) === "IN"
        ? "bg-emerald-50 border-emerald-200"
        : "bg-red-50 border-red-200"
    }`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-600">Current Status</p>

        <div className="flex items-center gap-2 mt-1">
          {getDocumentInOutStatus(editingDocument) === "IN" ? (
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
      {getDocumentInOutStatus(editingDocument) === "IN"
        ? "Mark as OUT"
        : "Mark as IN"}
    </h4>

    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleMovementInModal();
      }}
      className="space-y-3"
    >

      <div className="space-y-2">
        <Label htmlFor="inline_person">
          {getDocumentInOutStatus(editingDocument) === "IN"
            ? "Taken By *"
            : "Delivered By *"}
        </Label>
        <Input
          id="inline_person"
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="inline_notes">Notes</Label>
        <Input
          id="inline_notes"
          placeholder="Optional notes"
          value={movementData.notes}
          onChange={(e) =>
            setMovementData({
              ...movementData,
              notes: e.target.value,
            })
          }
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className={`w-full ${
          getDocumentInOutStatus(editingDocument) === "IN"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        {getDocumentInOutStatus(editingDocument) === "IN"
          ? "Confirm OUT"
          : "Confirm IN"}
      </Button>

    </form>
  </Card>

</TabsContent>
<TabsContent value="history" className="mt-4">
  <div className="space-y-3 max-h-80 overflow-y-auto">

    {editingDocument?.movement_log &&
    editingDocument.movement_log.length > 0 ? (

      editingDocument.movement_log
        .slice()
        .reverse()
        .map((movement, index) => {

          const movementKey = movement.id || movement.timestamp;
          const isEditing = editingMovement === movementKey;

          return (
            <Card
              key={movementKey}
              className={`p-3 ${
                movement.movement_type === "IN"
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-red-50 border-red-200"
              }`}
            >

              {isEditing ? (

                <div className="space-y-3">

                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium">Status:</Label>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          editMovementData.movement_type === "IN"
                            ? "default"
                            : "outline"
                        }
                        className={
                          editMovementData.movement_type === "IN"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : ""
                        }
                        onClick={() =>
                          setEditMovementData({
                            ...editMovementData,
                            movement_type: "IN",
                          })
                        }
                      >
                        <ArrowDownCircle className="h-4 w-4 mr-1" />
                        IN
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant={
                          editMovementData.movement_type === "OUT"
                            ? "default"
                            : "outline"
                        }
                        className={
                          editMovementData.movement_type === "OUT"
                            ? "bg-red-600 hover:bg-red-700"
                            : ""
                        }
                        onClick={() =>
                          setEditMovementData({
                            ...editMovementData,
                            movement_type: "OUT",
                          })
                        }
                      >
                        <ArrowUpCircle className="h-4 w-4 mr-1" />
                        OUT
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Person Name</Label>
                    <Input
                      value={editMovementData.person_name}
                      onChange={(e) =>
                        setEditMovementData({
                          ...editMovementData,
                          person_name: e.target.value,
                        })
                      }
                      placeholder="Person name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={editMovementData.notes}
                      onChange={(e) =>
                        setEditMovementData({
                          ...editMovementData,
                          notes: e.target.value,
                        })
                      }
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
                      onClick={() =>
                        handleUpdateMovement(movement.id)
                      }
                      disabled={
                        loading || !editMovementData.person_name
                      }
                    >
                      {loading ? "Saving..." : "Save"}
                    </Button>
                  </div>

                </div>

              ) : (

                <div className="flex items-start justify-between">

                  <div className="flex-1">

                    <div className="flex items-center gap-2 mb-1">
                      {movement.movement_type === "IN" ? (
                        <Badge className="bg-emerald-600 text-xs">
                          IN
                        </Badge>
                      ) : (
                        <Badge className="bg-red-600 text-xs">
                          OUT
                        </Badge>
                      )}

                      <span className="text-sm font-medium">
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
                        Edited by {movement.edited_by} on{" "}
                        {format(
                          new Date(movement.edited_at),
                          "MMM dd, yyyy"
                        )}
                      </p>
                    )}

                  </div>

                  <div className="flex flex-col items-end gap-2">

                    <div className="text-xs text-slate-500">
                      {format(
                        new Date(movement.timestamp),
                        "MMM dd, yyyy hh:mm a"
                      )}
                    </div>

                    {movement.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-slate-500 hover:text-indigo-600"
                        onClick={() =>
                          startEditingMovement(movement)
                        }
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
      {/* Movement Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <History className="h-6 w-6" />
              Movement Log
            </DialogTitle>
            <DialogDescription>
              {selectedDocument?.certificate_number} -{" "}
              {selectedDocument?.holder_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {selectedDocument?.movement_log &&
            selectedDocument.movement_log.length > 0 ? (
              selectedDocument.movement_log.map((movement) => (
                <Card
                  key={movement.id || movement.timestamp}
                  className={`p-4 ${
                    movement.movement_type === "IN"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {movement.movement_type === "IN" ? (
                          <Badge className="bg-emerald-600">IN</Badge>
                        ) : (
                          <Badge className="bg-red-600">OUT</Badge>
                        )}
                        <span className="text-sm font-medium">
                          {movement.person_name}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600">
                        {movement.movement_type === "IN"
                          ? "Delivered by"
                          : "Taken by"}{" "}
                        : {movement.person_name}
                      </p>

                      <p className="text-xs text-slate-500">
                        Recorded by: {movement.recorded_by}
                      </p>

                      {movement.notes && (
                        <p className="text-sm text-slate-600 mt-2">
                          {movement.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        {format(
                          new Date(movement.timestamp),
                          "MMM dd, yyyy"
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {format(
                          new Date(movement.timestamp),
                          "hh:mm a"
                        )}
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

    </div>
  );
}
function DocumentTable({
  DocumentList,
  onEdit,
  onDelete,
  onMovement,
  onViewLog,
  type,
}) {
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
            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {DocumentList.map((Document) => (
            <tr
              key={Document.id}
              className="hover:bg-slate-50 transition-colors"
              data-testid={`Document-row-${Document.id}`}
            >
              <td className="px-6 py-4 font-medium text-slate-900">
                {Document.holder_name}
              </td>

              <td className="px-6 py-4 text-sm text-slate-600">
                {Document.Document_type || "-"}
              </td>

              <td className="px-6 py-4 text-sm text-slate-600">
                {Document.associated_with || "-"}
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
                    onClick={() =>
                      onMovement(
                        Document,
                        type === "IN" ? "OUT" : "IN"
                      )
                    }
                    className={
                      type === "IN"
                        ? "hover:bg-red-50 hover:text-red-600"
                        : "hover:bg-emerald-50 hover:text-emerald-600"
                    }
                    title={
                      type === "IN"
                        ? "Mark as OUT"
                        : "Mark as IN"
                    }
                  >
                    {type === "IN" ? (
                      <ArrowUpCircle className="h-4 w-4" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
