// ROCSpherePage.jsx — ROC Sphere: Companies Act (India) document automation
// New, self-contained module. Mirrors the visual language of
// CompliancePage.jsx / TrademarkSphere.jsx / SalarySlips.jsx (Hub banner,
// StatCard, dark-mode-aware Tailwind classes, sonner toasts).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Landmark, Plus, X, Loader2, Trash2, Building2, Users as UsersIcon,
  Download, FileText, Search, RefreshCw, Save, CheckCircle2, Upload,
  ClipboardList, Gavel, NotebookPen, ChevronRight, AlertTriangle, Info,
  ScrollText, Pencil, DatabaseZap, ListChecks, FileSpreadsheet, FileUp,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useDark } from '@/hooks/useDark';
import { HubBanner, StatCard, HUB_COLORS } from '@/components/SectionHub.jsx';

/* ── helpers ─────────────────────────────────────────────────────────── */

async function parseBlobError(err) {
  try {
    const blob = err?.response?.data;
    if (blob instanceof Blob) {
      const text = await blob.text();
      const json = JSON.parse(text);
      return json.detail || 'Something went wrong';
    }
  } catch { /* fall through */ }
  return err?.response?.data?.detail || 'Something went wrong';
}

function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const CATEGORY_LABELS = {
  private: 'Private Limited', public: 'Public Limited', opc: 'One Person Company', section_8: 'Section 8 Company', llp: 'LLP',
};

// financial_data is filled only from AOC-4 uploads (see backend/roc_sphere.py
// FINANCIAL_DATA_FIELDS) — kept read-only here since it's a filing extract,
// not something the user hand-edits on this tab.
const FINANCIAL_DATA_LABELS = [
  ['period_from', 'Period From'],
  ['period_to', 'Period To'],
  ['total_income', 'Total Income (Rs.)'],
  ['total_expenses', 'Total Expenses (Rs.)'],
  ['profit_before_tax', 'Profit Before Tax (Rs.)'],
  ['profit_after_tax', 'Profit / (Loss) After Tax (Rs.)'],
  ['net_worth', 'Net Worth (Rs.)'],
  ['share_capital', 'Share Capital (Rs.)'],
  ['reserves_and_surplus', 'Reserves & Surplus (Rs.)'],
  ['balance_sheet_total', 'Balance Sheet Total (Rs.)'],
];

const emptyCompanyForm = () => ({
  client_id: null,
  company_name: '',
  cin: '',
  category: 'private',
  pan: '',
  date_of_incorporation: '',
  registered_office_address: '',
  authorized_capital: 0,
  paid_up_capital: 0,
  last_year_turnover: 0,
  last_agm_date: '',
  last_board_meeting_date: '',
  directors: [],
  shareholders: [],
  auditor: { name: '', firm_reg_no: '', membership_no: '', appointed_from: '', appointed_till: '' },
  notes: '',
});

const TABS = [
  { key: 'master', label: 'Company Master', icon: Building2 },
  { key: 'masterdata', label: 'Master Data', icon: DatabaseZap },
  { key: 'directors', label: 'Directors & Shareholders', icon: UsersIcon },
  { key: 'resolution', label: 'Board Resolution', icon: Gavel },
  { key: 'notice', label: 'Notice of Meeting', icon: ScrollText },
  { key: 'minutes', label: 'Minutes of Meeting', icon: NotebookPen },
  { key: 'checklist', label: 'Compliance Checklist', icon: ClipboardList },
  { key: 'applicable', label: 'Applicable Compliances', icon: ListChecks },
];

