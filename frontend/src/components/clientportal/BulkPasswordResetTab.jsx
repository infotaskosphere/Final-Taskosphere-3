// BulkPasswordResetTab.jsx — Client Portal Manager → Password Reset
//
// Shortcut that lets an admin (or any user granted the "Password Reset"
// permission in Access Governance) reset client-portal login passwords in
// bulk. Each reset stores a fresh bcrypt hash for login and re-encrypts a
// recoverable copy into the Password Vault with the CURRENT encryption key —
// which is also the fix for entries showing
// "Password decryption failed — the encryption key may have changed".
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

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Client Name', 'Portal Username', 'Email', 'New Password'];
  const body = rows.map((r) => [r.client_name, r.portal_username, r.email, r.new_password].map(esc).join(','));
  return [head.map(esc).join(','), ...body].join('\n');
}

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

  const buildBody = (allUsers) => {
    const body = {
      portal_user_ids: allUsers ? [] : selected,
      all_users: allUsers,
      only_active: onlyActive,
      password_length: 12,
    };
    if (mode === 'same') body.new_password = samePassword;
    return body;
  };

  const validate = (allUsers) => {
    if (!allUsers && selected.length === 0) {
      toast.error('Select at least one client first');
      return false;
    }
    if (mode === 'same' && samePassword.trim().length < 6) {
      toast.error('Common password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const run = useCallback(async (allUsers) => {
    if (!validate(allUsers)) return;
    const count = allUsers ? filtered.length : selected.length;
    if (!window.confirm(`Reset the portal password for ${count} client${count === 1 ? '' : 's'}? Their old password will stop working immediately.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/client-portal/users/bulk-reset-password', buildBody(allUsers));
      setResults(data?.results || []);
      setFailures(data?.failures || []);
      toast.success(`${data?.reset_count ?? 0} password(s) reset${data?.failed_count ? `, ${data.failed_count} failed` : ''}`);
      onRefresh?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Bulk password reset failed');
    } finally {
      setBusy(false);
    }
  }, [selected, filtered, mode, samePassword, onlyActive, onRefresh]);

  const downloadFromServer = async (allUsers) => {
    if (!validate(allUsers)) return;
    setBusy(true);
    try {
      const res = await api.post(
        '/client-portal/users/bulk-reset-password/export',
        buildBody(allUsers),
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `client-portal-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Passwords reset — credentials sheet downloaded');
      onRefresh?.();
    } catch {
      toast.error('Could not reset & download credentials');
    } finally {
      setBusy(false);
    }
  };

  const downloadLastResults = () => {
    if (!results.length) return;
    const url = URL.createObjectURL(new Blob([toCsv(results)], { type: 'text/csv' }));
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
            <Button size="sm" disabled={busy} onClick={() => run(false)} className="text-xs text-white px-4" style={{ background: GRADIENT }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <KeyRound className="h-3.5 w-3.5 mr-1.5" />}
              Reset selected ({selected.length})
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => downloadFromServer(false)} className="text-xs">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Reset selected & download CSV
            </Button>
            <Button size="sm" variant="outline" disabled={busy || filtered.length === 0} onClick={() => run(true)} className="text-xs">
              Reset all {onlyActive ? 'active' : ''} ({filtered.length})
            </Button>
            {results.length > 0 && (
              <Button size="sm" variant="outline" onClick={downloadLastResults} className="text-xs">
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
              <span className="w-20 text-right">Status</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {loading && (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
              )}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">No portal users match.</p>
              )}
              {filtered.map((pu) => (
                <label
                  key={pu.id}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm border-t cursor-pointer ${isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-100 hover:bg-slate-50'}`}
                >
                  <input type="checkbox" checked={selected.includes(pu.id)} onChange={() => toggleOne(pu.id)} />
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">
                    {pu.client_name || pu.display_name || pu.portal_username}
                  </span>
                  <span className="w-40 hidden sm:block truncate text-xs text-slate-400">{pu.portal_username}</span>
                  <span className="w-20 text-right text-[11px] font-semibold" style={{ color: pu.is_active === false ? '#94a3b8' : COLORS.emeraldGreen }}>
                    {pu.is_active === false ? 'Inactive' : 'Active'}
                  </span>
                </label>
              ))}
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
