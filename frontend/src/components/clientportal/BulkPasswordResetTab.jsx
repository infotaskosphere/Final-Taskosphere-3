// BulkPasswordResetTab.jsx — Client Portal Manager → Password Reset
//
// Shortcut that lets an admin (or any user granted the "Password Reset"
// permission in Access Governance) reset client-portal login passwords in
// bulk. Each reset stores a fresh bcrypt hash for login and re-encrypts a
// recoverable copy into the Password Vault with the CURRENT encryption key —
// which is also the fix for entries showing
// "Password decryption failed — the encryption key may have changed".
//
// The client list shows two live columns next to Username:
//   • Status      — Pending / Updating… / Updated / Failed, updated in real
//                   time as each batch is processed.
//   • Last update — when that account's password was last reset.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import api from '@/lib/api.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  KeyRound, Search, Loader2, Download, ShieldAlert, Copy, RefreshCw,
  CheckCircle2, AlertCircle, Eye, EyeOff,
} from 'lucide-react';

const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
};
const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

// How many accounts are reset per request. Small batches keep the per-row
// Status column moving in real time instead of freezing on one big call.
const BATCH_SIZE = 5;

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Client Name', 'Portal Username', 'Email', 'New Password', 'Reset At'];
  const body = rows.map((r) => [
    r.client_name, r.portal_username, r.email, r.new_password,
    r.reset_at || new Date().toISOString(),
  ].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_META = {
  updating: { label: 'Updating…', color: '#1F6FB2' },
  updated:  { label: 'Updated',   color: '#1FAF5A' },
  failed:   { label: 'Failed',    color: '#DC2626' },
};

export default function BulkPasswordResetTab({ isDark, portalUsers = [], loading, onRefresh }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [mode, setMode] = useState('auto');           // 'auto' | 'same'
  const [samePassword, setSamePassword] = useState('');
  const [showSame, setShowSame] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [failures, setFailures] = useState([]);
  const [allowed, setAllowed] = useState(null);       // null = checking
  const [rowStatus, setRowStatus] = useState({});     // id -> 'updating' | 'updated' | 'failed'
  const [rowUpdatedAt, setRowUpdatedAt] = useState({}); // id -> ISO string (live overrides)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/client-portal/users/password-reset-access');
        setAllowed(Boolean(data?.can_reset_passwords));
      } catch {
        setAllowed(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return portalUsers.filter((pu) => {
      if (onlyActive && pu.is_active === false) return false;
      if (!q) return true;
      return (
        (pu.client_name || '').toLowerCase().includes(q) ||
        (pu.display_name || '').toLowerCase().includes(q) ||
        (pu.portal_username || '').toLowerCase().includes(q) ||
        (pu.email || '').toLowerCase().includes(q)
      );
    });
  }, [portalUsers, search, onlyActive]);

  const allChecked = filtered.length > 0 && filtered.every((pu) => selected.includes(pu.id));
  const toggleAll = () => setSelected(allChecked ? [] : filtered.map((pu) => pu.id));
  const toggleOne = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const markStatus = (ids, status) =>
    setRowStatus((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = status; });
      return next;
    });

  const validate = (ids) => {
    if (ids.length === 0) {
      toast.error('Select at least one client first');
      return false;
    }
    if (mode === 'same' && samePassword.trim().length < 6) {
      toast.error('Common password must be at least 6 characters');
      return false;
    }
    return true;
  };

  // Runs the reset in small batches so the Status column advances live.
  const runBatched = useCallback(async (ids, { download } = {}) => {
    if (!validate(ids)) return;
    if (!window.confirm(`Reset the portal password for ${ids.length} client${ids.length === 1 ? '' : 's'}? Their old password will stop working immediately.`)) return;

    setBusy(true);
    setRowStatus({});
    const okRows = [];
    const badRows = [];
    setResults([]);
    setFailures([]);

    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        markStatus(chunk, 'updating');
        const body = {
          portal_user_ids: chunk,
          all_users: false,
          only_active: onlyActive,
          password_length: 12,
        };
        if (mode === 'same') body.new_password = samePassword;

        try {
          const { data } = await api.post('/client-portal/users/bulk-reset-password', body);
          const stamp = new Date().toISOString();
          const done = (data?.results || []).map((r) => ({ ...r, reset_at: stamp }));
          const fails = data?.failures || [];
          okRows.push(...done);
          badRows.push(...fails);

          markStatus(done.map((r) => r.portal_user_id), 'updated');
          if (fails.length) markStatus(fails.map((f) => f.portal_user_id), 'failed');
          setRowUpdatedAt((prev) => {
            const next = { ...prev };
            done.forEach((r) => { next[r.portal_user_id] = stamp; });
            return next;
          });
          setResults([...okRows]);
          setFailures([...badRows]);
        } catch (err) {
          markStatus(chunk, 'failed');
          chunk.forEach((id) => badRows.push({
            portal_user_id: id,
            portal_username: portalUsers.find((p) => p.id === id)?.portal_username || id,
            error: err?.response?.data?.detail || 'Reset failed',
          }));
          setFailures([...badRows]);
        }
      }

      // Success feedback
      const when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (okRows.length && !badRows.length) {
        const who = okRows.length === 1
          ? (okRows[0].portal_username || okRows[0].client_name || 'client')
          : `${okRows.length} clients`;
        toast.success(`Password reset successfully for ${who}`, {
          description: `Updated at ${when}. New credentials are shown in the table${download ? ' and downloaded as CSV' : ''}.`,
        });
      } else if (okRows.length && badRows.length) {
        toast.success(`${okRows.length} password(s) reset successfully`, {
          description: `${badRows.length} failed — check the Status column for details.`,
        });
      } else if (badRows.length) {
        toast.error('No passwords were reset', {
          description: `${badRows.length} client(s) failed. Please try again.`,
        });
      }

      if (download && okRows.length) downloadRows(okRows);
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  }, [portalUsers, mode, samePassword, onlyActive, onRefresh]);

  const downloadRows = (rows) => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-portal-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const card = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';

  if (allowed === false) {
    return (
      <div className={`rounded-2xl border p-6 flex items-start gap-3 ${isDark ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="text-xs leading-relaxed">
          <strong>Password Reset permission required.</strong> Ask an administrator to grant you
          the <em>Password Reset</em> permission under Access Governance → Taskosphere → Client Portal Manager.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${card}`}>
        <div className={`flex items-center gap-2.5 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <KeyRound className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Bulk Password Reset</h3>
            <p className="text-xs text-slate-400">
              Issue fresh client-portal passwords in one go and download the credentials sheet.
              Also repairs entries that fail to decrypt with the current encryption key.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onRefresh} className="text-slate-400">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="p-5 space-y-4">
          {/* Options */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or username…" className="pl-9 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Active accounts only
            </label>
            <div className="flex items-center gap-1 rounded-xl border p-1 text-xs dark:border-slate-600">
              {[['auto', 'Auto-generate'], ['same', 'One common password']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${mode === key ? 'text-white' : 'text-slate-500 dark:text-slate-300'}`}
                  style={mode === key ? { background: GRADIENT } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'same' && (
              <div className="relative min-w-[200px]">
                <Input
                  type={showSame ? 'text' : 'password'}
                  value={samePassword}
                  onChange={(e) => setSamePassword(e.target.value)}
                  placeholder="Common password (min 6 chars)"
                  className="text-sm pr-9"
                />
                <button type="button" onClick={() => setShowSame((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                  {showSame ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => runBatched(selected)} className="text-xs text-white px-4" style={{ background: GRADIENT }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 mr-1.5" />}
              Reset selected ({selected.length})
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runBatched(selected, { download: true })} className="text-xs">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Reset selected & download CSV
            </Button>
            <Button size="sm" variant="outline" disabled={busy || filtered.length === 0} onClick={() => runBatched(filtered.map((pu) => pu.id))} className="text-xs">
              Reset all {onlyActive ? 'active' : ''} ({filtered.length})
            </Button>
            {results.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => downloadRows(results)} className="text-xs">
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download last result
              </Button>
            )}
          </div>

          {/* Client list */}
          <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className={`flex items-center gap-3 px-4 py-2 text-[11px] font-bold uppercase tracking-wider ${isDark ? 'bg-slate-700/40 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span className="flex-1">Client</span>
              <span className="w-40 hidden sm:block">Username</span>
              <span className="w-24 hidden sm:block">Status</span>
              <span className="w-36 hidden md:block">Last update</span>
              <span className="w-20 text-right">Account</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              )}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">No portal users match.</p>
              )}
              {filtered.map((pu) => {
                const st = rowStatus[pu.id];
                const meta = STATUS_META[st];
                const last = rowUpdatedAt[pu.id] || pu.password_reset_at;
                return (
                  <label
                    key={pu.id}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm border-t cursor-pointer ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'}`}
                  >
                    <input type="checkbox" checked={selected.includes(pu.id)} onChange={() => toggleOne(pu.id)} />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                      {pu.client_name || pu.display_name || pu.portal_username}
                    </span>
                    <span className="w-40 hidden sm:block truncate text-xs text-slate-400">{pu.portal_username}</span>
                    <span className="w-24 hidden sm:flex items-center gap-1 text-[11px] font-semibold"
                          style={{ color: meta ? meta.color : '#94a3b8' }}>
                      {st === 'updating' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {st === 'updated' && <CheckCircle2 className="h-3 w-3" />}
                      {st === 'failed' && <AlertCircle className="h-3 w-3" />}
                      {meta ? meta.label : 'Pending'}
                    </span>
                    <span className="w-36 hidden md:block truncate text-[11px] text-slate-400">{fmtWhen(last)}</span>
                    <span className="w-20 text-right text-[11px] font-semibold" style={{ color: pu.is_active === false ? '#94a3b8' : COLORS.emeraldGreen }}>
                      {pu.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {(results.length > 0 || failures.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border overflow-hidden shadow-sm ${card}`}>
          <div className={`flex items-center gap-2 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
              New credentials ({results.length})
            </h3>
            <p className="text-xs text-slate-400 ml-2">Shown once — download or copy them now.</p>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {results.map((r) => (
              <div key={r.portal_user_id} className={`flex items-center gap-3 px-5 py-2.5 text-sm border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{r.client_name || r.portal_username}</span>
                <span className="w-40 truncate text-xs text-slate-400 hidden sm:block">{r.portal_username}</span>
                <span className="w-32 truncate text-[11px] text-slate-400 hidden md:block">{fmtWhen(r.reset_at)}</span>
                <code className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100">{r.new_password}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${r.portal_username} / ${r.new_password}`);
                    toast.success('Credentials copied');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                  title="Copy username & password"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {failures.map((f) => (
              <div key={f.portal_user_id} className="flex items-center gap-3 px-5 py-2.5 text-xs border-t border-red-200 text-red-600 dark:border-red-900">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="flex-1 truncate">{f.portal_username}</span>
                <span className="truncate">{f.error}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
