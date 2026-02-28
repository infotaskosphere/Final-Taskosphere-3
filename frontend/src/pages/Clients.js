import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import {
  Plus,
  Edit,
  Trash2,
  Mail,
  Briefcase,
  MessageCircle,
  Users,
  Archive,
  BarChart3,
  Cake,
  Search,
} from "lucide-react";

import { format } from "date-fns";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid as Grid } from "react-window";
import { toast } from "sonner";
import api from "@/lib/api";

/* ===========================================================
 CONSTANTS
=========================================================== */

const CLIENT_TYPES = [
  { value: "proprietor", label: "Proprietor" },
  { value: "pvt_ltd", label: "Private Limited" },
  { value: "llp", label: "LLP" },
  { value: "partnership", label: "Partnership" },
  { value: "huf", label: "HUF" },
  { value: "trust", label: "Trust" },
];

const SERVICES = [
  "GST",
  "Trademark",
  "Income Tax",
  "ROC",
  "Audit",
  "Compliance",
  "Company Registration",
  "Tax Planning",
  "Accounting",
  "Payroll",
  "Other",
];

/* ===========================================================
 MAIN COMPONENT
=========================================================== */

export default function Clients() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const canDeleteData = hasPermission("can_delete_data");
  const canViewAllClients = hasPermission("can_view_all_clients");
  const canAssignClients = hasPermission("can_assign_clients");

  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  const [previewData, setPreviewData] = useState([]);
  const [previewHeaders, setPreviewHeaders] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [otherService, setOtherService] = useState("");

  const [formData, setFormData] = useState(initialForm());

  /* ===========================================================
   INITIAL FORM
  =========================================================== */

  function initialForm() {
    return {
      company_name: "",
      client_type: "proprietor",
      email: "",
      phone: "",
      birthday: "",
      services: [],
      dsc_details: [],
      assigned_to: "unassigned",
      notes: "",
      status: "active",
      contact_persons: [
        {
          name: "",
          email: "",
          phone: "",
          designation: "",
          birthday: "",
          din: "",
        },
      ],
    };
  }

  /* ===========================================================
   EFFECTS
  =========================================================== */

  useEffect(() => {
    fetchClients();
    if (canAssignClients) fetchUsers();

    const params = new URLSearchParams(location.search);
    if (params.get("openAddClient") === "true") {
      setDialogOpen(true);
    }
  }, [location.search, canAssignClients]);

  /* ===========================================================
   FETCH
  =========================================================== */

  const fetchClients = async () => {
    try {
      const res = await api.get("/clients");
      setClients(res.data || []);
    } catch {
      toast.error("Failed to fetch clients");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch {}
  };

  /* ===========================================================
   STATS
  =========================================================== */

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter(
      (c) => (c?.status || "active") === "active"
    ).length;

    const serviceCounts = {};
    clients.forEach((c) => {
      if (c.services) {
        c.services.forEach((s) => {
          const name = s.startsWith("Other:") ? "Other" : s;
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
      }
    });

    return { totalClients, activeClients, serviceCounts };
  }, [clients]);

  /* ===========================================================
   FILTER
  =========================================================== */

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        (c.company_name || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone || "").includes(searchTerm);

      const matchesService =
        serviceFilter === "all" ||
        (c.services || []).some((s) =>
          s.toLowerCase().includes(serviceFilter.toLowerCase())
        );

      const matchesStatus =
        statusFilter === "all" ||
        (c.status || "active") === statusFilter;

      return matchesSearch && matchesService && matchesStatus;
    });
  }, [clients, searchTerm, serviceFilter, statusFilter]);

  /* ===========================================================
   UTILITY FUNCTIONS
  =========================================================== */

  const getClientNumber = (index) =>
    String(index + 1).padStart(3, "0");

  const openWhatsApp = (phone, name = "") => {
    const cleanPhone = phone?.replace(/\D/g, "") || "";
    const message = encodeURIComponent(
      `Hello ${name}, this is Manthan Desai's office regarding your services.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
  };

  /* ===========================================================
   FORM HANDLERS
  =========================================================== */

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalServices = [...formData.services];

      finalServices = finalServices.filter(
        (s) => !s.startsWith("Other:")
      );

      if (otherService.trim() && formData.services.includes("Other")) {
        finalServices.push(`Other: ${otherService.trim()}`);
      }

      const payload = {
        company_name: formData.company_name?.trim() || "",
        client_type: formData.client_type || "proprietor",
        email: formData.email?.trim() || "",
        phone: formData.phone?.replace(/\D/g, "") || "",
        birthday: formData.birthday || null,
        services: finalServices,
        notes: formData.notes?.trim() || null,
        status: formData.status || "active",
        assigned_to:
          formData.assigned_to === "unassigned"
            ? null
            : formData.assigned_to,
        contact_persons:
          formData.contact_persons?.map((cp) => ({
            name: cp.name || "",
            email: cp.email?.trim() || null,
            phone: cp.phone?.replace(/\D/g, "") || null,
            designation: cp.designation || null,
            birthday: cp.birthday || null,
            din: cp.din || null,
          })) || [],
        dsc_details: formData.dsc_details || [],
      };

      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload);
      } else {
        await api.post("/clients", payload);
      }

      toast.success("Client saved successfully");
      setDialogOpen(false);
      setEditingClient(null);
      setFormData(initialForm());
      setOtherService("");
      fetchClients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error saving client");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);

    setFormData({
      company_name: client.company_name || "",
      client_type: client.client_type || "proprietor",
      email: client.email || "",
      phone: client.phone || "",
      birthday: client.birthday
        ? format(new Date(client.birthday), "yyyy-MM-dd")
        : "",
      services: client.services || [],
      notes: client.notes || "",
      status: client.status || "active",
      assigned_to: client.assigned_to || "unassigned",
      contact_persons:
        client.contact_persons?.length > 0
          ? client.contact_persons.map((cp) => ({
              name: cp.name || "",
              email: cp.email || "",
              phone: cp.phone || "",
              designation: cp.designation || "",
              birthday: cp.birthday
                ? format(new Date(cp.birthday), "yyyy-MM-dd")
                : "",
              din: cp.din || "",
            }))
          : [
              {
                name: "",
                email: "",
                phone: "",
                designation: "",
                birthday: "",
                din: "",
              },
            ],
      dsc_details: client.dsc_details || [],
    });

    const other = client.services?.find((s) =>
      s.startsWith("Other:")
    );
    setOtherService(other ? other.replace("Other: ", "") : "");

    setDialogOpen(true);
  };

  /* ===========================================================
   SERVICE TOGGLE
  =========================================================== */

  const toggleService = (service) => {
    setFormData((prev) => {
      const exists = prev.services.includes(service);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((s) => s !== service)
          : [...prev.services, service],
      };
    });
  };

  /* ===========================================================
   CSV IMPORT
  =========================================================== */

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let success = 0;

        for (let row of results.data) {
          if (!row.company_name || !row.email || !row.phone) continue;

          try {
            await api.post("/clients", {
              company_name: row.company_name.trim(),
              client_type: row.client_type || "proprietor",
              email: row.email.trim(),
              phone: row.phone.replace(/\D/g, ""),
              birthday: row.birthday || null,
              services: row.services
                ? row.services.split(",").map((s) => s.trim())
                : [],
              notes: row.notes || null,
              assigned_to: null,
              contact_persons: [],
              dsc_details: [],
            });
            success++;
          } catch {}
        }

        toast.success(`${success} clients imported`);
        setImportLoading(false);
        fetchClients();
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  /* ===========================================================
   EXCEL IMPORT + PREVIEW
  =========================================================== */

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const workbook = XLSX.read(event.target.result, {
        type: "binary",
      });

      const rows = [];

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        data.forEach((row) => {
          rows.push({
            sheet: sheetName,
            company_name: row.company_name || "",
            client_type: row.client_type || "proprietor",
            email: row.email || "",
            phone: row.phone || "",
            birthday: row.birthday || "",
            services: row.services || "",
            notes: row.notes || "",
          });
        });
      });

      setPreviewHeaders([
        "sheet",
        "company_name",
        "client_type",
        "email",
        "phone",
        "birthday",
        "services",
        "notes",
      ]);

      setPreviewData(rows);
      setPreviewOpen(true);
    };

    reader.readAsBinaryString(file);
  };

  /* ===========================================================
   CONFIRM IMPORT
  =========================================================== */

  const confirmPreviewImport = async () => {
    setImportLoading(true);
    let success = 0;

    for (let row of previewData) {
      if (!row.company_name || !row.email || !row.phone) continue;

      try {
        await api.post("/clients", {
          company_name: row.company_name?.trim(),
          client_type: row.client_type || "proprietor",
          email: row.email?.trim(),
          phone: row.phone?.replace(/\D/g, ""),
          birthday: row.birthday || null,
          services: row.services
            ? row.services.split(",").map((s) => s.trim())
            : [],
          notes: row.notes || null,
          assigned_to: null,
          contact_persons: [],
          dsc_details: [],
        });
        success++;
      } catch {}
    }

    toast.success(`${success} clients imported`);
    setPreviewOpen(false);
    setImportLoading(false);
    fetchClients();
  };

  /* ===========================================================
   CLIENT CARD
  =========================================================== */

  const ClientCard = ({ columnIndex, rowIndex, style, columnCount }) => {
    const index = rowIndex * columnCount + columnIndex;
    const client = filteredClients[index];
    if (!client) return null;

    return (
      <div style={style} className="p-3">
        <Card
          onClick={() => navigate(`/clients/${client.id}`)}
          className="h-full rounded-2xl border border-slate-200 bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer relative"
        >
          <div className="absolute left-0 top-0 h-full w-1 bg-indigo-600" />

          <div className="p-4 flex flex-col h-full">
            <div className="flex justify-between items-start">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {client.company_name}
              </h3>

              <span
                className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                  client.status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {client.status === "active" ? "Active" : "Archived"}
              </span>
            </div>

            <p className="text-[10px] uppercase text-slate-500 mt-1">
              {
                CLIENT_TYPES.find(
                  (t) => t.value === client.client_type
                )?.label
              }
            </p>

            <div className="mt-3 space-y-1 text-xs text-slate-600 flex-1">
              <div className="flex items-center gap-2">
                <Briefcase className="h-3 w-3 text-slate-400" />
                {client.phone || "—"}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3 text-slate-400" />
                {client.email || "—"}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {(client.services || []).slice(0, 2).map((s) => (
                <Badge
                  key={s}
                  className="text-[10px] bg-indigo-50 text-indigo-700"
                >
                  {s.replace("Other: ", "")}
                </Badge>
              ))}
              {client.services?.length > 2 && (
                <Badge className="text-[10px] bg-slate-100 text-slate-600">
                  +{client.services.length - 2}
                </Badge>
              )}
            </div>

            <div
              className="mt-4 border-t pt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() =>
                  openWhatsApp(client.phone, client.company_name)
                }
                className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600"
              >
                <MessageCircle className="h-4 w-4" />
              </button>

              <button
                onClick={() => handleEdit(client)}
                className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"
              >
                <Edit className="h-4 w-4" />
              </button>

              {canDeleteData && (
                <button
                  onClick={() => {
                    if (confirm("Delete permanently?")) {
                      api
                        .delete(`/clients/${client.id}`)
                        .then(fetchClients);
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  };

  /* ===========================================================
   MAIN RETURN
  =========================================================== */

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Client Management
          </h1>
          <p className="text-slate-500 text-sm">
            Manage firm clients and compliance
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Import CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => excelInputRef.current?.click()}
          >
            Import Excel
          </Button>

          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex gap-3 bg-white p-3 rounded-xl border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search clients..."
            className="pl-9 bg-slate-50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* GRID */}
      <div className="h-[70vh] border rounded-xl overflow-hidden bg-white">
        {filteredClients.length > 0 ? (
          <AutoSizer>
            {({ height, width }) => {
              const CARD = 220;
              const columnCount = Math.max(
                1,
                Math.floor(width / CARD)
              );
              const rowCount = Math.ceil(
                filteredClients.length / columnCount
              );

              return (
                <Grid
                  columnCount={columnCount}
                  columnWidth={CARD}
                  height={height}
                  rowCount={rowCount}
                  rowHeight={220}
                  width={width}
                >
                  {({ columnIndex, rowIndex, style }) => (
                    <ClientCard
                      columnIndex={columnIndex}
                      rowIndex={rowIndex}
                      style={style}
                      columnCount={columnCount}
                    />
                  )}
                </Grid>
              );
            }}
          </AutoSizer>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            No clients found
          </div>
        )}
      </div>

      {/* ADD / EDIT CLIENT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Edit Client" : "Add New Client"}
            </DialogTitle>
            <DialogDescription>
              Fill in the client details below
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div>
                <Label>Client Type</Label>
                <Select
                  value={formData.client_type}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, client_type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Birthday</Label>
                <Input
                  type="date"
                  value={formData.birthday}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      birthday: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Services */}
            <div>
              <Label className="block mb-2">Services</Label>
              <div className="grid grid-cols-3 gap-2">
                {SERVICES.map((service) => (
                  <Button
                    key={service}
                    type="button"
                    variant={
                      formData.services.includes(service)
                        ? "default"
                        : "outline"
                    }
                    onClick={() => toggleService(service)}
                    className="justify-start"
                  >
                    {service}
                  </Button>
                ))}
              </div>

              {formData.services.includes("Other") && (
                <div className="mt-3">
                  <Label>Other Service Details</Label>
                  <Input
                    value={otherService}
                    onChange={(e) => setOtherService(e.target.value)}
                    placeholder="Specify other service"
                  />
                </div>
              )}
            </div>

            {/* Status & Assignment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {canAssignClients && (
                <div>
                  <Label>Assigned To</Label>
                  <Select
                    value={formData.assigned_to}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, assigned_to: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingClient(null);
                  setFormData(initialForm());
                  setOtherService("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editingClient ? "Update Client" : "Create Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PREVIEW DIALOG (EXCEL) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Preview Before Import</DialogTitle>
            <DialogDescription>
              Review and edit before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto border rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  {previewHeaders.map((h) => (
                    <th
                      key={h}
                      className="p-2 border text-left uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {previewHeaders.map((header) => (
                      <td key={header} className="border p-1">
                        <Input
                          value={row[header] || ""}
                          onChange={(e) => {
                            const updated = [...previewData];
                            updated[rowIndex][header] = e.target.value;
                            setPreviewData(updated);
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPreviewImport}
              disabled={importLoading}
              className="bg-indigo-600 text-white"
            >
              {importLoading ? "Importing..." : "Confirm Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HIDDEN FILE INPUTS */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        className="hidden"
        onChange={handleImportCSV}
      />

      <input
        type="file"
        ref={excelInputRef}
        accept=".xlsx"
        className="hidden"
        onChange={handleImportExcel}
      />
    </div>
  );
}
