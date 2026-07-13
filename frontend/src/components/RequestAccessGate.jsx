import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, Send, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useDark } from '@/hooks/useDark';

/**
 * Wraps any Accounts-module page (Purchase, Sale, Bank, Chart of Accounts,
 * Journal Entries, Accounting Reports). Admin always sees `children`
 * directly. Everyone else sees a "request access" screen until an admin
 * approves them from Permission Governance — at which point the page just
 * works next time they load it (no separate unlock step needed).
 *
 * `module` must match a key in backend/permission_governance.py's
 * GOVERNED_MODULES. `permissionFlag` is the UserPermissions field that,
 * once true, unlocks `children`.
 */
function RequestAccessGate({ module, moduleLabel, permissionFlag, children }) {
  const isDark = useDark();
  const { user, hasPermission } = useAuth();
  const [myRequest, setMyRequest] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const granted = user?.role === 'admin' || hasPermission(permissionFlag);

  useEffect(() => {
    if (granted) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await api.get('/permission-governance/requests/mine');
        const mine = (data || []).find(r => r.module === module);
        setMyRequest(mine || null);
      } catch {
        // non-fatal — just show the request button
      } finally {
        setLoading(false);
      }
    })();
  }, [granted, module]);

  if (granted) return children;

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/permission-governance/requests', { module, reason });
      setMyRequest(data.access_request);
      toast.success(data.duplicate ? 'Request already pending' : 'Access request sent to your admin');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not send the request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`min-h-[70vh] flex items-center justify-center p-6 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div className={`max-w-md w-full rounded-3xl border shadow-sm p-8 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{moduleLabel} needs admin approval</h2>
        <p className="text-sm text-slate-400 mt-2">
          This is part of the Accounts module, so it's admin-only by default. Ask your admin to approve access, or send a request below.
        </p>

        {loading ? (
          <div className="h-10" />
        ) : myRequest?.status === 'pending' ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-xl py-3 px-4 text-sm font-semibold">
            <Clock className="h-4 w-4" /> Request pending admin approval
          </div>
        ) : myRequest?.status === 'rejected' ? (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-xl py-3 px-4 text-sm font-semibold">
              <XCircle className="h-4 w-4" /> Previous request was declined
            </div>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Add a reason (optional) and try again..."
              className={`w-full rounded-xl border p-3 text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
              rows={2}
            />
            <Button onClick={submitRequest} disabled={submitting} className="w-full rounded-xl">
              <Send className="h-4 w-4 mr-2" /> Request again
            </Button>
          </div>
        ) : myRequest?.status === 'approved' ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl py-3 px-4 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Approved — refresh the page
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why do you need access? (optional)"
              className={`w-full rounded-xl border p-3 text-sm ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
              rows={2}
            />
            <Button onClick={submitRequest} disabled={submitting} className="w-full rounded-xl">
              <Send className="h-4 w-4 mr-2" /> Request access
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestAccessGate;
