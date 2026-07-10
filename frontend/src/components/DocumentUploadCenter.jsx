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
import { useDocumentUploads } from '@/contexts/DocumentUploadContext.jsx';
import {
  Search, Users, FolderOpen, Folder, FolderPlus, FileText, UploadCloud, Plus, Trash2,
  ChevronRight, ChevronUp, Home, Loader2, CheckCircle2, XCircle, Eye, EyeOff, X,
  ExternalLink, RefreshCw, KeyRound, Copy, Check, AlertCircle, CloudCog,
  FileImage, FileSpreadsheet, FileType2, Square, CheckSquare, Sparkles, ListChecks,
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
// Sorts a client list in place per the chosen key.
function sortClients(list, sortKey) {
  const arr = [...list];
  switch (sortKey) {
    case 'name_desc':
      return arr.sort((a, b) => clientName(b).localeCompare(clientName(a)));
    case 'newest':
      return arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    case 'oldest':
      return arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    case 'name_asc':
    default:
      return arr.sort((a, b) => clientName(a).localeCompare(clientName(b)));
  }
}

const SORT_OPTIONS = [
  { value: 'name_asc',  label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'newest',    label: 'Newest first' },
  { value: 'oldest',    label: 'Oldest first' },
];

function SortSelect({ value, onChange, isDark }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Sort this list"
      className={`text-[10.5px] font-medium rounded-lg border px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
        isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-500'
      }`}
    >
      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ClientListRow({ c, active, selectMode, selectedIds, onToggleSelect, onSelect, isDark }) {
  const name = clientName(c);
  const hasPortal = c.has_portal;
  const hasDrive = c.has_drive;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${
        active
          ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-200 dark:ring-blue-800'
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
          style={{ background: active ? GRADIENT : (hasPortal ? '#1FAF5A' : '#94a3b8') }}
        >
          {name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>{name}</p>
          {hasPortal ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 mt-0.5">
              {hasDrive ? 'Drive linked' : 'No Drive folder yet'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 mt-0.5">
              Not set up yet
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

// Tab filter pills — replaces the old fixed 50/50 split-pane layout.
// The old layout gave "Linked" and "Not Linked" a hard-coded equal share of
// height regardless of how many items were in each — so with (say) 1 linked
// client and 400 unlinked ones, the linked pane was mostly empty dead space
// while the unlinked pane was starved for room and had to be scrolled
// constantly, which read as items "randomly" disappearing. A single
// tab-filtered list gives every row the full height of the panel, every time.
const CLIENT_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'linked',   label: 'Linked' },
  { key: 'unlinked', label: 'Unlinked' },
];

// Roughly 10 client rows worth of scroll height (row ~48px + 4px gap, plus
// a little breathing room) — keeps the card compact instead of stretching
// to fill the page; anything beyond that scrolls.
const CLIENT_LIST_MAX_H = 540;

function ClientRail({
  clients, loadingClients, selectedClientId, onSelect, isDark, isAdmin,
  selectMode, onToggleSelectMode, selectedIds, onToggleSelect,
  onBulkRemove, onBulkProvision, removing, provisioning,
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('name_asc');
  const searchRef = useRef(null);
  const listRef = useRef(null);

  // Modern quick-access: press "/" anywhere on the page to jump into the
  // client search box (same pattern as Linear/Notion/Slack), Escape clears it.
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const linkedCount   = useMemo(() => clients.filter((c) => c.has_portal).length, [clients]);
  const unlinkedCount = clients.length - linkedCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = clients;
    if (tab === 'linked')   list = list.filter((c) => c.has_portal);
    if (tab === 'unlinked') list = list.filter((c) => !c.has_portal);
    if (q) list = list.filter((c) => clientName(c).toLowerCase().includes(q));
    return sortClients(list, sort);
  }, [clients, tab, search, sort]);

  const tabCount = { all: clients.length, linked: linkedCount, unlinked: unlinkedCount };

  // How many of the current selection are/aren't already linked — decides
  // which bulk action button(s) to show.
  const selectedLinkedCount = useMemo(
    () => clients.filter((c) => selectedIds.has(c.id) && c.has_portal).length,
    [clients, selectedIds]
  );
  const selectedUnlinkedCount = selectedIds.size - selectedLinkedCount;

  const scrollList = (dir) => listRef.current?.scrollBy({ top: dir * 260, behavior: 'smooth' });

  return (
    <div className={`rounded-2xl border shadow-sm flex flex-col overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3.5 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <Users className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-none">Clients</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{clients.length} total · {linkedCount} linked</p>
          </div>
          {isAdmin && (
            <button
              onClick={onToggleSelectMode}
              title="Select multiple clients to set up or remove from the portal"
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition flex-shrink-0 ${
                selectMode ? 'bg-red-50 text-red-600 border-red-200' : isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          )}
        </div>

        <div className="relative mb-2.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className={`w-full pl-8 pr-7 py-2 rounded-lg text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
          />
          {!search && (
            <kbd className={`absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold px-1 py-0.5 rounded border pointer-events-none ${isDark ? 'border-slate-600 text-slate-500' : 'border-slate-300 text-slate-400'}`}>/</kbd>
          )}
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tab filter — grid-cols-3 keeps all three exactly equal width;
            count stacked above label so a 3-digit number never wraps mid-digit */}
        <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl ${isDark ? 'bg-slate-900/40' : 'bg-slate-100'}`}>
          {CLIENT_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg transition-all ${
                tab === t.key
                  ? 'text-white shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
              style={tab === t.key ? { background: GRADIENT } : {}}
            >
              <span className="text-xs font-bold leading-none tabular-nums whitespace-nowrap">
                {tabCount[t.key]}
              </span>
              <span className={`text-[9.5px] font-semibold uppercase tracking-wide leading-none whitespace-nowrap ${tab === t.key ? 'text-white/80' : 'text-slate-400'}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <p className="text-[10.5px] text-slate-400">{filtered.length} shown</p>
          {filtered.length > 1 && <SortSelect value={sort} onChange={setSort} isDark={isDark} />}
        </div>

        {/* Bulk actions — set up portal logins for several unlinked clients
            at once, and/or remove several linked ones, from a single selection. */}
        {selectMode && selectedIds.size > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {selectedUnlinkedCount > 0 && (
              <button
                disabled={provisioning}
                onClick={onBulkProvision}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white rounded-lg py-1.5 hover:opacity-90 transition disabled:opacity-60"
                style={{ background: GRADIENT }}
              >
                {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Set up {selectedUnlinkedCount} client{selectedUnlinkedCount > 1 ? 's' : ''}
              </button>
            )}
            {selectedLinkedCount > 0 && (
              <button
                disabled={removing}
                onClick={onBulkRemove}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-100 transition disabled:opacity-60"
              >
                {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove {selectedLinkedCount} from Portal
              </button>
            )}
          </div>
        )}
      </div>

      {/* Client list — capped to ~10 rows tall so the card stays compact;
          scroll with the wheel/trackpad, drag, or the up/down arrows. */}
      {loadingClients ? (
        <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading clients…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
          <Users className="h-7 w-7 text-slate-300 mb-2" />
          <p className="text-xs text-slate-400">
            {search ? 'No clients match your search.' : tab === 'linked' ? 'No clients linked to the portal yet.' : tab === 'unlinked' ? 'Every client is linked. 🎉' : 'No clients found.'}
          </p>
        </div>
      ) : (
        <div className="relative">
          <div ref={listRef} className="overflow-y-auto slim-scroll p-2 space-y-1" style={{ maxHeight: CLIENT_LIST_MAX_H }}>
            {filtered.map((c) => (
              <ClientListRow
                key={c.id} c={c} active={selectedClientId === c.id}
                selectMode={selectMode} selectedIds={selectedIds}
                onToggleSelect={onToggleSelect} onSelect={onSelect} isDark={isDark}
              />
            ))}
          </div>
          {/* Up/down scroll nudge buttons — handy for long lists on trackpads without momentum scroll */}
          {filtered.length > 6 && (
            <div className="absolute right-2 bottom-2 flex flex-col rounded-lg overflow-hidden shadow-md border" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              <button
                onClick={() => scrollList(-1)}
                className={`p-1.5 ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                title="Scroll up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <div className={`h-px ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`} />
              <button
                onClick={() => scrollList(1)}
                className={`p-1.5 ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                title="Scroll down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
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
// Bulk credentials reveal card — shown after creating portal logins for
// several clients at once. Each password is generated once and never shown
// again, so this list (with a copy-all) is the only chance to grab them.
// ═══════════════════════════════════════════════════════════════════════════
function BulkCredentialsCard({ credentials, onDismiss, isDark }) {
  const [copiedAll, setCopiedAll] = useState(false);
  if (!credentials || credentials.length === 0) return null;

  const copyAll = async () => {
    const text = credentials
      .map((c) => `${c.name}\n  Username: ${c.username}\n  Password: ${c.password}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(`Client Portal logins — ${window.location.origin}/client-portal\n\n${text}`);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex-shrink-0">
          <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            {credentials.length} portal login{credentials.length > 1 ? 's' : ''} created
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">
            These passwords are shown once — copy them now and share with each client.
          </p>
        </div>
        <button onClick={copyAll} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50 flex-shrink-0">
          {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copiedAll ? 'Copied!' : 'Copy all'}
        </button>
        <button onClick={onDismiss} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-56 overflow-y-auto slim-scroll space-y-1.5 pr-1">
        {credentials.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200 min-w-0 truncate flex-1">{c.name}</span>
            <code className="bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px]">{c.username}</code>
            <code className="bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px]">{c.password}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload status card — persistent, sits below the documents grid.
// Backed by DocumentUploadContext, so it keeps showing live progress even
// after navigating away and back (uploads run in the background regardless
// of whether this card/component is mounted).
// ═══════════════════════════════════════════════════════════════════════════
const fmtElapsed = (ts) => {
  if (!ts) return '';
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
};

function UploadStatusCard({ items, onRetry, onResolveConflict, onResolveAllConflicts, onClearFinished, onClearAll, onRemove, isDark }) {
  if (!items.length) return null;

  const queued      = items.filter((i) => i.status === 'queued').length;
  const uploading    = items.filter((i) => i.status === 'uploading').length;
  const done          = items.filter((i) => i.status === 'done').length;
  const errored        = items.filter((i) => i.status === 'error').length;
  const conflicted       = items.filter((i) => i.status === 'conflict').length;
  const interrupted        = items.filter((i) => i.status === 'interrupted').length;
  const total     = items.length;
  const finished  = done + errored;
  const pct       = total ? Math.round((finished / total) * 100) : 0;
  const allDone   = finished === total;

  // Newest first so the most recently dropped files are easy to find.
  const ordered = [...items].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
    >
      {/* Header + overall progress */}
      <div className="px-5 py-4" style={{ background: GRADIENT }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-white/15 flex-shrink-0">
              {allDone ? <ListChecks className="h-4 w-4 text-white" /> : <UploadCloud className="h-4 w-4 text-white animate-pulse" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none">
                {allDone ? 'Upload complete' : 'Uploading in background'}
              </p>
              <p className="text-[11px] text-white/70 mt-0.5">
                {finished}/{total} finished
                {uploading > 0 && ` · ${uploading} uploading`}
                {queued > 0 && ` · ${queued} queued`}
                {errored > 0 && ` · ${errored} failed`}
                {conflicted > 0 && ` · ${conflicted} need a decision`}
                {interrupted > 0 && ` · ${interrupted} interrupted by a reload`}
                {allDone && conflicted === 0 && ' · safe to leave this page'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {conflicted > 1 && (
              <>
                <button
                  onClick={() => onResolveAllConflicts('overwrite')}
                  className="text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg transition"
                  title="Replace the existing file's content for every conflicting item"
                >
                  Overwrite all
                </button>
                <button
                  onClick={() => onResolveAllConflicts('keep_both')}
                  className="text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg transition"
                  title="Upload every conflicting item alongside the existing file"
                >
                  Keep both all
                </button>
              </>
            )}
            {errored > 0 && !uploading && !queued && (
              <button
                onClick={() => ordered.filter((i) => i.status === 'error').forEach((i) => onRetry(i))}
                className="text-[11px] font-semibold text-white bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg transition"
              >
                Retry all failed
              </button>
            )}
            {finished > 0 && (
              <button
                onClick={onClearFinished}
                className="text-[11px] font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition"
              >
                Clear finished
              </button>
            )}
            {allDone && conflicted === 0 && (
              <button onClick={onClearAll} className="text-white/70 hover:text-white flex-shrink-0" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-white"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Detailed file-by-file list */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700">
        {ordered.map((it) => (
          <div key={it.id} className="px-5 py-2.5 flex items-center gap-3 flex-wrap">
            <div className="flex-shrink-0">
              {it.status === 'queued'      && <Loader2 className="h-4 w-4 text-slate-300" />}
              {it.status === 'uploading'   && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              {it.status === 'done'        && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {it.status === 'error'       && <XCircle className="h-4 w-4 text-red-500" />}
              {it.status === 'conflict'    && <AlertCircle className="h-4 w-4 text-amber-500" />}
              {it.status === 'interrupted' && <AlertCircle className="h-4 w-4 text-slate-400" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[280px]">{it.name}</p>
                {it.clientName && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex-shrink-0">
                    {it.clientName}
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-slate-400 mt-0.5">
                {it.status === 'queued' && 'Waiting for a free upload slot…'}
                {it.status === 'uploading' && 'Uploading…'}
                {it.status === 'done' && `${it.overwritten ? 'Replaced existing file' : 'Uploaded'} ${fmtElapsed(it.finishedAt)}`}
                {it.status === 'error' && (it.errorMsg || 'Upload failed')}
                {it.status === 'conflict' && (it.conflict?.message || 'A file with this name already exists.')}
                {it.status === 'interrupted' && 'Page was reloaded mid-upload — re-drag this file to continue.'}
                {it.size ? ` · ${fmtSize(it.size)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {it.status === 'conflict' && (
                <>
                  <button
                    onClick={() => onResolveConflict(it, 'overwrite')}
                    className="text-[11px] font-semibold text-white bg-amber-500 hover:bg-amber-600 px-2.5 py-1 rounded-lg transition"
                    title="Replace the existing file's content"
                  >
                    Overwrite
                  </button>
                  <button
                    onClick={() => onResolveConflict(it, 'keep_both')}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    title="Upload alongside the existing file (renamed to avoid an exact-name clash)"
                  >
                    Keep both
                  </button>
                </>
              )}
              {it.status === 'error' && (
                <button
                  onClick={() => onRetry(it)}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              )}
              {(it.status === 'done' || it.status === 'error' || it.status === 'interrupted') && (
                <button onClick={() => onRemove(it.id)} className="text-slate-300 hover:text-slate-500" title="Remove from list">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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

  // uploads — actual queueing/progress lives in DocumentUploadContext so it
  // survives navigating away from this page; we just read+trigger it here.
  const { items: allUploadItems, queueUploads: queueUploadsCtx, retryItem, resolveConflict, resolveAllConflicts, clearFinished, clearAll, removeItem } = useDocumentUploads();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

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

  // ── provision (create portal login only) ─────────────────────────
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
      toast.success('Portal login created for this client.');
      await loadClients();
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

  // ── create Drive folder for this client (client-name folder + saved template subfolders) ──
  const [creatingDriveFolder, setCreatingDriveFolder] = useState(false);
  const createDriveFolder = async () => {
    if (!selectedClient || !portalUser) return;
    setCreatingDriveFolder(true);
    try {
      const res = await api.post('/client-portal/drive/create-individual-folder', {
        client_id: selectedClient.id,
        client_name: clientName(selectedClient),
        parent_folder_id: null,
        // omitting subfolders → backend falls back to the saved template (or root-only if template is empty)
      });
      toast.success(
        `Drive folder "${res.data.folder_name}" created!`,
        res.data.folder_link
          ? { action: { label: 'Open', onClick: () => window.open(res.data.folder_link, '_blank') } }
          : undefined,
      );
      await loadClients();
      const refreshed = await api.get('/client-portal/all-clients');
      const updated = (refreshed.data || []).find((c) => c.id === selectedClient.id);
      if (updated) {
        setSelectedClient(updated);
        setPortalUser((updated.portal_users || [])[0] || null);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Could not create Drive folder'));
    } finally {
      setCreatingDriveFolder(false);
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

  // ── upload (queues into the global DocumentUploadContext) ──────────────
  // The actual network calls, concurrency cap and retry logic all live in
  // DocumentUploadContext so they keep running even if the admin navigates
  // away from this page mid-batch. Here we just build the entries + target
  // and hand them off, and pass `loadItems` as the "a file just finished"
  // callback so the grid below refreshes live while this tab is open.
  const uploadTarget = useMemo(() => ({
    portalUserId: portalUser?.id,
    folderId: currentFolderId || null,
    clientId: selectedClient?.id,
    clientName: selectedClient ? clientName(selectedClient) : undefined,
  }), [portalUser?.id, currentFolderId, selectedClient]);

  const queueUploads = useCallback((entries) => {
    if (!portalUser?.google_drive_folder_id) {
      toast.error('Set up this client\'s Drive folder first.');
      return;
    }
    queueUploadsCtx(entries, uploadTarget, loadItems);
  }, [portalUser, uploadTarget, queueUploadsCtx, loadItems]);

  // Kept for the plain "Choose Files" input, which never carries folder info.
  const uploadFiles = useCallback((fileList) => {
    const files = Array.from(fileList);
    queueUploads(files.map((file) => ({ file, pathParts: [] })));
  }, [queueUploads]);

  const retryUpload = useCallback((item) => {
    retryItem(item, loadItems);
  }, [retryItem, loadItems]);

  const resolveUploadConflict = useCallback((item, action) => {
    resolveConflict(item, action, loadItems);
  }, [resolveConflict, loadItems]);

  const resolveAllUploadConflicts = useCallback((action) => {
    resolveAllConflicts(action, loadItems);
  }, [resolveAllConflicts, loadItems]);

  // Only this client's uploads are shown in the status card while a client
  // is selected — switching clients doesn't lose other clients' progress,
  // it's just not shown until you pick them again (or see the badge count).
  const clientUploadItems = useMemo(
    () => allUploadItems.filter((it) => it.portalUserId === portalUser?.id),
    [allUploadItems, portalUser?.id],
  );

  // ── recursively read a dropped folder into a flat file list ─────────
  // Browsers only expose real folder contents via the drag-and-drop
  // FileSystemEntry API (dataTransfer.items[i].webkitGetAsEntry()) --
  // dataTransfer.files alone gives you a single, unreadable 0-byte entry
  // for a dropped folder, which is what was silently failing before.
  function readEntry(entry, pathParts) {
    return new Promise((resolve) => {
      if (!entry) return resolve([]);
      if (entry.isFile) {
        entry.file(
          (file) => resolve([{ file, pathParts }]),
          () => resolve([]),
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const collected = [];
        const readBatch = () => {
          reader.readEntries(async (batch) => {
            if (!batch.length) {
              const nested = await Promise.all(
                collected.map((child) => readEntry(child, [...pathParts, entry.name])),
              );
              resolve(nested.flat());
              return;
            }
            // readEntries only returns up to 100 entries per call --
            // keep calling until it returns an empty batch.
            collected.push(...batch);
            readBatch();
          }, () => resolve([]));
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  }

  async function collectDroppedEntries(dataTransfer) {
    const items = Array.from(dataTransfer.items || []);
    const entries = items
      .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (!entries.length) {
      // Older/other browsers without entry support: flat files only.
      return Array.from(dataTransfer.files || []).map((file) => ({ file, pathParts: [] }));
    }
    const nested = await Promise.all(entries.map((entry) => readEntry(entry, [])));
    return nested.flat();
  }

  // ── drag & drop handlers ────────────────────────────────────────────
  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt) return;
    const entries = await collectDroppedEntries(dt);
    if (entries.length) queueUploads(entries);
  };

  // ── "Upload Folder" button (click-to-pick, no drag needed) ─────────
  const onFolderInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    const entries = files.map((file) => {
      const parts = (file.webkitRelativePath || file.name).split('/');
      parts.pop(); // last segment is the filename itself
      return { file, pathParts: parts };
    });
    queueUploads(entries);
    e.target.value = ''; // allow picking the same folder again later
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

  // ── bulk provisioning: create portal logins for several clients at once ──
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkNewCreds, setBulkNewCreds] = useState(null); // [{name, username, password}] | null

  const bulkProvisionClients = async () => {
    const targets = clients.filter((c) => selectedClientIds.has(c.id) && !c.has_portal);
    if (targets.length === 0) { toast.error('None of the selected clients need a new portal login.'); return; }
    if (!window.confirm(`Create portal logins for ${targets.length} client(s)? Each gets its own username & password.`)) return;

    setBulkProvisioning(true);
    const created = [];
    let failed = 0;
    for (const c of targets) {
      try {
        const form = new FormData();
        form.append('client_id', c.id);
        form.append('client_name', clientName(c));
        const res = await api.post('/client-portal/drive/ensure-root-folder', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data?.generated_password) {
          created.push({ name: clientName(c), username: res.data.portal_username, password: res.data.generated_password });
        }
      } catch {
        failed += 1;
      }
    }
    setBulkProvisioning(false);
    setSelectedClientIds(new Set());
    setClientSelectMode(false);
    await loadClients();

    if (created.length > 0) setBulkNewCreds(created);
    if (failed === 0) toast.success(`Portal logins created for ${created.length} client(s).`);
    else toast.error(`${created.length} created, ${failed} failed — select the failed ones and retry.`);
  };

  const isProvisioned = !!(portalUser?.google_drive_folder_id);

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {bulkNewCreds && (
          <BulkCredentialsCard credentials={bulkNewCreds} onDismiss={() => setBulkNewCreds(null)} isDark={isDark} />
        )}
      </AnimatePresence>

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

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
      {/* ── Left rail: clients — fixed, compact height (~10 rows visible),
          scrolls internally with wheel/drag or the up/down arrow buttons. */}
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
        onBulkProvision={bulkProvisionClients}
        removing={removingClients}
        provisioning={bulkProvisioning}
      />

      {/* ── Right: workspace ── */}
      <div className="min-w-0">
        {!selectedClient ? (
          <div className={`rounded-2xl border shadow-sm h-full flex flex-col items-center justify-center text-center py-24 px-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <FolderOpen className="h-7 w-7" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">Pick a client to get started</h3>
            <p className="text-xs text-slate-400 max-w-xs">Choose any client from the list on the left. Use Folder Architect to create Drive folders — upload here once a folder exists.</p>
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

              {/* Step 1 — no portal user yet */}
              {!portalUser && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 p-4 flex items-center gap-4 flex-wrap">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex-shrink-0">
                    <CloudCog className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Create portal login for this client</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Generates a username &amp; password — one click, nothing to fill in.</p>
                  </div>
                  <button
                    onClick={provision}
                    disabled={provisioning}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white px-4 py-2.5 rounded-xl shadow-sm hover:opacity-90 transition disabled:opacity-60"
                    style={{ background: GRADIENT }}
                  >
                    {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {provisioning ? 'Creating…' : 'Create Portal Login'}
                  </button>
                </div>
              )}

              {/* Step 2 — portal user exists but no Drive folder yet */}
              {portalUser && !portalUser.google_drive_folder_id && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 flex items-center gap-4 flex-wrap">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex-shrink-0">
                    <FolderPlus className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No Drive folder yet</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Create a Drive folder for this client — a <strong>{clientName(selectedClient)}</strong> folder will be created using your saved Folder Architect template (or root-only if no template is set).
                    </p>
                  </div>
                  <button
                    onClick={createDriveFolder}
                    disabled={creatingDriveFolder}
                    className="inline-flex items-center gap-2 text-xs font-semibold text-white px-4 py-2.5 rounded-xl shadow-sm hover:opacity-90 transition disabled:opacity-60 flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #92400e 0%, #b45309 100%)' }}
                  >
                    {creatingDriveFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
                    {creatingDriveFolder ? 'Creating…' : 'Create Drive Folder'}
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
                  {/* webkitdirectory lets people pick a whole OS folder without
                      dragging — same recursive pipeline handles both. */}
                  <input
                    ref={folderInputRef}
                    type="file"
                    webkitdirectory=""
                    directory=""
                    mozdirectory=""
                    multiple
                    hidden
                    onChange={onFolderInputChange}
                  />
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${COLORS.mediumBlue}12` }}>
                    <UploadCloud className="h-6 w-6" style={{ color: COLORS.mediumBlue }} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Drag files or a whole folder here to upload</p>
                  <p className="text-xs text-slate-400">or click anywhere in this box to choose files from your computer</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                    className={`mt-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                  >
                    Upload a folder instead
                  </button>
                  <p className="text-[11px] text-slate-400">Files upload in the background — you can keep working while they finish. Folder structure is recreated on Drive automatically.</p>
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

                {/* Upload status — persists across navigation; keeps showing
                    progress for this client even if a batch was started,
                    the admin left the page, and came back later. */}
                <AnimatePresence>
                  {clientUploadItems.length > 0 && (
                    <UploadStatusCard
                      items={clientUploadItems}
                      onRetry={retryUpload}
                      onResolveConflict={resolveUploadConflict}
                      onResolveAllConflicts={resolveAllUploadConflicts}
                      onClearFinished={clearFinished}
                      onClearAll={clearAll}
                      onRemove={removeItem}
                      isDark={isDark}
                    />
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