export default function ROCSpherePage() {
  const isDark = useDark();
  const [companies, setCompanies] = useState([]);
  const [eligibleClients, setEligibleClients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('master');
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);

  const card = isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200';
  const text = isDark ? 'text-slate-100' : 'text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const input = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`;

  const loadCompanies = useCallback(async () => {
    try {
      const { data } = await api.get('/roc-sphere/companies');
      setCompanies(data || []);
      return data || [];
    } catch (e) {
      toast.error('Failed to load companies');
      return [];
    }
  }, []);

  const loadEligibleClients = useCallback(async () => {
    try {
      const { data } = await api.get('/roc-sphere/clients-eligible');
      setEligibleClients(data || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await loadCompanies();
      await loadEligibleClients();
      if (list.length) setSelectedId(list[0].id);
      setLoading(false);
    })();
  }, [loadCompanies, loadEligibleClients]);

  const loadOne = useCallback(async (id) => {
    if (!id) { setCompany(null); return; }
    try {
      const { data } = await api.get(`/roc-sphere/companies/${id}`);
      setCompany(data);
    } catch (e) {
      toast.error('Failed to load company');
    }
  }, []);

  useEffect(() => { loadOne(selectedId); }, [selectedId, loadOne]);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => (c.company_name || '').toLowerCase().includes(q) || (c.cin || '').toLowerCase().includes(q));
  }, [companies, search]);

  const saveCompany = async (patch) => {
    if (!company?.id) return;
    try {
      const { data } = await api.put(`/roc-sphere/companies/${company.id}`, { ...company, ...patch });
      setCompany(data);
      setCompanies((prev) => prev.map((c) => (c.id === data.id ? { ...c, ...data } : c)));
      toast.success('Saved');
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Save failed');
    }
  };

  const deleteCompany = async () => {
    if (!company?.id) return;
    if (!window.confirm(`Remove "${company.company_name}" from ROC Sphere? This does not affect the linked client record.`)) return;
    try {
      await api.delete(`/roc-sphere/companies/${company.id}`);
      toast.success('Removed');
      const list = await loadCompanies();
      setSelectedId(list[0]?.id || null);
    } catch {
      toast.error('Delete failed');
    }
  };

  const syncFromClients = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/roc-sphere/companies/sync-from-clients');
      const list = await loadCompanies();
      await loadEligibleClients();
      if (!selectedId && list.length) setSelectedId(list[0].id);
      toast.success(data?.created ? `Added ${data.created} compan${data.created === 1 ? 'y' : 'ies'} from Clients` : 'Already up to date with Clients');
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      {/* Banner and the card grid below now share the same horizontal
          padding (px-4 sm:px-6) and no max-width cap, so their left/right
          edges line up and the cards use the full width available. */}
      <div className="px-4 sm:px-6 pt-6">
        <HubBanner
          icon={Landmark}
          eyebrow="Compliance"
          title="ROC Sphere"
          subtitle="Company master, Companies Act filings & ready-to-file drafts"
          isDark={isDark}
          stats={[
            { label: 'Companies', value: companies.length },
            { label: 'Private Ltd', value: companies.filter((c) => c.category === 'private').length },
            { label: 'Public Ltd', value: companies.filter((c) => c.category === 'public').length },
            { label: 'LLP', value: companies.filter((c) => c.category === 'llp').length },
          ]}
        />
      </div>

      <div className="px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Company list / picker ───────────────────────────────────── */}
        <div className={`lg:col-span-1 rounded-xl border ${card} p-4 h-fit`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold text-sm ${text}`}>Companies</h3>
            <div className="flex items-center gap-1.5">
              <button onClick={syncFromClients} disabled={syncing} title="Sync from Clients"
                className={`p-1.5 rounded-lg disabled:opacity-60 ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
              <button onClick={() => setShowNewCompany(true)} title="Add company manually" className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <p className={`text-[11px] ${muted} mb-3 -mt-2`}>Auto-synced from Pvt Ltd / Public Ltd / LLP / OPC / Section 8 clients</p>
          <div className="relative mb-3">
            <Search size={14} className={`absolute left-2.5 top-2.5 ${muted}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company / CIN…"
              className={`${input} pl-8 py-1.5 text-xs`} />
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
          ) : filteredCompanies.length === 0 ? (
            <p className={`text-xs ${muted} py-6 text-center`}>
              No registered-entity clients found (Pvt Ltd / Public Ltd / LLP / OPC / Section 8).<br />
              Add one as a Client, or click <RefreshCw size={11} className="inline" /> to re-sync, or + to add manually.
            </p>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {filteredCompanies.map((c) => (
                <button key={c.id} onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition
                    ${selectedId === c.id ? 'bg-blue-600 text-white' : isDark ? 'hover:bg-slate-700/60 text-slate-200' : 'hover:bg-slate-100 text-slate-700'}`}>
                  <span className="truncate">
                    <span className="font-medium block truncate">{c.company_name}</span>
                    <span className={`text-[10px] ${selectedId === c.id ? 'text-blue-100' : muted}`}>{CATEGORY_LABELS[c.category] || c.category}</span>
                  </span>
                  <ChevronRight size={12} className="shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {!company ? (
            <div className={`rounded-xl border ${card} p-10 text-center ${muted}`}>
              Select a company on the left, or add one to get started.
            </div>
          ) : (
            <>
              <div className={`rounded-xl border ${card} p-4 flex flex-wrap items-center justify-between gap-2`}>
                <div>
                  <h2 className={`text-lg font-bold ${text}`}>{company.company_name}</h2>
                  <p className={`text-xs ${muted}`}>CIN: {company.cin || '—'} · {CATEGORY_LABELS[company.category] || company.category}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={deleteCompany} className="text-xs flex items-center gap-1 px-2 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10">
                    <Trash2 size={13} /> Remove
                  </button>
                  <button onClick={() => setTab('upload')} className="text-xs flex items-center gap-1 px-2 py-1.5 rounded-lg text-blue-600 hover:bg-blue-500/10">
                    <Upload size={13} /> Upload ROC Forms
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className={`rounded-xl border ${card} overflow-hidden`}>
                <div className={`flex overflow-x-auto border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.key;
                    return (
                      <button key={t.key} onClick={() => setTab(t.key)}
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition
                          ${active ? 'border-blue-600 text-blue-600' : `border-transparent ${muted} hover:text-blue-500`}`}>
                        <Icon size={13} /> {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="p-4">
                  {tab === 'master' && <MasterTab company={company} isDark={isDark} onSave={saveCompany} input={input} text={text} muted={muted} />}
                  {tab === 'masterdata' && <MasterDataTab company={company} isDark={isDark} text={text} muted={muted} onApplied={() => loadOne(company.id)} />}
                  {tab === 'directors' && <DirectorsTab company={company} isDark={isDark} onSave={saveCompany} input={input} text={text} muted={muted} />}
                  {tab === 'resolution' && <ResolutionTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'notice' && <NoticeTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'minutes' && <MinutesTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'checklist' && <ChecklistTab company={company} isDark={isDark} text={text} muted={muted} />}
                  {tab === 'applicable' && <ApplicableCompliancesTab company={company} isDark={isDark} text={text} muted={muted} />}
                  {tab === 'upload' && <UploadTab company={company} isDark={isDark} input={input} text={text} muted={muted} onApplied={() => loadOne(company.id)} />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewCompany && (
        <NewCompanyModal
          isDark={isDark} input={input} text={text} muted={muted}
          eligibleClients={eligibleClients}
          onClose={() => setShowNewCompany(false)}
          onCreated={async (created) => {
            setShowNewCompany(false);
            const list = await loadCompanies();
            await loadEligibleClients();
            setSelectedId(created.id);
            void list;
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * New company modal — from scratch or prefilled from an existing client
 * ═══════════════════════════════════════════════════════════════════════ */

function NewCompanyModal({ isDark, input, text, muted, eligibleClients, onClose, onCreated }) {
  const [form, setForm] = useState(emptyCompanyForm());
  const [saving, setSaving] = useState(false);

  const fromClient = (clientId) => {
    if (!clientId) { setForm(emptyCompanyForm()); return; }
    const c = eligibleClients.find((x) => x.client_id === clientId);
    if (!c) return;
    const catMap = { pvt_ltd: 'private', PVT_LTD: 'private', public_ltd: 'public', section_8: 'section_8', llp: 'llp', LLP: 'llp', opc: 'opc' };
    setForm((f) => ({
      ...f,
      client_id: c.client_id,
      company_name: c.company_name || '',
      category: catMap[c.client_type] || 'private',
      pan: c.pan || '',
      date_of_incorporation: (c.date_of_incorporation || '').slice(0, 10),
      registered_office_address: c.address || '',
    }));
  };

  const submit = async () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/roc-sphere/companies', form);
      toast.success('Company added to ROC Sphere');
      onCreated(data);
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Failed to create company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className={`w-full max-w-lg rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold ${text}`}>Add Company Manually</h3>
          <button onClick={onClose}><X size={18} className={muted} /></button>
        </div>
        <p className={`text-xs ${muted} mb-3`}>Companies from your Clients list sync in automatically — use this only for a company that isn't a Client yet.</p>

        {eligibleClients.length > 0 && (
          <div className="mb-3">
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Or link it to an unsynced client instead</label>
            <select className={input} onChange={(e) => fromClient(e.target.value)} defaultValue="">
              <option value="">— Start from scratch —</option>
              {eligibleClients.map((c) => (
                <option key={c.client_id} value={c.client_id}>{c.company_name} ({c.client_type})</option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Company Name *</label>
            <input className={input} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`text-xs font-medium ${muted} mb-1 block`}>Category</label>
              <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={`text-xs font-medium ${muted} mb-1 block`}>CIN</label>
              <input className={input} value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value.toUpperCase() })} placeholder="U12345GJ2020PTC000000" />
            </div>
          </div>
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Registered Office Address</label>
            <input className={input} value={form.registered_office_address} onChange={(e) => setForm({ ...form, registered_office_address: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className={`px-3 py-1.5 rounded-lg text-sm ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Company Master tab
 * ═══════════════════════════════════════════════════════════════════════ */

function MasterTab({ company, isDark, onSave, input, text, muted }) {
  const [form, setForm] = useState(company);
  useEffect(() => setForm(company), [company]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setNum = (k) => (e) => setForm({ ...form, [k]: parseFloat(e.target.value) || 0 });

  const Field = ({ label, k, type = 'text', numeric }) => (
    <div>
      <label className={`text-xs font-medium ${muted} mb-1 block`}>{label}</label>
      <input type={type} className={input} value={form[k] ?? ''} onChange={numeric ? setNum(k) : set(k)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Company Name" k="company_name" />
        <Field label="CIN" k="cin" />
        <div>
          <label className={`text-xs font-medium ${muted} mb-1 block`}>Category</label>
          <select className={input} value={form.category} onChange={set('category')}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Field label="PAN" k="pan" />
        <Field label="Date of Incorporation" k="date_of_incorporation" type="date" />
        <Field label="Financial Year End (MM-DD)" k="financial_year_end" />
        <Field label="Authorized Capital (Rs.)" k="authorized_capital" numeric />
        <Field label="Paid-up Capital (Rs.)" k="paid_up_capital" numeric />
        <Field label="Last Year's Turnover (Rs.)" k="last_year_turnover" numeric />
        <Field label="Last AGM Date" k="last_agm_date" type="date" />
        <Field label="Last Board Meeting Date" k="last_board_meeting_date" type="date" />
      </div>
      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Registered Office Address</label>
        <textarea className={input} rows={2} value={form.registered_office_address || ''} onChange={set('registered_office_address')} />
      </div>

      <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
        <p className={`text-xs font-semibold ${muted} mb-2`}>Statutory Auditor</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {['name', 'firm_reg_no', 'membership_no'].map((k) => (
            <div key={k}>
              <label className={`text-xs font-medium ${muted} mb-1 block capitalize`}>{k.replace(/_/g, ' ')}</label>
              <input className={input} value={form.auditor?.[k] || ''}
                onChange={(e) => setForm({ ...form, auditor: { ...(form.auditor || {}), [k]: e.target.value } })} />
            </div>
          ))}
        </div>
      </div>

      {company.financial_data && Object.keys(company.financial_data).length > 0 && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`text-xs font-semibold ${muted} mb-2`}>Financial Summary (from AOC-4)</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {FINANCIAL_DATA_LABELS.map(([k, label]) => (
              company.financial_data[k] !== undefined && company.financial_data[k] !== null && company.financial_data[k] !== '' ? (
                <div key={k}>
                  <p className={`text-xs ${muted}`}>{label}</p>
                  <p className={`text-sm ${text}`}>
                    {typeof company.financial_data[k] === 'number'
                      ? company.financial_data[k].toLocaleString('en-IN')
                      : company.financial_data[k]}
                  </p>
                </div>
              ) : null
            ))}
          </div>
          <p className={`text-[11px] ${muted} mt-2`}>Auto-filled from the latest AOC-4 upload on the Upload ROC Forms tab — read-only here.</p>
        </div>
      )}

      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Notes</label>
        <textarea className={input} rows={2} value={form.notes || ''} onChange={set('notes')} />
      </div>

      <button onClick={() => onSave(form)} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
        <Save size={14} /> Save Company Master
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Master Data tab — dedicated MCA Master Data importer, separate code
 * path from the Upload ROC Forms tab (own endpoint, own component). Sits
 * right next to Company Master since it's the fastest way to fill it:
 * upload the MCA "Company/LLP Master Data" PDF/XLSX/CSV and fields are
 * fetched and applied automatically, mirroring Smart Import on Clients.
 * ═══════════════════════════════════════════════════════════════════════ */

function MasterDataTab({ company, isDark, text, muted, onApplied }) {
  const [files, setFiles] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const boxRef = React.useRef(null);
  const master = company.master_data || {};

  const pickFiles = (list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked]);
  };

  const removeFile = (i) => setFiles((prev) => prev.filter((_, x) => x !== i));

  const onDrop = (e) => {
    e.preventDefault();
    boxRef.current?.classList.remove('ring-2', 'ring-blue-500');
    pickFiles(e.dataTransfer.files);
  };

  const fetchAndApply = async () => {
    if (!files.length) { toast.error('Choose the MCA Master Data file (PDF, XLSX or CSV) first'); return; }
    setFetching(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const { data } = await api.post(`/roc-sphere/companies/${company.id}/master-data/fetch`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLastResult(data);
      if (data.applied) {
        setFiles([]);
        onApplied();
        toast.success(`Master Data fetched — ${data.fields_applied.length} field${data.fields_applied.length === 1 ? '' : 's'} updated on Company Master`, { duration: 5000 });
      } else {
        toast.error((data.errors && data.errors[0]) || 'Could not extract Master Data — please check the file');
      }
      if (data.errors?.length && data.applied) {
        data.errors.forEach((e) => toast.warning(e));
      }
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Master Data fetch failed');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${text}`}>Master Data</h3>
      <p className={`text-xs ${muted}`}>
        Upload the MCA "View Company/LLP Master Data" export (PDF, or an MCA master-data XLSX/CSV). Company Master
        fields and the Director/Signatory register are fetched and applied automatically — no manual review step,
        just like Smart Import on the Clients page. This uses its own extraction path, kept separate from
        Upload ROC Forms so a filing PDF never affects Master Data accuracy.
      </p>

      <div
        ref={boxRef}
        onDragOver={(e) => { e.preventDefault(); boxRef.current?.classList.add('ring-2', 'ring-blue-500'); }}
        onDragLeave={() => boxRef.current?.classList.remove('ring-2', 'ring-blue-500')}
        onDrop={onDrop}
        onClick={() => document.getElementById('_master_data_input')?.click()}
        className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition ${isDark ? 'border-slate-700 hover:border-blue-500/60' : 'border-slate-300 hover:border-blue-400'}`}
      >
        <DatabaseZap size={22} className={`mx-auto mb-2 ${muted}`} />
        <p className={`text-xs font-semibold ${text}`}>Drop the MCA Master Data file here, or click to browse</p>
        <p className={`text-[11px] ${muted} mt-1`}>PDF, XLSX or CSV — multiple files are merged into one fetch</p>
        <input id="_master_data_input" type="file" multiple accept=".pdf,.xlsx,.xls,.csv"
          className="hidden" onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {!!files.length && (
        <div className={`rounded-lg border p-3 space-y-1.5 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className={`flex items-center gap-1.5 ${text}`}><FileSpreadsheet size={13} /> {f.name}</span>
              <button onClick={() => removeFile(i)} className="text-red-500"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <button onClick={fetchAndApply} disabled={fetching || !files.length}
        className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
        {fetching ? <Loader2 size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
        Fetch &amp; Apply Master Data
      </button>

      {lastResult?.applied && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-emerald-700/40 bg-emerald-900/10' : 'border-emerald-200 bg-emerald-50'}`}>
          <p className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
            <CheckCircle2 size={13} /> Applied to Company Master
          </p>
          <p className={`text-[11px] ${muted} mt-1`}>{lastResult.fields_applied.join(', ') || '—'}</p>
        </div>
      )}
      {!!lastResult?.errors?.length && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-amber-700/40 bg-amber-900/10' : 'border-amber-200 bg-amber-50'}`}>
          {lastResult.errors.map((e, i) => (
            <p key={i} className={`text-[11px] flex items-start gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {e}
            </p>
          ))}
        </div>
      )}

      {(master.last_fetched_at || Object.keys(master).length > 0) && (
        <div className={`rounded-lg border p-3 text-xs space-y-1 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`font-semibold ${muted} mb-1`}>Last fetched Master Data</p>
          {master.last_fetched_at && <p className={muted}>Fetched {new Date(master.last_fetched_at).toLocaleString('en-IN')}{master.last_fetched_by ? ` by ${master.last_fetched_by}` : ''}</p>}
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
            {['roc_name', 'registration_number', 'email', 'company_status', 'roc_office', 'rd_region', 'date_of_balance_sheet', 'active_compliance'].map((k) => (
              master[k] ? (
                <div key={k} className="flex justify-between gap-2">
                  <span className={muted}>{k.replace(/_/g, ' ')}</span>
                  <span className={text}>{master[k]}</span>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Directors & Shareholders tab
 * ═══════════════════════════════════════════════════════════════════════ */

function DirectorsTab({ company, isDark, onSave, input, text, muted }) {
  const [directors, setDirectors] = useState(company.directors || []);
  const [designatedPartners, setDesignatedPartners] = useState(company.designated_partners || []);
  const [partners, setPartners] = useState(company.partners || []);
  const [shareholders, setShareholders] = useState(company.shareholders || []);
  const isLLP = company.category === 'llp';
  useEffect(() => {
    setDirectors(company.directors || []);
    setDesignatedPartners(company.designated_partners || []);
    setPartners(company.partners || []);
    setShareholders(company.shareholders || []);
  }, [company]);

  const addDirector = () => setDirectors([...directors, { name: '', din: '', designation: 'Director', date_of_appointment: '' }]);
  const addPerson = (setter, list, designation) => setter([...list, { name: '', din: '', designation, date_of_appointment: '' }]);
  const addShareholder = () => setShareholders([...shareholders, { name: '', folio_no: '', shares_held: 0, class_of_shares: 'Equity' }]);

  const totalShares = shareholders.reduce((s, sh) => s + (parseFloat(sh.shares_held) || 0), 0);
  const renderPeople = (title, list, setList, designationOptions) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-sm font-semibold ${text}`}>{title}</h4>
        <button onClick={() => addPerson(setList, list, designationOptions[0])} className="text-xs flex items-center gap-1 text-blue-500"><Plus size={13} /> Add {title.replace(/s$/, '')}</button>
      </div>
      <div className="space-y-2">
        {list.map((d, i) => (
          <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-slate-50'}`}>
            <input className={`${input} col-span-3`} placeholder="Name" value={d.name || ''} onChange={(e) => { const c = [...list]; c[i] = { ...c[i], name: e.target.value }; setList(c); }} />
            <input className={`${input} col-span-2`} placeholder="DIN / PAN" value={d.din || d.pan || ''} onChange={(e) => { const c = [...list]; c[i] = { ...c[i], din: e.target.value }; setList(c); }} />
            <select className={`${input} col-span-3`} value={d.designation || designationOptions[0]} onChange={(e) => { const c = [...list]; c[i] = { ...c[i], designation: e.target.value }; setList(c); }}>
              {designationOptions.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input type="date" className={`${input} col-span-3`} value={(d.date_of_appointment || '').slice(0, 10)} onChange={(e) => { const c = [...list]; c[i] = { ...c[i], date_of_appointment: e.target.value }; setList(c); }} />
            <button onClick={() => setList(list.filter((_, x) => x !== i))} className="col-span-1 text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}
        {list.length === 0 && <p className={`text-xs ${muted}`}>No {title.toLowerCase()} added yet.</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {!isLLP && <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className={`text-sm font-semibold ${text}`}>Directors</h4>
          <button onClick={addDirector} className="text-xs flex items-center gap-1 text-blue-500"><Plus size={13} /> Add Director</button>
        </div>
        <div className="space-y-2">
          {directors.map((d, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-slate-50'}`}>
              <input className={`${input} col-span-3`} placeholder="Name" value={d.name} onChange={(e) => { const c = [...directors]; c[i] = { ...c[i], name: e.target.value }; setDirectors(c); }} />
              <input className={`${input} col-span-2`} placeholder="DIN" value={d.din || ''} onChange={(e) => { const c = [...directors]; c[i] = { ...c[i], din: e.target.value }; setDirectors(c); }} />
              <select className={`${input} col-span-3`} value={d.designation || 'Director'} onChange={(e) => { const c = [...directors]; c[i] = { ...c[i], designation: e.target.value }; setDirectors(c); }}>
                {['Director', 'Managing Director', 'Whole-time Director', 'Additional Director', 'Independent Director', 'Nominee Director'].map((x) => <option key={x}>{x}</option>)}
              </select>
              <input type="date" className={`${input} col-span-3`} value={d.date_of_appointment || ''} onChange={(e) => { const c = [...directors]; c[i] = { ...c[i], date_of_appointment: e.target.value }; setDirectors(c); }} />
              <button onClick={() => setDirectors(directors.filter((_, x) => x !== i))} className="col-span-1 text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
          {directors.length === 0 && <p className={`text-xs ${muted}`}>No directors added yet.</p>}
        </div>
      </div>}

      {isLLP && renderPeople('Designated Partners', designatedPartners, setDesignatedPartners, ['Designated Partner', 'Designated Partner (Managing)'])}
      {isLLP && renderPeople('Partners', partners, setPartners, ['Partner', 'Nominee Partner'])}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className={`text-sm font-semibold ${text}`}>Shareholders {totalShares > 0 && <span className={`font-normal ${muted}`}>(Total: {totalShares.toLocaleString('en-IN')} shares)</span>}</h4>
          <button onClick={addShareholder} className="text-xs flex items-center gap-1 text-blue-500"><Plus size={13} /> Add Shareholder</button>
        </div>
        <div className="space-y-2">
          {shareholders.map((s, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${isDark ? 'bg-slate-900/40' : 'bg-slate-50'}`}>
              <input className={`${input} col-span-3`} placeholder="Name" value={s.name} onChange={(e) => { const c = [...shareholders]; c[i] = { ...c[i], name: e.target.value }; setShareholders(c); }} />
              <input className={`${input} col-span-2`} placeholder="Folio / PAN" value={s.folio_no || ''} onChange={(e) => { const c = [...shareholders]; c[i] = { ...c[i], folio_no: e.target.value }; setShareholders(c); }} />
              <input className={`${input} col-span-2`} placeholder="Class" value={s.class_of_shares || 'Equity'} onChange={(e) => { const c = [...shareholders]; c[i] = { ...c[i], class_of_shares: e.target.value }; setShareholders(c); }} />
              <input type="number" className={`${input} col-span-3`} placeholder="Shares held" value={s.shares_held || 0} onChange={(e) => { const c = [...shareholders]; c[i] = { ...c[i], shares_held: parseFloat(e.target.value) || 0 }; setShareholders(c); }} />
              <button onClick={() => setShareholders(shareholders.filter((_, x) => x !== i))} className="col-span-1 text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
          {shareholders.length === 0 && <p className={`text-xs ${muted}`}>No shareholders added yet.</p>}
        </div>
      </div>

      <button onClick={() => onSave({ directors, designated_partners: designatedPartners, partners, shareholders })} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
        <Save size={14} /> Save {isLLP ? 'Partners' : 'Directors'} & Shareholders
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Shared: resolution-list editor used by Board Resolution + Notice(special business)
 * ═══════════════════════════════════════════════════════════════════════ */

function ResolutionListEditor({ items, setItems, input, muted }) {
  const add = () => setItems([...items, { particulars: '', resolution_text: '', proposed_by: '', seconded_by: '' }]);
  return (
    <div className="space-y-3">
      {items.map((r, i) => (
        <div key={i} className={`p-3 rounded-lg border ${muted.includes('slate-400') ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${muted}`}>Resolution {i + 1}</span>
            <button onClick={() => setItems(items.filter((_, x) => x !== i))} className="text-red-500"><Trash2 size={13} /></button>
          </div>
          <input className={input} placeholder="Particulars (e.g. Opening of Bank Account)" value={r.particulars}
            onChange={(e) => { const c = [...items]; c[i] = { ...c[i], particulars: e.target.value }; setItems(c); }} />
          <textarea className={input} rows={2} placeholder='Resolution text — the part after "RESOLVED THAT ..."' value={r.resolution_text}
            onChange={(e) => { const c = [...items]; c[i] = { ...c[i], resolution_text: e.target.value }; setItems(c); }} />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="Proposed by" value={r.proposed_by} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], proposed_by: e.target.value }; setItems(c); }} />
            <input className={input} placeholder="Seconded by" value={r.seconded_by} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], seconded_by: e.target.value }; setItems(c); }} />
          </div>
        </div>
      ))}
      <button onClick={add} className="text-xs flex items-center gap-1 text-blue-500"><Plus size={13} /> Add Resolution</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Board Resolution tab
 * ═══════════════════════════════════════════════════════════════════════ */

function ResolutionTab({ company, isDark, input, text, muted }) {
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('11:00 AM');
  const [venue, setVenue] = useState('Registered Office of the Company');
  const [chairman, setChairman] = useState('');
  const [directorsPresent, setDirectorsPresent] = useState((company.directors || []).map((d) => d.name).join(', '));
  const [resolutions, setResolutions] = useState([{ particulars: '', resolution_text: '', proposed_by: '', seconded_by: '' }]);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!meetingDate) { toast.error('Meeting date is required'); return; }
    if (!resolutions.length || !resolutions[0].resolution_text) { toast.error('Add at least one resolution'); return; }
    setGenerating(true);
    try {
      const payload = {
        meeting_date: meetingDate, meeting_time: meetingTime, venue, chairman,
        directors_present: directorsPresent.split(',').map((s) => s.trim()).filter(Boolean),
        resolutions,
      };
      const res = await api.post(`/roc-sphere/companies/${company.id}/generate/board-resolution`, payload, { responseType: 'blob' });
      triggerBlobDownload(res.data, `Board_Resolution_${company.company_name.replace(/\s+/g, '_')}.docx`);
      toast.success('Board Resolution generated');
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className={`text-xs ${muted}`}>Drafts a certified-true-copy style Board Resolution (Companies Act, 2013 / SS-1 format) — review before circulation or filing.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Meeting Date *</label><input type="date" className={input} value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Time</label><input className={input} value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Venue</label><input className={input} value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Chairman</label><input className={input} value={chairman} onChange={(e) => setChairman(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Directors Present (comma separated)</label><input className={input} value={directorsPresent} onChange={(e) => setDirectorsPresent(e.target.value)} /></div>
      </div>
      <ResolutionListEditor items={resolutions} setItems={setResolutions} input={input} muted={muted} />
      <button onClick={generate} disabled={generating} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generate Board Resolution (.docx)
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Notice of Meeting tab
 * ═══════════════════════════════════════════════════════════════════════ */

function NoticeTab({ company, isDark, input, text, muted }) {
  const [meetingType, setMeetingType] = useState('board');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('11:00 AM');
  const [venue, setVenue] = useState('Registered Office of the Company');
  const [agendaText, setAgendaText] = useState('');
  const [specialBusiness, setSpecialBusiness] = useState([]);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!meetingDate) { toast.error('Meeting date is required'); return; }
    setGenerating(true);
    try {
      const payload = {
        meeting_type: meetingType, meeting_date: meetingDate, meeting_time: meetingTime, venue,
        agenda_items: agendaText.split('\n').map((s) => s.trim()).filter(Boolean),
        special_business: specialBusiness,
      };
      const res = await api.post(`/roc-sphere/companies/${company.id}/generate/notice`, payload, { responseType: 'blob' });
      triggerBlobDownload(res.data, `Notice_${meetingType.toUpperCase()}_${company.company_name.replace(/\s+/g, '_')}.docx`);
      toast.success('Notice generated');
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className={`text-xs ${muted}`}>Board Meeting notice needs no minimum notice period under SS-1 unless the AoA says otherwise; General Meeting (AGM/EGM) notices generally require 21 clear days — check applicability of shorter notice.</p>
      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <label className={`text-xs font-medium ${muted} mb-1 block`}>Meeting Type</label>
          <select className={input} value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
            <option value="board">Board Meeting</option>
            <option value="agm">Annual General Meeting (AGM)</option>
            <option value="egm">Extra-Ordinary General Meeting (EGM)</option>
          </select>
        </div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Meeting Date *</label><input type="date" className={input} value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Time</label><input className={input} value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Venue</label><input className={input} value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
      </div>
      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Agenda / Ordinary Business (one per line)</label>
        <textarea className={input} rows={4} value={agendaText} onChange={(e) => setAgendaText(e.target.value)}
          placeholder={'To confirm the minutes of the previous meeting\nTo consider and approve the financial statements\n...'} />
      </div>
      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Special Business (optional)</label>
        <ResolutionListEditor items={specialBusiness} setItems={setSpecialBusiness} input={input} muted={muted} />
      </div>
      <button onClick={generate} disabled={generating} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generate Notice (.docx)
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Minutes of Meeting tab
 * ═══════════════════════════════════════════════════════════════════════ */

function MinutesTab({ company, isDark, input, text, muted }) {
  const [meetingType, setMeetingType] = useState('board');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('11:00 AM');
  const [venue, setVenue] = useState('Registered Office of the Company');
  const [chairman, setChairman] = useState('');
  const [directorsPresent, setDirectorsPresent] = useState((company.directors || []).map((d) => d.name).join(', '));
  const [directorsAbsent, setDirectorsAbsent] = useState('');
  const [attendeesOther, setAttendeesOther] = useState('');
  const [discussion, setDiscussion] = useState('');
  const [resolutions, setResolutions] = useState([]);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!meetingDate) { toast.error('Meeting date is required'); return; }
    setGenerating(true);
    try {
      const payload = {
        meeting_type: meetingType, meeting_date: meetingDate, meeting_time: meetingTime, venue, chairman,
        directors_present: directorsPresent.split(',').map((s) => s.trim()).filter(Boolean),
        directors_absent: directorsAbsent.split(',').map((s) => s.trim()).filter(Boolean),
        attendees_other: attendeesOther.split(',').map((s) => s.trim()).filter(Boolean),
        quorum_present: true,
        discussion_notes: discussion,
        resolutions,
      };
      const res = await api.post(`/roc-sphere/companies/${company.id}/generate/minutes`, payload, { responseType: 'blob' });
      triggerBlobDownload(res.data, `Minutes_${meetingType.toUpperCase()}_${company.company_name.replace(/\s+/g, '_')}.docx`);
      toast.success('Minutes generated');
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className={`text-xs ${muted}`}>Minutes must be entered in the Minutes Book within 30 days of the meeting (Sec. 118) and signed by the Chairman.</p>
      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <label className={`text-xs font-medium ${muted} mb-1 block`}>Meeting Type</label>
          <select className={input} value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
            <option value="board">Board Meeting</option>
            <option value="agm">Annual General Meeting (AGM)</option>
            <option value="egm">Extra-Ordinary General Meeting (EGM)</option>
          </select>
        </div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Meeting Date *</label><input type="date" className={input} value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Time</label><input className={input} value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Venue</label><input className={input} value={venue} onChange={(e) => setVenue(e.target.value)} /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Chairman</label><input className={input} value={chairman} onChange={(e) => setChairman(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Present (comma separated)</label><input className={input} value={directorsPresent} onChange={(e) => setDirectorsPresent(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Absent / Leave granted</label><input className={input} value={directorsAbsent} onChange={(e) => setDirectorsAbsent(e.target.value)} /></div>
        <div><label className={`text-xs font-medium ${muted} mb-1 block`}>Other attendees (auditor, CS, invitees)</label><input className={input} value={attendeesOther} onChange={(e) => setAttendeesOther(e.target.value)} /></div>
      </div>
      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Discussion Notes (optional)</label>
        <textarea className={input} rows={2} value={discussion} onChange={(e) => setDiscussion(e.target.value)} />
      </div>
      <div>
        <label className={`text-xs font-medium ${muted} mb-1 block`}>Resolutions Passed</label>
        <ResolutionListEditor items={resolutions} setItems={setResolutions} input={input} muted={muted} />
      </div>
      <button onClick={generate} disabled={generating} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Generate Minutes (.docx)
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Compliance Checklist tab
 * ═══════════════════════════════════════════════════════════════════════ */

function ChecklistTab({ company, isDark, text, muted }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: d } = await api.get(`/roc-sphere/companies/${company.id}/compliance-checklist`);
        setData(d);
      } catch {
        toast.error('Failed to compute checklist');
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  const downloadShareholders = async () => {
    try {
      const res = await api.get(`/roc-sphere/companies/${company.id}/generate/shareholders`, { responseType: 'blob' });
      triggerBlobDownload(res.data, `Shareholders_${company.company_name.replace(/\s+/g, '_')}.docx`);
    } catch (e) { toast.error(await parseBlobError(e) || 'Download failed'); }
  };

  const downloadChecklist = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/roc-sphere/companies/${company.id}/generate/checklist`, { responseType: 'blob' });
      triggerBlobDownload(res.data, `Compliance_Checklist_${company.company_name.replace(/\s+/g, '_')}.docx`);
    } catch (e) { toast.error(await parseBlobError(e) || 'Download failed'); } finally { setDownloading(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={20} /></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`text-xs ${muted} flex items-center gap-1.5`}>
          <Info size={13} /> {data.is_small_company ? 'Classified as a Small Company' : 'Not classified as a Small Company'} based on current capital/turnover.
        </div>
        <div className="flex gap-2">
          <button onClick={downloadShareholders} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600/20 text-slate-500 hover:bg-slate-600/30">
            <Download size={12} /> Shareholder Register
          </button>
          <button onClick={downloadChecklist} disabled={downloading} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download Checklist (.docx)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700/40">
        <table className="w-full text-xs">
          <thead className={isDark ? 'bg-slate-900/60' : 'bg-slate-100'}>
            <tr>
              {['Form / Item', 'Particulars', 'Due Date Rule', 'Frequency', 'Applicable'].map((h) => (
                <th key={h} className={`text-left px-3 py-2 font-semibold ${muted}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.checklist.map((item, i) => (
              <tr key={i} className={`border-t ${isDark ? 'border-slate-800' : 'border-slate-200'} ${!item.applicable ? 'opacity-40' : ''}`}>
                <td className={`px-3 py-2 font-medium ${text}`}>{item.form}</td>
                <td className={`px-3 py-2 ${muted}`}>{item.particulars}{item.notes && <span className="block text-[10px] italic">{item.notes}</span>}</td>
                <td className={`px-3 py-2 ${muted}`}>{item.due_date_rule}</td>
                <td className={`px-3 py-2 ${muted}`}>{item.frequency}</td>
                <td className="px-3 py-2">
                  {item.applicable ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className={muted}>N/A</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-[11px] ${muted} flex items-start gap-1.5`}>
        <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {data.disclaimer}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Applicable Compliances tab — dashboard view next to Compliance
 * Checklist. Same checklist engine, but only the applicable items,
 * grouped by frequency. Reads live off whatever Upload ROC Forms /
 * Master Data have applied to the Company Master, so it always reflects
 * the latest uploaded data with no extra wiring.
 * ═══════════════════════════════════════════════════════════════════════ */

function ApplicableCompliancesTab({ company, isDark, text, muted }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: d } = await api.get(`/roc-sphere/companies/${company.id}/applicable-compliances`);
        setData(d);
      } catch {
        toast.error('Failed to load applicable compliances');
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={20} /></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`text-lg font-bold ${text}`}>{data.total_applicable}</p>
          <p className={`text-[10px] ${muted}`}>Applicable Forms</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`text-lg font-bold ${text}`}>{data.total_forms_tracked}</p>
          <p className={`text-[10px] ${muted}`}>Total Forms Tracked</p>
        </div>
        {data.master_data_last_fetched && (
          <div className={`text-xs ${muted} flex items-center gap-1.5`}>
            <DatabaseZap size={13} /> Master Data last fetched {new Date(data.master_data_last_fetched).toLocaleDateString('en-IN')}
          </div>
        )}
        {!!data.roc_forms_uploaded && (
          <div className={`text-xs ${muted} flex items-center gap-1.5`}>
            <FileUp size={13} /> {data.roc_forms_uploaded} ROC form{data.roc_forms_uploaded === 1 ? '' : 's'} uploaded
          </div>
        )}
      </div>

      {data.groups.map((g) => (
        <div key={g.frequency} className={`rounded-lg border ${isDark ? 'border-slate-700' : 'border-slate-200'} overflow-hidden`}>
          <div className={`px-3 py-2 text-xs font-semibold ${isDark ? 'bg-slate-900/60 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
            {g.frequency} <span className={muted}>({g.items.length})</span>
          </div>
          <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            {g.items.map((item, i) => (
              <div key={i} className="px-3 py-2 flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className={`text-xs font-medium ${text}`}>{item.form} <span className={`font-normal ${muted}`}>— {item.particulars}</span></p>
                  <p className={`text-[11px] ${muted}`}>{item.due_date_rule}{item.notes ? ` · ${item.notes}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className={`text-[11px] ${muted} flex items-start gap-1.5`}>
        <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {data.disclaimer}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Upload AOC-4 / MGT-7 tab
 * ═══════════════════════════════════════════════════════════════════════ */

function UploadTab({ company, isDark, input, text, muted, onApplied }) {
  const [rocFiles, setRocFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);

  // ROC Forms filing-extraction path — separate endpoint/parser from the
  // Master Data tab (see MasterDataTab above / /master-data/fetch below).
  const handleUpload = async (apply) => {
    if (!rocFiles.length) { toast.error('Choose at least one ROC form (PDF) first'); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      rocFiles.forEach((file) => fd.append('files', file));
      fd.append('source_type', 'roc');
      fd.append('apply', apply ? 'true' : 'false');
      const { data } = await api.post(`/roc-sphere/companies/${company.id}/upload-master-data`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExtracted(data.extracted);
      setResults(data.results || []);
      setErrors(data.errors || []);
      const hasFields = Object.keys(data.extracted || {}).some((k) => !k.startsWith('_'));
      if (apply && data.applied) {
        toast.success('Company master updated from uploaded ROC forms');
        onApplied();
      } else if (!hasFields) {
        toast.error(data.message || 'Could not extract fields — please enter manually');
      } else {
        toast.success('Fields extracted — review below, then Apply');
      }
      if (data.errors?.length) data.errors.forEach((e) => toast.warning(e));
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Upload failed');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${text}`}>Upload ROC Forms</h3>
      <p className={`text-xs ${muted}`}>
        Upload AOC-4, AOC-2, MGT-7, MGT-7A, Board's/Auditor's Report extracts, DIR-12, ADT-1, INC-22, PAS-3, MGT-14 or
        DPT-3 acknowledgement PDFs — multiple files are merged into one extraction, and each field is only ever
        pulled from its statutory source form: the <strong>Directors &amp; Shareholders register comes only from
        MGT-7 / MGT-7A</strong>, <strong>financial data and the Statutory Auditor come only from AOC-4</strong>, and
        general Company Master fields (CIN, name, address, capital, AGM/board meeting dates) are read from whichever
        recognised form states them. A non-MGT-7/7A form can never add or change a director or shareholder row.
        Applied details are saved in both ROC Company Master and the linked Client record, and feed straight into
        the Compliance Checklist and Applicable Compliances tabs.{' '}
        For the MCA Company/LLP Master Data export (PDF/XLSX/CSV), use the <strong>Master Data</strong> tab instead —
        that's a separate, dedicated extraction path.
      </p>
      <div className={`rounded-lg border-2 border-dashed p-4 ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
        <p className={`text-xs font-semibold ${text} mb-1`}>ROC Forms (filing extraction)</p>
        <p className={`text-[11px] ${muted} mb-3`}>PDF only — one bad/scanned file no longer blocks the rest of the batch.</p>
        <input type="file" multiple accept=".pdf" onChange={(e) => setRocFiles(Array.from(e.target.files || []))}
          className={`text-xs ${muted}`} />
        {!!rocFiles.length && <p className={`text-xs mt-2 ${text}`}>{rocFiles.length} ROC form(s) selected</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={() => handleUpload(false)} disabled={extracting || !rocFiles.length}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 disabled:opacity-60 ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Preview ROC Forms
          </button>
          <button onClick={() => handleUpload(true)} disabled={extracting || !rocFiles.length}
            className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white flex items-center gap-1 disabled:opacity-60">
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Apply
          </button>
        </div>
      </div>

      {!!errors.length && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-amber-700/40 bg-amber-900/10' : 'border-amber-200 bg-amber-50'}`}>
          {errors.map((e, i) => (
            <p key={i} className={`text-[11px] flex items-start gap-1.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {e}
            </p>
          ))}
        </div>
      )}

      {extracted && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`text-xs font-semibold ${muted} mb-2`}>Extracted fields</p>
          {results.length > 0 && <p className={`text-[11px] ${muted} mb-2`}>{results.map((r) => `${r.filename} (${r.source_type})`).join(' · ')}</p>}
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {Object.entries(extracted).filter(([k, v]) => !k.startsWith('_') && !Array.isArray(v)).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className={muted}>{k.replace(/_/g, ' ')}</span>
                <span className={text}>{String(v)}</span>
              </div>
            ))}
            {extracted.directors && (
              <div className="sm:col-span-2">
                <span className={muted}>directors / partners</span>
                <span className={`${text} block`}>{extracted.directors.map((p) => `${p.name}${p.din ? ` (${p.din})` : ''}`).join(', ')}</span>
              </div>
            )}
            {extracted.shareholders && (
              <div className="sm:col-span-2">
                <span className={muted}>shareholders</span>
                <span className={`${text} block`}>{extracted.shareholders.map((p) => `${p.name} — ${p.shares_held || 0} shares`).join(', ')}</span>
              </div>
            )}
            {!Object.keys(extracted).filter((k) => !k.startsWith('_') && !['directors', 'shareholders'].includes(k)).length && !extracted.directors && !extracted.shareholders && (
              <p className={muted}>No fields could be confidently extracted from this file.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
