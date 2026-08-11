// MasterData.jsx — Admin → Master Data page.
//
// This page is the single place to manage full company profiles (name,
// address, phone, GSTIN/PAN, bank accounts, logos, SMTP). It's the SAME
// `/companies` records used everywhere else company name / bank details
// are shown — Quotations, Invoicing, Trademark Sphere, WhatsApp Settings,
// Email Settings, GST Portal Sync, etc. all read from this one collection,
// so anything added or edited here shows up there automatically.
//
// Below the company profiles is the original lightweight org-wide notes
// list (departments, categories, etc) for anything that isn't a full
// company record. See frontend/src/components/CompanyProfiles.jsx for the
// shared company form/list, and backend/quotations.py for the /companies API.

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Pencil, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "sonner";
import { ActionGuard } from "@/components/governance/GovernanceGuards";
import { CompanyProfilesList } from "@/components/CompanyProfiles";

export default function MasterData() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Master Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organization-wide master data — company profiles, bank details, and other reference data.
        </p>
      </div>

      {/* ── Company Profiles — the real source of truth for name/address/GST/bank/logo.
          Same /companies records read by Quotations, Invoicing, Trademark Sphere,
          WhatsApp/Email settings and GST Portal Sync. ── */}
      <Card className="p-5">
        <CompanyProfilesList />
      </Card>

      {/* ── Other org-wide reference data (departments, categories, etc) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">Other Master Data</h2>
        </div>
        <OtherMasterDataList />
      </div>
    </div>
  );
}

// Trimmed inline version of the original generic governed-list UI (title +
// details notes), without its own page heading, so it fits under the
// "Other Master Data" section above.
function OtherMasterDataList() {
  const module = "admin";
  const pageFlag = "can_view_master_data";
  const apiPath = "/master-data";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title_, setTitle_] = useState("");
  const [details, setDetails] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(apiPath);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      // 403 = no page access — PageGuard should already have kept the user
      // off this route, but fail quietly either way.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!title_.trim()) return;
    setCreating(true);
    try {
      await api.post(apiPath, { title: title_.trim(), details: details.trim() || null });
      setTitle_("");
      setDetails("");
      toast.success("Created");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`${apiPath}/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not delete");
    }
  };

  return (
    <div className="space-y-3">
      <ActionGuard module={module} page={pageFlag} action="create">
        <Card className="p-4 space-y-3">
          <Input placeholder="Title" value={title_} onChange={(e) => setTitle_(e.target.value)} />
          <Input placeholder="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button onClick={handleCreate} disabled={creating || !title_.trim()}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add
          </Button>
        </Card>
      </ActionGuard>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nothing here yet.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="p-4 flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{item.title}</div>
                {item.details && <div className="text-sm text-muted-foreground">{item.details}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {item.created_by_name} · {item.status}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <ActionGuard module={module} page={pageFlag} action="edit">
                  <Button variant="ghost" size="icon"><Pencil className="w-4 h-4" /></Button>
                </ActionGuard>
                <ActionGuard module={module} page={pageFlag} action="delete">
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </ActionGuard>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
