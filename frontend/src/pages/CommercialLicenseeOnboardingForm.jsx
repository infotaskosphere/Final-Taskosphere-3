import React, { useState } from 'react';
import {
  Building2, UserRound, Layers3, Cloud, Palette, Plug, Send, CheckCircle2,
  ChevronLeft, ChevronRight, Loader2, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

const STEPS = [
  'Applicant & legal entity',
  'Primary contact',
  'Business profile',
  'License requirements',
  'Deployment & data',
  'Branding & integrations',
  'Implementation',
  'Declaration',
];
const MODULES = [
  ['task_management', 'Taskosphere / Task Management'],
  ['finix', 'Finix / Accounting'],
  ['gst', 'GST'],
  ['income_tax', 'Income Tax'],
  ['roc', 'ROC / Compliance'],
  ['trademark', 'Trademark / IP'],
  ['payroll', 'Payroll'],
  ['hr', 'HR'],
  ['crm', 'CRM / Leads'],
  ['inventory', 'Inventory'],
  ['document_management', 'Document Management'],
  ['workflow', 'Workflow'],
  ['analytics', 'Analytics'],
];
const INTEGRATIONS = [
  'Google Workspace / Drive', 'Email / SMTP', 'WhatsApp', 'Accounting / Tally',
  'GST / Tax Systems', 'Cloud Storage', 'API / Custom Integration', 'None',
];
const initial = {
  legal_name: '', trade_name: '', constitution: '', pan: '', gstin: '', registration_no: '',
  address: '', city: '', state: '', pin: '', website: '', contact_name: '', designation: '',
  email: '', mobile: '', alternate_contact: '', business_type: '', business_description: '',
  client_count: '', modules: ['task_management'], license_type: 'standard', user_count: '10',
  entity_count: '1', commercial_notes: '', deployment: 'Cloud Hosted', migration: 'To be discussed',
  migration_details: '', isolation: 'Yes – Dedicated / Isolated', branding: 'No',
  white_label_name: '', custom_domain: '', integrations: [], go_live_date: '',
  implementation_notes: '', notes: '', declaration: false,
};

function Input({ label, name, form, setForm, required = false, type = 'text', placeholder = '' }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-1 text-rose-600">*</span>}
      <input
        type={type}
        value={form[name] ?? ''}
        required={required}
        placeholder={placeholder}
        onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}
function TextArea({ label, name, form, setForm, required = false, rows = 3 }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-1 text-rose-600">*</span>}
      <textarea rows={rows} value={form[name] ?? ''} required={required}
        onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
        className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}
function Select({ label, name, form, setForm, options, required = false }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required && <span className="ml-1 text-rose-600">*</span>}
      <select value={form[name] ?? ''} required={required}
        onChange={(e) => setForm((prev) => ({ ...prev, [name]: e.target.value }))}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
        <option value="">Select an option</option>
        {options.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );
}

