/**
 * DocumentUploadCenter.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * The redesigned "Documents" experience for the Client Portal Manager.
 *
 * Goals (plain-language, so anyone on the team can use it):
 *   1. Pick a client from the same list used on the Clients page.
 *   2. One click sets up their login + their Google Drive folder if missing.
 *   3. Drag files onto the page (or click "Choose Files") — they upload in
 *      the background, one by one, with a little progress tray. No forms,
 *      no dialogs to fill in.
 *   4. Every folder/file has a simple ON/OFF switch: "Visible to client?"
 *   5. Select items with checkboxes → delete one, delete many, or clear a
 *      whole folder in one click.
 *   6. Clients can be removed from the portal individually or in bulk.
 *
 * Visual language matches the rest of Client Portal Manager: rounded-2xl
 * cards, the deepBlue → mediumBlue gradient, slate borders, framer-motion
 * micro-interactions.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '@/lib/api.js';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Users, FolderOpen, Folder, FileText, UploadCloud, Plus, Trash2,
  ChevronRight, Home, Loader2, CheckCircle2, XCircle, Eye, EyeOff, X,
  ExternalLink, RefreshCw, KeyRound, Copy, Check, AlertCircle, CloudCog,
  FileImage, FileSpreadsheet, FileType2, Square, CheckSquare, Sparkles,
} from 'lucide-react';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
};
const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

// ── small helpers ────────────────────────────────────────────────────────
const fmtSize = (b) => {
  if (!b) return '';
  const n = Number(b);
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

const isFolderMime = (m) => m === 'application/vnd.google-apps.folder';

// Clients in this app store their display name under `company_name` (falls
// back to `name` for older records) — matches the field used on the
// Clients / All Clients tabs so names show up consistently everywhere.
const clientName = (c) => c?.company_name || c?.name || 'Unnamed Client';

function iconFor(mime) {
  if (isFolderMime(mime)) return { Icon: Folder, color: '#F5A524' };
  if (mime === 'application/pdf') return { Icon: FileType2, color: '#E5484D' };
  if (mime?.startsWith('image/')) return { Icon: FileImage, color: '#EC4899' };
  if (mime?.includes('spreadsheet')) return { Icon: FileSpreadsheet, color: '#10B981' };
  return { Icon: FileText, color: '#64748B' };
}

function extractErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(' | ');
  return fallback;
}

// A request that got a response (even an error one, like 403/500) reached our
// server -- that's a normal backend error. A request with NO response at all
// (err.response is undefined, err.code is ERR_NETWORK / ERR_FAILED / etc.)
// never reached the server: it was blocked before leaving the browser, almost
// always by antivirus "web shield" software, a browser extension, or a
// corporate firewall -- NOT a bug in Taskosphere. We label these differently
// so the tray gives people something actionable instead of a generic failure.
function isLikelyClientSideBlock(err) {
  return !err?.response;
}

function uploadFailureMessage(fileName, err) {
  if (isLikelyClientSideBlock(err)) {
    return `"${fileName}" was blocked before it left your browser -- likely your antivirus/firewall or an extension. Try Incognito mode or whitelist this site, then hit Retry.`;
  }
  return extractErrorMessage(err, `Failed to upload "${fileName}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Client list (left rail)
// ═══════════════════════════════════════════════════════════════════════════
function ClientRail({
  clients, loadingClients, selectedClientId, onSelect, isDark, isAdmin,
  selectMode, onToggleSelectMode, selectedIds, onToggleSelect, onBulkRemove, removing,
}) {
  const [search, setSearch] = useState('');
  const filtered = clients.filter((c) =>
    clientName(c).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={`rounded-2xl border shadow-sm flex flex-col overflow-hidden h-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`px-4 py-3.5 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2 mb-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <Users className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-none">Clients</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{clients.length} total</p>
          </div>
          {isAdmin && (
            <button
              onClick={onToggleSelectMode}
              title="Select multiple clients to remove from portal"
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition flex-shrink-0 ${
                selectMode ? 'bg-red-50 text-red-600 border-red-200' : isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className={`w-full pl-8 pr-3 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
          />
        </div>
        {selectMode && selectedIds.size > 0 && (
          <button
            disabled={removing}
            onClick={onBulkRemove}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-100 transition disabled:opacity-60"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Remove {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''} from Portal
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto max-h-[560px]">
        {loadingClients ? (
          <div className="flex items-center justify-center py-14 gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading clients…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-14 px-4">No clients match your search.</p>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((c) => {
              const name = clientName(c);
              const active = selectedClientId === c.id;
              const hasPortal = c.has_portal;
              const hasDrive = c.has_drive;
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : isDark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-50'
                  }`}
                >
                  {selectMode && (
                    <button onClick={() => onToggleSelect(c)} className="flex-shrink-0">
                      {selectedIds.has(c.id)
                        ? <CheckSquare className="h-4 w-4" style={{ color: COLORS.mediumBlue }} />
                        : <Square className="h-4 w-4 text-slate-300" />}
                    </button>
                  )}
                  <button onClick={() => onSelect(c)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
                      style={{ background: active ? GRADIENT : '#94a3b8' }}
                    >
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>{name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${hasPortal ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>
                          {hasPortal ? 'Portal ready' : 'No login yet'}
                        </span>
                        {hasPortal && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${hasDrive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-50 text-amber-600'}`}>
                            {hasDrive ? 'Drive linked' : 'No folder'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Credentials reveal card (shown right after auto-provisioning)
// ═══════════════════════════════════════════════════════════════════════════
function CredentialsCard({ username, password, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${username}\nPassword: ${password}\nPortal: ${window.location.origin}/client-portal`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 mb-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex-shrink-0">
        <KeyRound className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">Portal login created for this client</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg font-mono">User: {username}</code>
          <code className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg font-mono">Pass: {password}</code>
          <button onClick={copy} className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied!' : 'Copy details'}
          </button>
        </div>
        <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-1">Share these with the client so they can log in. This is shown once — copy it now.</p>
      </div>
      <button onClick={onDismiss} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload progress tray (floating, bottom-right)
// ═══════════════════════════════════════════════════════════════════════════
function UploadTray({ items, onClear, onRetry }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status !== 'uploading').length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-5 right-5 w-80 rounded-2xl shadow-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden z-50"
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ background: GRADIENT }}>
        <p className="text-xs font-semibold text-white flex items-center gap-1.5">
          <UploadCloud className="h-3.5 w-3.5" /> Uploading… {done}/{items.length}
        </p>
        {done === items.length && (
          <button onClick={onClear} className="text-white/70 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700">
        {items.map((it) => (
          <div key={it.id} className="px-4 py-2">
            <div className="flex items-center gap-2.5">
              {it.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 flex-shrink-0" />}
              {it.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />}
              {it.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{it.name}</span>
              {it.status === 'error' && (
                <button
                  onClick={() => onRetry?.(it)}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 flex-shrink-0"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              )}
            </div>
            {it.status === 'error' && it.errorMsg && (
              <p className="text-[10.5px] text-red-500 mt-0.5 pl-6 leading-snug">{it.errorMsg}</p>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Item card — a folder or a file inside the current Drive view
// ═══════════════════════════════════════════════════════════════════════════
function ItemCard({ item, isDark, selected, onToggleSelect, onOpen, onToggleVisible, onDelete, busy }) {
  const { Icon, color } = iconFor(item.mimeType);
  const isFolder = isFolderMime(item.mimeType);
  return (
    <motion.div
      layout
      className={`group relative rounded-xl border p-3 flex flex-col gap-2 transition-colors ${
        selected ? 'border-blue-300 bg-blue-50/60 dark:bg-blue-900/20' : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between">
        <button onClick={() => onToggleSelect(item)} className="flex-shrink-0">
          {selected ? <CheckSquare className="h-4 w-4" style={{ color: COLORS.mediumBlue }} /> : <Square className="h-4 w-4 text-slate-300 group-hover:text-slate-400" />}
        </button>
        <button
          onClick={() => onDelete(item)}
          disabled={busy}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        onClick={() => (isFolder ? onOpen(item) : window.open(item.webViewLink, '_blank'))}
        className="flex flex-col items-center text-center gap-1.5 py-1"
      >
        <Icon className="h-9 w-9" style={{ color }} />
        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 line-clamp-2 leading-tight px-1">{item.name}</p>
        {!isFolder && item.size && <p className="text-[10px] text-slate-400">{fmtSize(item.size)}</p>}
      </button>

      <button
        onClick={() => onToggleVisible(item)}
        disabled={busy}
        className={`w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold rounded-lg py-1.5 transition-colors disabled:opacity-50 ${
          item.is_visible
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-slate-100 text-slate-400 dark:bg-slate-700'
        }`}
      >
        {item.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {item.is_visible ? 'Visible to client' : 'Hidden from client'}
      </button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════════════
export default function DocumentUploadCenter({ isDark, isAdmin }) {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  // client-rail bulk-select-and-remove
  const [clientSelectMode, setClientSelectMode] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState(new Set());
  const [removingClients, setRemovingClients] = useState(false);

  // provisioning
  const [provisioning, setProvisioning] = useState(false);
  const [newCreds, setNewCreds] = useState(null); // {username, password}
  const [portalUser, setPortalUser] = useState(null); // full portal user doc for selected client

  // folder browse
  const [breadcrumb, setBreadcrumb] = useState([]); // [{id, name}]
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [busyIds, setBusyIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // new folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // uploads
  const [uploadItems, setUploadItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── load clients (from the same source as the Clients page) ────────────
  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await api.get('/client-portal/all-clients');
      setClients(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  // ── select a client ──────────────────────────────────────────────────
  const selectClient = (c) => {
    setSelectedClient(c);
    setNewCreds(null);
    setBreadcrumb([]);
    setItems([]);
    setSelectedItemIds(new Set());
    const pu = (c.portal_users || [])[0] || null;
    setPortalUser(pu);
  };

  const currentFolderId = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].id : portalUser?.google_drive_folder_id;

  // ── load items in current folder ────────────────────────────────────
  const loadItems = useCallback(async () => {
    if (!portalUser?.id || !portalUser?.google_drive_folder_id) { setItems([]); return; }
    setLoadingItems(true);
    try {
      const params = currentFolderId ? { folder_id: currentFolderId } : {};
      const res = await api.get(`/client-portal/drive/admin/files/${portalUser.id}`, { params });
      setItems(res.data?.files ?? []);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to load documents'));
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [portalUser, currentFolderId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── provision (create login + drive folder in one click) ───────────
  const provision = async () => {
    if (!selectedClient) return;
    setProvisioning(true);
    try {
      const form = new FormData();
      form.append('client_id', selectedClient.id);
      form.append('client_name', clientName(selectedClient));
      const res = await api.post('/client-portal/drive/ensure-root-folder', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.generated_password) {
        setNewCreds({ username: res.data.portal_username, password: res.data.generated_password });
      }
      toast.success('Client is ready — portal login and Drive folder are set up.');
      await loadClients();
      // refresh local portal user + selection
      const refreshed = await api.get('/client-portal/all-clients');
      const updated = (refreshed.data || []).find((c) => c.id === selectedClient.id);
      if (updated) {
        setSelectedClient(updated);
        setPortalUser((updated.portal_users || [])[0] || null);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Setup failed'));
    } finally {
      setProvisioning(false);
    }
  };

  // ── navigate into a folder ───────────────────────────────────────────
  const openFolder = (item) => {
    setBreadcrumb((b) => [...b, { id: item.id, name: item.name }]);
    setSelectedItemIds(new Set());
  };
  const jumpTo = (index) => {
    setBreadcrumb((b) => b.slice(0, index + 1));
    setSelectedItemIds(new Set());
  };
  const jumpToRoot = () => { setBreadcrumb([]); setSelectedItemIds(new Set()); };

  // ── toggle visibility ────────────────────────────────────────────────
  const toggleVisible = async (item) => {
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      await api.patch(`/client-portal/drive/admin/visibility/${portalUser.id}/toggle`, null, {
        params: { file_id: item.id, visible: !item.is_visible },
      });
      setItems((prev) => prev.map((f) => (f.id === item.id ? { ...f, is_visible: !f.is_visible } : f)));
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not update visibility'));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  // ── delete single item ───────────────────────────────────────────────
  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This moves it to Drive trash.`)) return;
    setBusyIds((s) => new Set(s).add(item.id));
    try {
      await api.delete('/client-portal/drive/item', { params: { portal_user_id: portalUser.id, file_id: item.id } });
      setItems((prev) => prev.filter((f) => f.id !== item.id));
      toast.success('Deleted');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Delete failed'));
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  // ── bulk delete selected items ───────────────────────────────────────
  const toggleItemSelect = (item) => {
    setSelectedItemIds((s) => {
      const n = new Set(s);
      n.has(item.id) ? n.delete(item.id) : n.add(item.id);
      return n;
    });
  };
  const selectAllItems = () => setSelectedItemIds(new Set(items.map((i) => i.id)));
  const clearItemSelection = () => setSelectedItemIds(new Set());

  const bulkDeleteItems = async () => {
    if (selectedItemIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedItemIds.size} selected item(s)? This moves them to Drive trash.`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/client-portal/drive/bulk-delete', {
        portal_user_id: portalUser.id,
        file_ids: Array.from(selectedItemIds),
      });
      setItems((prev) => prev.filter((f) => !selectedItemIds.has(f.id)));
      setSelectedItemIds(new Set());
      toast.success('Selected items deleted');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Bulk delete failed'));
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── new folder ────────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await api.post('/client-portal/drive/simple-create-folder', {
        portal_user_id: portalUser.id,
        folder_name: newFolderName.trim(),
        parent_folder_id: currentFolderId || null,
      });
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      loadItems();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not create folder'));
    } finally {
      setCreatingFolder(false);
    }
  };

  // ── upload (background, parallel, one call per file) ───────────────────
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  const uploadOne = useCallback(async (file, trayId, { isRetry = false } = {}) => {
    const form = new FormData();
    form.append('portal_user_id', portalUser.id);
    if (currentFolderId) form.append('folder_id', currentFolderId);
    form.append('file', file);

    setUploadItems((prev) => prev.map((it) => (
      it.id === trayId ? { ...it, status: 'uploading', file, errorMsg: null } : it
    )));

    try {
      await api.post('/client-portal/drive/upload-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadItems((prev) => prev.map((it) => (it.id === trayId ? { ...it, status: 'done' } : it)));
      loadItems();
    } catch (err) {
      // Network-level blocks (no response reached us at all) are often
      // transient -- a first attempt trips something, a second gets through.
      // Only auto-retry once, and only for that class of failure, so a real
      // backend error (403/500 etc.) surfaces immediately instead of hiding
      // behind a pointless retry.
      if (!isRetry && isLikelyClientSideBlock(err)) {
        await sleep(1200);
        return uploadOne(file, trayId, { isRetry: true });
      }
      const msg = uploadFailureMessage(file.name, err);
      setUploadItems((prev) => prev.map((it) => (
        it.id === trayId ? { ...it, status: 'error', errorMsg: msg, file } : it
      )));
      toast.error(msg);
    }
  }, [portalUser, currentFolderId, loadItems]);

  const uploadFiles = useCallback((fileList) => {
    if (!portalUser?.google_drive_folder_id) {
      toast.error('Set up this client\'s Drive folder first.');
      return;
    }
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newTrayItems = files.map((f) => ({ id: `${Date.now()}-${Math.random()}`, name: f.name, status: 'uploading' }));
    setUploadItems((prev) => [...prev, ...newTrayItems]);

    files.forEach((file, idx) => uploadOne(file, newTrayItems[idx].id));
  }, [portalUser, uploadOne]);

  const retryUpload = useCallback((trayItem) => {
    if (!trayItem?.file) {
      toast.error('Can\'t retry -- please re-drag this file in.');
      return;
    }
    uploadOne(trayItem.file, trayItem.id);
  }, [uploadOne]);

  // ── drag & drop handlers ────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  // ── client removal (single + bulk) ──────────────────────────────────
  const toggleClientSelect = (c) => {
    setSelectedClientIds((s) => {
      const n = new Set(s);
      n.has(c.id) ? n.delete(c.id) : n.add(c.id);
      return n;
    });
  };

  const removeClientFromPortal = async (c) => {
    const pu = (c.portal_users || [])[0];
    if (!pu) { toast.error('This client has no portal login to remove.'); return; }
    if (!window.confirm(`Remove ${clientName(c)} from the Client Portal? Their login will stop working. Drive files are kept.`)) return;
    try {
      await api.delete(`/client-portal/users/${pu.id}`);
      toast.success('Client removed from portal');
      if (selectedClient?.id === c.id) { setSelectedClient(null); setPortalUser(null); }
      loadClients();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not remove client'));
    }
  };

  const bulkRemoveClients = async () => {
    const puIds = clients
      .filter((c) => selectedClientIds.has(c.id))
      .flatMap((c) => (c.portal_users || []).map((pu) => pu.id));
    if (puIds.length === 0) { toast.error('None of the selected clients have a portal login.'); return; }
    if (!window.confirm(`Remove ${puIds.length} client(s) from the Client Portal?`)) return;
    setRemovingClients(true);
    try {
      await api.post('/client-portal/users/bulk-delete', { portal_user_ids: puIds });
      toast.success('Selected clients removed from portal');
      setSelectedClientIds(new Set());
      setClientSelectMode(false);
      loadClients();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Bulk remove failed'));
    } finally {
      setRemovingClients(false);
    }
  };

  const isProvisioned = !!(portalUser?.google_drive_folder_id);

  return (
    <div className="space-y-4">
      {/* ── Simple 3-step guide ── */}
      <div className={`rounded-2xl border shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {[
          { n: '1', text: 'Pick a client on the left' },
          { n: '2', text: 'Click "Set Up Client" once (only needed the first time)' },
          { n: '3', text: 'Drag files onto the page — done!' },
        ].map((s) => (
          <div key={s.n} className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: GRADIENT }}>{s.n}</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{s.text}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      {/* ── Left rail: clients ── */}
      <ClientRail
        clients={clients}
        loadingClients={loadingClients}
        selectedClientId={selectedClient?.id}
        onSelect={selectClient}
        isDark={isDark}
        isAdmin={isAdmin}
        selectMode={clientSelectMode}
        onToggleSelectMode={() => { setClientSelectMode((v) => !v); setSelectedClientIds(new Set()); }}
        selectedIds={selectedClientIds}
        onToggleSelect={toggleClientSelect}
        onBulkRemove={bulkRemoveClients}
        removing={removingClients}
      />

      {/* ── Right: workspace ── */}
      <div className="min-w-0">
        {!selectedClient ? (
          <div className={`rounded-2xl border shadow-sm h-full flex flex-col items-center justify-center text-center py-24 px-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <FolderOpen className="h-7 w-7" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">Pick a client to get started</h3>
            <p className="text-xs text-slate-400 max-w-xs">Choose any client from the list on the left. If they're new, we'll set up their portal login and Drive folder for you in one click.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className={`rounded-2xl border shadow-sm p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: GRADIENT }}>
                    {clientName(selectedClient)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{clientName(selectedClient)}</h2>
                    <p className="text-xs text-slate-400">
                      {isProvisioned ? 'Portal & Drive folder ready' : 'Not set up yet'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {portalUser && (
                    <a href="/client-portal" target="_blank" rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> View Portal
                    </a>
                  )}
                  <button
                    onClick={() => removeClientFromPortal(selectedClient)}
                    disabled={!portalUser}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove from Portal
                  </button>
                </div>
              </div>

              {newCreds && <div className="mt-4"><CredentialsCard username={newCreds.username} password={newCreds.password} onDismiss={() => setNewCreds(null)} /></div>}

              {!isProvisioned && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4 flex items-center gap-4 flex-wrap">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex-shrink-0">
                    <CloudCog className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Set up this client to start uploading</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Creates a portal login (if needed) and a Google Drive folder — one click, nothing to fill in.</p>
                  </div>
                  <button
                    onClick={provision}
                    disabled={provisioning}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white px-4 py-2.5 rounded-xl shadow-sm hover:opacity-90 transition disabled:opacity-60"
                    style={{ background: GRADIENT }}
                  >
                    {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {provisioning ? 'Setting up…' : 'Set Up Client'}
                  </button>
                </div>
              )}
            </div>

            {isProvisioned && (
              <>
                {/* Toolbar: breadcrumb + actions */}
                <div className={`rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <button onClick={jumpToRoot} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                    <Home className="h-3.5 w-3.5" /> {portalUser.google_drive_folder_name || 'Root'}
                  </button>
                  {breadcrumb.map((b, i) => (
                    <React.Fragment key={b.id}>
                      <ChevronRight className="h-3 w-3 text-slate-300" />
                      <button onClick={() => jumpTo(i)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">{b.name}</button>
                    </React.Fragment>
                  ))}

                  <div className="ml-auto flex items-center gap-2">
                    {selectedItemIds.size > 0 ? (
                      <>
                        <span className="text-xs text-slate-400">{selectedItemIds.size} selected</span>
                        <button onClick={clearItemSelection} className="text-xs font-semibold text-slate-500 hover:underline">Clear</button>
                        <button
                          onClick={bulkDeleteItems}
                          disabled={bulkDeleting}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition disabled:opacity-60"
                        >
                          {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete Selected
                        </button>
                      </>
                    ) : (
                      items.length > 0 && (
                        <button onClick={selectAllItems} className="text-xs font-semibold text-slate-500 hover:underline">Select all</button>
                      )
                    )}
                    <button
                      onClick={() => setShowNewFolder((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Plus className="h-3.5 w-3.5" /> New Folder
                    </button>
                  </div>
                </div>

                {showNewFolder && (
                  <div className={`rounded-2xl border shadow-sm p-4 flex items-center gap-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                      placeholder="Folder name, e.g. 2026 Invoices"
                      className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
                    />
                    <button onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()} className="text-xs font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50" style={{ background: GRADIENT }}>
                      {creatingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
                    </button>
                    <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="text-xs text-slate-400 hover:text-slate-600 px-2">Cancel</button>
                  </div>
                )}

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-2xl border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 py-10 px-6 text-center ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : isDark ? 'border-slate-700 hover:border-slate-600 bg-slate-800/50' : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${COLORS.mediumBlue}12` }}>
                    <UploadCloud className="h-6 w-6" style={{ color: COLORS.mediumBlue }} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Drag files here to upload</p>
                  <p className="text-xs text-slate-400">or click anywhere in this box to choose files from your computer</p>
                  <p className="text-[11px] text-slate-400">Files upload in the background — you can keep working while they finish.</p>
                </div>

                {/* Items grid */}
                <div className={`rounded-2xl border shadow-sm p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  {loadingItems ? (
                    <div className="flex items-center justify-center py-14 gap-2 text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading…</span>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <Folder className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-xs text-slate-400">This folder is empty. Drag files above to add the first one.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                      <AnimatePresence>
                        {items.map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            isDark={isDark}
                            selected={selectedItemIds.has(item.id)}
                            onToggleSelect={toggleItemSelect}
                            onOpen={openFolder}
                            onToggleVisible={toggleVisible}
                            onDelete={deleteItem}
                            busy={busyIds.has(item.id)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>

      <AnimatePresence>
        {uploadItems.length > 0 && (
          <UploadTray items={uploadItems} onClear={() => setUploadItems([])} onRetry={retryUpload} />
        )}
      </AnimatePresence>
    </div>
  );
}
