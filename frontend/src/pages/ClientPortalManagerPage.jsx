import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useDark } from '@/hooks/useDark.jsx';
import api from '@/lib/api.js';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import ClientPortalHeader from '@/components/layout/ClientPortalHeader.jsx';
import ClientPortalManager from '@/components/ClientPortalManager.jsx';
import {
  Building2, Users, Shield, FileText, ExternalLink,
  Search, Globe, Lock, CreditCard, ClipboardList,
  ChevronRight, RefreshCw, UserCheck, Loader2, AlertCircle,
  Settings, MessageSquare, Mail, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
};
const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;
const springCard = { type: 'spring', stiffness: 280, damping: 22, mass: 0.85 };

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } },
};

/* ── Stat Card ──────────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color, bg }) {
  const { isDark } = useDark();
  return (
    <motion.div
      variants={itemVariants}
      className={`rounded-2xl p-5 border flex items-center gap-4 shadow-sm ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </motion.div>
  );
}

/* ── Portal User Card ───────────────────────────────────────────────────────── */
function PortalUserCard({ pu, onManage, isAdmin }) {
  const { isDark } = useDark();
  const perm = pu.permissions || pu;
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
      transition={springCard}
      className={`rounded-2xl border overflow-hidden shadow-sm ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <div className="h-1.5 w-full" style={{ background: pu.is_active ? GRADIENT : '#94a3b8' }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: GRADIENT }}>
              {(pu.display_name || pu.portal_username || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {pu.display_name || pu.portal_username}
              </p>
              <p className="text-xs text-slate-400 truncate">{pu.email || pu.portal_username}</p>
            </div>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
            pu.is_active
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${pu.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {pu.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {pu.client_name && (
          <div className={`flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg ${isDark ? 'bg-slate-700/60' : 'bg-slate-50'}`}>
            <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{pu.client_name}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          {[
            { key: 'can_view_tasks',      label: 'Tasks',      icon: ClipboardList, color: '#3B82F6' },
            { key: 'can_view_documents',  label: 'Docs',       icon: FileText,      color: '#8B5CF6' },
            { key: 'can_view_invoices',   label: 'Invoices',   icon: CreditCard,    color: '#10B981' },
            { key: 'can_view_compliance', label: 'Compliance', icon: Shield,        color: '#F59E0B' },
          ].map(({ key, label, icon: Icon, color }) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border"
              style={
                perm[key]
                  ? { background: `${color}12`, color, borderColor: `${color}30` }
                  : { background: 'transparent', color: '#94a3b8', borderColor: '#e2e8f0' }
              }
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open('/client-portal', '_blank')} className="flex-1 text-xs">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Portal
          </Button>
          {isAdmin && onManage && (
            <Button variant="ghost" size="sm" onClick={() => onManage(pu)} className="text-xs" title="Manage this client's portal">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Overview Tab ───────────────────────────────────────────────────────────── */
function OverviewTab({ portalUsers, loading, navigate, isAdmin, isDark, onManage }) {
  const [search, setSearch] = useState('');
  const filtered = portalUsers.filter((pu) => {
    const q = search.toLowerCase();
    return (
      (pu.display_name    || '').toLowerCase().includes(q) ||
      (pu.portal_username || '').toLowerCase().includes(q) ||
      (pu.client_name     || '').toLowerCase().includes(q) ||
      (pu.email           || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <Shield className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Portal Accounts</h3>
            <p className="text-xs text-slate-400">{filtered.length} of {portalUsers.length} users</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search clients or users…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-48 sm:w-64" />
        </div>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading portal users…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <Building2 className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">{search ? 'No results found' : 'No portal users yet'}</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              {search ? 'Try a different search term.' : 'Portal accounts are created from the Clients page. Open a client and use the Portal Access panel to invite them.'}
            </p>
            {!search && (
              <Button size="sm" className="mt-4 text-xs text-white" onClick={() => navigate('/clients')} style={{ background: GRADIENT }}>
                <ChevronRight className="h-3.5 w-3.5 mr-1" /> Go to Clients
              </Button>
            )}
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map((pu) => (
              <PortalUserCard key={pu.id} pu={pu} isAdmin={isAdmin} onManage={onManage} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ── Clients Tab ────────────────────────────────────────────────────────────── */
function ClientsTab({ portalUsers, loading, onManage, isAdmin, isDark }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const filtered = portalUsers.filter((pu) => {
    const q = search.toLowerCase();
    return (
      (pu.display_name    || '').toLowerCase().includes(q) ||
      (pu.portal_username || '').toLowerCase().includes(q) ||
      (pu.client_name     || '').toLowerCase().includes(q) ||
      (pu.email           || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <Users className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Portal Clients</h3>
            <p className="text-xs text-slate-400">{filtered.length} of {portalUsers.length} clients</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-48 sm:w-64" />
        </div>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading clients…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <Users className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">{search ? 'No results found' : 'No portal clients yet'}</h3>
            <p className="text-xs text-slate-400 max-w-xs">{search ? 'Try a different search term.' : 'Portal accounts are created from the Clients page.'}</p>
            {!search && (
              <Button size="sm" className="mt-4 text-xs text-white" onClick={() => navigate('/clients')} style={{ background: GRADIENT }}>
                <ChevronRight className="h-3.5 w-3.5 mr-1" /> Go to Clients
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  {['Client', 'Username', 'Email', 'Status', 'Permissions', ...(isAdmin ? ['Actions'] : [])].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((pu) => (
                  <tr key={pu.id} className={`border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: GRADIENT }}>
                          {(pu.display_name || pu.portal_username || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{pu.display_name || pu.client_name || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-500 font-mono">@{pu.portal_username}</td>
                    <td className="py-3 px-3 text-xs text-slate-500">{pu.email || '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${pu.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${pu.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {pu.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {[['can_view_tasks','T'],['can_view_documents','D'],['can_view_invoices','I'],['can_view_compliance','C']].map(([key, label]) => (
                          <span key={key} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${pu[key] ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{label}</span>
                        ))}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => window.open('/client-portal', '_blank')} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" /> Portal
                          </button>
                          {onManage && (
                            <button onClick={() => onManage(pu)} className="text-xs text-slate-500 hover:text-slate-700">
                              <Settings className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Documents Tab ──────────────────────────────────────────────────────────── */
function DocumentsTab({ portalUsers, loading, isDark }) {
  const [selectedUser, setSelectedUser] = useState('');
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const usersWithDrive = portalUsers.filter((u) => u.google_drive_folder_id);

  const loadDocs = useCallback(async (userId) => {
    if (!userId) return;
    setDocsLoading(true);
    try {
      const res = await api.get(`/client-portal/drive/admin/files/${userId}`);
      setDocs(res.data || []);
    } catch { setDocs([]); toast.error('Failed to load documents'); }
    finally { setDocsLoading(false); }
  }, []);

  useEffect(() => { if (selectedUser) loadDocs(selectedUser); else setDocs([]); }, [selectedUser, loadDocs]);

  const fmtSize = (b) => { if (!b) return ''; const n = Number(b); if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; };
  const ICONS = { 'application/vnd.google-apps.folder':'📁','application/vnd.google-apps.document':'📄','application/vnd.google-apps.spreadsheet':'📊','application/vnd.google-apps.presentation':'📽️','application/pdf':'📑','image/jpeg':'🖼️','image/png':'🖼️' };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center px-5 py-4 border-b gap-2.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
          <FileText className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Client Documents</h3>
          <p className="text-xs text-slate-400">Browse Drive files linked to each client</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span></div>
        ) : usersWithDrive.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <FolderOpen className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">No Drive folders linked</h3>
            <p className="text-xs text-slate-400 max-w-xs">Link a Google Drive folder to a portal user from the Clients page to manage their documents here.</p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1.5">Select Client</label>
              <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}
                className={`w-full max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
              >
                <option value="">— Choose a client —</option>
                {usersWithDrive.map((u) => (
                  <option key={u.id} value={u.id}>{u.display_name || u.portal_username} ({u.google_drive_folder_name || 'Drive'})</option>
                ))}
              </select>
            </div>
            {selectedUser && (docsLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading documents…</span></div>
            ) : docs.length === 0 ? (
              <p className="text-center py-10 text-slate-400 text-sm">No documents found in this folder.</p>
            ) : (
              <div className="space-y-1">
                {docs.map((f) => (
                  <div key={f.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                    <span className="text-lg flex-shrink-0">{ICONS[f.mimeType] || '📎'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{f.name}</p>
                      {f.size && <p className="text-[10px] text-slate-400">{fmtSize(f.size)}</p>}
                    </div>
                    {f.webViewLink && (
                      <a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5 flex-shrink-0">
                        <ExternalLink className="h-3 w-3" /> Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Messages Tab ───────────────────────────────────────────────────────────── */
function MessagesTab({ portalUsers, isDark }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);
  const [form, setForm] = useState({ to_portal_user_id: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { const res = await api.get('/client-portal/messages'); setMessages(res.data || []); }
      catch { setMessages([]); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const send = async () => {
    if (!form.to_portal_user_id || !form.body) { toast.error('Please select a client and enter a message.'); return; }
    setSending(true);
    try {
      await api.post('/client-portal/messages', form);
      toast.success('Message sent!');
      setCompose(false);
      setForm({ to_portal_user_id: '', subject: '', body: '' });
    } catch { toast.error('Failed to send message'); }
    finally { setSending(false); }
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <MessageSquare className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Messages</h3>
            <p className="text-xs text-slate-400">Communicate with your portal clients</p>
          </div>
        </div>
        <Button size="sm" className="text-xs text-white" style={{ background: GRADIENT }} onClick={() => setCompose(true)}>
          <Mail className="h-3.5 w-3.5 mr-1" /> Compose
        </Button>
      </div>
      <div className="p-5 space-y-4">
        {compose && (
          <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-indigo-100 bg-indigo-50'}`}>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Message</p>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">To</label>
              <select value={form.to_portal_user_id} onChange={(e) => setForm(f => ({ ...f, to_portal_user_id: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
              >
                <option value="">— Select client —</option>
                {portalUsers.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.portal_username}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Subject (optional)</label>
              <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Optional subject…" className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Message</label>
              <textarea value={form.body} onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))} rows={4} placeholder="Write your message…"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={sending} onClick={send} className="text-xs text-white" style={{ background: GRADIENT }}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
                {sending ? 'Sending…' : 'Send'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCompose(false)} className="text-xs">Cancel</Button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading messages…</span></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <MessageSquare className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">No messages yet</h3>
            <p className="text-xs text-slate-400 max-w-xs">Use the Compose button to send a message to a portal client.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className={`rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{msg.subject || '(no subject)'}</p>
                  <span className="text-[10px] text-slate-400">{msg.created_at ? new Date(msg.created_at).toLocaleDateString() : ''}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{msg.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Settings Tab ───────────────────────────────────────────────────────────── */
function SettingsTab({ isDark }) {
  const [settings, setSettings] = useState({
    portal_name: 'Client Portal',
    welcome_message: 'Welcome to your client portal.',
    allow_client_messages: true,
    show_task_comments: true,
    portal_status: 'live',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/client-portal/settings', settings).catch(() => {});
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      toast.success('Settings saved!');
    } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center px-5 py-4 border-b gap-2.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
          <Settings className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
        </div>
        <div>
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Portal Settings</h3>
          <p className="text-xs text-slate-400">Configure your client portal behaviour</p>
        </div>
      </div>
      <div className="p-5 space-y-5 max-w-lg">
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Portal Name</label>
          <Input value={settings.portal_name} onChange={(e) => setSettings(s => ({ ...s, portal_name: e.target.value }))} className="text-sm" placeholder="Client Portal" />
          <p className="text-[10px] text-slate-400 mt-1">Displayed in the browser title and portal header.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Welcome Message</label>
          <textarea value={settings.welcome_message} onChange={(e) => setSettings(s => ({ ...s, welcome_message: e.target.value }))} rows={3}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
            placeholder="Welcome to your client portal."
          />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Features</p>
          {[
            { key: 'allow_client_messages', label: 'Allow clients to send messages',   desc: 'Clients can compose and send messages to your team.' },
            { key: 'show_task_comments',    label: 'Show task comments to clients',    desc: 'Internal task comments are visible in the client portal.' },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <button type="button" onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 ${settings[key] ? 'bg-indigo-500' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[key] ? 'translate-x-4' : ''}`} />
              </button>
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</p>
                <p className="text-[10px] text-slate-400">{desc}</p>
              </div>
            </label>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Portal Status</p>
          <div className="flex gap-2">
            {[['live','bg-emerald-500'],['maintenance','bg-amber-500'],['offline','bg-red-500']].map(([status, activeCls]) => (
              <button key={status} onClick={() => setSettings(s => ({ ...s, portal_status: status }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                  settings.portal_status === status ? `${activeCls} text-white border-transparent` : isDark ? 'border-slate-600 text-slate-400 hover:border-slate-500' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="text-xs text-white px-6" style={{ background: GRADIENT }}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function ClientPortalManagerPage() {
  const { user }   = useAuth();
  const { isDark } = useDark();
  const navigate   = useNavigate();
  const location   = useLocation();

  const [portalUsers, setPortalUsers]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [manageTarget, setManageTarget] = useState(null);

  const isAdmin = user?.role === 'admin';

  // Determine active tab from path
  const path = location.pathname;
  let activeTab = 'overview';
  if (path.endsWith('/clients'))   activeTab = 'clients';
  if (path.endsWith('/documents')) activeTab = 'documents';
  if (path.endsWith('/messages'))  activeTab = 'messages';
  if (path.endsWith('/settings'))  activeTab = 'settings';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/client-portal/users');
      setPortalUsers(res.data || []);
    } catch { toast.error('Failed to load portal users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleManage = (pu) => {
    setManageTarget({ clientId: pu.client_id, clientName: pu.client_name || pu.portal_username });
  };

  const activeCount   = portalUsers.filter((u) => u.is_active).length;
  const inactiveCount = portalUsers.length - activeCount;

  return (
    <div>
      {/* ── Branded Header with sub-nav ── */}
      <ClientPortalHeader
        title="Client Portal Manager"
        subtitle="Manage client portal access, permissions and visibility"
        actions={
          <Button size="sm" variant="ghost" onClick={loadUsers} className="text-white/70 hover:text-white hover:bg-white/15 border border-white/20">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      {/* ── Stat Cards ── */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" variants={containerVariants} initial="hidden" animate="visible">
        <StatCard icon={Users}     label="Total Portal Users" value={portalUsers.length} color={COLORS.deepBlue}     bg={`${COLORS.deepBlue}12`} />
        <StatCard icon={UserCheck} label="Active"             value={activeCount}        color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} />
        <StatCard icon={Lock}      label="Inactive"           value={inactiveCount}      color="#94a3b8"             bg="#94a3b812" />
        <StatCard icon={Globe}     label="Portal Status"      value="Live"               color="#1F6FB2"             bg="#1F6FB212" />
      </motion.div>

      {/* ── Info banners ── */}
      {!isAdmin && (
        <div className={`mb-5 flex items-start gap-3 p-4 rounded-xl border ${isDark ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">You have read-only access to the Client Portal. Contact an administrator to add or modify portal users.</p>
        </div>
      )}
      {isAdmin && (
        <div className={`mb-5 flex items-start gap-3 p-4 rounded-xl border ${isDark ? 'bg-slate-700/50 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
          <p className="text-xs leading-relaxed">
            <strong>Tip:</strong> To create a new portal account, go to the{' '}
            <button onClick={() => navigate('/clients')} className="underline font-semibold text-blue-600 dark:text-blue-400">Clients page</button>
            , open a client, and use the Portal Access panel. Use the <Settings className="inline h-3 w-3" /> button on each card below to manage an existing account.
          </p>
        </div>
      )}

      {/* ── Active Tab Content ── */}
      {activeTab === 'overview'  && <OverviewTab   portalUsers={portalUsers} loading={loading} navigate={navigate} isAdmin={isAdmin} isDark={isDark} onManage={handleManage} />}
      {activeTab === 'clients'   && <ClientsTab    portalUsers={portalUsers} loading={loading} onManage={handleManage} isAdmin={isAdmin} isDark={isDark} />}
      {activeTab === 'documents' && <DocumentsTab  portalUsers={portalUsers} loading={loading} isDark={isDark} />}
      {activeTab === 'messages'  && <MessagesTab   portalUsers={portalUsers} isDark={isDark} />}
      {activeTab === 'settings'  && <SettingsTab   isDark={isDark} />}

      {/* ── Manage modal ── */}
      {manageTarget && (
        <ClientPortalManager
          clientId={manageTarget.clientId}
          clientName={manageTarget.clientName}
          onClose={() => { setManageTarget(null); loadUsers(); }}
        />
      )}
    </div>
  );
}
