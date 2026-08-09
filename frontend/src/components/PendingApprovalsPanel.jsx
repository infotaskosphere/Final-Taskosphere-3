import React, { useState, useEffect } from 'react';
import { Check, X, Loader2, Cake, Sparkles, MessageSquare, Mail } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';

const KIND_ICON = { birthday: Cake, festival: Sparkles };
const CHANNEL_ICON = { whatsapp: MessageSquare, email: Mail };

export default function PendingApprovalsPanel(props) {
  const { isDark: hookIsDark } = useDark();
  const { user } = useAuth();
  const isDark = props.isDark ?? hookIsDark;
  const currentUserRole = props.currentUserRole ?? user?.role;
  const canApproveWhatsapp = props.canApproveWhatsapp ?? !!user?.permissions?.can_approve_whatsapp_wishes;
  const canApproveEmail = props.canApproveEmail ?? !!user?.permissions?.can_approve_email_wishes;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  // Admins always have full access. Non-admins need at least one of the
  // two delegated rights (granted per-user in the Permission Matrix,
  // Records module → "Automation — approve WhatsApp/Email wishes").
  const hasAnyAccess = currentUserRole === 'admin' || canApproveWhatsapp || canApproveEmail;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/automation/pending-approvals', { params: { status: 'pending' } });
      setItems(res.data);
    } catch (err) {
      toast.error('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (hasAnyAccess) load(); else setLoading(false); }, [hasAnyAccess]);

  const act = async (id, action) => {
    setActingId(id);
    try {
      await api.post(`/automation/pending-approvals/${id}/${action}`);
      setItems(prev => prev.filter(i => i.id !== id));
      toast.success(action === 'approve' ? 'Sent' : 'Rejected');
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action}`);
    } finally {
      setActingId(null);
    }
  };

  const border = isDark ? 'border-slate-700' : 'border-slate-200';
  const cardBg = isDark ? 'bg-slate-800' : 'bg-white';

  // Frontend gate mirrors the backend's require_approval_access — UX only,
  // the API itself enforces this (and filters by channel) regardless.
  if (!hasAnyAccess) {
    return (
      <div className="text-center py-10">
        <p className="text-sm font-semibold text-slate-500">No approval rights granted</p>
        <p className="text-xs text-slate-400 mt-1">Ask an admin to grant WhatsApp/Email approval rights in the Permission Matrix.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400">
        No wishes waiting for approval right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const KIcon = KIND_ICON[item.kind] || Sparkles;
        const CIcon = CHANNEL_ICON[item.channel] || MessageSquare;
        return (
          <div key={item.id} className={`rounded-xl border ${border} ${cardBg} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: '#0D3B66' }}>
                  <KIcon className="h-3.5 w-3.5" /> {item.kind === 'birthday' ? 'Birthday Wish' : 'Festival Greeting'}
                  <span className="text-slate-300">•</span>
                  <CIcon className="h-3.5 w-3.5" /> {item.channel}
                </div>
                <div className="text-sm font-semibold mt-1">{item.recipient_name}</div>
                <div className="text-xs text-slate-400">{item.client_name} · {item.recipient_contact}</div>
                {item.subject && <div className="text-xs font-semibold mt-1.5">{item.subject}</div>}
                <p className={`text-sm mt-1 whitespace-pre-wrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {item.message}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => act(item.id, 'approve')}
                  disabled={actingId === item.id}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
                  style={{ background: '#15803D' }}
                  title="Approve & Send"
                >
                  {actingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => act(item.id, 'reject')}
                  disabled={actingId === item.id}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white"
                  style={{ background: '#DC2626' }}
                  title="Reject"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
