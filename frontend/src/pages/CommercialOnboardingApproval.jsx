import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, CheckCircle2, XCircle, Loader2, ShieldCheck, Building2,
  Clock, Search, RefreshCw, Eye, AlertCircle, Boxes, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import useDark from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { HubBanner } from '@/components/SectionHub.jsx';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All applications' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];
const MODULE_OPTIONS = [
  ['task_management', 'Taskosphere / Task Management'], ['finix', 'Finix / Accounting'],
  ['gst', 'GST'], ['income_tax', 'Income Tax'], ['roc', 'ROC / Compliance'],
  ['trademark', 'Trademark / IP'], ['payroll', 'Payroll'], ['hr', 'HR'],
  ['crm', 'CRM / Leads'], ['inventory', 'Inventory'], ['document_management', 'Document Management'],
  ['workflow', 'Workflow'], ['analytics', 'Analytics'],
];
const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-800', under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-800',
};
const prettyStatus = (value) => String(value || 'pending').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function CommercialOnboardingApproval() {
  const isDark = useDark();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [licenseType, setLicenseType] = useState('standard');
  const [maxUsers, setMaxUsers] = useState('10');
  const [licenseDays, setLicenseDays] = useState('365');
  const [schemaType, setSchemaType] = useState('isolated');
  const [approvedModules, setApprovedModules] = useState([]);

  const card = isDark ? 'bg-slate-800/70 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-sm';
  const subtle = isDark ? 'text-slate-400' : 'text-slate-500';
  const input = isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-800';

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const params = {};
      if (status !== 'all') params.status = status;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/v2/commercial-onboarding/submissions', { params, _silent: true });
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      setRows([]);
      if (error?.response?.status === 403) toast.error('Platform-owner administrator access is required.');
      else if (error?.response?.status !== 404) toast.error(error?.response?.data?.detail || 'Unable to load onboarding applications.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [status, search]);

  useEffect(() => { load(); }, [load]);
  const counts = useMemo(() => {
    const result = { pending: 0, under_review: 0, approved: 0, rejected: 0 };
    rows.forEach((row) => { if (result[row.status] !== undefined) result[row.status] += 1; });
    return result;
  }, [rows]);

  const openReview = (row) => {
    setSelected(row); setReviewNotes(row.review_notes || '');
    setLicenseType(row.approved_license_type || row.license_type || 'standard');
    setMaxUsers(String(row.approved_max_users || row.user_count || 10));
    setLicenseDays('365'); setSchemaType('isolated');
    setApprovedModules(row.approved_modules || row.modules || []);
  };

  const review = async (action) => {
    if (!selected) return;
    if (action === 'approve') {
      if (!approvedModules.length) return toast.error('Select at least one module to approve.');
      if (!Number.isInteger(Number(maxUsers)) || Number(maxUsers) < 1) return toast.error('Enter a valid approved user limit.');
    }
    const applicationId = selected.application_id;
    setBusyId(applicationId);
    try {
      const { data } = await api.post(
        \`/v2/commercial-onboarding/submissions/\${encodeURIComponent(applicationId)}/review\`,
        {
          action, review_notes: reviewNotes,
          ...(action === 'approve' ? {
            license_type: licenseType, max_users: Number(maxUsers), modules: approvedModules,
            schema_type: schemaType, license_days: Number(licenseDays),
          } : {}),
        },
      );
      if (action === 'approve') {
        toast.success('Application approved. Tenant and license are awaiting activation.');
        if (data?.license_key) {
          setSelected({ ...selected, _issuedLicenseKey: data.license_key, _provisioning: data });
          await load(true);
          return;
        }
      } else if (action === 'reject') toast.success('Application rejected.');
      else toast.success('Application moved to under review.');
      setSelected(null); await load(true);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to update application.');
    } finally { setBusyId(null); }
  };

  if (!isAdmin) return (
    <div className={\`rounded-2xl border p-8 \${card}\`}>
      <ShieldCheck className="h-8 w-8 text-rose-500 mb-3" />
      <h2 className="text-lg font-bold">Platform-owner access required</h2>
      <p className={\`text-sm mt-1 \${subtle}\`}>Commercial onboarding records are available only to platform-owner administrators.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <HubBanner icon={ClipboardCheck} eyebrow="Commercial Licensing" title="Onboarding Approval"
        subtitle="Review licensee applications received from the public onboarding form. Tenant and license provisioning starts only after an explicit platform-owner approval."
        isDark={isDark} stats={[
          { label: 'Pending', value: counts.pending, loading },
          { label: 'Under review', value: counts.under_review, loading },
          { label: 'Approved', value: counts.approved, loading },
        ]} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATUS_OPTIONS.slice(1).map((option) => (
          <button key={option.value} type="button" onClick={() => setStatus(option.value)}
            className={\`rounded-xl border p-3 text-left transition-colors \${status === option.value ? 'border-blue-500 ring-1 ring-blue-500' : isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'}\`}>
            <div className={\`text-xs \${subtle}\`}>{option.label}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">{counts[option.value]}</div>
          </button>
        ))}
      </div>
      <div className={\`rounded-xl border p-3 flex flex-col md:flex-row gap-3 md:items-center \${card}\`}>
        <div className="relative flex-1"><Search className={\`h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 \${subtle}\`} />
          <input aria-label="Search onboarding applications" value={search}
            onChange={(e) => setSearch(e.target.value)} placeholder="Search application ID, name, email or PAN"
            className={\`w-full rounded-lg border pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 \${input}\`} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={\`rounded-lg border px-3 py-2 text-sm \${input}\`}>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60">
          <RefreshCw className={\`h-4 w-4 \${refreshing ? 'animate-spin' : ''}\`} /> Refresh
        </button>
      </div>
      {loading ? <div className={\`py-12 flex items-center justify-center gap-2 text-sm \${subtle}\`}><Loader2 className="h-4 w-4 animate-spin" /> Loading applications…</div>
        : rows.length === 0 ? <div className={\`rounded-2xl border p-10 text-center \${card}\`}>
          <ShieldCheck className="h-9 w-9 mx-auto mb-3 text-emerald-500" /><p className="font-bold">No applications found</p>
          <p className={\`text-sm mt-1 \${subtle}\`}>New submissions appear here automatically. Check the status filter or refresh.</p>
        </div> : <div className={\`rounded-xl border overflow-hidden \${card}\`}><div className="overflow-x-auto">
          <table className="min-w-[940px] w-full text-sm"><thead className={isDark ? 'bg-slate-900/80' : 'bg-slate-50'}>
            <tr className={\`text-xs uppercase tracking-wide \${subtle}\`}>
              {['Application', 'Applicant', 'License request', 'Submitted', 'Status', 'Action'].map((heading) => <th key={heading} className="text-left px-4 py-3 font-semibold">{heading}</th>)}
            </tr></thead><tbody>
            {rows.map((row) => <tr key={row.application_id} className={\`border-t \${isDark ? 'border-slate-700' : 'border-slate-100'}\`}>
              <td className="px-4 py-3 align-top"><div className="font-bold">{row.application_id}</div><div className={\`text-xs mt-1 \${subtle}\`}>{row.city}, {row.state}</div></td>
              <td className="px-4 py-3 align-top"><div className="font-semibold">{row.trade_name || row.legal_name}</div><div className={\`text-xs mt-1 \${subtle}\`}>{row.email}</div><div className={\`text-xs \${subtle}\`}>{row.mobile}</div></td>
              <td className="px-4 py-3 align-top"><div>{row.license_type} · {row.user_count} users</div><div className={\`text-xs mt-1 \${subtle}\`}>{(row.modules || []).map((m) => m.replaceAll('_', ' ')).join(', ')}</div></td>
              <td className="px-4 py-3 align-top whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-3 align-top"><span className={\`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold \${STATUS_STYLE[row.status] || STATUS_STYLE.pending}\`}>{prettyStatus(row.status)}</span></td>
              <td className="px-4 py-3 align-top"><button type="button" onClick={() => openReview(row)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-700"><Eye className="h-3.5 w-3.5" /> {['pending', 'under_review'].includes(row.status) ? 'Review' : 'View'}</button></td>
            </tr>)}
          </tbody></table>
        </div></div>}

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="onboarding-review-title">
        <div className={\`w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border p-5 sm:p-6 \${card}\`}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-teal-500/10 p-2.5"><Building2 className="h-5 w-5 text-teal-600" /></div>
            <div className="min-w-0 flex-1"><h2 id="onboarding-review-title" className="text-xl font-bold">{selected.trade_name || selected.legal_name}</h2>
              <p className={\`text-xs mt-1 \${subtle}\`}>{selected.application_id} · {selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</p></div>
            <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="rounded-lg border p-2">×</button>
          </div>
          {selected._issuedLicenseKey && <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2 font-bold"><KeyRound className="h-4 w-4" /> Provisioned — license key shown once</div>
            <p className="text-xs mt-1">Store this key securely. The license remains pending activation.</p>
            <code className="block mt-3 break-all rounded-lg bg-white p-3 text-sm">{selected._issuedLicenseKey}</code>
            <button type="button" onClick={() => navigator.clipboard?.writeText(selected._issuedLicenseKey)} className="mt-2 text-xs font-bold underline">Copy license key</button>
            <p className="text-xs mt-2">Tenant: {selected._provisioning?.tenant_id} · License: {selected._provisioning?.license_id}</p>
          </div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            {[
              ['Legal name', selected.legal_name], ['Constitution', selected.constitution], ['PAN', selected.pan], ['GSTIN', selected.gstin],
              ['Registration number', selected.registration_no], ['Business type', selected.business_type], ['Contact person', selected.contact_name],
              ['Designation', selected.designation], ['Email', selected.email], ['Mobile', selected.mobile], ['Website', selected.website],
              ['Client count', selected.client_count], ['Deployment', selected.deployment], ['Migration', selected.migration],
              ['Data isolation', selected.isolation], ['Branding', selected.branding], ['Custom domain', selected.custom_domain],
              ['Integrations', (selected.integrations || []).join(', ')],
            ].filter(([, value]) => value).map(([label, value]) => <div key={label} className={\`rounded-lg border p-3 \${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}\`}>
              <div className={\`text-[11px] font-semibold uppercase tracking-wide \${subtle}\`}>{label}</div><div className="text-sm mt-1 break-words">{value}</div>
            </div>)}
            <div className={\`md:col-span-2 rounded-lg border p-3 \${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}\`}>
              <div className={\`text-[11px] font-semibold uppercase tracking-wide \${subtle}\`}>Registered address</div>
              <div className="text-sm mt-1 whitespace-pre-wrap">{selected.address}, {selected.city}, {selected.state} {selected.pin}</div>
            </div>
            {selected.business_description && <div className={\`md:col-span-2 rounded-lg border p-3 \${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}\`}><div className={\`text-[11px] font-semibold uppercase tracking-wide \${subtle}\`}>Business description</div><div className="text-sm mt-1 whitespace-pre-wrap">{selected.business_description}</div></div>}
            {selected.notes && <div className={\`md:col-span-2 rounded-lg border p-3 \${isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}\`}><div className={\`text-[11px] font-semibold uppercase tracking-wide \${subtle}\`}>Applicant notes</div><div className="text-sm mt-1 whitespace-pre-wrap">{selected.notes}</div></div>}
          </div>
          {['pending', 'under_review'].includes(selected.status) && !selected._issuedLicenseKey && <div className={\`mt-5 rounded-xl border p-4 space-y-4 \${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}\`}>
            <div className="flex items-center gap-2 font-bold"><Boxes className="h-4 w-4" /> Approval configuration</div>
            <p className={\`text-xs \${subtle}\`}>Confirm limits/modules before approval. Provisioning only runs after explicit approval.</p>
            <div><label className="block text-xs font-semibold mb-2">Approved modules</label><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODULE_OPTIONS.map(([value, label]) => <label key={value} className={\`flex items-center gap-2 rounded-lg border p-2.5 text-sm \${isDark ? 'border-slate-700' : 'border-slate-200'}\`}>
                <input type="checkbox" checked={approvedModules.includes(value)} onChange={(e) => setApprovedModules((prev) => e.target.checked ? [...prev, value] : prev.filter((v) => v !== value))} />{label}
              </label>)}
            </div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs font-semibold">License type<select value={licenseType} onChange={(e) => setLicenseType(e.target.value)} className={\`mt-1 w-full rounded-lg border px-3 py-2 text-sm \${input}\`}><option value="standard">Standard</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option><option value="white_label">White label</option><option value="reseller">Reseller / Partner</option></select></label>
              <label className="text-xs font-semibold">Maximum users<input type="number" min="1" max="100000" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className={\`mt-1 w-full rounded-lg border px-3 py-2 text-sm \${input}\`} /></label>
              <label className="text-xs font-semibold">Duration<select value={licenseDays} onChange={(e) => setLicenseDays(e.target.value)} className={\`mt-1 w-full rounded-lg border px-3 py-2 text-sm \${input}\`}><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option><option value="730">2 years</option><option value="1095">3 years</option></select></label>
              <label className="text-xs font-semibold">Tenant environment<select value={schemaType} onChange={(e) => setSchemaType(e.target.value)} className={\`mt-1 w-full rounded-lg border px-3 py-2 text-sm \${input}\`}><option value="isolated">Isolated tenant</option><option value="shared">Shared tenant</option></select></label>
            </div>
            <label className="block text-xs font-semibold">Reviewer notes<textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} maxLength={3000} className={\`mt-1 w-full rounded-lg border p-3 text-sm \${input}\`} placeholder="Verification and commercial terms…" /></label>
          </div>}
          {selected.provisioning?.status === 'failed' && <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="inline h-4 w-4 mr-1" /> Provisioning failed. Check backend records before attempting a retry to avoid duplicate objects.</div>}
          <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Close</button>
            {['pending', 'under_review'].includes(selected.status) && !selected._issuedLicenseKey && <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" disabled={!!busyId} onClick={() => review('under_review')} className="rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busyId ? 'Saving…' : 'Mark under review'}</button>
              <button type="button" disabled={!!busyId} onClick={() => { if (window.confirm('Reject this commercial licensee application?')) review('reject'); }} className="inline-flex justify-center items-center gap-2 rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4" /> Reject</button>
              <button type="button" disabled={!!busyId} onClick={() => { if (window.confirm('Approve and provision a pending-activation tenant/license?')) review('approve'); }} className="inline-flex justify-center items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Approve & provision</button>
            </div>}
          </div>
        </div>
      </div>}
    </div>
  );
}
