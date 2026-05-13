import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Settings,
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

/* ── Stat Card ─────────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color, bg }) {
  const { isDark } = useDark();
  return (
    <motion.div
      variants={itemVariants}
      className={`rounded-2xl p-5 border flex items-center gap-4 shadow-sm ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: bg }}
      >
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </motion.div>
  );
}

/* ── Portal User Card ──────────────────────────────────────────────────────── */
function PortalUserCard({ pu, onManage, isAdmin }) {
  const { isDark } = useDark();
  const perm = pu.permissions || pu; // support flat or nested permissions

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
      transition={springCard}
      className={`rounded-2xl border overflow-hidden shadow-sm ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}
    >
      {/* Colour strip */}
      <div
        className="h-1.5 w-full"
        style={{ background: pu.is_active ? GRADIENT : '#94a3b8' }}
      />

      <div className="p-5">
        {/* Avatar + name + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ background: GRADIENT }}
            >
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

        {/* Client name pill */}
        {pu.client_name && (
          <div className={`flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg ${
            isDark ? 'bg-slate-700/60' : 'bg-slate-50'
          }`}>
            <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
              {pu.client_name}
            </span>
          </div>
        )}

        {/* Permission badges */}
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

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/client-portal', '_blank')}
            className="flex-1 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Portal
          </Button>
          {isAdmin && onManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onManage(pu)}
              className="text-xs"
              title="Manage this client's portal"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */
export default function ClientPortalManagerPage() {
  const { user }   = useAuth();
  const { isDark } = useDark();
  const navigate   = useNavigate();

  const [portalUsers, setPortalUsers] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');

  // State for opening the existing ClientPortalManager modal
  const [manageTarget, setManageTarget] = useState(null); // { clientId, clientName }

  const isAdmin = user?.role === 'admin';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/client-portal/users');
      setPortalUsers(res.data || []);
    } catch {
      toast.error('Failed to load portal users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Open existing ClientPortalManager modal for a specific client
  const handleManage = (pu) => {
    setManageTarget({ clientId: pu.client_id, clientName: pu.client_name || pu.portal_username });
  };

  const filtered = portalUsers.filter((pu) => {
    const q = search.toLowerCase();
    return (
      (pu.display_name    || '').toLowerCase().includes(q) ||
      (pu.portal_username || '').toLowerCase().includes(q) ||
      (pu.client_name     || '').toLowerCase().includes(q) ||
      (pu.email           || '').toLowerCase().includes(q)
    );
  });

  const activeCount   = portalUsers.filter((u) => u.is_active).length;
  const inactiveCount = portalUsers.length - activeCount;

  return (
    <div>
      {/* ── Branded Header ── */}
      <ClientPortalHeader
        title="Client Portal Manager"
        subtitle="Manage client portal access, permissions and visibility"
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={loadUsers}
            className="text-white/70 hover:text-white hover:bg-white/15 border border-white/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      {/* ── Stat Cards ── */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <StatCard
          icon={Users}
          label="Total Portal Users"
          value={portalUsers.length}
          color={COLORS.deepBlue}
          bg={`${COLORS.deepBlue}12`}
        />
        <StatCard
          icon={UserCheck}
          label="Active"
          value={activeCount}
          color={COLORS.emeraldGreen}
          bg={`${COLORS.emeraldGreen}12`}
        />
        <StatCard
          icon={Lock}
          label="Inactive"
          value={inactiveCount}
          color="#94a3b8"
          bg="#94a3b812"
        />
        <StatCard
          icon={Globe}
          label="Portal Status"
          value="Live"
          color="#1F6FB2"
          bg="#1F6FB212"
        />
      </motion.div>

      {/* ── Read-only notice for non-admin ── */}
      {!isAdmin && (
        <div className={`mb-5 flex items-start gap-3 p-4 rounded-xl border ${
          isDark
            ? 'bg-blue-900/20 border-blue-800 text-blue-300'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            You have read-only access to the Client Portal. Contact an administrator to add or
            modify portal users.
          </p>
        </div>
      )}

      {/* ── Tip for admins: portal accounts created from Clients page ── */}
      {isAdmin && (
        <div className={`mb-5 flex items-start gap-3 p-4 rounded-xl border ${
          isDark
            ? 'bg-slate-700/50 border-slate-600 text-slate-300'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
          <p className="text-xs leading-relaxed">
            <strong>Tip:</strong> To create a new portal account, go to the{' '}
            <button
              onClick={() => navigate('/clients')}
              className="underline font-semibold text-blue-600 dark:text-blue-400"
            >
              Clients page
            </button>
            , open a client, and use the Portal Access panel. Use the{' '}
            <Settings className="inline h-3 w-3" /> button on each card below to manage an existing account.
          </p>
        </div>
      )}

      {/* ── User List Card ── */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Card header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${
          isDark ? 'border-slate-700' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
              <Shield className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                Portal Accounts
              </h3>
              <p className="text-xs text-slate-400">
                {filtered.length} of {portalUsers.length} users
              </p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search clients or users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-48 sm:w-64"
            />
          </div>
        </div>

        {/* Grid / empty / loading */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading portal users…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: `${COLORS.deepBlue}10` }}
              >
                <Building2 className="h-6 w-6" style={{ color: COLORS.deepBlue }} />
              </div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-sm mb-1">
                {search ? 'No results found' : 'No portal users yet'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs">
                {search
                  ? 'Try a different search term.'
                  : 'Portal accounts are created from the Clients page. Open a client and use the Portal Access panel to invite them.'}
              </p>
              {!search && (
                <Button
                  size="sm"
                  className="mt-4 text-xs text-white"
                  onClick={() => navigate('/clients')}
                  style={{ background: GRADIENT }}
                >
                  <ChevronRight className="h-3.5 w-3.5 mr-1" /> Go to Clients
                </Button>
              )}
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {filtered.map((pu) => (
                <PortalUserCard
                  key={pu.id}
                  pu={pu}
                  isAdmin={isAdmin}
                  onManage={handleManage}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Existing ClientPortalManager modal (reused, not duplicated) ── */}
      {manageTarget && (
        <ClientPortalManager
          clientId={manageTarget.clientId}
          clientName={manageTarget.clientName}
          onClose={() => {
            setManageTarget(null);
            loadUsers(); // refresh list after modal closes
          }}
        />
      )}
    </div>
  );
}
