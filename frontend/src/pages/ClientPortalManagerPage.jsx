import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useDark } from '@/hooks/useDark.jsx';
import api from '@/lib/api.js';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ClientPortalHeader from '@/components/layout/ClientPortalHeader.jsx';
import ClientPortalManager from '@/components/ClientPortalManager.jsx';
import {
  Building2, Users, Shield, FileText, ExternalLink,
  Search, Globe, Lock, CreditCard, ClipboardList,
  ChevronRight, RefreshCw, UserCheck, Loader2, AlertCircle,
  Settings, MessageSquare, Mail, FolderOpen, FolderTree,
  Plus, Trash2, GripVertical, FolderPlus, CheckCircle2,
  XCircle, Play, RotateCcw, Check, X, ChevronDown, ChevronUp,
  Folder, FolderCheck,
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

/* ── All Clients Tab ────────────────────────────────────────────────────────── */
function AllClientsTab({ isDark, isAdmin }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [manageTarget, setManageTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/client-portal/all-clients');
      setClients(res.data || []);
    } catch { toast.error('Failed to load clients'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const name = (c.company_name || c.name || '').toLowerCase();
    const matchSearch = !q || name.includes(q) || (c.email || '').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (filter === 'portal') return c.has_portal;
    if (filter === 'no-portal') return !c.has_portal;
    if (filter === 'drive') return c.has_drive;
    if (filter === 'no-drive') return !c.has_drive;
    return true;
  });

  const stats = {
    total: clients.length,
    portal: clients.filter(c => c.has_portal).length,
    drive: clients.filter(c => c.has_drive).length,
    noPortal: clients.filter(c => !c.has_portal).length,
  };

  const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'portal', label: 'Has Portal' },
    { key: 'no-portal', label: 'No Portal' },
    { key: 'drive', label: 'Drive Linked' },
    { key: 'no-drive', label: 'No Drive' },
  ];

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Clients', value: stats.total, color: COLORS.deepBlue },
          { label: 'Portal Connected', value: stats.portal, color: COLORS.emeraldGreen },
          { label: 'Drive Linked', value: stats.drive, color: '#3B82F6' },
          { label: 'No Portal Yet', value: stats.noPortal, color: '#94a3b8' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  filter === f.key
                    ? 'text-white border-transparent'
                    : isDark ? 'border-slate-600 text-slate-400 hover:border-slate-500' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
                style={filter === f.key ? { background: GRADIENT } : {}}
              >{f.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-48" />
            </div>
            <Button variant="ghost" size="sm" onClick={load} className="h-8 w-8 p-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading clients…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{search || filter !== 'all' ? 'No clients match your filter' : 'No clients found'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  {['Client', 'Type', 'Contact', 'Portal', 'Drive', ...(isAdmin ? ['Actions'] : [])].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const name = c.company_name || c.name || '—';
                  const portalUser = c.portal_users?.[0];
                  return (
                    <tr key={c.id} className={`border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: GRADIENT }}>
                            {name[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="font-medium text-xs text-slate-800 dark:text-slate-200">{name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs text-slate-500 capitalize">{c.client_type || c.type || '—'}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-xs text-slate-500 space-y-0.5">
                          {c.email && <p className="truncate max-w-[160px]">{c.email}</p>}
                          {c.phone && <p>{c.phone}</p>}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {c.has_portal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {portalUser?.portal_username ? `@${portalUser.portal_username}` : 'Connected'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Not connected
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {c.has_drive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                            <FolderCheck className="h-3 w-3" /> Linked
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-3">
                          <button
                            onClick={() => setManageTarget({ clientId: c.id, clientName: c.company_name || c.name })}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                          >
                            <Settings className="h-3.5 w-3.5" /> Manage Portal
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manageTarget && (
        <ClientPortalManager
          clientId={manageTarget.clientId}
          clientName={manageTarget.clientName}
          onClose={() => { setManageTarget(null); load(); }}
        />
      )}
    </div>
  );
}


/* ── Folder Architect Tab ───────────────────────────────────────────────────── */
/* ── Individual Folder Panel ─────────────────────────────────────────────── */
function IndividualFolderPanel({ clients, loadingClients, subfolders, parentId, isDark, onRefresh }) {
  const [search, setSearch] = useState('');
  const [customNames, setCustomNames] = useState({});   // clientId → custom name
  const [editingId, setEditingId] = useState(null);    // which client is being name-edited
  const [applyingSingle, setApplyingSingle] = useState(null);

  const filtered = clients.filter(c => {
    const name = (c.company_name || c.name || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const applyToClient = async (clientId, defaultName) => {
    const customName = customNames[clientId]?.trim() || defaultName;
    setApplyingSingle(clientId);
    try {
      const res = await api.post('/client-portal/drive/create-individual-folder', {
        client_id: clientId,
        client_name: defaultName,
        custom_folder_name: customName !== defaultName ? customName : undefined,
        parent_folder_id: parentId || null,
        subfolders: subfolders.length > 0 ? subfolders : undefined,
      });
      if (res.data.folder_link) {
        toast.success(`Folder "${customName}" created!`, {
          action: { label: 'Open', onClick: () => window.open(res.data.folder_link, '_blank') },
        });
      } else {
        toast.success(`Folder created for ${customName}!`);
      }
      onRefresh && onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to create folder for ${defaultName}`);
    } finally {
      setApplyingSingle(null);
    }
  };

  if (loadingClients) {
    return <div className="flex items-center gap-2 py-6 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading clients…</span></div>;
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…"
          className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-50 border-slate-200'}`}
        />
      </div>

      {/* Client list */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No clients found.</p>}
        {filtered.map(c => {
          const defaultName = c.company_name || c.name || '—';
          const customName = customNames[c.id] ?? defaultName;
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className={`rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: GRADIENT }}>
                  {defaultName[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{defaultName}</p>
                  {c.has_drive && (
                    <p className="text-[10px] text-emerald-600 flex items-center gap-1"><FolderCheck className="h-3 w-3" /> Drive folder exists</p>
                  )}
                </div>
              </div>

              {/* Custom folder name input */}
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={customName}
                      onChange={e => setCustomNames(prev => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder={`Folder name (default: ${defaultName})`}
                      className={`flex-1 px-2 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDark ? 'bg-slate-700 border-slate-500 text-slate-200' : 'bg-white border-slate-300'}`}
                      onKeyDown={e => { if (e.key === 'Enter') { setEditingId(null); } if (e.key === 'Escape') { setEditingId(null); setCustomNames(p => ({ ...p, [c.id]: defaultName })); } }}
                    />
                    <button onClick={() => setEditingId(null)} className="text-emerald-500 hover:text-emerald-700 p-1" title="Done"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => { setEditingId(null); setCustomNames(p => ({ ...p, [c.id]: defaultName })); }} className="text-slate-400 hover:text-slate-600 p-1" title="Reset"><X className="h-3.5 w-3.5" /></button>
                  </>
                ) : (
                  <>
                    <div className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs truncate ${isDark ? 'bg-slate-600/40' : 'bg-white border border-slate-200'}`}>
                      <Folder className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                      <span className="truncate text-slate-600 dark:text-slate-300">{customName || defaultName}</span>
                      {customName !== defaultName && customName && (
                        <span className="ml-1 text-[10px] text-blue-500 font-medium flex-shrink-0">(custom)</span>
                      )}
                    </div>
                    <button onClick={() => setEditingId(c.id)} className={`p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition text-[10px] border ${isDark ? 'border-slate-600' : 'border-slate-200'}`} title="Edit folder name">
                      ✏️
                    </button>
                  </>
                )}
                <Button
                  size="sm"
                  disabled={applyingSingle === c.id || (subfolders.length === 0)}
                  onClick={() => applyToClient(c.id, defaultName)}
                  className="text-[10px] h-7 px-2.5 flex-shrink-0 text-white"
                  style={{ background: c.has_drive ? '#059669' : GRADIENT }}
                  title={c.has_drive ? 'Re-create / update folder' : 'Create Drive folder'}
                >
                  {applyingSingle === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3 mr-0.5" />}
                  {c.has_drive ? 'Re-apply' : 'Create'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {subfolders.length === 0 && (
        <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ Define subfolders in the Folder Architecture panel on the left before creating.
        </p>
      )}
    </div>
  );
}

function FolderArchitectTab({ isDark, isAdmin }) {
  const [subfolders, setSubfolders] = useState([]);
  const [parentId, setParentId] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClients, setSelectedClients] = useState([]);
  const [bulkMode, setBulkMode] = useState('all');
  const [applying, setApplying] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkFilter, setBulkFilter] = useState('all');

  const [singleClient, setSingleClient] = useState('');
  const [applyingSingle, setApplyingSingle] = useState(null);

  const loadTemplate = useCallback(async () => {
    setLoadingTemplate(true);
    try {
      const res = await api.get('/client-portal/folder-template');
      setSubfolders(res.data.subfolders || []);
      setParentId(res.data.parent_folder_id || '');
    } catch { toast.error('Failed to load template'); }
    finally { setLoadingTemplate(false); }
  }, []);

  const loadClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const res = await api.get('/client-portal/all-clients');
      setClients(res.data || []);
    } catch {}
    finally { setLoadingClients(false); }
  }, []);

  useEffect(() => { loadTemplate(); loadClients(); }, [loadTemplate, loadClients]);

  const addFolder = () => {
    const trimmed = newFolder.trim();
    if (!trimmed) return;
    if (subfolders.includes(trimmed)) { toast.error('Folder already exists'); return; }
    setSubfolders(p => [...p, trimmed]);
    setNewFolder('');
  };

  const removeFolder = (name) => setSubfolders(p => p.filter(f => f !== name));

  const moveFolder = (idx, dir) => {
    const arr = [...subfolders];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setSubfolders(arr);
  };

  const saveTemplate = async () => {
    if (subfolders.length === 0) { toast.error('Add at least one subfolder'); return; }
    setSaving(true);
    try {
      await api.put('/client-portal/folder-template', { subfolders, parent_folder_id: parentId });
      toast.success('Folder template saved!');
    } catch { toast.error('Failed to save template'); }
    finally { setSaving(false); }
  };

  const applyToClient = async (clientId, clientName) => {
    setApplyingSingle(clientId);
    try {
      const res = await api.post('/client-portal/drive/create-folders', {
        client_name: clientName,
        client_id: clientId,
        parent_folder_id: parentId || null,
        subfolders,
      });
      if (res.data.folder_link) {
        toast.success(`Folder created for ${clientName}!`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed for ${clientName}`);
    } finally {
      setApplyingSingle(null);
      loadClients();
    }
  };

  const applyBulk = async () => {
    if (subfolders.length === 0) { toast.error('Save the template first'); return; }
    const clientIds = bulkMode === 'selected' ? selectedClients : [];
    if (bulkMode === 'selected' && clientIds.length === 0) { toast.error('Select at least one client'); return; }
    setApplying(true);
    setBulkResults(null);
    try {
      const res = await api.post('/client-portal/drive/bulk-create-folders', {
        client_ids: clientIds.length > 0 ? clientIds : null,
        parent_folder_id: parentId || null,
        subfolders,
      });
      setBulkResults(res.data);
      toast.success(`Done! ${res.data.succeeded}/${res.data.total} folders created.`);
      loadClients();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Bulk creation failed');
    } finally { setApplying(false); }
  };

  const toggleClient = (id) => {
    setSelectedClients(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const PRESET_TEMPLATES = {
    'CA Firm': ['Documents', 'Invoices', 'Compliance', 'Income Tax', 'GST Returns', 'Audit Reports', 'Bank Statements', 'Correspondence'],
    'CS Firm': ['Documents', 'ROC Filings', 'Board Minutes', 'Compliance', 'Invoices', 'Correspondence', 'Agreements'],
    'Standard': ['Documents', 'Invoices', 'Compliance', 'Correspondence', 'Reports', 'Bank Statements'],
    'Minimal': ['Documents', 'Invoices', 'Misc'],
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Folder Structure Designer */}
        <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`flex items-center gap-2.5 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
              <FolderTree className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Folder Architecture</h3>
              <p className="text-xs text-slate-400">Design the subfolder template for client Drive folders</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Preset Templates */}
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Quick Presets</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PRESET_TEMPLATES).map(([name, folders]) => (
                  <button key={name} onClick={() => setSubfolders(folders)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${isDark ? 'border-slate-600 text-slate-300 hover:border-blue-500' : 'border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'}`}
                  >{name}</button>
                ))}
              </div>
            </div>

            {/* Parent Folder */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">
                Parent Folder ID <span className="font-normal text-slate-400">(optional – leave blank for Drive root)</span>
              </label>
              <Input value={parentId} onChange={e => setParentId(e.target.value)} placeholder="Paste Drive folder ID…" className="text-xs font-mono" />
            </div>

            {/* Subfolder List */}
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Subfolders <span className="font-normal text-slate-400">({subfolders.length})</span></p>
              {loadingTemplate ? (
                <div className="flex items-center gap-2 py-6 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Loading…</span></div>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {subfolders.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No subfolders yet. Add one below or pick a preset.</p>
                  )}
                  {subfolders.map((name, idx) => (
                    <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-700/40' : 'border-slate-100 bg-slate-50'}`}>
                      <Folder className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                      <span className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-300">{name}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveFolder(idx, -1)} disabled={idx === 0} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveFolder(idx, 1)} disabled={idx === subfolders.length - 1} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-30">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeFolder(name)} className="w-5 h-5 flex items-center justify-center rounded text-red-400 hover:text-red-600">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add folder input */}
              <div className="flex gap-2">
                <Input
                  value={newFolder}
                  onChange={e => setNewFolder(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFolder()}
                  placeholder="New subfolder name…"
                  className="text-xs flex-1"
                />
                <Button size="sm" onClick={addFolder} className="text-white px-3" style={{ background: GRADIENT }}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Preview */}
            {subfolders.length > 0 && (
              <div className={`rounded-xl p-3 border ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-blue-100 bg-blue-50'}`}>
                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-2">Preview</p>
                <div className="font-mono text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                  <p>📁 [Client Name]</p>
                  {subfolders.map((f, i) => (
                    <p key={i} className="ml-4">├── 📁 {f}</p>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <Button onClick={saveTemplate} disabled={saving || subfolders.length === 0} className="w-full text-white text-xs" style={{ background: GRADIENT }}>
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : <><Check className="h-3.5 w-3.5 mr-1" />Save Template</>}
              </Button>
            )}
          </div>
        </div>

        {/* Right: Apply to Clients */}
        <div className="space-y-4">
          {/* Individual Apply — with custom folder name */}
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className={`flex items-center gap-2.5 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="p-1.5 rounded-lg" style={{ background: '#3B82F612' }}>
                <Folder className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Add Folder to Company</h3>
                <p className="text-xs text-slate-400">Create a Drive folder for any client — optionally with a custom folder name</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {/* Quick-add a single folder for any company */}
              <IndividualFolderPanel clients={clients} loadingClients={loadingClients} subfolders={subfolders} parentId={parentId} isDark={isDark} onRefresh={loadClients} />
            </div>
          </div>

          {/* Bulk Apply */}
          {isAdmin && (
            <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className={`flex items-center gap-2.5 px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.emeraldGreen}15` }}>
                  <FolderPlus className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Bulk Apply to All / Selected</h3>
                  <p className="text-xs text-slate-400">Create Drive folders for multiple clients at once</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                {/* Mode Toggle */}
                <div className="flex gap-2">
                  {[['all','All Clients'],['selected','Selected Clients']].map(([k,l]) => (
                    <button key={k} onClick={() => setBulkMode(k)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        bulkMode === k ? 'text-white border-transparent' : isDark ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500'
                      }`}
                      style={bulkMode === k ? { background: GRADIENT } : {}}
                    >{l}</button>
                  ))}
                </div>

                {/* Search + Filter row */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <input
                      value={bulkSearch}
                      onChange={e => setBulkSearch(e.target.value)}
                      placeholder="Search clients…"
                      className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        isDark ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'
                      }`}
                    />
                  </div>
                  <select
                    value={bulkFilter}
                    onChange={e => setBulkFilter(e.target.value)}
                    className={`border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="all">All statuses</option>
                    <option value="no-portal">No Portal</option>
                    <option value="has-portal">Has Portal</option>
                    <option value="no-drive">No Drive</option>
                    <option value="has-drive">Drive Linked</option>
                    <option value="pvt_ltd">Pvt Ltd</option>
                    <option value="llp">LLP</option>
                    <option value="partnership">Partnership</option>
                    <option value="proprietor">Proprietor</option>
                    <option value="huf">HUF</option>
                    <option value="trust">Trust</option>
                  </select>
                </div>

                {/* Client list (selected mode) */}
                {bulkMode === 'selected' && (() => {
                  const q = bulkSearch.toLowerCase();
                  const visibleClients = clients.filter(c => {
                    const name = (c.company_name || c.name || '').toLowerCase();
                    if (q && !name.includes(q)) return false;
                    if (bulkFilter === 'no-portal') return !c.has_portal;
                    if (bulkFilter === 'has-portal') return c.has_portal;
                    if (bulkFilter === 'no-drive') return !c.has_drive;
                    if (bulkFilter === 'has-drive') return c.has_drive;
                    if (['pvt_ltd','llp','partnership','proprietor','huf','trust'].includes(bulkFilter))
                      return (c.client_type || c.type || '') === bulkFilter;
                    return true;
                  });
                  return (
                    <div className="space-y-1">
                      {visibleClients.length === 0 ? (
                        <p className="text-center py-6 text-xs text-slate-400">No clients match your search / filter.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {visibleClients.map(c => {
                            const name = c.company_name || c.name || '—';
                            const checked = selectedClients.includes(c.id);
                            return (
                              <label key={c.id} onClick={() => toggleClient(c.id)} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                                checked
                                  ? isDark ? 'border-blue-600 bg-blue-900/30' : 'border-blue-300 bg-blue-50'
                                  : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-100 hover:border-slate-200'
                              }`}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : isDark ? 'border-slate-600' : 'border-slate-300'}`}>
                                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">{name}</span>
                                {c.client_type && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 capitalize flex-shrink-0">
                                    {c.client_type.replace('_', ' ')}
                                  </span>
                                )}
                                {c.has_drive && <FolderCheck className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setSelectedClients(visibleClients.map(c => c.id))}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Select visible
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          onClick={() => setSelectedClients(clients.map(c => c.id))}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-slate-300">·</span>
                        <button onClick={() => setSelectedClients([])} className="text-xs text-slate-400 hover:underline">Clear</button>
                        <span className="text-xs text-slate-400 ml-auto">
                          {selectedClients.length} / {clients.length} selected
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* All mode – show filtered count info */}
                {bulkMode === 'all' && (bulkSearch || bulkFilter !== 'all') && (() => {
                  const q = bulkSearch.toLowerCase();
                  const visible = clients.filter(c => {
                    const name = (c.company_name || c.name || '').toLowerCase();
                    if (q && !name.includes(q)) return false;
                    if (bulkFilter === 'no-portal') return !c.has_portal;
                    if (bulkFilter === 'has-portal') return c.has_portal;
                    if (bulkFilter === 'no-drive') return !c.has_drive;
                    if (bulkFilter === 'has-drive') return c.has_drive;
                    if (['pvt_ltd','llp','partnership','proprietor','huf','trust'].includes(bulkFilter))
                      return (c.client_type || c.type || '') === bulkFilter;
                    return true;
                  });
                  return (
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-700/50' : 'bg-blue-50'}`}>
                      <span className="text-slate-500 dark:text-slate-400">
                        Filter active — <strong className="text-blue-600 dark:text-blue-400">{visible.length}</strong> of {clients.length} clients match
                      </span>
                      <button
                        onClick={() => {
                          setBulkMode('selected');
                          setSelectedClients(visible.map(c => c.id));
                        }}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline ml-2"
                      >
                        Switch to selected →
                      </button>
                    </div>
                  );
                })()}

                {/* Create button */}
                <Button
                  onClick={applyBulk}
                  disabled={applying || subfolders.length === 0}
                  className="w-full text-white text-xs"
                  style={{ background: GRADIENT }}
                >
                  {applying ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Creating folders…</>
                  ) : (
                    <><Play className="h-3.5 w-3.5 mr-1.5" />
                    {bulkMode === 'all'
                      ? `Create Folders for All ${clients.length} Clients`
                      : `Create Folders for ${selectedClients.length} Client${selectedClients.length !== 1 ? 's' : ''}`
                    }
                    </>
                  )}
                </Button>

                {/* Results */}
                {bulkResults && (
                  <div className={`rounded-xl p-4 border space-y-2 ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bulk Result</span>
                      <span className="text-[10px] text-emerald-600 font-semibold">{bulkResults.succeeded} succeeded</span>
                      {bulkResults.failed > 0 && <span className="text-[10px] text-red-500 font-semibold">{bulkResults.failed} failed</span>}
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {bulkResults.results.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {r.success
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                            : <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                          <span className="text-slate-600 dark:text-slate-300 truncate">{r.client_name}</span>
                          {r.success && r.folder_link && (
                            <a href={r.folder_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-auto flex-shrink-0">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {!r.success && <span className="text-red-400 text-[10px] ml-auto">{r.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
      // Backend returns { files: [...], hidden_ids: [...] } — extract the files array
      const raw = res.data;
      setDocs(Array.isArray(raw) ? raw : (raw?.files ?? []));
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
const MSG_TEMPLATES = [
  {
    type: "dsc_expiry",
    label: "🔐 DSC Expiry Alert",
    subject: "Your DSC is expiring soon",
    body: "Dear {client},

We would like to inform you that your Digital Signature Certificate (DSC) is due to expire soon. Please arrange for its renewal at the earliest to avoid any disruptions in your compliance filings and digital transactions.

Kindly contact us or our team to initiate the renewal process.

Regards,
Your CA / CS Team",
  },
  {
    type: "compliance_due",
    label: "📋 Compliance Due Date",
    subject: "Upcoming compliance due dates",
    body: "Dear {client},

This is a reminder that the following compliance filing(s) are due soon. Please ensure that all required documents and data are shared with us at the earliest so that filings can be completed on time and penalties are avoided.

Please reach out to us if you have any queries.

Regards,
Your CA / CS Team",
  },
  {
    type: "invoice_reminder",
    label: "🧾 Invoice Reminder",
    subject: "Professional fee invoice pending",
    body: "Dear {client},

This is a gentle reminder that you have an outstanding professional fee invoice. Request you to kindly arrange the payment at the earliest.

Please feel free to contact us for any queries regarding the invoice.

Regards,
Your CA / CS Team",
  },
  {
    type: "general",
    label: "💬 General Message",
    subject: "",
    body: "",
  },
  {
    type: "custom",
    label: "📢 Custom Notice",
    subject: "",
    body: "",
  },
];

function MessagesTab({ portalUsers, isDark }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [form, setForm] = useState({ to_portal_user_id: '', subject: '', body: '', message_type: 'general' });
  const [sending, setSending] = useState(false);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try { const res = await api.get('/client-portal/messages'); setMessages(res.data || []); }
      catch { setMessages([]); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const applyTemplate = (tpl) => {
    setSelectedTemplate(tpl.type);
    const clientName = portalUsers.find(u => u.id === form.to_portal_user_id)?.display_name || "Client";
    setForm(f => ({
      ...f,
      subject: tpl.subject,
      body: tpl.body.replace("{client}", clientName),
      message_type: tpl.type,
    }));
  };

  const send = async () => {
    if (!form.to_portal_user_id || !form.body) { toast.error('Please select a client and enter a message.'); return; }
    setSending(true);
    try {
      const res = await api.post('/client-portal/messages', form);
      toast.success('Message sent to client portal!');
      // add to local list
      setMessages(prev => [{
        id: res.data.id,
        subject: form.subject,
        body: form.body,
        message_type: form.message_type,
        to_display_name: portalUsers.find(u => u.id === form.to_portal_user_id)?.display_name || '?',
        created_at: new Date().toISOString(),
        is_read: false,
      }, ...prev]);
      setCompose(false);
      setForm({ to_portal_user_id: '', subject: '', body: '', message_type: 'general' });
      setSelectedTemplate(null);
    } catch { toast.error('Failed to send message'); }
    finally { setSending(false); }
  };

  const deleteMsg = async (id) => {
    try {
      await api.delete(`/client-portal/messages/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
      toast.success('Message deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const MSG_TYPE_COLORS = {
    dsc_expiry:       { badge: 'bg-red-100 text-red-700',    icon: '🔐' },
    compliance_due:   { badge: 'bg-orange-100 text-orange-700', icon: '📋' },
    invoice_reminder: { badge: 'bg-blue-100 text-blue-700',  icon: '🧾' },
    general:          { badge: 'bg-gray-100 text-gray-600',  icon: '💬' },
    custom:           { badge: 'bg-purple-100 text-purple-700', icon: '📢' },
  };

  const filtered = filterType === 'all' ? messages : messages.filter(m => m.message_type === filterType);

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
            <MessageSquare className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Portal Messages</h3>
            <p className="text-xs text-slate-400">Send DSC alerts, compliance reminders & communications to clients</p>
          </div>
        </div>
        <Button size="sm" className="text-xs text-white" style={{ background: GRADIENT }} onClick={() => setCompose(true)}>
          <Mail className="h-3.5 w-3.5 mr-1" /> Compose
        </Button>
      </div>
      <div className="p-5 space-y-4">
        {compose && (
          <div className={`rounded-xl border p-4 space-y-4 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-indigo-100 bg-indigo-50'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">New Message</p>
              <button onClick={() => { setCompose(false); setSelectedTemplate(null); }} className="text-slate-400 hover:text-slate-600 text-xs">✕ Close</button>
            </div>

            {/* Quick Templates */}
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Quick Templates</p>
              <div className="flex flex-wrap gap-2">
                {MSG_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.type}
                    onClick={() => applyTemplate(tpl)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                      selectedTemplate === tpl.type
                        ? 'text-white border-transparent shadow-sm'
                        : isDark ? 'border-slate-600 text-slate-300 hover:border-blue-500' : 'border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'
                    }`}
                    style={selectedTemplate === tpl.type ? { background: GRADIENT } : {}}
                  >{tpl.label}</button>
                ))}
              </div>
            </div>

            {/* To */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">To (Client)</label>
              <select value={form.to_portal_user_id}
                onChange={(e) => {
                  const uid = e.target.value;
                  setForm(f => ({ ...f, to_portal_user_id: uid }));
                  // re-apply template with correct client name if one was selected
                  if (selectedTemplate) {
                    const tpl = MSG_TEMPLATES.find(t => t.type === selectedTemplate);
                    const clientName = portalUsers.find(u => u.id === uid)?.display_name || "Client";
                    if (tpl) setForm(f => ({ ...f, to_portal_user_id: uid, body: tpl.body.replace("{client}", clientName) }));
                  }
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
              >
                <option value="">— Select client portal user —</option>
                {portalUsers.filter(u => u.is_active).map((u) =>
                  <option key={u.id} value={u.id}>{u.display_name || u.portal_username} {u.client_name ? `(${u.client_name})` : ''}</option>
                )}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Subject</label>
              <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Optional subject line…" className="text-sm" />
            </div>

            {/* Message Body */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Message</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                rows={6}
                placeholder="Write your message here…"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-white border-slate-200'}`}
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" disabled={sending} onClick={send} className="text-xs text-white" style={{ background: GRADIENT }}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
                {sending ? 'Sending…' : 'Send to Portal'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCompose(false); setSelectedTemplate(null); }} className="text-xs">Cancel</Button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {messages.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {[['all','All'],['dsc_expiry','🔐 DSC'],['compliance_due','📋 Compliance'],['invoice_reminder','🧾 Invoice'],['general','💬 General']].map(([k,l]) => (
              <button key={k} onClick={() => setFilterType(k)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  filterType === k ? 'text-white border-transparent' : isDark ? 'border-slate-600 text-slate-400' : 'border-slate-200 text-slate-500'
                }`}
                style={filterType === k ? { background: GRADIENT } : {}}
              >{l}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading messages…</span></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${COLORS.deepBlue}10` }}>
              <MessageSquare className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">No messages yet</h3>
            <p className="text-xs text-slate-400 max-w-xs">Use the Compose button to send a message or alert to a portal client.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((msg) => {
              const typeKey = msg.message_type || 'general';
              const meta = MSG_TYPE_COLORS[typeKey] || MSG_TYPE_COLORS.general;
              return (
                <div key={msg.id} className={`rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="text-base mt-0.5 flex-shrink-0">{meta.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>{typeKey.replace('_',' ')}</span>
                          <span className="text-[10px] text-slate-400">→ {msg.to_display_name || '?'}</span>
                          <span className="text-[10px] text-slate-400">{msg.created_at ? new Date(msg.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{msg.subject || '(no subject)'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{msg.body}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteMsg(msg.id)} className="text-slate-300 hover:text-red-500 flex-shrink-0 p-1" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
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
  if (path.endsWith('/all-clients'))      activeTab = 'all-clients';
  if (path.endsWith('/clients'))          activeTab = 'clients';
  if (path.endsWith('/folder-architect')) activeTab = 'folder-architect';
  if (path.endsWith('/documents'))        activeTab = 'documents';
  if (path.endsWith('/messages'))         activeTab = 'messages';
  if (path.endsWith('/settings'))         activeTab = 'settings';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/client-portal/users');
      setPortalUsers(Array.isArray(res.data) ? res.data : (res.data?.users ?? res.data?.items ?? []));
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
            <strong>Tip:</strong> Use{' '}
            <button onClick={() => navigate('/client-portal-manager/all-clients')} className="underline font-semibold text-blue-600 dark:text-blue-400">All Clients</button>{' '}
            to view and manage portal access for every client. Use{' '}
            <button onClick={() => navigate('/client-portal-manager/folder-architect')} className="underline font-semibold text-blue-600 dark:text-blue-400">Folder Architect</button>{' '}
            to design your Drive folder structure and bulk-create folders. When a portal user is created, their Drive folder is created automatically.
          </p>
        </div>
      )}

      {/* ── Active Tab Content ── */}
      {activeTab === 'overview'         && <OverviewTab        portalUsers={portalUsers} loading={loading} navigate={navigate} isAdmin={isAdmin} isDark={isDark} onManage={handleManage} />}
      {activeTab === 'all-clients'      && <AllClientsTab      isDark={isDark} isAdmin={isAdmin} />}
      {activeTab === 'clients'          && <ClientsTab         portalUsers={portalUsers} loading={loading} onManage={handleManage} isAdmin={isAdmin} isDark={isDark} />}
      {activeTab === 'folder-architect' && <FolderArchitectTab isDark={isDark} isAdmin={isAdmin} />}
      {activeTab === 'documents'        && <DocumentsTab       portalUsers={portalUsers} loading={loading} isDark={isDark} />}
      {activeTab === 'messages'         && <MessagesTab        portalUsers={portalUsers} isDark={isDark} />}
      {activeTab === 'settings'         && <SettingsTab        isDark={isDark} />}

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
