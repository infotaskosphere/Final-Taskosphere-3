import React, { useEffect, useState } from 'react';
import { FileText, Users, KeyRound, Archive } from 'lucide-react';
import api from '@/lib/api';
import useDark from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { HubBanner, StatCard, LinkCard, HUB_COLORS, extractCount } from '@/components/SectionHub.jsx';

const MODULES = [
  {
    path: '/dsc', icon: FileText, label: 'DSC Register',
    description: 'Track digital signature certificates, expiry dates and custodians.',
    color: HUB_COLORS.mediumBlue, permission: 'can_view_all_dsc', countKey: 'dsc',
  },
  {
    path: '/documents', icon: Archive, label: 'Document Register',
    description: 'Central register of client documents received and returned.',
    color: '#F59E0B', permission: 'can_view_documents', countKey: 'documents',
  },
  {
    path: '/clients', icon: Users, label: 'Clients',
    description: 'Master list of every client, their groups, contacts and status.',
    color: HUB_COLORS.emeraldGreen, countKey: 'clients',
  },
  {
    path: '/passwords', icon: KeyRound, label: 'Password Vault',
    description: 'Securely store and retrieve client portal credentials.',
    color: '#7C3AED', permission: 'can_view_passwords', countKey: 'passwords',
  },
];

export default function RecordsDashboard() {
  const isDark = useDark();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});

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
      const requests = {
        dsc:       api.get('/dsc', { params: { limit: 500 }, _silent: true }),
        documents: api.get('/documents', { _silent: true }),
        clients:   api.get('/clients', { params: { page: 1, page_size: 1 }, _silent: true }),
        passwords: api.get('/passwords', { params: { limit: 500 }, _silent: true }),
      };
      const keys = Object.keys(requests);
      const results = await Promise.allSettled(keys.map((k) => requests[k]));
      if (cancelled) return;
      const next = {};
      results.forEach((r, i) => {
        const key = keys[i];
        if (r.status === 'fulfilled') {
          const data = r.value?.data;
          next[key] = extractCount(data, key === 'clients' ? 'total' : undefined);
        } else {
          next[key] = null;
        }
      });
      setCounts(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (v) => (v === null || v === undefined ? '—' : v);

  const stats = [
    { label: 'Clients', value: fmt(counts.clients), loading },
    { label: 'DSC Records', value: fmt(counts.dsc), loading },
    { label: 'Documents', value: fmt(counts.documents), loading },
  ];

  return (
    <div>
      <HubBanner
        icon={Archive}
        eyebrow="Records"
        title="Records Dashboard"
        subtitle="Everything you keep on file — clients, DSCs, documents and credentials — in one place."
        isDark={isDark}
        stats={stats}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={Users} label="Clients" value={fmt(counts.clients)} loading={loading} color={HUB_COLORS.emeraldGreen} isDark={isDark} />
        <StatCard icon={FileText} label="DSC Records" value={fmt(counts.dsc)} loading={loading} color={HUB_COLORS.mediumBlue} isDark={isDark} />
        <StatCard icon={Archive} label="Documents" value={fmt(counts.documents)} loading={loading} color="#F59E0B" isDark={isDark} />
        <StatCard icon={KeyRound} label="Password Vault" value={fmt(counts.passwords)} loading={loading} color="#7C3AED" isDark={isDark} />
      </div>

      <h2 className={`text-sm font-extrabold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        Record Modules
      </h2>
      {visibleModules.length === 0 ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You don't have access to any record modules yet. Contact your admin to request access.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleModules.map((m) => (
            <LinkCard key={m.path} {...m} badge={fmt(counts[m.countKey])} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
}
