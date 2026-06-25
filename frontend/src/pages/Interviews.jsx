import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  Plus, Search, Upload, X, Loader2, Pencil, Trash2, UserCheck,
  Briefcase, GraduationCap, IndianRupee, Clock, Building2, Mail, Phone,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext.jsx';

const COLORS = {
  deepBlue: '#0D3B66', mediumBlue: '#1F6FB2', emeraldGreen: '#1FAF5A',
  purple: '#7C2D12', amber: '#F59E0B', red: '#EF4444', slate: '#64748b',
};

const STATUS_CFG = {
  scheduled: { label: 'Scheduled', color: '#64748b', bg: '#F1F5F9' },
  in_review: { label: 'In Review', color: '#1F6FB2', bg: '#EFF6FF' },
  selected: { label: 'Selected', color: '#7C3AED', bg: '#F5F3FF' },
  on_hold: { label: 'On Hold', color: '#F59E0B', bg: '#FFFBEB' },
  rejected: { label: 'Rejected', color: '#EF4444', bg: '#FEF2F2' },
  hired: { label: 'Hired', color: '#1FAF5A', bg: '#F0FDF4' },
};

const DEPARTMENTS = ['GST', 'IT', 'ACC', 'Legal', 'TDS', 'ROC', 'TM', 'MSME', 'FEMA', 'DSC', 'HR', 'Sales', 'Marketing', 'Operations', 'Other'];

// The backend's AI/heuristic resume parser (backend/interviews.py) can return department
// labels that don't exactly match our dropdown's canonical values (e.g. "Accounts" instead
// of "ACC"). Normalize those here so a parsed resume always lands on a real <option>.
const DEPARTMENT_ALIASES = {
  accounts: 'ACC', accounting: 'ACC', finance: 'ACC',
  legal: 'Legal', law: 'Legal',
  hr: 'HR', 'human resources': 'HR',
};

