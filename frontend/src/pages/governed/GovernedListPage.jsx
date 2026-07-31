// GovernedListPage.jsx — shared list/create/edit/delete UI for the new
// stub modules (Leave, Payroll, HR, Recruitment, Performance, Templates,
// Uploads, Client Discussion, Master Data, Roles). Each of those pages is a
// thin wrapper around this component (see frontend/src/pages/governed/*),
// exactly like backend/governed_modules.py's `_build_router` factory is
// shared by their APIs. Replace with a bespoke UI per-page as real features
// get built — the ActionGuard usage below is the pattern to keep.

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ActionGuard } from '@/components/governance/GovernanceGuards';

export default function GovernedListPage({ title, description, apiPath, module, pageFlag }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title_, setTitle_] = useState('');
  const [details, setDetails] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(apiPath);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      // 403 = no page access — ActionGuard/PageGuard should already have kept
      // the user off this route, but fail quietly either way.
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!title_.trim()) return;
    setCreating(true);
    try {
      await api.post(apiPath, { title: title_.trim(), details: details.trim() || null });
      setTitle_('');
      setDetails('');
      toast.success('Created');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not create');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`${apiPath}/${id}`);
      toast.success('Deleted');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not delete');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>

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
