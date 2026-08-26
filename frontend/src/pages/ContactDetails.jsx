// ─────────────────────────────────────────────────────────────────────────
// ContactDetails.jsx — Admin → "Contact Details" page.
//
// One place for every helpline / contact number the firm wants reachable:
//   • Company-wise  — pulled read-only from the shared Company Profile
//                      records (Admin → Master Data is still the one place
//                      that edits name/address/phone/email/website; this
//                      page just surfaces them so admin doesn't have to hop
//                      between pages to see every company's contact info).
//   • Department-wise — a helpline directory (department, phone, email,
//                        hours) that admin manages directly here.
//
// The department directory is saved on the existing client-portal settings
// document (`help_desk` field, already exposed on the no-auth
// /client-portal/public-settings endpoint) so it keeps reflecting on the
// Client Portal's "Contact Us" tab with no extra backend routes needed.
// ─────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { fetchCompanies } from '@/lib/companies';
import { toast } from 'sonner';
import { useDark } from '@/hooks/useDark';
import { HubBanner } from '@/components/SectionHub.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Phone, Mail, Building2, Globe, MapPin, Plus, Trash2,
  Loader2, ExternalLink, Contact,
} from 'lucide-react';

// Canonical department codes — same list used on Admin → Users for each
// staff member's `departments` field (GST, IT, ACC, TDS, ROC, TM, MSME,
// FEMA, DSC, OTHER). Picking from this list here (instead of free text)
// keeps the helpline directory keyed the same way, so a task's assignee
// can be matched to their department's contact number reliably.
const DEPARTMENTS = [
  { value: 'GST',   label: 'GST' },
  { value: 'IT',    label: 'Income Tax' },
  { value: 'ACC',   label: 'Accounts' },
  { value: 'TDS',   label: 'TDS' },
  { value: 'ROC',   label: 'ROC / Company Law' },
  { value: 'TM',    label: 'Trademark & IP' },
  { value: 'MSME',  label: 'MSME' },
  { value: 'FEMA',  label: 'FEMA' },
  { value: 'DSC',   label: 'DSC' },
  { value: 'OTHER', label: 'General / Other' },
];

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
};

const emptyRow = () => ({ department: '', phone: '', email: '', hours: '' });
const emptyPersonRow = () => ({ name: '', position: '', phone: '', email: '' });