export default function CommercialLicenseeOnboardingForm() {
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(null);

  const toggleArray = (field, value, checked) => setForm((prev) => ({
    ...prev,
    [field]: checked
      ? (value === 'None' ? ['None'] : [...new Set([...(prev[field] || []).filter((v) => v !== 'None'), value])])
      : (prev[field] || []).filter((v) => v !== value),
  }));

  const validate = () => {
    const root = document.getElementById('commercial-onboarding-form');
    if (step === 3) {
      const userLimit = Number(form.user_count);
      if (!Number.isInteger(userLimit) || userLimit < 1 || userLimit > 100000) {
        toast.error('Enter an expected user count between 1 and 100,000.');
        return false;
      }
      if (!form.modules.length) {
        toast.error('Select at least one module.');
        return false;
      }
    }
    const activeStep = root?.querySelector('[data-onboarding-step="active"]');
    if (activeStep) {
      const fields = activeStep.querySelectorAll('input, textarea, select');
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
    }
    if (step === 7 && !form.declaration) {
      toast.error('Please confirm the declaration.');
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validate()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const previous = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        user_count: Number(form.user_count),
        declaration: Boolean(form.declaration),
        source: 'onenexa_public_web_form',
      };
      const { data } = await api.post('/v2/commercial-onboarding/submissions', payload, { timeout: 30000 });
      setComplete(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(error?.response?.data?.detail?.message || error?.response?.data?.detail || 'Could not submit the application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (complete) {
    return (
      <div className="min-h-screen bg-[#F0EBF8] px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-2xl rounded-xl border-t-[10px] border-violet-700 bg-white p-7 shadow-sm sm:p-10">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Application submitted</h1>
          <p className="mt-2 text-sm text-slate-600">Your commercial licensee application has been received. It will appear in the platform owner's Commercial Licensing → Onboarding Approval tab. No tenant or license is activated until the platform owner approves it.</p>
          <div className="mt-5 rounded-lg bg-slate-100 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Application ID</div>
            <div className="mt-1 break-all font-mono text-lg font-bold text-slate-900">{complete.application_id}</div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Keep this application ID for future correspondence.</p>
        </div>
      </div>
    );
  }

  const currentHeading = STEPS[step];
  const subtitle = 'Request OneNexa commercial licensing, module access and deployment setup. Applications are reviewed by the platform owner before activation.';

  return (
    <div className="min-h-screen bg-[#F0EBF8] px-3 py-7 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-2 bg-violet-700" />
          <header className="border-b border-slate-100 px-5 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2.5"><ShieldCheck className="h-6 w-6 text-blue-800" /></div>
              <div><div className="text-xs font-bold uppercase tracking-[0.15em] text-blue-800">OneNexa</div><div className="text-xs text-slate-500">Commercial Licensing</div></div>
            </div>
            <h1 className="mt-5 text-2xl font-normal text-slate-900 sm:text-3xl">Commercial Licensee Onboarding</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            <p className="mt-3 text-xs text-slate-500"><span className="text-rose-600">*</span> Required field</p>
          </header>

          <div className="px-5 pt-5 sm:px-8">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-700 transition-all" style={{ width: ((step + 1) / STEPS.length * 100) + '%' }} /></div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Section {step + 1} of {STEPS.length}</span><span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span></div>
          </div>

          <form id="commercial-onboarding-form" onSubmit={submit}>
            <section data-onboarding-step="active" className="px-5 py-6 sm:px-8">
              <div className="mb-5 flex items-center gap-2.5">
                {[Building2, UserRound, Layers3, Layers3, Cloud, Palette, Plug, ShieldCheck][step] && React.createElement([Building2, UserRound, Layers3, Layers3, Cloud, Palette, Plug, ShieldCheck][step], { className: 'h-5 w-5 text-violet-700' })}
                <h2 className="text-lg font-semibold text-slate-900">{currentHeading}</h2>
              </div>

              {step === 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Legal / registered name" name="legal_name" form={form} setForm={setForm} required />
                <Input label="Trade / brand name" name="trade_name" form={form} setForm={setForm} />
                <Select label="Constitution / entity type" name="constitution" form={form} setForm={setForm} required options={['Private Limited Company','Public Limited Company','LLP','Partnership Firm','Proprietorship','Trust / Society','Individual / Professional','Other']} />
                <Input label="PAN" name="pan" form={form} setForm={setForm} required placeholder="ABCDE1234F" />
                <Input label="GSTIN" name="gstin" form={form} setForm={setForm} />
                <Input label="CIN / LLPIN / registration number" name="registration_no" form={form} setForm={setForm} />
                <div className="sm:col-span-2"><TextArea label="Registered office address" name="address" form={form} setForm={setForm} required /></div>
                <Input label="City" name="city" form={form} setForm={setForm} required />
                <Input label="State" name="state" form={form} setForm={setForm} required />
                <Input label="PIN code" name="pin" form={form} setForm={setForm} required />
                <Input label="Website" name="website" type="url" form={form} setForm={setForm} />
              </div>}

              {step === 1 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Contact person name" name="contact_name" form={form} setForm={setForm} required />
                <Input label="Designation" name="designation" form={form} setForm={setForm} required />
                <Input label="Official email" name="email" type="email" form={form} setForm={setForm} required />
                <Input label="Mobile number" name="mobile" form={form} setForm={setForm} required />
                <div className="sm:col-span-2"><Input label="Alternate contact / email" name="alternate_contact" form={form} setForm={setForm} /></div>
              </div>}

              {step === 2 && <div className="space-y-4">
                <Select label="Primary business type" name="business_type" form={form} setForm={setForm} required options={['CA / CS / CMA / Professional Firm','Corporate / SME','Accounting / Bookkeeping Firm','Compliance / Legal Firm','Trademark / IP Practice','Enterprise / Group','Reseller / Partner','Other']} />
                <TextArea label="Business description and intended use of OneNexa" name="business_description" form={form} setForm={setForm} required />
                <Input label="Approximate number of clients / entities" name="client_count" form={form} setForm={setForm} />
              </div>}

              {step === 3 && <div className="space-y-5">
                <div><div className="mb-2 text-sm font-medium text-slate-700">Modules requested <span className="text-rose-600">*</span></div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {MODULES.map(([value,label]) => <label key={value} className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                      <input type="checkbox" checked={form.modules.includes(value)} onChange={(e) => toggleArray('modules', value, e.target.checked)} className="h-4 w-4 accent-violet-700" />{label}
                    </label>)}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select label="Requested license model" name="license_type" form={form} setForm={setForm} required options={['Single Company / Licensee','Multi-Company / Group','White Label','Reseller / Partner','Enterprise','Standard','Professional']} />
                  <Input label="Expected number of users" name="user_count" type="number" form={form} setForm={setForm} required />
                  <Select label="Expected companies / entities" name="entity_count" form={form} setForm={setForm} options={['1','2–10','11–50','51–100','101–500','500+']} />
                </div>
                <TextArea label="Additional modules / commercial requirements" name="commercial_notes" form={form} setForm={setForm} />
              </div>}

              {step === 4 && <div className="space-y-4">
                <Select label="Preferred deployment" name="deployment" form={form} setForm={setForm} required options={['Cloud Hosted','Private Cloud / AWS','On-Premise / Local Server','Hybrid','Not Decided']} />
                <Select label="Data migration required?" name="migration" form={form} setForm={setForm} options={['Yes','No','To be discussed']} />
                <TextArea label="Current software/database and data volume (if migrating)" name="migration_details" form={form} setForm={setForm} />
                <Select label="Separate / isolated licensee data environment" name="isolation" form={form} setForm={setForm} options={['Yes – Dedicated / Isolated','No – Standard','Please advise']} />
              </div>}

              {step === 5 && <div className="space-y-4">
                <Select label="Custom branding required?" name="branding" form={form} setForm={setForm} options={['Yes','No','To be discussed']} />
                <Input label="Preferred white-label name" name="white_label_name" form={form} setForm={setForm} />
                <Input label="Custom domain" name="custom_domain" form={form} setForm={setForm} placeholder="app.example.com" />
                <div><div className="mb-2 text-sm font-medium text-slate-700">Required integrations</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INTEGRATIONS.map((value) => <label key={value} className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                    <input type="checkbox" checked={form.integrations.includes(value)} onChange={(e) => toggleArray('integrations', value, e.target.checked)} className="h-4 w-4 accent-violet-700" />{value}
                  </label>)}
                </div></div>
              </div>}

              {step === 6 && <div className="space-y-4">
                <Input label="Target implementation / go-live date" name="go_live_date" type="date" form={form} setForm={setForm} />
                <TextArea label="Implementation, training, support or special requirements" name="implementation_notes" form={form} setForm={setForm} />
                <TextArea label="Additional notes" name="notes" form={form} setForm={setForm} />
              </div>}

              {step === 7 && <div className="space-y-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                  Submission creates an onboarding application for review. It does not automatically create an active license or provide platform access. Any tenant/license provisioning remains inactive until platform-owner approval and subsequent activation.
                </div>
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                  <input type="checkbox" checked={form.declaration} onChange={(e) => setForm((prev) => ({ ...prev, declaration: e.target.checked }))} required className="mt-1 h-4 w-4 accent-violet-700" />
                  <span>I confirm that the information provided is accurate and may be used for commercial onboarding, verification, licensing and implementation purposes. <span className="text-rose-600">*</span></span>
                </label>
              </div>}
            </section>
            <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-8">
              <button type="button" onClick={previous} disabled={step === 0 || submitting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:invisible"><ChevronLeft className="h-4 w-4" /> Back</button>
              <div className="flex items-center gap-2">
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-800">Next <ChevronRight className="h-4 w-4" /></button>
                ) : (
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-60">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {submitting ? 'Submitting…' : 'Submit application'}
                  </button>
                )}
              </div>
            </footer>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">OneNexa · Commercial Licensee Onboarding</p>
      </div>
    </div>
  );
}
