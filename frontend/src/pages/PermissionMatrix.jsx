// PermissionMatrix.jsx — Admin → Permission Matrix.
//
// A redesigned, module-driven permission editor: pick a user, then expand
// Module → Page cards with per-page checkboxes, "select whole module" /
// "clear whole module" bulk actions, and a live count of permissions
// granted. Reads/writes through the existing, already-battle-tested
// endpoints (/permission-governance/module-tree, /users/{id}/permissions)
// — no new backend surface needed for this page, everything it needs
// already existed.
//
// This is intentionally a separate page from the permission editor embedded
// in Users.jsx (left untouched) — a focused, admin-only "control room" view
// across all users, rather than a per-user side panel.

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, ShieldCheck, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function PermissionMatrix() {
  const [users, setUsers] = useState([]);
  const [moduleTree, setModuleTree] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [usersRes, treeRes] = await Promise.all([
          api.get('/users'),
          api.get('/permission-governance/module-tree'),
        ]);
        const userList = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || [];
        setUsers(userList);
        setModuleTree(treeRes.data || []);
        if (userList.length) setSelectedUserId(userList[0].id);
      } catch (e) {
        toast.error('Could not load permission matrix');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    (async () => {
      try {
        const { data } = await api.get(`/users/${selectedUserId}/permissions`);
        setPermissions(data || {});
      } catch (e) {
        toast.error('Could not load this user\u2019s permissions');
      }
    })();
  }, [selectedUserId]);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const isAdminUser = selectedUser?.role?.toLowerCase() === 'admin';

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => (u.full_name || u.email || '').toLowerCase().includes(q));
  }, [users, search]);

  const toggleModule = (moduleFlag, pages, checked) => {
    setPermissions((prev) => {
      const next = { ...prev, [moduleFlag]: checked };
      if (!checked) pages.forEach((p) => { next[p.flag] = false; });
      return next;
    });
  };

  const togglePage = (pageFlag, checked) => {
    setPermissions((prev) => ({ ...prev, [pageFlag]: checked }));
  };

  const grantedCount = (mod) => mod.pages.filter((p) => permissions[p.flag]).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/users/${selectedUserId}/permissions`, permissions);
      toast.success('Permissions updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading permission matrix…</div>;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* User list */}
      <Card className="p-3 h-fit">
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="space-y-1 max-h-[70vh] overflow-y-auto">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                u.id === selectedUserId ? 'bg-primary/10 font-medium' : 'hover:bg-muted'
              }`}
            >
              <span>{u.full_name || u.email}</span>
              {u.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
          ))}
        </div>
      </Card>

      {/* Module → Page matrix */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Permission Matrix</h1>
            <p className="text-sm text-muted-foreground">
              {selectedUser ? (selectedUser.full_name || selectedUser.email) : 'Select a user'}
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving || isAdminUser}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {isAdminUser && (
          <Card className="p-4 text-sm text-muted-foreground bg-muted/40">
            Admins have unrestricted access everywhere by role — nothing to configure here.
          </Card>
        )}

        {!isAdminUser && moduleTree.map((mod) => {
          const isOpen = expanded[mod.module] ?? false;
          const total = mod.pages.length;
          const granted = grantedCount(mod);
          const moduleOn = !!permissions[mod.flag];
          return (
            <Card key={mod.module} className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-muted/40"
                onClick={() => setExpanded((p) => ({ ...p, [mod.module]: !isOpen }))}
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <Checkbox
                    checked={moduleOn}
                    onCheckedChange={(c) => toggleModule(mod.flag, mod.pages, !!c)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="font-medium">{mod.label}</span>
                  {total > 0 && (
                    <span className="text-xs text-muted-foreground">{granted}/{total} pages</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{mod.description}</span>
              </button>

              {isOpen && (
                <div className="border-t px-4 py-3 space-y-2">
                  {total === 0 && (
                    <p className="text-sm text-muted-foreground">No sub-pages — module access is all-or-nothing.</p>
                  )}
                  <div className="flex gap-2 mb-2">
                    <Button size="sm" variant="outline" onClick={() => mod.pages.forEach((p) => togglePage(p.flag, true))}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Select all
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => mod.pages.forEach((p) => togglePage(p.flag, false))}>
                      <X className="w-3.5 h-3.5 mr-1" /> Clear all
                    </Button>
                  </div>
                  {mod.pages.map((page) => (
                    <label key={page.flag} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!permissions[page.flag]}
                        disabled={!moduleOn}
                        onCheckedChange={(c) => togglePage(page.flag, !!c)}
                      />
                      <span className={!moduleOn ? 'text-muted-foreground' : ''}>{page.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