export default function ContactDetails() {
  const isDark = useDark();
  const navigate = useNavigate();

  // ── Companies (read-only here — edited at Master Data / Company Profiles) ──
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // ── Department helpline directory ──
  const [helpDesk, setHelpDesk] = useState([emptyRow()]);
  const [loadingHelpDesk, setLoadingHelpDesk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Individually-named contacts (Manager, Senior Manager, etc.) ──
  const [peopleContacts, setPeopleContacts] = useState([emptyPersonRow()]);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    const list = await fetchCompanies();
    setCompanies(list);
    setLoadingCompanies(false);
  }, []);

  const loadHelpDesk = useCallback(async () => {
    setLoadingHelpDesk(true);
    try {
      const res = await api.get('/client-portal/settings');
      const d = res.data || {};
      setHelpDesk(Array.isArray(d.help_desk) && d.help_desk.length ? d.help_desk : [emptyRow()]);
      setPeopleContacts(Array.isArray(d.people_contacts) && d.people_contacts.length ? d.people_contacts : [emptyPersonRow()]);
    } catch {
      toast.error('Failed to load department helpline numbers');
    } finally {
      setLoadingHelpDesk(false);
    }
  }, []);

  useEffect(() => { loadCompanies(); loadHelpDesk(); }, [loadCompanies, loadHelpDesk]);

  const updateRow = (idx, field, value) => {
    setHelpDesk(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setHelpDesk(rows => [...rows, emptyRow()]);
  const removeRow = (idx) => setHelpDesk(rows => {
    const next = rows.filter((_, i) => i !== idx);
    return next.length ? next : [emptyRow()];
  });

  const updatePersonRow = (idx, field, value) => {
    setPeopleContacts(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };
  const addPersonRow = () => setPeopleContacts(rows => [...rows, emptyPersonRow()]);
  const removePersonRow = (idx) => setPeopleContacts(rows => {
    const next = rows.filter((_, i) => i !== idx);
    return next.length ? next : [emptyPersonRow()];
  });

  const save = async () => {
    setSaving(true);
    try {
      // The backend PortalSettings model covers more than help_desk (portal
      // branding, Drive root folder, etc.) — fetch the current doc first so
      // saving the helpline directory here doesn't clobber those fields.
      const current = await api.get('/client-portal/settings');
      const cleaned = helpDesk.filter(r => (r.department || '').trim() || (r.phone || '').trim());
      await api.put('/client-portal/settings', {
        ...current.data,
        help_desk: cleaned,
      });
      setHelpDesk(cleaned.length ? cleaned : [emptyRow()]);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
      toast.success('Contact details saved — now live on the client portal.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save contact details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <HubBanner
        icon={Contact}
        eyebrow="Admin"
        title="Contact Details"
        subtitle="Company-wise and department-wise contact numbers — the department directory is shown to clients on the Client Portal's Contact Us tab."
        isDark={isDark}
      />

      {/* ── Companies ── */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b gap-2.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.deepBlue}12` }}>
              <Building2 className="h-4 w-4" style={{ color: COLORS.deepBlue }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Company-wise Contact Details</h3>
              <p className="text-xs text-slate-400">Every registered company/firm and its contact information.</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/master-data')}
            className="text-xs gap-1.5"
          >
            Manage Companies <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
        <div className="p-5">
          {loadingCompanies ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : companies.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">
              No companies added yet. Add one from{' '}
              <button onClick={() => navigate('/master-data')} className="text-blue-600 hover:underline font-medium">Master Data</button>.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.map((c) => (
                <div key={c.id || c._id || c.name} className={`p-4 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-100 bg-slate-50'}`}>
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{c.name || 'Unnamed company'}</p>
                  {c.address && (
                    <p className="flex items-start gap-1.5 text-xs text-slate-500 mt-2">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> <span>{c.address}</span>
                    </p>
                  )}
                  {c.phone && (
                    <a href={`tel:${String(c.phone).replace(/[^\d+]/g, '')}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 mt-1.5 font-medium">
                      <Phone className="h-3.5 w-3.5" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 mt-1.5">
                      <Mail className="h-3.5 w-3.5" /> {c.email}
                    </a>
                  )}
                  {c.website && (
                    <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 mt-1.5">
                      <Globe className="h-3.5 w-3.5" /> {c.website}
                    </a>
                  )}
                  {!c.phone && !c.email && !c.website && (
                    <p className="text-xs text-slate-400 italic mt-1.5">No contact details on file.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Departments ── */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b gap-2.5 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg" style={{ background: `${COLORS.emeraldGreen}12` }}>
              <Phone className="h-4 w-4" style={{ color: COLORS.emeraldGreen }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Department-wise Helpline Numbers</h3>
              <p className="text-xs text-slate-400">Shown to clients on the Contact Us tab, and next to a task's assignee once we know their department.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={addRow}
            className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Plus className="h-3.5 w-3.5" /> Add Department
          </button>
        </div>
        <div className="p-5">
          {loadingHelpDesk ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {helpDesk.map((row, idx) => {
                const usedElsewhere = helpDesk.some((r, i) => i !== idx && r.department === row.department && row.department);
                return (
                <div key={idx} className={`grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] gap-2 p-3 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-100 bg-slate-50'}`}>
                  <select
                    value={row.department || ''}
                    onChange={(e) => updateRow(idx, 'department', e.target.value)}
                    className={`text-sm rounded-lg border px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-800'} ${usedElsewhere ? 'ring-1 ring-amber-400' : ''}`}
                  >
                    <option value="">Select department…</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                  <Input value={row.phone || ''} onChange={(e) => updateRow(idx, 'phone', e.target.value)}
                    placeholder="Helpline number" className="text-sm" />
                  <Input value={row.email || ''} onChange={(e) => updateRow(idx, 'email', e.target.value)}
                    placeholder="Email (optional)" className="text-sm" />
                  <Input value={row.hours || ''} onChange={(e) => updateRow(idx, 'hours', e.target.value)}
                    placeholder="Hours (optional)" className="text-sm" />
                  <button type="button" onClick={() => removeRow(idx)}
                    className="flex items-center justify-center text-red-400 hover:text-red-600 px-2" title="Remove department">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                );
              })}
            </div>
          )}
          <div className="pt-4">
            <Button
              onClick={save}
              disabled={saving || loadingHelpDesk}
              className="text-xs text-white px-6"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Contact Details'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