function normalizeDepartment(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const exact = DEPARTMENTS.find(d => d.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;
  return DEPARTMENT_ALIASES[trimmed.toLowerCase()] || trimmed;
}

const EMPTY_CANDIDATE = {
  full_name: '', email: '', phone: '', position: '', department: '',
  experience_years: '', current_company: '', skills: [], education: '',
  interview_date: '', interviewer: '', pay_scale_offered: '', conditions: '',
  training_period: '', status: 'scheduled', notes: '', resume_text: '',
};

const EMPTY_CONVERT = {
  full_name: '', email: '', password: '', role: 'staff', departments: [],
  phone: '', punch_in_time: '10:30', grace_time: '00:10', punch_out_time: '19:00',
};

export default function Interviews() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_CANDIDATE);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [praise, setPraise] = useState(null);   // AI assessment result
  const [praising, setPraising] = useState(false); // loading AI assessment

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertForm, setConvertForm] = useState(EMPTY_CONVERT);
  const [converting, setConverting] = useState(false);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/interviews');
      setCandidates(res.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load candidates');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const filtered = useMemo(() => {
    let arr = candidates;
    if (statusFilter !== 'all') arr = arr.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.position || '').toLowerCase().includes(q) ||
        (c.department || '').toLowerCase().includes(q)
      );
    }
    return arr;
  }, [candidates, search, statusFilter]);

  const openAdd = () => { setSelected(null); setForm(EMPTY_CANDIDATE); setPraise(null); setDialogOpen(true); };

  const openEdit = (c) => {
    setSelected(c);
    setPraise(null);
    setForm({
      ...EMPTY_CANDIDATE, ...c,
      experience_years: c.experience_years ?? '',
      skills: c.skills || [],
      department: normalizeDepartment(c.department),
    });
    setDialogOpen(true);
  };

  const handleResumeUpload = async (file) => {
    if (!file) return;
    setParsing(true);
    setPraise(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/interviews/parse-resume', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const f = res.data.fields || {};
      const resumeText = res.data.resume_text || '';
      // Merge parsed fields — always overwrite with parsed value if non-empty
      setForm(prev => {
        const next = {
          ...prev,
          full_name: (f.full_name && f.full_name.trim()) ? f.full_name.trim() : prev.full_name,
          email: (f.email && f.email.trim()) ? f.email.trim() : prev.email,
          phone: (f.phone && f.phone.trim()) ? f.phone.trim() : prev.phone,
          position: (f.position && f.position.trim()) ? f.position.trim() : prev.position,
          department: (f.department && f.department.trim()) ? normalizeDepartment(f.department) : prev.department,
          experience_years: (f.experience_years != null && f.experience_years !== 0)
            ? String(f.experience_years) : prev.experience_years,
          current_company: (f.current_company && f.current_company.trim()) ? f.current_company.trim() : prev.current_company,
          skills: (Array.isArray(f.skills) && f.skills.length > 0) ? f.skills : prev.skills,
          education: (f.education && f.education.trim()) ? f.education.trim() : prev.education,
          resume_text: resumeText,
        };
        return next;
      });
      const filled = Object.entries(f).filter(([k, v]) =>
        v && (Array.isArray(v) ? v.length > 0 : String(v).trim())
      ).length;
      toast.success(`✓ Resume parsed — ${filled} fields auto-filled`);

      // Trigger AI praise in background
      if (resumeText) {
        setPraising(true);
        api.post('/interviews/praise-resume-json', {
          resume_text: resumeText,
          position: f.position || '',
        }).then(r => {
          setPraise(r.data);
        }).catch(() => {
          // Praise is non-critical — silently skip if it fails
        }).finally(() => setPraising(false));
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not parse resume');
    } finally { setParsing(false); }
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        experience_years: form.experience_years === '' ? null : Number(form.experience_years),
      };
      if (selected) {
        await api.put(`/interviews/${selected.id}`, payload);
        toast.success('✓ Candidate updated');
      } else {
        await api.post('/interviews', payload);
        toast.success('✓ Candidate added');
      }
      setDialogOpen(false);
      fetchCandidates();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save candidate');
    } finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete interview record for ${c.full_name}?`)) return;
    try {
      await api.delete(`/interviews/${c.id}`);
      toast.success('Candidate removed');
      fetchCandidates();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete');
    }
  };

  const openConvert = (c) => {
    setConvertTarget(c);
    setConvertForm({
      ...EMPTY_CONVERT,
      full_name: c.full_name || '',
      email: c.email || '',
      departments: c.department ? [c.department] : [],
      phone: c.phone || '',
    });
    setConvertOpen(true);
  };

  const handleConvert = async () => {
    if (!convertForm.full_name.trim() || !convertForm.email.trim() || !convertForm.password.trim()) {
      toast.error('Name, email and password are required'); return;
    }
    setConverting(true);
    try {
      await api.post(`/interviews/${convertTarget.id}/convert-to-user`, convertForm);
      toast.success('✓ Candidate converted to user — pending admin approval');
      setConvertOpen(false);
      fetchCandidates();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to convert candidate');
    } finally { setConverting(false); }
  };

  return (
    <div className="min-h-screen p-5 md:p-6 lg:p-8 space-y-5" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl px-6 py-5"
        style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`, boxShadow: '0 8px 32px rgba(13,59,102,0.25)' }}>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">HR</p>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Briefcase className="w-6 h-6" /> Employee Interviews
            </h1>
            <p className="text-white/60 text-sm mt-1">Log every candidate interviewed and convert hires into users in one click</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{ backgroundColor: '#ffffff', color: COLORS.deepBlue }}>
            <Plus className="w-4 h-4" /> Add Candidate
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 items-center rounded-2xl border p-3" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search candidates, position, department…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-400"
            style={{ borderColor: '#e2e8f0' }} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[{ val: 'all', label: 'All' }, ...Object.entries(STATUS_CFG).map(([val, c]) => ({ val, label: c.label }))].map(f => (
            <button key={f.val} onClick={() => setStatusFilter(f.val)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
              style={{
                borderColor: statusFilter === f.val ? COLORS.mediumBlue : 'transparent',
                backgroundColor: statusFilter === f.val ? '#EFF6FF' : '#f8fafc',
                color: statusFilter === f.val ? COLORS.mediumBlue : '#64748b',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border py-16 text-center" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
          <p className="font-semibold text-slate-600">No candidates found</p>
          <p className="text-sm text-slate-400 mt-1">Click "Add Candidate" to log a new interview</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => {
            const st = STATUS_CFG[c.status] || STATUS_CFG.scheduled;
            return (
              <div key={c.id} className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800">{c.full_name}</p>
                    <p className="text-xs text-slate-500">{c.position || 'No position specified'}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase flex-shrink-0"
                    style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  {c.department && <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" /> {c.department}</div>}
                  {c.experience_years != null && <div className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-slate-400" /> {c.experience_years} yrs experience</div>}
                  {c.pay_scale_offered && <div className="flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5 text-slate-400" /> {c.pay_scale_offered}</div>}
                  {c.training_period && <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Training: {c.training_period}</div>}
                  {c.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> {c.email}</div>}
                  {c.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {c.phone}</div>}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => openEdit(c)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{ borderColor: '#e2e8f0', color: '#64748b' }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {!c.converted_user_id && (
                    <button onClick={() => openConvert(c)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <UserCheck className="w-3 h-3" /> Convert
                    </button>
                  )}
                  {c.converted_user_id && (
                    <span className="flex-1 text-center text-xs font-semibold py-1.5 rounded-lg" style={{ backgroundColor: '#F0FDF4', color: COLORS.emeraldGreen }}>
                      Converted ✓
                    </span>
                  )}
                  <button onClick={() => handleDelete(c)} className="p-1.5 rounded-lg" style={{ color: COLORS.red }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDialogOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden bg-white">
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <h2 className="text-white font-bold">{selected ? 'Edit Candidate' : 'Add Candidate'}</h2>
              <button onClick={() => setDialogOpen(false)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Resume upload */}
              <label className="block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer"
                style={{ borderColor: '#cbd5e1' }}>
                <input type="file" accept=".pdf,.docx,.txt" className="hidden"
                  onChange={e => handleResumeUpload(e.target.files?.[0])} />
                {parsing ? (
                  <span className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Parsing resume…</span>
                ) : (
                  <span className="flex items-center justify-center gap-2 text-sm text-slate-500"><Upload className="w-4 h-4" /> Upload resume (PDF / DOCX / TXT) to auto-fill the form below</span>
                )}
              </label>

              {/* AI Resume Assessment Panel */}
              {(praising || praise) && (() => {
                const VERDICT_CFG = {
                  'Strong Hire': { color: '#1FAF5A', bg: '#F0FDF4', border: '#bbf7d0', label: 'Strong Hire' },
                  'Hire':        { color: '#1F6FB2', bg: '#EFF6FF', border: '#bfdbfe', label: 'Hire' },
                  'Maybe':       { color: '#F59E0B', bg: '#FFFBEB', border: '#fde68a', label: 'Consider' },
                  'Pass':        { color: '#EF4444', bg: '#FEF2F2', border: '#fecaca', label: 'Pass' },
                };
                const vcfg = praise ? (VERDICT_CFG[praise.verdict] || VERDICT_CFG['Maybe']) : null;
                const score = praise?.fit_score ?? 0;
                const scoreColor = score >= 75 ? '#1FAF5A' : score >= 50 ? '#1F6FB2' : score >= 35 ? '#F59E0B' : '#EF4444';

                return (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
                    {/* Header */}
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-white text-sm font-semibold">AI Resume Assessment</span>
                      </div>
                      {praising && <span className="flex items-center gap-1.5 text-white/70 text-xs"><Loader2 className="w-3 h-3 animate-spin" />Analysing…</span>}
                      {praise && !praising && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: vcfg.bg, color: vcfg.color, border: `1px solid ${vcfg.border}` }}>
                          {vcfg.label}
                        </span>
                      )}
                    </div>

                    {praising && !praise && (
                      <div className="px-4 py-6 flex flex-col items-center gap-2 bg-slate-50">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <p className="text-xs text-slate-500">Evaluating candidate profile…</p>
                      </div>
                    )}

                    {praise && (
                      <div className="bg-white px-4 py-3 space-y-3">
                        {/* Score row */}
                        <div className="flex items-center gap-3">
                          {/* Circular score */}
                          <div className="relative flex-shrink-0 w-14 h-14">
                            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                              <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor} strokeWidth="3"
                                strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-[13px] font-black leading-none" style={{ color: scoreColor }}>{score}</span>
                              <span className="text-[7px] text-slate-400 font-medium leading-none">/100</span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 leading-snug">{praise.summary}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(praise.standout_skills || []).map(s => (
                                <span key={s} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: '#EFF6FF', color: '#1F6FB2', border: '1px solid #bfdbfe' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-center">
                            <div className="text-[10px] text-slate-500 mb-0.5">Experience</div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
                              background: praise.experience_quality === 'Excellent' ? '#F0FDF4' : praise.experience_quality === 'Good' ? '#EFF6FF' : praise.experience_quality === 'Average' ? '#FFFBEB' : '#FEF2F2',
                              color: praise.experience_quality === 'Excellent' ? '#1FAF5A' : praise.experience_quality === 'Good' ? '#1F6FB2' : praise.experience_quality === 'Average' ? '#F59E0B' : '#EF4444',
                            }}>{praise.experience_quality}</span>
                          </div>
                        </div>

                        {/* Strengths & Concerns side by side */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* Strengths */}
                          {(praise.strengths || []).length > 0 && (
                            <div className="rounded-lg p-2.5" style={{ background: '#F0FDF4', border: '1px solid #bbf7d0' }}>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">✓ Strengths</p>
                              <ul className="space-y-1">
                                {praise.strengths.map((s, i) => (
                                  <li key={i} className="text-[10px] text-slate-700 leading-snug flex gap-1.5">
                                    <span className="text-emerald-500 flex-shrink-0 mt-px">•</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {/* Concerns */}
                          <div className="rounded-lg p-2.5" style={{ background: (praise.concerns || []).length > 0 ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${(praise.concerns || []).length > 0 ? '#fecaca' : '#e2e8f0'}` }}>
                            <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: (praise.concerns || []).length > 0 ? '#EF4444' : '#94a3b8' }}>
                              {(praise.concerns || []).length > 0 ? '⚠ Concerns' : '✓ No Concerns'}
                            </p>
                            {(praise.concerns || []).length > 0 ? (
                              <ul className="space-y-1">
                                {praise.concerns.map((c, i) => (
                                  <li key={i} className="text-[10px] text-slate-700 leading-snug flex gap-1.5">
                                    <span className="text-red-400 flex-shrink-0 mt-px">•</span>
                                    <span>{c}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[10px] text-slate-400">Candidate looks good across all areas.</p>
                            )}
                          </div>
                        </div>

                        {/* Recommended Interview Questions */}
                        {(praise.recommended_questions || []).length > 0 && (
                          <div className="rounded-lg p-2.5" style={{ background: '#F5F3FF', border: '1px solid #ddd6fe' }}>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-violet-700 mb-1.5">💬 Suggested Interview Questions</p>
                            <ol className="space-y-1">
                              {praise.recommended_questions.map((q, i) => (
                                <li key={i} className="text-[10px] text-slate-700 leading-snug flex gap-1.5">
                                  <span className="font-bold text-violet-400 flex-shrink-0">{i + 1}.</span>
                                  <span>{q}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name *" value={form.full_name} onChange={v => setForm(p => ({ ...p, full_name: v }))} />
                <Field label="Email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />
                <Field label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} />
                <Field label="Position Applied For" value={form.position} onChange={v => setForm(p => ({ ...p, position: v }))} />
                <SelectField label="Department" value={form.department} options={DEPARTMENTS}
                  onChange={v => setForm(p => ({ ...p, department: v }))} />
                <Field label="Experience (years)" type="number" value={form.experience_years} onChange={v => setForm(p => ({ ...p, experience_years: v }))} />
                <Field label="Current / Last Company" value={form.current_company} onChange={v => setForm(p => ({ ...p, current_company: v }))} />
                <Field label="Education" value={form.education} onChange={v => setForm(p => ({ ...p, education: v }))} />
                <Field label="Interview Date" type="date" value={form.interview_date} onChange={v => setForm(p => ({ ...p, interview_date: v }))} />
                <Field label="Interviewer" value={form.interviewer} onChange={v => setForm(p => ({ ...p, interviewer: v }))} />
                <Field label="Pay Scale Offered" value={form.pay_scale_offered} onChange={v => setForm(p => ({ ...p, pay_scale_offered: v }))} placeholder="e.g. ₹25,000 – ₹30,000 / month" />
                <Field label="Training Period" value={form.training_period} onChange={v => setForm(p => ({ ...p, training_period: v }))} placeholder="e.g. 3 months" />
                <SelectField label="Status" value={form.status} options={Object.keys(STATUS_CFG)}
                  optionLabels={Object.fromEntries(Object.entries(STATUS_CFG).map(([k, v]) => [k, v.label]))}
                  onChange={v => setForm(p => ({ ...p, status: v }))} />
                <Field label="Skills (comma separated)" value={(form.skills || []).join(', ')}
                  onChange={v => setForm(p => ({ ...p, skills: v.split(',').map(s => s.trim()).filter(Boolean) }))} />
              </div>

              <TextAreaField label="Conditions of Offer" value={form.conditions} onChange={v => setForm(p => ({ ...p, conditions: v }))} />
              <TextAreaField label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} />
            </div>

            <div className="flex-shrink-0 px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setDialogOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: '#e2e8f0' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
                {saving ? 'Saving…' : selected ? 'Save Changes' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to User Modal */}
      {convertOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConvertOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white">
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #16a34a)` }}>
              <h2 className="text-white font-bold flex items-center gap-2"><UserCheck className="w-5 h-5" /> Convert to User</h2>
              <button onClick={() => setConvertOpen(false)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-500 -mt-1 mb-2">All fields below are editable — review before creating the account. The new user will need admin approval to log in.</p>
              <Field label="Full Name *" value={convertForm.full_name} onChange={v => setConvertForm(p => ({ ...p, full_name: v }))} />
              <Field label="Email *" value={convertForm.email} onChange={v => setConvertForm(p => ({ ...p, email: v }))} />
              <Field label="Temporary Password *" type="password" value={convertForm.password} onChange={v => setConvertForm(p => ({ ...p, password: v }))} />
              <Field label="Phone" value={convertForm.phone} onChange={v => setConvertForm(p => ({ ...p, phone: v }))} />
              <SelectField label="Role" value={convertForm.role} options={['staff', 'manager', ...(user?.role === 'admin' ? ['admin'] : [])]}
                onChange={v => setConvertForm(p => ({ ...p, role: v }))} />
              <SelectField label="Department" value={(convertForm.departments || [])[0] || ''} options={DEPARTMENTS}
                onChange={v => setConvertForm(p => ({ ...p, departments: v ? [v] : [] }))} />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setConvertOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border" style={{ borderColor: '#e2e8f0' }}>Cancel</button>
              <button onClick={handleConvert} disabled={converting}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #16a34a)` }}>
                {converting ? 'Creating…' : 'Create User Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ borderColor: '#e2e8f0' }} />
    </div>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2}
        className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ borderColor: '#e2e8f0' }} />
    </div>
  );
}

function SelectField({ label, value, options, optionLabels, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ borderColor: '#e2e8f0' }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{optionLabels ? optionLabels[o] : o}</option>)}
      </select>
    </div>
  );
}
