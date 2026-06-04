/**
 * ClientGroupsPanel
 * ─────────────────
 * Sidebar/modal panel to manage client groups.
 * Users can create groups, add/remove clients, rename groups, delete groups.
 *
 * Props:
 *   open         — boolean
 *   onClose      — () => void
 *   clients      — full clients array
 *   onGroupFilter — (groupId | null) => void  — filter clients page by group
 *   activeGroupId — string | null
 *   isDark       — boolean
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Layers, Plus, Trash2, Edit2, Check, X, Users, Search,
  ChevronDown, ChevronRight, Loader2, FolderOpen, Folder,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const GROUP_COLORS = [
  '#0D3B66', '#1D4ED8', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#BE185D', '#4338CA', '#065F46',
];

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {GROUP_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{ background: c, borderColor: value === c ? 'white' : 'transparent', boxShadow: value === c ? `0 0 0 2px ${c}` : 'none' }}
        />
      ))}
    </div>
  );
}

function ClientMultiSelect({ clients, selectedIds, onChange, isDark }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() =>
    clients.filter(c => (c.company_name || '').toLowerCase().includes(search.toLowerCase())),
    [clients, search]);

  return (
    <div className={`border rounded-xl overflow-hidden ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
      <div className={`p-2 border-b ${isDark ? 'border-slate-600 bg-slate-700' : 'border-slate-100 bg-slate-50'}`}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className={`w-full pl-7 pr-3 py-1.5 text-xs rounded-lg outline-none border ${
              isDark ? 'bg-slate-600 border-slate-500 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-700 placeholder-slate-400'
            }`}
          />
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No clients found</p>
        )}
        {filtered.map(c => {
          const isSelected = selectedIds.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onChange(isSelected ? selectedIds.filter(id => id !== c.id) : [...selectedIds, c.id])}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                isSelected
                  ? isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                  : isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'bg-blue-500 border-blue-500' : isDark ? 'border-slate-500' : 'border-slate-300'
              }`}>
                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="truncate font-medium">{c.company_name}</span>
              {c.client_type && <span className="text-[9px] opacity-50 ml-auto flex-shrink-0">{c.client_type}</span>}
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <div className={`px-3 py-1.5 border-t text-[10px] font-semibold ${
          isDark ? 'border-slate-600 text-slate-400 bg-slate-700/50' : 'border-slate-100 text-slate-500 bg-slate-50'
        }`}>
          {selectedIds.length} client{selectedIds.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}

export default function ClientGroupsPanel({
  open, onClose, clients = [], onGroupFilter, activeGroupId, isDark = false,
}) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#0D3B66');

  // Edit mode
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('#0D3B66');

  // Expanded group (for adding/removing members)
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [pendingMemberIds, setPendingMemberIds] = useState([]);
  const [savingMembers, setSavingMembers] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/client-groups');
      setGroups(r.data || []);
    } catch (e) {
      toast.error('Failed to load client groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchGroups();
  }, [open, fetchGroups]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      const r = await api.post('/client-groups', { name: newName.trim(), description: newDesc.trim(), color: newColor });
      setGroups(prev => [r.data, ...prev]);
      setCreateMode(false);
      setNewName(''); setNewDesc(''); setNewColor('#0D3B66');
      toast.success(`Group "${r.data.name}" created`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (groupId) => {
    setSaving(true);
    try {
      const r = await api.put(`/client-groups/${groupId}`, { name: editName.trim(), description: editDesc.trim(), color: editColor });
      setGroups(prev => prev.map(g => g.id === groupId ? r.data : g));
      setEditingGroupId(null);
      toast.success('Group updated');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId, groupName) => {
    if (!window.confirm(`Delete group "${groupName}"? (Clients will NOT be deleted)`)) return;
    try {
      await api.delete(`/client-groups/${groupId}`);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (activeGroupId === groupId) onGroupFilter?.(null);
      toast.success('Group deleted');
    } catch (e) {
      toast.error('Failed to delete group');
    }
  };

  const openMemberEditor = (group) => {
    if (expandedGroupId === group.id) { setExpandedGroupId(null); return; }
    setExpandedGroupId(group.id);
    setPendingMemberIds(group.client_ids || []);
  };

  const handleSaveMembers = async (groupId) => {
    setSavingMembers(true);
    try {
      const r = await api.put(`/client-groups/${groupId}`, { client_ids: pendingMemberIds });
      setGroups(prev => prev.map(g => g.id === groupId ? r.data : g));
      setExpandedGroupId(null);
      toast.success('Group members updated');
    } catch (e) {
      toast.error('Failed to update group members');
    } finally {
      setSavingMembers(false);
    }
  };

  // Get client names for a group
  const getMemberNames = (client_ids = []) => {
    const names = client_ids.slice(0, 3).map(id => {
      const c = clients.find(cl => cl.id === id);
      return c?.company_name;
    }).filter(Boolean);
    const extra = client_ids.length - 3;
    return names.join(', ') + (extra > 0 ? ` +${extra} more` : '');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className={`max-w-lg max-h-[88vh] flex flex-col overflow-hidden p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}
        style={{ borderRadius: 20 }}
      >
        {/* Header */}
        <DialogHeader className={`flex-shrink-0 px-6 pt-5 pb-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #4338CA, #7C3AED)' }}>
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Client Groups</DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Organize clients into logical groups for easy filtering
              </DialogDescription>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {activeGroupId && (
                <Button size="sm" variant="outline" onClick={() => onGroupFilter?.(null)}
                  className="text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50">
                  <X className="w-3 h-3 mr-1" /> Clear Filter
                </Button>
              )}
              <Button size="sm" onClick={() => setCreateMode(v => !v)}
                className="text-xs h-8 bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-0">
                <Plus className="w-3 h-3 mr-1" /> New Group
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Create form */}
          <AnimatePresence>
            {createMode && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className={`rounded-xl border p-4 space-y-3 ${isDark ? 'border-slate-600 bg-slate-700/60' : 'border-indigo-200 bg-indigo-50'}`}
              >
                <p className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-indigo-800'}`}>New Group</p>
                <Input
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Group name (e.g. VIP Clients, GST Only)"
                  className={`text-sm h-9 ${isDark ? 'bg-slate-600 border-slate-500 text-white' : ''}`}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <Input
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className={`text-sm h-9 ${isDark ? 'bg-slate-600 border-slate-500 text-white' : ''}`}
                />
                <div>
                  <p className="text-[10px] text-slate-500 mb-1.5">Group color</p>
                  <ColorPicker value={newColor} onChange={setNewColor} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreate} disabled={saving} className="flex-1 text-xs bg-indigo-600 text-white border-0">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Group'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCreateMode(false)} className="text-xs">Cancel</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-400">Loading groups…</span>
            </div>
          )}

          {/* Empty */}
          {!loading && groups.length === 0 && !createMode && (
            <div className="text-center py-10">
              <FolderOpen className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No groups yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Group" to create your first client group</p>
            </div>
          )}

          {/* Group list */}
          {groups.map(group => {
            const isEditing = editingGroupId === group.id;
            const isExpanded = expandedGroupId === group.id;
            const isActiveFilter = activeGroupId === group.id;
            const memberCount = (group.client_ids || []).length;

            return (
              <motion.div
                key={group.id}
                layout
                className={`rounded-xl border overflow-hidden transition-all ${
                  isActiveFilter
                    ? isDark ? 'border-blue-500 bg-blue-900/20' : 'border-blue-400 bg-blue-50'
                    : isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white'
                }`}
              >
                {/* Group header */}
                <div className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${group.color}20`, border: `1.5px solid ${group.color}40` }}>
                    <Folder className="w-4 h-4" style={{ color: group.color }} />
                  </div>

                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <Input value={editName} onChange={e => setEditName(e.target.value)}
                        className={`h-8 text-xs ${isDark ? 'bg-slate-600 border-slate-500 text-white' : ''}`} />
                      <Input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                        placeholder="Description" className={`h-8 text-xs ${isDark ? 'bg-slate-600 border-slate-500 text-white' : ''}`} />
                      <ColorPicker value={editColor} onChange={setEditColor} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdate(group.id)} disabled={saving} className="flex-1 h-7 text-xs bg-blue-600 text-white border-0">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingGroupId(null)} className="h-7 text-xs">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{group.name}</p>
                        {isActiveFilter && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white flex-shrink-0">ACTIVE FILTER</span>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{group.description}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {memberCount === 0 ? 'No clients' : getMemberNames(group.client_ids)}
                        {memberCount > 0 && ` · ${memberCount} client${memberCount !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onGroupFilter?.(isActiveFilter ? null : group.id)}
                        className={`h-7 px-2 rounded-lg text-[10px] font-semibold transition-all ${
                          isActiveFilter
                            ? 'bg-blue-500 text-white'
                            : isDark ? 'bg-slate-700 text-slate-300 hover:bg-blue-900 hover:text-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600'
                        }`}
                        title={isActiveFilter ? 'Clear filter' : 'Filter by this group'}
                      >
                        {isActiveFilter ? 'Filtering' : 'Filter'}
                      </button>
                      <button
                        onClick={() => openMemberEditor(group)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                          isExpanded
                            ? isDark ? 'bg-violet-700 text-white' : 'bg-violet-100 text-violet-700'
                            : isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                        }`}
                        title="Edit members"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setEditingGroupId(group.id); setEditName(group.name); setEditDesc(group.description || ''); setEditColor(group.color || '#0D3B66'); }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                        title="Edit group"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(group.id, group.name)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${isDark ? 'hover:bg-red-900/40 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'}`}
                        title="Delete group"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Member editor */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className={`border-t px-3 pb-3 pt-2 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}
                    >
                      <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Select clients to include in this group
                      </p>
                      <ClientMultiSelect
                        clients={clients}
                        selectedIds={pendingMemberIds}
                        onChange={setPendingMemberIds}
                        isDark={isDark}
                      />
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => handleSaveMembers(group.id)} disabled={savingMembers}
                          className="flex-1 h-8 text-xs bg-violet-600 text-white border-0">
                          {savingMembers ? <Loader2 className="w-3 h-3 animate-spin" /> : `Save ${pendingMemberIds.length} member${pendingMemberIds.length !== 1 ? 's' : ''}`}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExpandedGroupId(null)} className="h-8 text-xs">Cancel</Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
