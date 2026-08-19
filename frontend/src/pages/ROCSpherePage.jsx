// ROCSpherePage.jsx — ROC Sphere: Companies Act (India) document automation
// New, self-contained module. Mirrors the visual language of
// CompliancePage.jsx / TrademarkSphere.jsx / SalarySlips.jsx (Hub banner,
// StatCard, dark-mode-aware Tailwind classes, sonner toasts).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Landmark, Plus, X, Loader2, Trash2, Building2, Users as UsersIcon,
  Download, FileText, Search, RefreshCw, Save, CheckCircle2, Upload,
  ClipboardList, Gavel, NotebookPen, ChevronRight, AlertTriangle, Info,
  ScrollText, Pencil,
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
  private: 'Private Limited', public: 'Public Limited', opc: 'One Person Company', section_8: 'Section 8 Company',
};

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
  { key: 'directors', label: 'Directors & Shareholders', icon: UsersIcon },
  { key: 'resolution', label: 'Board Resolution', icon: Gavel },
  { key: 'notice', label: 'Notice of Meeting', icon: ScrollText },
  { key: 'minutes', label: 'Minutes of Meeting', icon: NotebookPen },
  { key: 'checklist', label: 'Compliance Checklist', icon: ClipboardList },
  { key: 'upload', label: 'Upload AOC-4 / MGT-7', icon: Upload },
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

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
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
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Company list / picker ───────────────────────────────────── */}
        <div className={`lg:col-span-1 rounded-xl border ${card} p-4 h-fit`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold text-sm ${text}`}>Companies</h3>
            <button onClick={() => setShowNewCompany(true)} className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={14} />
            </button>
          </div>
          <div className="relative mb-3">
            <Search size={14} className={`absolute left-2.5 top-2.5 ${muted}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company / CIN…"
              className={`${input} pl-8 py-1.5 text-xs`} />
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
          ) : filteredCompanies.length === 0 ? (
            <p className={`text-xs ${muted} py-6 text-center`}>No companies yet. Click + to add one.</p>
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
              <div className={`rounded-xl border ${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
                <div>
                  <h2 className={`text-lg font-bold ${text}`}>{company.company_name}</h2>
                  <p className={`text-xs ${muted}`}>CIN: {company.cin || '—'} · {CATEGORY_LABELS[company.category] || company.category}</p>
                </div>
                <button onClick={deleteCompany} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10">
                  <Trash2 size={13} /> Remove
                </button>
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
                  {tab === 'directors' && <DirectorsTab company={company} isDark={isDark} onSave={saveCompany} input={input} text={text} muted={muted} />}
                  {tab === 'resolution' && <ResolutionTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'notice' && <NoticeTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'minutes' && <MinutesTab company={company} isDark={isDark} input={input} text={text} muted={muted} />}
                  {tab === 'checklist' && <ChecklistTab company={company} isDark={isDark} text={text} muted={muted} />}
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
    const catMap = { pvt_ltd: 'private', PVT_LTD: 'private', public_ltd: 'public', section_8: 'section_8', llp: 'private', LLP: 'private', opc: 'opc' };
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
          <h3 className={`font-semibold ${text}`}>Add Company</h3>
          <button onClick={onClose}><X size={18} className={muted} /></button>
        </div>

        {eligibleClients.length > 0 && (
          <div className="mb-3">
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Prefill from an existing client (optional)</label>
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
 * Directors & Shareholders tab
 * ═══════════════════════════════════════════════════════════════════════ */

function DirectorsTab({ company, isDark, onSave, input, text, muted }) {
  const [directors, setDirectors] = useState(company.directors || []);
  const [shareholders, setShareholders] = useState(company.shareholders || []);
  useEffect(() => { setDirectors(company.directors || []); setShareholders(company.shareholders || []); }, [company]);

  const addDirector = () => setDirectors([...directors, { name: '', din: '', designation: 'Director', date_of_appointment: '' }]);
  const addShareholder = () => setShareholders([...shareholders, { name: '', folio_no: '', shares_held: 0, class_of_shares: 'Equity' }]);

  const totalShares = shareholders.reduce((s, sh) => s + (parseFloat(sh.shares_held) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
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
      </div>

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

      <button onClick={() => onSave({ directors, shareholders })} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
        <Save size={14} /> Save Directors & Shareholders
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
 * Upload AOC-4 / MGT-7 tab
 * ═══════════════════════════════════════════════════════════════════════ */

function UploadTab({ company, isDark, input, text, muted, onApplied }) {
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);

  const handleUpload = async (apply) => {
    if (!file) { toast.error('Choose a file first'); return; }
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('apply', apply ? 'true' : 'false');
      const { data } = await api.post(`/roc-sphere/companies/${company.id}/upload-master-data`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExtracted(data.extracted);
      if (apply && data.applied) {
        toast.success('Company master updated from upload');
        onApplied();
      } else if (!Object.keys(data.extracted || {}).some((k) => !k.startsWith('_'))) {
        toast.error(data.message || 'Could not extract fields — please enter manually');
      } else {
        toast.success('Fields extracted — review below, then Apply');
      }
    } catch (e) {
      toast.error(await parseBlobError(e) || 'Upload failed');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className={`text-xs ${muted}`}>
        Upload the AOC-4 / MGT-7 / MGT-7A acknowledgement PDF, or the MCA master-data Excel export. Fields it can
        confidently read (CIN, incorporation date, registered office, authorized/paid-up capital, turnover, AGM &
        Board Meeting dates, PAN) are shown below for review before they're applied to the company master —
        this is a best-effort text scrape, not an XBRL parser, so always double-check the extracted values.
      </p>
      <div className={`rounded-lg border-2 border-dashed p-6 text-center ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
        <Upload size={22} className={`mx-auto mb-2 ${muted}`} />
        <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
          className={`text-xs ${muted}`} />
        {file && <p className={`text-xs mt-2 ${text}`}>{file.name}</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={() => handleUpload(false)} disabled={extracting || !file}
          className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-60 ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
          {extracting ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Preview Extraction
        </button>
        <button onClick={() => handleUpload(true)} disabled={extracting || !file}
          className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 disabled:opacity-60">
          <CheckCircle2 size={14} /> Extract & Apply to Company Master
        </button>
      </div>

      {extracted && (
        <div className={`rounded-lg border p-3 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <p className={`text-xs font-semibold ${muted} mb-2`}>Extracted fields</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {Object.entries(extracted).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className={muted}>{k.replace(/_/g, ' ')}</span>
                <span className={text}>{String(v)}</span>
              </div>
            ))}
            {!Object.keys(extracted).filter((k) => !k.startsWith('_')).length && (
              <p className={muted}>No fields could be confidently extracted from this file.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
