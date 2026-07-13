import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle, Clock, UserX } from 'lucide-react';
import GifLoader from '@/components/ui/GifLoader.jsx';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A', amber: '#F59E0B', coral: '#FF6B6B' };

function PermissionGovernance() {
  const isDark = useDark();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [grants, setGrants] = useState([]);
  const [tab, setTab] = useState('pending');
  const [modules, setModules] = useState([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [reqR, grantsR, modsR] = await Promise.allSettled([
        api.get('/permission-governance/requests'),
        api.get('/permission-governance/grants'),
        api.get('/permission-governance/modules'),
      ]);
      setRequests(reqR.status === 'fulfilled' ? (reqR.value.data || []) : []);
      setGrants(grantsR.status === 'fulfilled' ? (grantsR.value.data || []) : []);
      setModules(modsR.status === 'fulfilled' ? (modsR.value.data || []) : []);
    } catch {
      toast.error('Failed to load permission governance data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const pending = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const decided = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);

  const decide = async (id, action) => {
    try {
      await api.post(`/permission-governance/requests/${id}/${action}`, { note: '' });
      toast.success(action === 'approve' ? 'Access granted' : 'Request rejected');
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const revoke = async (userId, moduleKey) => {
    if (!window.confirm('Revoke this access?')) return;
    try {
      await api.post(`/permission-governance/users/${userId}/revoke?module=${moduleKey}`);
      toast.success('Access revoked');
      await fetchAll();
    } catch {
      toast.error('Failed to revoke');
    }
  };

  if (loading) return <GifLoader />;

  const moduleFlags = modules.map(m => m.flag);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
        <div className="rounded-3xl overflow-hidden shadow-xl" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-5 text-white">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-blue-100 font-bold">Admin</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Permission Governance</h1>
                <p className="text-sm text-blue-100 mt-1 max-w-2xl">Approve or reject staff requests for Purchase, Sale, Bank, and other Accounts-module access. You have full access to all of it by default — nobody else does until you say so.</p>
              </div>
            </div>
            <Button onClick={fetchAll} variant="outline" className="bg-white/10 border-white/25 text-white hover:bg-white/20"><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
          </div>
        </div>

        <div className="flex gap-2">
          {[{ id: 'pending', label: `Pending (${pending.length})` }, { id: 'history', label: 'History' }, { id: 'grants', label: 'Current Access' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border ${tab === t.id ? 'text-white' : isDark ? 'text-slate-300 border-slate-700' : 'text-slate-600 border-slate-200'}`}
              style={tab === t.id ? { background: COLORS.deepBlue, borderColor: 'transparent' } : {}}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'pending' && (
          <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {pending.length === 0 ? (
              <div className="py-16 text-center"><Clock className="h-10 w-10 mx-auto text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-400">No pending requests</p></div>
            ) : (
              <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                {pending.map(r => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{r.user_name} <span className="font-normal text-slate-400">· {r.user_email}</span></p>
                      <p className="text-xs text-slate-400 mt-1">Requesting <span className="font-semibold">{r.module_label}</span> access</p>
                      {r.reason && <p className="text-xs text-slate-400 mt-1 italic">"{r.reason}"</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => decide(r.id, 'approve')} className="rounded-xl bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, 'reject')} className="rounded-xl text-rose-600 border-rose-200"><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {decided.length === 0 ? (
              <div className="py-16 text-center"><p className="text-sm font-semibold text-slate-400">No decisions yet</p></div>
            ) : (
              <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                {decided.map(r => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{r.user_name} — {r.module_label}</p>
                      <p className="text-xs text-slate-400 mt-1">Decided by {r.decided_by_name || '—'}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'grants' && (
          <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
              {grants.filter(u => u.role !== 'admin').map(u => {
                const activeModules = modules.filter(m => u.permissions?.[m.flag]);
                if (activeModules.length === 0) return null;
                return (
                  <div key={u.id} className="p-4">
                    <p className={`font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{u.full_name || u.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {activeModules.map(m => (
                        <span key={m.module} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {m.label}
                          <button onClick={() => revoke(u.id, m.module)} title="Revoke"><UserX className="h-3 w-3 hover:text-rose-600" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PermissionGovernance;
