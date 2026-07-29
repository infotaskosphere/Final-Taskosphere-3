import React, { useEffect, useState } from 'react';
import { Target, Receipt, Trophy, Send, Clock3 } from 'lucide-react';
import api from '@/lib/api';
import useDark from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { HubBanner, StatCard, LinkCard, HUB_COLORS } from '@/components/SectionHub.jsx';

const fmtC = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const MODULES = [
  {
    path: '/leads', icon: Target, label: 'Lead Management',
    description: 'Pipeline of prospective clients from first contact through to won/lost.',
    color: HUB_COLORS.mediumBlue, permission: 'can_view_all_leads',
  },
  {
    path: '/quotations', icon: Receipt, label: 'Quotations',
    description: 'Create, send and track quotations issued to leads and clients.',
    color: HUB_COLORS.emeraldGreen, permission: 'can_create_quotations',
  },
];

export default function ClientProposalsDashboard() {
  const isDark = useDark();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState([]);
  const [quotations, setQuotations] = useState([]);

  const canSee = (m) => {
    if (!m.permission) return true;
    if (user?.role === 'admin') return true;
    return hasPermission(m.permission);
  };
  const visibleModules = MODULES.filter(canSee);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [leadsRes, quotesRes] = await Promise.allSettled([
        api.get('/leads', { _silent: true }),
        api.get('/quotations', { _silent: true }),
      ]);
      if (cancelled) return;
      if (leadsRes.status === 'fulfilled') setLeads(Array.isArray(leadsRes.value.data) ? leadsRes.value.data : []);
      if (quotesRes.status === 'fulfilled') setQuotations(Array.isArray(quotesRes.value.data) ? quotesRes.value.data : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const wonLeads = leads.filter((l) => l.status === 'won').length;
  const activeLeads = leads.filter((l) => l.status && !['won', 'lost'].includes(l.status)).length;
  const wonValue = leads
    .filter((l) => l.status === 'won')
    .reduce((s, l) => s + (Number(l.quotation_amount) || 0), 0);
  const pendingQuotes = quotations.filter((q) => q.status === 'draft' || q.status === 'sent').length;
  const acceptedQuotes = quotations.filter((q) => q.status === 'accepted').length;
  const acceptedValue = quotations
    .filter((q) => q.status === 'accepted')
    .reduce((s, q) => s + (Number(q.total) || 0), 0);

  const badgeFor = (path) => {
    if (path === '/leads') return loading ? '—' : leads.length;
    if (path === '/quotations') return loading ? '—' : quotations.length;
    return null;
  };

  const stats = [
    { label: 'Active Leads', value: loading ? '—' : activeLeads, loading },
    { label: 'Won Value', value: loading ? '—' : fmtC(wonValue), loading },
    { label: 'Pending Quotes', value: loading ? '—' : pendingQuotes, loading },
  ];

  return (
    <div>
      <HubBanner
        icon={Target}
        eyebrow="Client Proposals"
        title="Client Proposals Dashboard"
        subtitle="Everything between a first conversation and a signed quotation."
        isDark={isDark}
        stats={stats}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Clock3} label="Active Leads" value={loading ? '—' : activeLeads} loading={loading} color={HUB_COLORS.mediumBlue} isDark={isDark} />
        <StatCard icon={Trophy} label="Won Leads" value={loading ? '—' : wonLeads} loading={loading} color={HUB_COLORS.emeraldGreen} isDark={isDark} />
        <StatCard icon={Send} label="Pending Quotations" value={loading ? '—' : pendingQuotes} loading={loading} color="#F59E0B" isDark={isDark} />
        <StatCard icon={Receipt} label="Accepted Quotations" value={loading ? '—' : acceptedQuotes} loading={loading} color="#7C3AED" isDark={isDark} />
      </div>

      <h2 className={`text-sm font-extrabold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        Proposal Modules
      </h2>
      {visibleModules.length === 0 ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You don't have access to any proposal modules yet. Contact your admin to request access.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleModules.map((m) => (
            <LinkCard key={m.path} {...m} badge={badgeFor(m.path)} isDark={isDark} />
          ))}
        </div>
      )}

      {acceptedValue > 0 && (
        <p className={`mt-6 text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Accepted quotation value this list: <span style={{ color: HUB_COLORS.emeraldGreen }}>{fmtC(acceptedValue)}</span>
        </p>
      )}
    </div>
  );
}
