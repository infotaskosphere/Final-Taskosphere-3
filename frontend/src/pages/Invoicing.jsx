import Papa from 'papaparse/papaparse.js';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import GifLoader, { MiniLoader } from '@/components/ui/GifLoader.jsx';
import { useDark } from '@/hooks/useDark';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  Plus, Edit, Trash2, FileText, Search, Download, X, ChevronRight,
  Check, Eye, Printer, Layout, Palette,
  CheckCircle2, Clock, AlertCircle, TrendingUp, DollarSign, BarChart3,
  Building2, Users, Receipt, CreditCard, RefreshCw, Send, Copy,
  Repeat, Package, Tag, ChevronDown, ChevronUp, Percent, Truck,
  ArrowUpRight, Activity, Zap, Shield, Star, Filter,
  IndianRupee, CalendarDays, FileCheck, ArrowRightLeft, Layers,
  Upload, Database, FileUp, CheckSquare, AlertTriangle, Phone, Mail,
  FileSpreadsheet, Briefcase, PieChart, Settings, Table, FileDown, BookOpen,
  ExternalLink
} from 'lucide-react';
import InvoiceSettings, { getInvSettings, getNextInvoiceNumber } from './InvoiceSettings';
import { COLOR_THEMES, INVOICE_TEMPLATES, generateInvoiceHTML } from './InvoiceTemplates';
import PartyLedger from './PartyLedger';

// ─── Brand Colors ─────────────────────────────────────────────────────────────
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
  coral: '#FF6B6B',
  amber: '#F59E0B',
  purple: '#7C3AED',
  teal: '#0D9488',
};

// ─── Constants ────────────────────────────────────────────────────────────────
const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['service','nos','kg','ltr','mtr','sqft','hr','day','month','year','set','lot','pcs','box'];
const PAY_MODES = ['cash','cheque','neft','rtgs','imps','upi','card','other'];
const INV_TYPES = [
  { value: 'tax_invoice', label: 'Tax Invoice' },
  { value: 'proforma', label: 'Proforma Invoice' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'credit_note', label: 'Credit Note' },
  { value: 'debit_note', label: 'Debit Note' },
];
const STATUS_META = {
  draft: { label: 'Draft', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400', hex: '#94A3B8' },
  sent: { label: 'Sent', bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500', hex: COLORS.mediumBlue },
  partially_paid: { label: 'Partial', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-400', hex: COLORS.amber },
  paid: { label: 'Paid', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', hex: COLORS.emeraldGreen },
  overdue: { label: 'Overdue', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', dot: 'bg-red-500', hex: COLORS.coral },
  cancelled: { label: 'Cancelled', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-400', hex: '#94A3B8' },
  credit_note: { label: 'Credit Note', bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500', hex: COLORS.purple },
};

// ─── Pure Module-Level Helpers ────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtC = (n) => `₹${fmt(n)}`;
const getStatusMeta = (inv) => {
  if (inv.status && STATUS_META[inv.status]) return STATUS_META[inv.status];
  if (inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0)
    return STATUS_META.overdue;
  return STATUS_META.draft;
};
const emptyItem = () => ({
  description: '', hsn_sac: '', quantity: 1, unit: 'service',
  unit_price: 0, discount_pct: 0, gst_rate: 18,
  taxable_value: 0, cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_amount: 0,
  item_details: '',
});

// Pure helper — no hooks, safe to call anywhere
const fyRange = (year) => {
  if (!year || year === 'all') return null;
  const y = parseInt(year);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};

// ─── Item Memory (localStorage) ───────────────────────────────────────────────
const getItemMemory = () => {
  try { return JSON.parse(localStorage.getItem('inv_item_memory') || '{}'); }
  catch { return {}; }
};
const saveItemMemory = (items = []) => {
  try {
    const mem = getItemMemory();
    items.forEach(it => {
      const key = (it.description || '').trim().toLowerCase();
      if (key) mem[key] = { description: it.description, unit_price: it.unit_price, gst_rate: it.gst_rate, unit: it.unit, hsn_sac: it.hsn_sac };
    });
    localStorage.setItem('inv_item_memory', JSON.stringify(mem));
  } catch {}
};
const computeItem = (item, isInter) => {
  const disc = item.unit_price * item.quantity * (item.discount_pct / 100);
  const taxable = Math.round((item.unit_price * item.quantity - disc) * 100) / 100;
  const g = item.gst_rate;
  if (isInter) {
    const igst = Math.round(taxable * g / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: 0, sgst_rate: 0, igst_rate: g,
      cgst_amount: 0, sgst_amount: 0, igst_amount: igst,
      total_amount: Math.round((taxable + igst) * 100) / 100 };
  } else {
    const half = g / 2;
    const cgst = Math.round(taxable * half / 100 * 100) / 100;
    const sgst = Math.round(taxable * half / 100 * 100) / 100;
    return { ...item, taxable_value: taxable, cgst_rate: half, sgst_rate: half, igst_rate: 0,
      cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0,
      total_amount: Math.round((taxable + cgst + sgst) * 100) / 100 };
  }
};
const computeTotals = (items, isInter, discAmt = 0, shipping = 0, other = 0) => {
  const comp = items.map(it => computeItem(it, isInter));
  const subtotal = comp.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totDisc = comp.reduce((s, i) => s + i.unit_price * i.quantity * i.discount_pct / 100, 0) + discAmt;
  const totTax = comp.reduce((s, i) => s + i.taxable_value, 0);
  const totCGST = comp.reduce((s, i) => s + i.cgst_amount, 0);
  const totSGST = comp.reduce((s, i) => s + i.sgst_amount, 0);
  const totIGST = comp.reduce((s, i) => s + i.igst_amount, 0);
  const totGST = Math.round((totCGST + totSGST + totIGST) * 100) / 100;
  const grand = Math.round((totTax + totGST + shipping + other - discAmt) * 100) / 100;
  return {
    items: comp,
    subtotal: Math.round(subtotal * 100) / 100,
    total_discount: Math.round(totDisc * 100) / 100,
    total_taxable: Math.round(totTax * 100) / 100,
    total_cgst: Math.round(totCGST * 100) / 100,
    total_sgst: Math.round(totSGST * 100) / 100,
    total_igst: Math.round(totIGST * 100) / 100,
    total_gst: totGST,
    grand_total: grand,
  };
};
const AVATAR_GRADS = [
  ['#0D3B66','#1F6FB2'],['#065f46','#059669'],['#7c2d12','#ea580c'],
  ['#4c1d95','#7c3aed'],['#831843','#db2777'],['#134e4a','#0d9488'],
];
const avatarGrad = (name = '') => {
  const i = (name.charCodeAt(0) || 0) % AVATAR_GRADS.length;
  return `linear-gradient(135deg, ${AVATAR_GRADS[i][0]}, ${AVATAR_GRADS[i][1]})`;
};
// ─── Invoice age-based colour strip ─────────────────────────────────────────
// green = paid / fully-received
// orange = outstanding 15-30 days since invoice date
// red = outstanding > 30 days since invoice date OR past due date
const getInvoiceStripe = (inv) => {
  if (inv.status === 'paid' || inv.amount_due <= 0) return { color: '#1FAF5A', label: 'Paid' };
  if (inv.status === 'cancelled') return { color: '#94A3B8', label: 'Cancelled' };
  const today = new Date();
  const invoiceDate = inv.invoice_date ? new Date(inv.invoice_date) : null;
  const dueDate = inv.due_date ? new Date(inv.due_date) : null;
  // If past due date → red
  if (dueDate && differenceInDays(today, dueDate) > 0) return { color: '#FF6B6B', label: 'Overdue' };
  // Days since invoice was created
  const daysSince = invoiceDate ? differenceInDays(today, invoiceDate) : 0;
  if (daysSince > 30) return { color: '#FF6B6B', label: '>30 days' };
  if (daysSince > 15) return { color: '#F59E0B', label: '>15 days' };
  return { color: '#1F6FB2', label: 'Recent' };
};

const Hl = ({ text = '', query = '' }) => {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-bold">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ─── DriveUploadBtn component ─────────────────────────────────────────
// Fixed to produce 100% identical PDF to browser Print
//
// ROOT CAUSE OF DIFFERENCE:
// The old code used html2canvas (screenshot-based) which renders differently from
// browser's native PDF renderer used in window.print().
//
// FIX:
// Instead of html2canvas, we send the raw HTML to the backend and let the
// backend use a headless browser (Puppeteer/Playwright) to render it — producing
// a pixel-perfect PDF identical to browser print.
//
// FALLBACK:
// If the backend doesn't support /upload-html-to-drive, we fall back to
// the improved html2canvas approach with settings that better match print output.
const DriveUploadBtn = ({ invoiceId, invoiceNo, invoice, companies }) => {
  const [loading, setLoading] = useState(false);

  const handleDriveUpload = async () => {
    setLoading(true);
    try {
      // 1. Fetch full invoice data if items are missing
      const invData = (invoice.items?.length || 0) > 0
        ? invoice
        : (await api.get(`/invoices/${invoiceId}`)).data;

      // 2. Resolve company + settings (identical to handleDownloadPdf)
      const baseCompany = (companies || []).find(c => c.id === invData.company_id) || {};
      const invSettings = getInvSettings(invData.company_id);
      const company = {
        ...baseCompany,
        bank_name:        baseCompany.bank_name        || invSettings.bank_name        || '',
        bank_account_no:  baseCompany.bank_account_no  || invSettings.bank_account_no  || '',
        bank_account:     baseCompany.bank_account     || invSettings.bank_account_no  || '',
        bank_ifsc:        baseCompany.bank_ifsc        || invSettings.bank_ifsc        || '',
        bank_branch:      baseCompany.bank_branch      || invSettings.bank_branch      || '',
        upi_id:           baseCompany.upi_id           || invSettings.upi_id           || '',
        show_qr_code:     invSettings.show_qr_code     ?? true,
        invoice_title:    invSettings.invoice_title    || 'Tax Invoice',
        signatory_name:   invSettings.signatory_name   || '',
        signatory_label:  invSettings.signatory_label  || 'Authorised Signatory',
        footer_line:      invSettings.footer_line      || '',
        signature_image:  baseCompany.signature_image  || baseCompany.signature_base64  || baseCompany.signature_url  || invSettings.signature_image || '',
        signature_base64: baseCompany.signature_base64 || baseCompany.signature_image   || '',
        logo_url:         baseCompany.logo_url         || baseCompany.logo              || '',
        logo_base64:      baseCompany.logo_base64      || '',
      };

      // 3. Generate the EXACT same HTML used by handleDownloadPdf / Print
      const html = generateInvoiceHTML(invData, {
        company,
        template:    invData.invoice_template     || invSettings.template     || 'classic',
        theme:       invData.invoice_theme        || invSettings.theme        || 'classic_blue',
        customColor: invData.invoice_custom_color || invSettings.custom_color || '#0D3B66',
      });

      const filename = `Invoice_${(invoiceNo || '').replace(/[\/\s]/g, '_')}.pdf`;

      // 4. PRIMARY: Try backend HTML-to-PDF endpoint (uses headless browser = identical to print)
      //    This is the PREFERRED path — produces 100% identical output to browser print
      try {
        const htmlResponse = await api.post(`/invoices/${invoiceId}/upload-html-to-drive`, {
          html_content: html,
          filename,
        });

        if (htmlResponse.data?.drive_link) {
          toast.success('Saved to Google Drive ✅ (identical to Print PDF)');
          if (window.confirm('Open in Google Drive?')) {
            window.open(htmlResponse.data.drive_link, '_blank');
          }
          return;
        }
      } catch (htmlErr) {
        // Backend doesn't support HTML endpoint — fall through to canvas method
        console.warn('HTML-to-PDF endpoint not available, using canvas fallback:', htmlErr.message);
      }

      // 5. FALLBACK: Use html2canvas with improved settings to minimize difference from print
      //    Key improvements over old code:
      //    - scale:3 (instead of 2) for sharper text closer to print quality
      //    - useCORS:true for external images (QR codes, logos)
      //    - Proper A4 page slicing
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');

      const blob    = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = [
          'position:fixed',
          'top:-9999px',
          'left:-9999px',
          'width:794px',   // A4 at 96dpi
          'height:1123px', // A4 height at 96dpi
          'border:none',
          'visibility:hidden',
        ].join(';');

        document.body.appendChild(iframe);

        iframe.onload = async () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            // Force A4 width layout identical to @page CSS
            iframeDoc.body.style.width  = '794px';
            iframeDoc.body.style.margin = '0';
            iframeDoc.body.style.padding = '0';
            iframeDoc.documentElement.style.width = '794px';

            // Wait for ALL images to load (logo, signature, QR code from external URL)
            const imgs = Array.from(iframeDoc.querySelectorAll('img'));
            await Promise.all(
              imgs.map(img =>
                img.complete
                  ? Promise.resolve()
                  : new Promise(res => {
                      img.onload  = res;
                      img.onerror = res;
                      setTimeout(res, 5000); // 5s max per image
                    })
              )
            );

            // Extra settle for QR API and web fonts
            await new Promise(r => setTimeout(r, 1000));

            const fullHeight = Math.max(
              iframeDoc.body.scrollHeight,
              iframeDoc.documentElement.scrollHeight,
              1123
            );

            // Use scale:3 for higher fidelity (closer to print 300dpi)
            const canvas = await window.html2canvas(iframeDoc.body, {
              scale:           3,
              useCORS:         true,
              allowTaint:      false,
              logging:         false,
              width:           794,
              height:          fullHeight,
              windowWidth:     794,
              windowHeight:    fullHeight,
              scrollX:         0,
              scrollY:         0,
              backgroundColor: '#ffffff',
              imageTimeout:    8000,
              removeContainer: false,
              // These options help match print rendering more closely:
              letterRendering: true,
              foreignObjectRendering: false,
            });

            // A4 dimensions
            const A4_W = 210;
            const A4_H = 297;

            // Use PNG instead of JPEG to avoid compression artifacts
            const imgData     = canvas.toDataURL('image/png');
            const imgHeightMM = (canvas.height * A4_W) / canvas.width;

            let pageCount = Math.ceil(imgHeightMM / A4_H);
            if (pageCount < 1) pageCount = 1;

            for (let page = 0; page < pageCount; page++) {
              if (page > 0) pdf.addPage();
              const yOffset = -(page * A4_H);
              pdf.addImage(imgData, 'PNG', 0, yOffset, A4_W, imgHeightMM);
            }

            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
            resolve();
          } catch (err) {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
            reject(err);
          }
        };

        iframe.onerror = () => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
          URL.revokeObjectURL(blobUrl);
          reject(new Error('iframe load failed'));
        };

        iframe.src = blobUrl;
      });

      // 6. Upload base64 PDF to backend
      const base64 = pdf.output('datauristring').split(',')[1];

      const response = await api.post(`/invoices/${invoiceId}/upload-pdf-to-drive`, {
        pdf_base64: base64,
        filename,
      });

      if (response.data?.drive_link) {
        toast.success('Saved to Google Drive ✅');
        if (window.confirm('Open in Google Drive?')) {
          window.open(response.data.drive_link, '_blank');
        }
      } else {
        toast.warning(response.data?.message || 'Upload failed');
      }

    } catch (err) {
      console.error('Drive upload error:', err);
      toast.error(`Drive upload failed: ${err.response?.data?.detail || err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDriveUpload}
      disabled={loading}
      className="rounded-xl text-xs h-9 gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50"
      title="Save invoice to Google Drive (identical to Print PDF)"
    >
      {loading ? (
        <span className="flex items-center gap-1">
          <span className="w-3.5 h-3.5 border border-blue-500 border-t-transparent rounded-full animate-spin" />
          Uploading…
        </span>
      ) : (
        'Save to Drive'
      )}
    </Button>
  );
};

function parseExcelInvoices(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb      = XLSX.read(e.target.result, { type: 'array' });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        const rows    = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
 
        // Find header row (first row containing "Invoice No" or "invoice no")
        let headerIdx = rows.findIndex(r =>
          String(r[0] || '').toLowerCase().includes('invoice') ||
          String(r[1] || '').toLowerCase().includes('invoice')
        );
        if (headerIdx === -1) headerIdx = 0;
 
        const headers   = (rows[headerIdx] || []).map(h => String(h).trim().toLowerCase());
        const dataRows  = rows.slice(headerIdx + 1).filter(r => r.some(cell => cell !== ''));
 
        const col = (name) => {
          const idx = headers.findIndex(h => h.includes(name));
          return idx;
        };
 
        const invoices = dataRows.map((row, i) => {
          const get = (name, fallback = '') => {
            const idx = col(name);
            return idx >= 0 ? String(row[idx] || '').trim() : fallback;
          };
          const getNum = (name, fallback = 0) => {
            const idx = col(name);
            return idx >= 0 ? (parseFloat(row[idx]) || fallback) : fallback;
          };
 
          const rawDate   = get('date');
          const invoiceNo = get('invoice no') || get('invoice #') || `IMP-${String(i + 1).padStart(4, '0')}`;
          const clientName= get('customer') || get('client') || get('party') || 'Unknown';
          const gstin     = get('gstin') || get('gst');
          const phone     = get('phone') || get('mobile');
          const total     = getNum('total') || getNum('amount') || getNum('grand');
          const paid      = getNum('paid') || getNum('received');
          const balance   = getNum('balance') || getNum('due') || Math.max(total - paid, 0);
          const notes     = get('notes') || get('description') || get('remarks');
          const terms     = get('payment terms') || get('terms');
 
          // Normalise date  DD/MM/YYYY → YYYY-MM-DD
          let invDate = format(new Date(), 'yyyy-MM-dd');
          if (rawDate) {
            const parts = rawDate.split(/[\/\-\.]/);
            if (parts.length === 3) {
              const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              const m = parts[1].padStart(2, '0');
              const d = parts[0].padStart(2, '0');
              const parsed = new Date(`${y}-${m}-${d}`);
              if (!isNaN(parsed)) invDate = format(parsed, 'yyyy-MM-dd');
            }
          }
 
          const dueDate = format(
            new Date(new Date(invDate).getTime() + 30 * 86400000),
            'yyyy-MM-dd'
          );
 
          // Derive status
          let status = 'draft';
          if (balance <= 0 && total > 0)            status = 'paid';
          else if (paid > 0 && balance > 0)          status = 'partially_paid';
          else if (balance > 0)                      status = 'sent';
 
          // Back-calculate taxable assuming 18% GST
          const gstRate  = 18;
          const taxable  = Math.round(total / 1.18 * 100) / 100;
          const gstAmt   = Math.round((total - taxable) * 100) / 100;
          const cgst     = Math.round(gstAmt / 2 * 100) / 100;
 
          return {
            invoice_type:    'tax_invoice',
            invoice_no:      invoiceNo,
            client_name:     clientName,
            client_email:    get('email') || '',
            client_phone:    phone,
            client_gstin:    gstin,
            client_address:  get('address') || '',
            client_state:    get('state') || '',
            invoice_date:    invDate,
            due_date:        dueDate,
            reference_no:    get('ref') || get('po') || '',
            notes:           notes,
            payment_terms:   terms || 'Due on receipt',
            is_interstate:   false,
            items: [{
              description:    notes || `Import – ${invoiceNo}`,
              hsn_sac:        '',
              quantity:       1,
              unit:           'service',
              unit_price:     taxable,
              discount_pct:   0,
              gst_rate:       gstRate,
              taxable_value:  taxable,
              cgst_rate:      9,
              sgst_rate:      9,
              igst_rate:      0,
              cgst_amount:    cgst,
              sgst_amount:    cgst,
              igst_amount:    0,
              total_amount:   total,
            }],
            subtotal:        taxable,
            total_taxable:   taxable,
            total_cgst:      cgst,
            total_sgst:      cgst,
            total_igst:      0,
            total_gst:       gstAmt,
            grand_total:     total,
            amount_paid:     paid,
            amount_due:      balance,
            status,
            discount_amount:  0,
            shipping_charges: 0,
            other_charges:    0,
          };
        }).filter(inv => (inv.grand_total || 0) > 0);
 
        resolve(invoices);
      } catch (err) {
        reject(new Error(`Failed to parse Excel: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
//  Module-level: used by Invoicing header AND ImportModal 
// ════════════════════════════════════════════════════════════════════════════════
const downloadInvoiceTemplate = () => {
  const headers = [
    "Invoice No","Date","Customer Name","GSTIN","Phone",
    "Item Description","HSN/SAC","Quantity","Unit",
    "Unit Price","Discount %","GST %",
    "Shipping","Other Charges",
    "Total Amount","Paid Amount","Balance",
    "Payment Terms","Notes"
  ];
  const sampleRows = [
    ["INV-001","01/04/2026","ABC Pvt Ltd","24ABCDE1234F1Z5","9876543210",
     "Consulting Service","9983","1","service","10000","0","18",
     "0","0","11800","5000","6800","Due in 30 days","First invoice"]
  ];
  const csvContent = [
    headers.join(","),
    ...sampleRows.map(r => r.join(","))
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "invoice_template.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


// ════════════════════════════════════════════════════════════════════════════════
// CLIENT SEARCH COMBOBOX
// ════════════════════════════════════════════════════════════════════════════════
const ClientSearchCombobox = ({ clients = [], value, onSelect, onAddNew, isDark }) => {
  // ── useState ──
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(-1);

  // ── useRef ──
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── useMemo ──
  const selected = useMemo(() => clients.find(c => c.id === value) || null, [clients, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients.filter(c =>
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.client_gstin || '').toLowerCase().includes(q)
    ).slice(0, 40);
  }, [clients, query]);

  // ── useEffect ──
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery(''); setFocused(-1);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (focused >= 0 && listRef.current) {
      listRef.current.querySelector(`[data-idx="${focused}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  // ── Handlers ──
  const openDrop = () => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 20); };
  const pick = (client) => { onSelect(client); setOpen(false); setQuery(''); setFocused(-1); };
  const clear = (e) => { e.stopPropagation(); onSelect(null); };
  const onKeyDown = (e) => {
    if (!open) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrop(); } return; }
    const total = filtered.length + 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocused(f => Math.max(f - 1, -1)); }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); setFocused(-1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused === filtered.length) { setOpen(false); onAddNew?.(); return; }
      if (focused >= 0 && filtered[focused]) pick(filtered[focused]);
    }
  };

  const inputCls = `w-full flex items-center gap-2.5 h-11 px-3 rounded-xl border text-sm transition-all outline-none
    ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}
    ${open ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm' : 'hover:border-blue-300'}`;

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button type="button" onClick={open ? () => { setOpen(false); setQuery(''); } : openDrop}
        className={inputCls} aria-haspopup="listbox" aria-expanded={open}>
        {selected ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: avatarGrad(selected.company_name) }}>
              {selected.company_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-sm font-semibold truncate leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                {selected.company_name}
              </p>
              <p className={`text-[10px] truncate leading-tight ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                {selected.phone || selected.email || 'No contact info'}
              </p>
            </div>
          </div>
        ) : (
          <span className={`flex-1 text-left text-sm ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
            — Search or select client —
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <span onClick={clear} role="button" tabIndex={-1}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 hover:text-red-500 text-slate-300 transition-colors">
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className={`absolute z-50 w-full mt-1.5 rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
          style={{ maxHeight: 340 }}>
          <div className={`flex items-center gap-2 px-3 py-2.5 border-b flex-shrink-0 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100'}`}>
            <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setFocused(-1); }}
              placeholder="Type name, GSTIN, phone or email…"
              className={`flex-1 text-sm outline-none placeholder:text-slate-400 bg-transparent ${isDark ? 'text-slate-100' : 'text-slate-800'}`}
              autoComplete="off" />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setFocused(-1); inputRef.current?.focus(); }}
                className="text-slate-300 hover:text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {filtered.length === 0 && query ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Search className="h-5 w-5 mb-2 opacity-30" />
                <p className="text-xs font-medium">No matches for "{query}"</p>
              </div>
            ) : filtered.map((c, i) => {
              const isActive = i === focused;
              const isSelected = c.id === value;
              return (
                <div key={c.id} data-idx={i} role="option" aria-selected={isSelected}
                  onClick={() => pick(c)} onMouseEnter={() => setFocused(i)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b last:border-0 transition-colors
                    ${isDark ? 'border-slate-700' : 'border-slate-50'}
                    ${isActive ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50')}
                    ${isSelected ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/60') : ''}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                    style={{ background: avatarGrad(c.company_name) }}>
                    {c.company_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                        <Hl text={c.company_name || ''} query={query} />
                      </p>
                      {isSelected && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">
                          ✓ Selected
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.phone && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Phone className="h-2.5 w-2.5" /><Hl text={c.phone} query={query} />
                        </span>
                      )}
                      {c.email && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 max-w-[180px] truncate">
                          <Mail className="h-2.5 w-2.5 flex-shrink-0" /><Hl text={c.email} query={query} />
                        </span>
                      )}
                      {c.client_gstin && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          <Hl text={c.client_gstin} query={query} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={`flex-shrink-0 border-t ${isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-100 bg-slate-50/60'}`}>
            <button type="button" data-idx={filtered.length}
              onMouseEnter={() => setFocused(filtered.length)}
              onClick={() => { setOpen(false); onAddNew?.(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left
                ${focused === filtered.length ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-slate-700/40' : 'hover:bg-blue-50/60')}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}>
                <Plus className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Add New Client</p>
                <p className="text-[10px] text-slate-400">Opens client form in a new tab</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// GST REPORTS MODAL
// ════════════════════════════════════════════════════════════════════════════════
const GSTReportsModal = ({ open, onClose, invoices = [], companies = [], isDark }) => {
  const [tab, setTab] = useState('gstr1');
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [companyFilter, setCompanyFilter] = useState('all');
  const [exporting, setExporting] = useState(null);

  // ── Base filtered data ──────────────────────────────────────────────────
  const baseInvoices = useMemo(() => {
    return (invoices || []).filter(inv => {
      if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false;
      if (!inv.invoice_date?.startsWith(month)) return false;
      if (!['tax_invoice', 'credit_note', 'debit_note'].includes(inv.invoice_type)) return false;
      if (inv.status === 'cancelled') return false;
      return true;
    });
  }, [invoices, month, companyFilter]);

  // ── GSTR-1 data ─────────────────────────────────────────────────────────
  const gstr1 = useMemo(() => {
    const b2b = [], b2cL = [], b2cS = [], cdnr = [];
    const hsnMap = {};

    for (const inv of baseInvoices) {
      const hasGstin = !!inv.client_gstin?.trim();
      const isCDN = ['credit_note', 'debit_note'].includes(inv.invoice_type);
      const total = inv.grand_total || 0;

      if (isCDN && hasGstin) cdnr.push(inv);
      else if (hasGstin) b2b.push(inv);
      else if (total > 250000) b2cL.push(inv);
      else b2cS.push(inv);

      for (const item of (inv.items || [])) {
        // ✅ FIX 2: 'UNKNOWN' → '—'
        const key = item.hsn_sac?.trim() || '—';
        if (!hsnMap[key]) hsnMap[key] = {
          hsn_sac: key, description: item.description || '',
          quantity: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0,
        };
        hsnMap[key].quantity  += item.quantity || 0;
        hsnMap[key].taxable   += item.taxable_value || 0;
        hsnMap[key].igst      += item.igst_amount || 0;
        hsnMap[key].cgst      += item.cgst_amount || 0;
        hsnMap[key].sgst      += item.sgst_amount || 0;
      }
    }

    const b2cSTotal = b2cS.reduce((a, inv) => ({
      taxable: a.taxable + (inv.total_taxable || 0),
      igst:    a.igst    + (inv.total_igst    || 0),
      cgst:    a.cgst    + (inv.total_cgst    || 0),
      sgst:    a.sgst    + (inv.total_sgst    || 0),
    }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });

    return { b2b, b2cL, b2cS, b2cSTotal, cdnr, hsnSummary: Object.values(hsnMap) };
  }, [baseInvoices]);

  // ── GSTR-3B data ────────────────────────────────────────────────────────
  const gstr3b = useMemo(() => {
    const outward = baseInvoices
      .filter(i => i.invoice_type === 'tax_invoice')
      .reduce((a, inv) => ({
        taxable: a.taxable + (inv.total_taxable || 0),
        igst:    a.igst    + (inv.total_igst    || 0),
        cgst:    a.cgst    + (inv.total_cgst    || 0),
        sgst:    a.sgst    + (inv.total_sgst    || 0),
      }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });

    const credits = baseInvoices
      .filter(i => i.invoice_type === 'credit_note')
      .reduce((a, inv) => ({
        taxable: a.taxable + (inv.total_taxable || 0),
        igst:    a.igst    + (inv.total_igst    || 0),
        cgst:    a.cgst    + (inv.total_cgst    || 0),
        sgst:    a.sgst    + (inv.total_sgst    || 0),
      }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });

    const netIGST = outward.igst - credits.igst;
    const netCGST = outward.cgst - credits.cgst;
    const netSGST = outward.sgst - credits.sgst;

    return {
      outward, credits, netIGST, netCGST, netSGST,
      netTotal: netIGST + netCGST + netSGST,
    };
  }, [baseInvoices]);

  // ── Export helpers ──────────────────────────────────────────────────────
  const handleExport = (exportFormat = 'excel') => {
    setExporting(exportFormat);
    try {
      const companyName = companyFilter === 'all'
        ? 'All'
        : (companies.find(c => c.id === companyFilter)?.name || companyFilter);

      if (exportFormat === 'json') {
        const jsonData = {
          generated_at: new Date().toISOString(),
          month,
          company: companyName,
          gstr1: {
            b2b: gstr1.b2b.map(inv => ({
              invoice_no: inv.invoice_no,
              invoice_date: inv.invoice_date,
              client_name: inv.client_name,
              client_gstin: inv.client_gstin,
              total_taxable: inv.total_taxable,
              total_cgst: inv.total_cgst,
              total_sgst: inv.total_sgst,
              total_igst: inv.total_igst,
              grand_total: inv.grand_total,
            })),
            b2c_large: gstr1.b2cL.map(inv => ({
              invoice_no: inv.invoice_no,
              invoice_date: inv.invoice_date,
              client_name: inv.client_name,
              total_taxable: inv.total_taxable,
              total_cgst: inv.total_cgst,
              total_sgst: inv.total_sgst,
              total_igst: inv.total_igst,
              grand_total: inv.grand_total,
            })),
            b2c_small_summary: gstr1.b2cSTotal,
            hsn_summary: gstr1.hsnSummary,
            cdnr: gstr1.cdnr.map(inv => ({
              invoice_no: inv.invoice_no,
              invoice_date: inv.invoice_date,
              client_name: inv.client_name,
              client_gstin: inv.client_gstin,
              grand_total: inv.grand_total,
            })),
          },
          gstr3b: {
            outward_supplies: gstr3b.outward,
            credit_note_adjustments: gstr3b.credits,
            net_igst: gstr3b.netIGST,
            net_cgst: gstr3b.netCGST,
            net_sgst: gstr3b.netSGST,
            total_tax_liability: gstr3b.netTotal,
          },
          all_invoices: baseInvoices.map(inv => ({
            invoice_no: inv.invoice_no,
            invoice_type: inv.invoice_type,
            invoice_date: inv.invoice_date,
            client_name: inv.client_name,
            client_gstin: inv.client_gstin || '',
            total_taxable: inv.total_taxable,
            total_cgst: inv.total_cgst,
            total_sgst: inv.total_sgst,
            total_igst: inv.total_igst,
            grand_total: inv.grand_total,
            status: inv.status,
          })),
        };
        const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `GST_${month}_${companyName.replace(/\s+/g,'_')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('GST data exported as JSON!');
        return;
      }
      if (tab === 'gstr1') {
        const rows = [
          ['GSTR-1 Export', `Month: ${month}`, `Company: ${companyFilter === 'all' ? 'All' : (companies.find(c=>c.id===companyFilter)?.name || companyFilter)}`],
          [],
          ['== B2B Invoices =='],
          ['Invoice No', 'Date', 'Client', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
          ...gstr1.b2b.map(inv => [
            inv.invoice_no, inv.invoice_date, inv.client_name, inv.client_gstin,
            inv.total_taxable, inv.total_cgst, inv.total_sgst, inv.total_igst, inv.grand_total,
          ]),
          [],
          ['== B2C Large (>2.5L) =='],
          ['Invoice No', 'Date', 'Client', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
          ...gstr1.b2cL.map(inv => [
            inv.invoice_no, inv.invoice_date, inv.client_name,
            inv.total_taxable, inv.total_cgst, inv.total_sgst, inv.total_igst, inv.grand_total,
          ]),
          [],
          ['== B2C Small Summary =='],
          ['Taxable', 'CGST', 'SGST', 'IGST'],
          [gstr1.b2cSTotal.taxable, gstr1.b2cSTotal.cgst, gstr1.b2cSTotal.sgst, gstr1.b2cSTotal.igst],
          [],
          ['== HSN Summary =='],
          ['HSN/SAC', 'Description', 'Quantity', 'Taxable', 'CGST', 'SGST', 'IGST'],
          ...gstr1.hsnSummary.map(h => [h.hsn_sac, h.description, h.quantity, h.taxable, h.cgst, h.sgst, h.igst]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'GSTR-1');
        XLSX.writeFile(wb, `GSTR1_${month}.xlsx`);
      } else {
        const rows = [
          ['GSTR-3B Export', `Month: ${month}`],
          [],
          ['Section', 'Taxable Value', 'IGST', 'CGST', 'SGST'],
          ['3.1 Outward Taxable Supplies', gstr3b.outward.taxable, gstr3b.outward.igst, gstr3b.outward.cgst, gstr3b.outward.sgst],
          ['Credit Notes Adjustment', gstr3b.credits.taxable, gstr3b.credits.igst, gstr3b.credits.cgst, gstr3b.credits.sgst],
          ['Net Tax Liability', '', gstr3b.netIGST, gstr3b.netCGST, gstr3b.netSGST],
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B');
        XLSX.writeFile(wb, `GSTR3B_${month}.xlsx`);
      }
      toast.success('GST report exported!');
    } catch (e) {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  // ── Shared table styles ─────────────────────────────────────────────────
  const thCls = `px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`;
  const tdCls = `px-3 py-2 text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
  const trCls = `border-b last:border-0 ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-50 hover:bg-slate-50'}`;
  const cardCls = `rounded-xl border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[94vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 [&>button.absolute]:hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">GST Returns</DialogTitle>
        <DialogDescription className="sr-only">GSTR-1 and GSTR-3B reports</DialogDescription>

        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)' }}
        >
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-white" />
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">GST Returns</h2>
              <p className="text-emerald-200 text-xs">GSTR-1 · GSTR-3B · {baseInvoices.length} invoices in view</p>
            </div>
          </div>

          {/* ✅ FIX 1: removed stray }), FIX 3: added close button */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className={`h-9 w-[160px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-blue-50 text-blue-700'}`}>
                <Building2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                <SelectValue placeholder="Select Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {(companies || []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="h-9 px-3 rounded-xl bg-white/15 text-white text-xs border border-white/20 [color-scheme:dark] focus:outline-none"
            />
            <button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="h-9 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting === 'excel' ? 'Exporting…' : 'Excel'}
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={exporting}
              className="h-9 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-colors disabled:opacity-50"
            >
              <FileText className="h-3.5 w-3.5" />
              {exporting === 'json' ? 'Exporting…' : 'JSON'}
            </button>
            {/* ✅ FIX 3: Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors flex-shrink-0"
              title="Close"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b flex-shrink-0 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          {[
            { id: 'gstr1',  label: 'GSTR-1',  sub: 'Outward Supplies' },
            { id: 'gstr3b', label: 'GSTR-3B', sub: 'Tax Summary' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border-b-2 transition-all ${
                tab === t.id
                  ? `border-emerald-500 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`
                  : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`
              }`}>
              {t.label}
              <span className={`text-[10px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t.sub}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {baseInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <FileSpreadsheet className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium">No invoices for {month}{companyFilter !== 'all' ? ' · selected company' : ''}</p>
              <p className="text-xs">Adjust the month or company filter above</p>
            </div>
          ) : tab === 'gstr1' ? (
            <div className="space-y-5">
              {/* Summary pills */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'B2B Invoices',      value: gstr1.b2b.length,  color: COLORS.mediumBlue,   desc: 'Registered buyers (GSTIN)' },
                  { label: 'B2C Large',          value: gstr1.b2cL.length, color: COLORS.amber,        desc: 'Unregistered > ₹2.5L' },
                  { label: 'B2C Small',          value: gstr1.b2cS.length, color: COLORS.emeraldGreen, desc: 'Unregistered ≤ ₹2.5L' },
                  { label: 'Credit/Debit Notes', value: gstr1.cdnr.length, color: COLORS.coral,        desc: 'CDNR' },
                ].map(s => (
                  <div key={s.label} className={`${cardCls} p-3`}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
                    <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* B2B */}
              {gstr1.b2b.length > 0 && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      B2B — Registered Buyers ({gstr1.b2b.length})
                    </p>
                  </div>
                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full">
                      <thead className={`sticky top-0 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <tr>
                          {['Invoice No','Date','Client','GSTIN','Taxable','CGST','SGST','IGST','Total'].map(h => (
                            <th key={h} className={thCls}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gstr1.b2b.map((inv, i) => (
                          <tr key={inv.id || i} className={trCls}>
                            <td className={`${tdCls} font-mono font-semibold`}>{inv.invoice_no}</td>
                            <td className={tdCls}>{inv.invoice_date}</td>
                            <td className={`${tdCls} max-w-[140px] truncate`}>{inv.client_name}</td>
                            <td className={`${tdCls} font-mono text-[10px]`}>{inv.client_gstin}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_taxable)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_cgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_sgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_igst)}</td>
                            <td className={`${tdCls} text-right font-bold`}>{fmtC(inv.grand_total)}</td>
                          </tr>
                        ))}
                        <tr className={`border-t-2 font-bold ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-slate-50'}`}>
                          <td colSpan={4} className={`${tdCls} font-bold`}>B2B Total</td>
                          <td className={`${tdCls} text-right font-bold`} style={{ color: COLORS.mediumBlue }}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_taxable||0),0))}</td>
                          <td className={`${tdCls} text-right font-bold`}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_cgst||0),0))}</td>
                          <td className={`${tdCls} text-right font-bold`}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_sgst||0),0))}</td>
                          <td className={`${tdCls} text-right font-bold`}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.total_igst||0),0))}</td>
                          <td className={`${tdCls} text-right font-bold`} style={{ color: COLORS.mediumBlue }}>{fmtC(gstr1.b2b.reduce((s,i)=>s+(i.grand_total||0),0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* B2C Large */}
              {gstr1.b2cL.length > 0 && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">B2C Large — &gt;₹2.5L ({gstr1.b2cL.length})</p>
                  </div>
                  <div className="overflow-x-auto max-h-44 overflow-y-auto">
                    <table className="w-full">
                      <thead className={`sticky top-0 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <tr>{['Invoice No','Date','Client','Taxable','CGST','SGST','IGST','Total'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {gstr1.b2cL.map((inv,i)=>(
                          <tr key={inv.id||i} className={trCls}>
                            <td className={`${tdCls} font-mono`}>{inv.invoice_no}</td>
                            <td className={tdCls}>{inv.invoice_date}</td>
                            <td className={`${tdCls} max-w-[160px] truncate`}>{inv.client_name}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_taxable)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_cgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_sgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(inv.total_igst)}</td>
                            <td className={`${tdCls} text-right font-bold`}>{fmtC(inv.grand_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* B2C Small Summary */}
              {gstr1.b2cS.length > 0 && (
                <div className={`${cardCls} p-4`}>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    B2C Small Summary — {gstr1.b2cS.length} invoices (≤₹2.5L each, consolidated)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Taxable', val: gstr1.b2cSTotal.taxable, color: COLORS.deepBlue },
                      { label: 'CGST',    val: gstr1.b2cSTotal.cgst,    color: COLORS.mediumBlue },
                      { label: 'SGST',    val: gstr1.b2cSTotal.sgst,    color: COLORS.mediumBlue },
                      { label: 'IGST',    val: gstr1.b2cSTotal.igst,    color: COLORS.amber },
                    ].map(s => (
                      <div key={s.label} className={`rounded-lg p-2.5 ${isDark ? 'bg-slate-800' : 'bg-white'} border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider">{s.label}</p>
                        <p className="text-sm font-black mt-0.5" style={{ color: s.color }}>{fmtC(s.val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HSN Summary */}
              {gstr1.hsnSummary.length > 0 && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">HSN/SAC Summary</p>
                  </div>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full">
                      <thead className={`sticky top-0 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <tr>{['HSN/SAC','Description','Qty','Taxable Value','CGST','SGST','IGST'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {gstr1.hsnSummary.sort((a,b)=>b.taxable-a.taxable).map((h,i)=>(
                          <tr key={h.hsn_sac||i} className={trCls}>
                            <td className={`${tdCls} font-mono font-bold`}>{h.hsn_sac}</td>
                            <td className={`${tdCls} max-w-[180px] truncate`}>{h.description || '—'}</td>
                            <td className={`${tdCls} text-right`}>{h.quantity.toFixed(2)}</td>
                            <td className={`${tdCls} text-right font-semibold`}>{fmtC(h.taxable)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(h.cgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(h.sgst)}</td>
                            <td className={`${tdCls} text-right`}>{fmtC(h.igst)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // GSTR-3B
            <div className="space-y-5">
              {/* Net Tax Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Net IGST',           value: gstr3b.netIGST,  color: COLORS.coral },
                  { label: 'Net CGST',           value: gstr3b.netCGST,  color: COLORS.mediumBlue },
                  { label: 'Net SGST',           value: gstr3b.netSGST,  color: COLORS.teal },
                  { label: 'Total Tax Liability', value: gstr3b.netTotal, color: COLORS.deepBlue },
                ].map(s => (
                  <div key={s.label} className={`${cardCls} p-3`}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
                    <p className="text-xl font-black" style={{ color: s.color }}>{fmtC(s.value)}</p>
                  </div>
                ))}
              </div>

              {/* 3.1 Outward Supplies */}
              <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">3.1 — Outward Taxable Supplies</p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>
                      {['Description','Taxable Value','IGST','CGST','SGST','Total Tax'].map(h=><th key={h} className={thCls}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Outward Taxable Supplies (Tax Invoice)', gstr3b.outward],
                      ['Credit Note Adjustments (−)',           gstr3b.credits],
                    ].map(([label, d]) => (
                      <tr key={label} className={trCls}>
                        <td className={`${tdCls} font-semibold`}>{label}</td>
                        <td className={`${tdCls} text-right`}>{fmtC(d.taxable)}</td>
                        <td className={`${tdCls} text-right`}>{fmtC(d.igst)}</td>
                        <td className={`${tdCls} text-right`}>{fmtC(d.cgst)}</td>
                        <td className={`${tdCls} text-right`}>{fmtC(d.sgst)}</td>
                        <td className={`${tdCls} text-right font-bold`}>{fmtC(d.igst + d.cgst + d.sgst)}</td>
                      </tr>
                    ))}
                    <tr className={`border-t-2 ${isDark ? 'border-slate-600 bg-slate-700/40' : 'border-slate-200 bg-emerald-50/60'}`}>
                      <td className={`${tdCls} font-black`} style={{ color: COLORS.emeraldGreen }}>Net Tax Payable</td>
                      <td className={`${tdCls} text-right font-bold`}>{fmtC(gstr3b.outward.taxable - gstr3b.credits.taxable)}</td>
                      <td className={`${tdCls} text-right font-bold`} style={{ color: COLORS.coral }}>{fmtC(gstr3b.netIGST)}</td>
                      <td className={`${tdCls} text-right font-bold`} style={{ color: COLORS.mediumBlue }}>{fmtC(gstr3b.netCGST)}</td>
                      <td className={`${tdCls} text-right font-bold`} style={{ color: COLORS.teal }}>{fmtC(gstr3b.netSGST)}</td>
                      <td className="px-3 py-2 text-right text-sm font-black" style={{ color: COLORS.deepBlue }}>{fmtC(gstr3b.netTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Invoice list for the month */}
              <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/60 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    All Invoices in {month} ({baseInvoices.length})
                  </p>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className={`sticky top-0 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                      <tr>{['Invoice No','Type','Client','Date','Taxable','CGST','SGST','IGST','Total'].map(h=><th key={h} className={thCls}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {baseInvoices.map((inv,i)=>(
                        <tr key={inv.id||i} className={trCls}>
                          <td className={`${tdCls} font-mono font-semibold`}>{inv.invoice_no}</td>
                          <td className={tdCls}>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark?'bg-slate-700 text-slate-300':'bg-slate-100 text-slate-600'}`}>
                              {INV_TYPES.find(t=>t.value===inv.invoice_type)?.label||inv.invoice_type}
                            </span>
                          </td>
                          <td className={`${tdCls} max-w-[160px] truncate`}>{inv.client_name}</td>
                          <td className={tdCls}>{inv.invoice_date}</td>
                          <td className={`${tdCls} text-right`}>{fmtC(inv.total_taxable)}</td>
                          <td className={`${tdCls} text-right`}>{fmtC(inv.total_cgst)}</td>
                          <td className={`${tdCls} text-right`}>{fmtC(inv.total_sgst)}</td>
                          <td className={`${tdCls} text-right`}>{fmtC(inv.total_igst)}</td>
                          <td className={`${tdCls} text-right font-bold`}>{fmtC(inv.grand_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
// ════════════════════════════════════════════════════════════════════════════════
// EXCEL IMPORT — parse Excel/CSV invoice template
// ════════════════════════════════════════════════════════════════════════════════
function parseSaleReportExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
        let headerIdx = rows.findIndex(r => String(r[0]).trim().toLowerCase() === 'date');
        if (headerIdx === -1) headerIdx = 2;
        const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).trim());
        const invoices = dataRows.map((row, i) => {
          const rawDate = String(row[0] || '').trim();
          const orderNo = String(row[1] || '').trim();
          const invoiceNo = String(row[2] || '').trim();
          const partyName = String(row[3] || '').trim() || 'Unknown';
          const gstin = String(row[4] || '').trim();
          const phone = String(row[5] || '').trim();
          const txnType = String(row[6] || '').trim().toLowerCase();
          const totalAmount = parseFloat(row[7]) || 0;
          const paymentType = String(row[8] || '').trim();
          const received = parseFloat(row[9]) || 0;
          const balanceDue = parseFloat(row[10]) || 0;
          const paymentStatus = String(row[11] || '').trim().toLowerCase();
          const description = String(row[12] || '').trim();
          let invDate = format(new Date(), 'yyyy-MM-dd');
          if (rawDate) {
            const parts = rawDate.split('/');
            if (parts.length === 3) {
              const yr = parts[2].length === 2 ? '20' + parts[2] : parts[2];
              invDate = `${yr}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            }
          }
          const dueDate = format(new Date(new Date(invDate).getTime() + 30 * 86400000), 'yyyy-MM-dd');
          let status = 'draft';
          if (paymentStatus === 'paid') status = 'paid';
          else if (received > 0 && balanceDue > 0) status = 'partially_paid';
          else if (balanceDue > 0) status = 'sent';
          let invoice_type = 'tax_invoice';
          if (txnType.includes('credit')) invoice_type = 'credit_note';
          else if (txnType.includes('estimate')) invoice_type = 'estimate';
          const taxable = Math.round(totalAmount / 1.18 * 100) / 100;
          const gstAmt = Math.round((totalAmount - taxable) * 100) / 100;
          const cgst = Math.round(gstAmt / 2 * 100) / 100;
          const sgst = Math.round(gstAmt / 2 * 100) / 100;
          return {
            invoice_type,
            client_name: partyName,
            client_email: '',
            client_phone: phone,
            client_gstin: gstin,
            client_address: '',
            client_state: '',
            invoice_date: invDate,
            due_date: dueDate,
            reference_no: orderNo || invoiceNo,
            notes: description || paymentType,
            is_interstate: false,
            items: [{ description: description || `Sale - ${invoiceNo || i + 1}`, hsn_sac: '', quantity: 1, unit: 'service', unit_price: taxable, discount_pct: 0, gst_rate: 18, taxable_value: taxable, cgst_rate: 9, sgst_rate: 9, igst_rate: 0, cgst_amount: cgst, sgst_amount: sgst, igst_amount: 0, total_amount: totalAmount }],
            subtotal: taxable, total_taxable: taxable, total_cgst: cgst, total_sgst: sgst, total_igst: 0,
            total_gst: gstAmt, grand_total: totalAmount, amount_paid: received, amount_due: balanceDue,
            status, payment_terms: paymentType || 'Due on receipt',
          };
        }).filter(inv => inv.grand_total > 0);
        resolve(invoices);
      } catch (err) { reject(new Error(`Failed to parse SaleReport: ${err.message}`)); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// UNIFIED IMPORT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const KB_PAY_STATUS = { 1: 'sent', 2: 'partially_paid', 3: 'paid' };

const ImportModal = ({ open, onClose, isDark, companies, onImportComplete }) => {
  // ── useState ──
  const [step, setStep] = useState('choose');
  const [importMode, setImportMode] = useState('');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ imported: 0, clients: 0, clients_updated: 0, skipped: 0, errors: [] });
  const [selectedFirm, setSelectedFirm] = useState('__none__');
  const [importClients, setImportClients] = useState(true);
  const [importInvoices, setImportInvoices] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState('__none__');

  // ── useRef ──
  const dropRef = useRef(null);

  // ── Handlers ──
  const reset = () => {
    setStep('choose'); setImportMode(''); setFile(null); setParsed(null);
    setError(''); setLoading(false); setProgress(0);
    setResults({ imported: 0, clients: 0, skipped: 0, errors: [], clients_updated: 0 });
  }; 

  const handleClose = () => { reset(); onClose(); };

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    const ALLOWED_EXTS = {
      vyp: ['.vyp', '.vyb', '.db'],
      tally: ['.xml', '.tbk'],
      excel: ['.xlsx', '.xls', '.csv'],
      json: ['.json'],
    };
    const allowed = ALLOWED_EXTS[importMode] || [];
    if (allowed.length > 0 && !allowed.some(ext => name.endsWith(ext))) {
      setError(`Please upload one of: ${allowed.join(', ')}`);
      return;
    }
    setFile(f); setError('');
  }, [importMode]);

  const parseBackupViaAPI = async (f) => {
    const formData = new FormData();
    formData.append('file', f);
    try {
      const resp = await api.post('/invoices/parse-backup', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return resp.data;
    } catch (err) {
      throw new Error(err.response?.data?.detail || 'Server could not parse backup file');
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setLoading(true); setError('');
    try {
      if (importMode === 'excel') {
        // Auto-detect SaleReport vs template
        const firstCell = await new Promise(res => {
          const sniffReader = new FileReader();
          sniffReader.onload = (ev) => {
            try {
              const wb = XLSX.read(ev.target.result, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
              res(String(rows[0]?.[0] || ''));
            } catch { res(''); }
          };
          sniffReader.readAsArrayBuffer(file);
        });
        const isSaleReport = firstCell.toLowerCase().includes('generated on');
        let invoices;
        if (isSaleReport) {
          invoices = await parseSaleReportExcel(file);
          if (!invoices.length) throw new Error('No valid sale rows found in SaleReport format.');
          setParsed({ invoices, firms: [], clients: [], items: [], mode: 'excel', source_label: 'SaleReport (Auto-detected)' });
        } else {
          invoices = await parseExcelInvoices(file);
          if (!invoices.length) throw new Error('No valid invoice rows found. Check the template format.');
          setParsed({ invoices, firms: [], clients: [], items: [], mode: 'excel', source_label: 'Excel/CSV' });
        }
      } else {
        const data = await parseBackupViaAPI(file);
        const mode = importMode === 'vyp' ? 'vyp' : importMode;
        setParsed({ ...data, mode });
        if (data.firms?.length > 0) setSelectedFirm(String(data.firms[0].firm_id));
      }
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

const handleImport = async () => {
  if (!parsed) return;
  setStep('importing');
  setProgress(5);

  const companyId = selectedCompanyId === '__none__' ? '' : selectedCompanyId;
  const source    = parsed.source || parsed.mode || 'unknown';
  const CHUNK     = 150; // invoices per request — keeps each call well under 30 s

  // Filter invoices by selected firm (for VYP multi-firm backups)
  const allInvToImport = (parsed.mode === 'excel'
    ? (parsed.invoices || [])
    : selectedFirm === '__none__'
      ? (parsed.invoices || [])
      : (parsed.invoices || []).filter(i => String(i.company_id) === selectedFirm)
  ).map(inv => {
    const clean = { ...inv };
    // Ensure items have at least one entry
    if (!clean.items?.length) {
      clean.items = [{
        description: 'Imported service', hsn_sac: '', quantity: 1, unit: 'service',
        unit_price: clean.grand_total || 0, discount_pct: 0, gst_rate: 18,
        taxable_value: clean.grand_total || 0,
        cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
        cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
        total_amount: clean.grand_total || 0,
      }];
    }
    return clean;
  });

  const totals = { imported: 0, clients: 0, clients_updated: 0, skipped: 0, errors: [] };

  try {
    // ── Chunk 0: send clients + items + payments + first slice of invoices ──
    const chunks = [];
    for (let i = 0; i < allInvToImport.length; i += CHUNK) {
      chunks.push(allInvToImport.slice(i, i + CHUNK));
    }
    if (chunks.length === 0) chunks.push([]); // at least one request

    const totalChunks = chunks.length;

    for (let ci = 0; ci < totalChunks; ci++) {
      const isFirst = ci === 0;
      const payload = {
        company_id:      companyId,
        source,
        invoices:        chunks[ci],
        // Only send clients / items / payments on the first chunk
        clients:         isFirst && importClients && parsed.mode !== 'excel' ? (parsed.clients || []) : [],
        items:           isFirst ? (parsed.items  || []) : [],
        payments:        isFirst ? (parsed.payments || []) : [],
        skip_duplicates: true,
      };

      // 5 minutes per chunk — bulk backend should finish in seconds but we give plenty of headroom
      const resp = await api.post('/invoices/import-backup', payload, { timeout: 300_000 });
      const d    = resp.data;

      totals.imported        += d.invoices_imported  || 0;
      totals.clients         += d.clients_imported   || 0;
      totals.clients_updated += d.clients_updated    || 0;
      totals.skipped         += d.invoices_skipped   || 0;
      if (d.errors?.length)    totals.errors.push(...d.errors);

      // Smooth progress: 5 % → 95 % across chunks, then 100 % on finish
      setProgress(Math.round(5 + ((ci + 1) / totalChunks) * 90));
    }

    setProgress(100);
    setResults({
      imported:         totals.imported,
      clients:          totals.clients,
      clients_updated:  totals.clients_updated,
      skipped:          totals.skipped,
      errors:           totals.errors.slice(0, 50),
    });
    setStep('done');
    onImportComplete?.();
    toast.success(`Imported ${totals.imported} invoice${totals.imported !== 1 ? 's' : ''} successfully`);
  } catch (err) {
    const detail = err.response?.data?.detail || err.message || 'Import failed';
    setResults({ imported: totals.imported, clients: totals.clients, skipped: totals.skipped, errors: [detail, ...totals.errors].slice(0, 50) });
    setStep('done');
    toast.error(`Import failed: ${detail}`);
  }
};

  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={`w-full max-w-xl rounded-2xl border shadow-2xl p-0 overflow-hidden flex flex-col ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
        style={{ maxHeight: '90vh' }}>
        <DialogTitle className="sr-only">Import Invoices</DialogTitle>
        <DialogDescription className="sr-only">Import invoices from KhataBook .vyp or Excel file</DialogDescription>
        {/* Header */}
        <div className="px-6 py-5 relative overflow-hidden flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
          <div className="absolute right-0 top-0 w-40 h-40 rounded-full -mr-12 -mt-12 opacity-10"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0"><Database className="h-5 w-5 text-white" /></div>
              <div><h2 className="text-white font-bold text-lg leading-tight">Import Invoices</h2><p className="text-emerald-200 text-xs mt-0.5">KhataBook · Tally · Vyapar · Excel</p></div>
            </div>
            <button onClick={handleClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all flex-shrink-0"><X className="h-4 w-4 text-white" /></button>
          </div>
          {step !== 'choose' && (
            <div className="relative mt-4 flex items-center gap-1">
              {['upload', 'preview', 'importing', 'done'].map((s, i) => {
                const stepKeys = ['upload', 'preview', 'importing', 'done'];
                const current = stepKeys.indexOf(step);
                const isActive = i === current;
                const isDoneStep = i < current;
                return (
                  <React.Fragment key={s}>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${isActive ? 'bg-white text-emerald-700' : isDoneStep ? 'bg-white/30 text-white' : 'bg-white/10 text-white/50'}`}>
                      {isDoneStep ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 h-3 flex items-center justify-center">{i + 1}</span>}
                      {['Upload', 'Preview', 'Import', 'Done'][i]}
                    </div>
                    {i < 3 && <div className={`flex-1 h-px ${isDoneStep ? 'bg-white/60' : 'bg-white/20'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP: CHOOSE MODE */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className={`text-sm font-medium text-center mb-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Choose your import source</p>
              <div className={`rounded-xl border-2 border-dashed p-4 ${isDark ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0"><FileDown className="h-5 w-5 text-amber-600" /></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Download Excel Template</p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Get a ready-made template with sample data & instructions</p>
                  </div>
                  <Button type="button" size="sm" onClick={downloadInvoiceTemplate} className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 flex-shrink-0 text-white" style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}><Download className="h-3.5 w-3.5" /> Download</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { mode: 'vyp', icon: Database, title: 'KhataBook Backup (.vyp / .vyb)', desc: 'Import clients, items & invoices from KhataBook .vyp or KhataBook Pro .vyb backup', color: 'from-emerald-600 to-emerald-700', badge: 'Recommended' },
                  { mode: 'tally', icon: FileSpreadsheet, title: 'Tally Export (.xml)', desc: 'Import from TallyPrime / Tally.ERP 9 XML export or .tbk backup', color: 'from-purple-600 to-purple-700', badge: 'Tally' },
                  { mode: 'json', icon: FileText, title: 'Vyapar / JSON (.json)', desc: 'Import from Vyapar JSON export or any JSON formatted backup file', color: 'from-amber-600 to-amber-700', badge: 'Vyapar' },
                  { mode: 'excel', icon: Table, title: 'Excel / CSV (.xlsx, .xls, .csv)', desc: 'Import from any spreadsheet — Sage, myBillBook, Zoho, Xero, or our template', color: 'from-blue-600 to-blue-700', badge: 'Universal' },
                ].map(opt => (
                  <button key={opt.mode} type="button"
                    onClick={() => { setImportMode(opt.mode); setStep('upload'); setError(''); setFile(null); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left hover:shadow-md ${isDark ? 'border-slate-600 hover:border-emerald-500 bg-slate-700/40' : 'border-slate-200 hover:border-emerald-400 bg-white'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 bg-gradient-to-br ${opt.color}`}><opt.icon className="h-6 w-6" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{opt.title}</p>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{opt.badge}</span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{opt.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* STEP: UPLOAD FILE */}
          {step === 'upload' && (
            <div className="space-y-5">
              <button type="button" onClick={() => { setStep('choose'); setFile(null); setError(''); }}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">← Back to source selection</button>
              <div ref={dropRef} onDrop={handleFileDrop} onDragOver={(e) => e.preventDefault()}
                onClick={() => {
                  const inp = document.createElement('input'); inp.type = 'file';
                  inp.accept = importMode === 'vyp' ? '.vyp,.vyb,.db' : importMode === 'tally' ? '.xml,.tbk' : importMode === 'excel' ? '.xlsx,.xls,.csv' : '.json';
                  inp.onchange = handleFileDrop; inp.click();
                }}
                className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${file ? (isDark ? 'border-emerald-500 bg-emerald-900/20' : 'border-emerald-400 bg-emerald-50') : (isDark ? 'border-slate-600 bg-slate-700/30 hover:border-emerald-500' : 'border-slate-300 bg-slate-50 hover:border-emerald-400')}`}>
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center"><CheckCircle2 className="h-7 w-7 text-emerald-600" /></div>
                    <div><p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{file.name}</p><p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click or drop to change</p></div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`}><Upload className="h-7 w-7 text-slate-400" /></div>
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Drop your file here or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {importMode === 'vyp' && 'Accepts .vyp, .vyb, or .db files'}
                        {importMode === 'tally' && 'Accepts .xml or .tbk files'}
                        {importMode === 'excel' && 'Accepts .xlsx, .xls, or .csv files'}
                        {importMode === 'json' && 'Accepts .json files'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {error && (
                <div className={`rounded-xl border p-3 flex items-start gap-2 ${isDark ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><p className="text-xs">{error}</p>
                </div>
              )}
              <Button onClick={handleParse} disabled={!file || loading} className="w-full h-11 rounded-xl text-white font-semibold"
                style={{ background: !file || loading ? '#94a3b8' : 'linear-gradient(135deg, #065f46, #059669)' }}>
                {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Parsing file…</span>
                  : <span className="flex items-center gap-2"><FileUp className="h-4 w-4" /> Parse & Preview</span>}
              </Button>
            </div>
          )}
{step === 'preview' && parsed && (
  <div className="space-y-5">
    <button
      type="button"
      onClick={() => setStep('upload')}
      className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
    >
      ← Back to upload
    </button>

    <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-emerald-50 border-emerald-200'}`}>
      <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
        Parsed: {parsed.source_label || parsed.mode}
      </p>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Firms', val: parsed.stats?.firms ?? parsed.firms?.length ?? 0 },
          { label: 'Clients', val: parsed.stats?.clients ?? parsed.clients?.length ?? 0 },
          { label: 'Items', val: parsed.stats?.items ?? parsed.items?.length ?? 0 },
          { label: 'Invoices', val: parsed.stats?.invoices ?? parsed.invoices?.length ?? 0 },
          { label: 'Payments', val: parsed.stats?.payments ?? parsed.payments?.length ?? 0 },
        ].map(s => (
          <div key={s.label} className="text-center">
            <p className={`text-xl font-black ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{s.val}</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase">{s.label}</p>
          </div>
        ))}
      </div>
    </div>

    {(parsed.firms?.length || 0) > 1 && (
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
          Select Firm
        </label>
        <Select value={selectedFirm} onValueChange={setSelectedFirm}>
          <SelectTrigger className={inputCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All firms</SelectItem>
            {(parsed.firms || []).map(f => (
              <SelectItem key={f.firm_id} value={String(f.firm_id)}>
                {f.firm_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}

    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
        Import Into Company Profile
      </label>
      <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
        <SelectTrigger className={inputCls}>
          <SelectValue placeholder="Select target company" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Select later —</SelectItem>
          {(companies || []).map(c => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {parsed.mode !== 'excel' && (parsed.clients?.length || 0) > 0 && (
      <div className="flex items-center gap-3">
        <Switch checked={importClients} onCheckedChange={setImportClients} />
        <div>
          <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
            Import Clients ({parsed.clients.length})
          </p>
          <p className="text-xs text-slate-400">Add as client records</p>
        </div>
      </div>
    )}

    {(parsed.invoices?.length || 0) > 0 && (
      <div className={`rounded-xl border max-h-48 overflow-y-auto ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
        <div className={`px-4 py-2 border-b sticky top-0 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-100'}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Invoice Preview ({parsed.invoices.length})
          </p>
        </div>

        {(parsed.invoices || []).slice(0, 20).map((inv, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-2 border-b last:border-0 ${isDark ? 'border-slate-700' : 'border-slate-50'}`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {inv.client_name || 'Unknown'}
              </p>
              <p className="text-[10px] text-slate-400">
                {inv.invoice_no || `#${i + 1}`} · {inv.invoice_date || '—'}
              </p>
            </div>
            <p className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
              {fmtC(inv.grand_total || 0)}
            </p>
          </div>
        ))}

        {parsed.invoices.length > 20 && (
          <div className="px-4 py-2 text-center text-xs text-slate-400">
            +{parsed.invoices.length - 20} more…
          </div>
        )}
      </div>
    )}

    <Button
      onClick={handleImport}
      className="w-full h-11 rounded-xl text-white font-semibold"
      style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}
    >
      <CheckSquare className="h-4 w-4 mr-2" />

      Import {
        parsed.mode === 'excel' || selectedFirm === '__none__'
          ? parsed.invoices?.length || 0
          : (parsed.invoices || []).filter(
              i => String(i.company_id) === selectedFirm
            ).length
      } Invoices
      {
        importClients && (parsed.clients?.length || 0) > 0
          ? ` + ${parsed.clients.length} Clients`
          : ''
      }
    </Button>
  </div>
)}
          {/* STEP: IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-6">
              <MiniLoader height={100} />
              <div className="w-full max-w-xs">
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #065f46, #059669)' }} /></div>
                <p className="text-center text-xs font-bold text-emerald-600 mt-2">{progress}%</p>
              </div>
            </div>
          )}
          {/* STEP: DONE */}
          {step === 'done' && (
            <div className="space-y-5">
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
                <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Import Complete!</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Invoices Imported', val: results.imported, color: '#1FAF5A' },
                  { label: 'Clients Added/Updated', val: results.clients, color: '#1F6FB2' },
                  { label: 'Inv Skipped (Dup)', val: results.skipped, color: '#F59E0B' },
                  { label: 'Errors', val: results.errors?.length || 0, color: results.errors?.length ? '#EF4444' : '#94A3B8' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl border p-4 text-center ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-2xl font-black" style={{ color: s.color }}>{s.val}</p>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
              {(results.errors?.length || 0) > 0 && (
                <div className={`rounded-xl border p-3 max-h-32 overflow-y-auto ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-2">Errors ({results.errors.length})</p>
                  {results.errors.slice(0, 10).map((err, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>)}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose} className="flex-1 h-10 rounded-xl">Close</Button>
                <Button onClick={() => reset()} className="flex-1 h-10 rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>Import More</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STATUS PILL
// ════════════════════════════════════════════════════════════════════════════════
const StatusPill = ({ inv }) => {
  const m = getStatusMeta(inv);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${m.bg} ${m.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// STAT CARD
// ════════════════════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sub, icon: Icon, color, bg, onClick, isDark, trend }) => (
  <div onClick={onClick}
    className={`rounded-2xl border p-5 relative overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all ${isDark ? 'bg-slate-800 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200/80 hover:border-slate-300'}`}>
    <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full" style={{ background: color }} />
    <div className="flex items-start justify-between mb-3 pl-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}><Icon className="h-5 w-5" style={{ color }} /></div>
      {trend !== undefined && (<span className={`text-[10px] font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{trend >= 0 ? '+' : ''}{trend}%</span>)}
    </div>
    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 pl-2 text-slate-400">{label}</p>
    <p className={`text-2xl font-bold tracking-tight pl-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
    {sub && <p className={`text-xs pl-2 mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</p>}
  </div>
);

// ─── Enhanced Revenue Trend ───────────────────────────────────────────────────
const EnhancedRevenueTrend = ({ invoices = [], isDark }) => {
  // ── useState ──
  const [trendRange, setTrendRange] = useState('12m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [showServiceBreakdown, setShowServiceBreakdown] = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);

  // ── Pure helpers (no hooks) ──
  const fmtAxis = (v) => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v/100000).toFixed(1)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0);

  // ── useCallback: getRange (stable, used by memos) ──
  const getRange = useCallback(() => {
    const now = new Date();
    if (trendRange === 'custom') {
      return {
        start: customFrom ? new Date(customFrom + 'T00:00:00') : subMonths(now, 12),
        end: customTo ? new Date(customTo + 'T23:59:59') : now,
      };
    }
    const m = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[trendRange] || 12;
    return { start: subMonths(now, m), end: now };
  }, [trendRange, customFrom, customTo]);

  // ── useCallback: getMonths ──
  const getMonths = useCallback((start, end) => {
    const months = [];
    let cur = startOfMonth(start);
    while (cur <= end) {
      months.push(format(cur, 'yyyy-MM'));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return months;
  }, []);

  // ── useMemo: allServices ──
  const allServices = useMemo(() => {
    const s = new Set();
    (invoices || []).forEach(inv => (inv.items || []).forEach(it => { if (it.description?.trim()) s.add(it.description.trim()); }));
    return Array.from(s).slice(0, 30);
  }, [invoices]);

  // ── useMemo: currentData ──
  const currentData = useMemo(() => {
    const { start, end } = getRange();
    return getMonths(start, end).map(m => {
      const monthInvs = (invoices || []).filter(i => i.invoice_date?.startsWith(m) && i.status !== 'cancelled');
      let serviceRevenue = 0;
      if (selectedServices.length > 0) {
        monthInvs.forEach(inv => (inv.items || []).forEach(it => {
          if (selectedServices.includes(it.description?.trim())) serviceRevenue += (it.total_amount || 0);
        }));
      }
      return {
        month: m, label: format(new Date(m + '-15'), 'MMM yy'),
        revenue: monthInvs.reduce((s, i) => s + (i.grand_total || 0), 0),
        collected: monthInvs.reduce((s, i) => s + (i.amount_paid || 0), 0),
        count: monthInvs.length, serviceRevenue,
      };
    });
  }, [invoices, trendRange, customFrom, customTo, selectedServices, getRange, getMonths]);

  // ── useMemo: prevData ──
  const prevData = useMemo(() => {
    if (!compareEnabled) return [];
    const { start, end } = getRange();
    const diff = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - diff);
    const prevEnd = new Date(start);
    return getMonths(prevStart, prevEnd).map(m => {
      const monthInvs = (invoices || []).filter(i => i.invoice_date?.startsWith(m) && i.status !== 'cancelled');
      return {
        month: m, label: format(new Date(m + '-15'), 'MMM yy'),
        revenue: monthInvs.reduce((s, i) => s + (i.grand_total || 0), 0),
        collected: monthInvs.reduce((s, i) => s + (i.amount_paid || 0), 0),
      };
    });
  }, [invoices, compareEnabled, trendRange, customFrom, customTo, getRange, getMonths]);

  // ── useMemo: serviceBreakdown ──
  const serviceBreakdown = useMemo(() => {
    const { start, end } = getRange();
    const startStr = format(start, 'yyyy-MM-dd'), endStr = format(end, 'yyyy-MM-dd');
    const map = {};
    (invoices || []).filter(i => i.invoice_date >= startStr && i.invoice_date <= endStr && i.status !== 'cancelled')
      .forEach(inv => (inv.items || []).forEach(it => {
        const k = (it.description || 'Unknown').trim();
        if (!map[k]) map[k] = { description: k, revenue: 0, count: 0 };
        map[k].revenue += (it.total_amount || 0); map[k].count++;
      }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [invoices, trendRange, customFrom, customTo, getRange]);

  // ── useMemo: aggregate totals (depend on currentData / prevData) ──
  const totalRevenue = useMemo(() => currentData.reduce((s, d) => s + d.revenue, 0), [currentData]);
  const totalCollected = useMemo(() => currentData.reduce((s, d) => s + d.collected, 0), [currentData]);
  const prevTotal = useMemo(() => prevData.reduce((s, d) => s + d.revenue, 0), [prevData]);
  const growthPct = useMemo(() => prevTotal > 0 ? Math.round((totalRevenue - prevTotal) / prevTotal * 100) : null, [totalRevenue, prevTotal]);

  // SVG chart params (derived, no hooks needed)
  const W = 700, H = 160, pad = { t: 20, b: 34, l: 58, r: 16 };
  const allVals = [...currentData.map(d => d.revenue), ...(compareEnabled ? prevData.map(d => d.revenue) : [])];
  const maxVal = Math.max(...allVals, 1);
  const n = currentData.length;
  const xStep = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 0;
  const yS = (v) => H - pad.b - (v / maxVal) * (H - pad.t - pad.b);
  const pts = currentData.map((d, i) => [pad.l + i * xStep, yS(d.revenue)]);
  const colPts = currentData.map((d, i) => [pad.l + i * xStep, yS(d.collected)]);
  const svcPts = selectedServices.length > 0 ? currentData.map((d, i) => [pad.l + i * xStep, yS(d.serviceRevenue)]) : [];
  const prevAligned = compareEnabled ? currentData.map((_, i) => prevData[i] || { revenue: 0 }) : [];
  const prevPts = prevAligned.map((d, i) => [pad.l + i * xStep, yS(d.revenue)]);

  const RANGE_BTNS = [{ v:'1m',l:'1M' },{ v:'3m',l:'3M' },{ v:'6m',l:'6M' },{ v:'12m',l:'12M' },{ v:'custom',l:'Custom' }];

  if (!(invoices || []).some(i => (i.grand_total||0) > 0)) return null;

  return (
    <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40"><BarChart3 className="h-4 w-4 text-blue-500" /></div>
          <div>
            <h3 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Revenue Trend</h3>
            <p className="text-xs text-slate-400">
              {fmtC(totalRevenue)} · {currentData.length} months
              {growthPct !== null && <span className={`ml-2 font-bold ${growthPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{growthPct >= 0 ? '↑' : '↓'} {Math.abs(growthPct)}% vs prev period</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
            {RANGE_BTNS.map(b => (
              <button key={b.v} onClick={() => setTrendRange(b.v)}
                className={`px-2.5 py-1.5 text-[10px] font-bold transition-all whitespace-nowrap ${trendRange === b.v ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {b.l}
              </button>
            ))}
          </div>
          <button onClick={() => setCompareEnabled(c => !c)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${compareEnabled ? 'bg-purple-600 text-white border-purple-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            <ArrowRightLeft className="h-3 w-3" /> Compare
          </button>
          <button onClick={() => setShowServiceBreakdown(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${showServiceBreakdown ? 'bg-emerald-600 text-white border-emerald-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            <PieChart className="h-3 w-3" /> By Service
          </button>
        </div>
      </div>

      {/* Custom date range */}
      {trendRange === 'custom' && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            className={`h-8 px-2 rounded-lg text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 [color-scheme:dark]' : 'bg-white border-slate-200 text-slate-800'}`} />
          <span className="text-slate-400 text-xs">to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            className={`h-8 px-2 rounded-lg text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 [color-scheme:dark]' : 'bg-white border-slate-200 text-slate-800'}`} />
        </div>
      )}

      {/* Comparative totals */}
      {compareEnabled && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Current Period', val: totalRevenue, color: COLORS.mediumBlue },
            { label: 'Previous Period', val: prevTotal, color: COLORS.purple },
            { label: totalRevenue >= prevTotal ? 'Growth ↑' : 'Decline ↓', val: Math.abs(totalRevenue - prevTotal), sub: growthPct !== null ? `${Math.abs(growthPct)}%` : '—', color: totalRevenue >= prevTotal ? COLORS.emeraldGreen : COLORS.coral },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border p-3 ${isDark ? 'bg-slate-700/60 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{c.label}</p>
              <p className="text-base font-black" style={{ color: c.color }}>{fmtC(c.val)}</p>
              {c.sub && <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Service filter chips */}
      {showServiceBreakdown && allServices.length > 0 && (
        <div className="mb-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-2">Filter by Service (multi-select — also highlights on chart)</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            <button onClick={() => setSelectedServices([])}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${selectedServices.length === 0 ? 'bg-blue-600 text-white border-blue-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              All
            </button>
            {allServices.map(name => (
              <button key={name} title={name}
                onClick={() => setSelectedServices(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all max-w-[180px] truncate ${selectedServices.includes(name) ? 'bg-emerald-600 text-white border-emerald-600' : isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* SVG Chart — smooth cubic bezier */}
      {currentData.length > 0 && (
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.mediumBlue} stopOpacity="0.28" />
                <stop offset="65%" stopColor={COLORS.mediumBlue} stopOpacity="0.07" />
                <stop offset="100%" stopColor={COLORS.mediumBlue} stopOpacity="0" />
              </linearGradient>
              <linearGradient id="collectedAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.emeraldGreen} stopOpacity="0.18" />
                <stop offset="100%" stopColor={COLORS.emeraldGreen} stopOpacity="0" />
              </linearGradient>
              <filter id="glowBlue" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {[0.25, 0.5, 0.75, 1].map(f => {
              const y = H - pad.b - f * (H - pad.t - pad.b);
              return (
                <g key={f}>
                  <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke={isDark ? '#1e293b' : '#f1f5f9'} strokeWidth="1" strokeDasharray="4 4" />
                  <text x={pad.l - 6} y={y + 3.5} textAnchor="end" fontSize="8" fill={isDark ? '#475569' : '#94a3b8'} fontFamily="monospace">{fmtAxis(maxVal * f)}</text>
                </g>
              );
            })}
            {(() => {
              const smooth = (pp) => {
                if (pp.length < 2) return '';
                let d = `M${pp[0][0]},${pp[0][1]}`;
                for (let i = 0; i < pp.length - 1; i++) {
                  const x0 = i > 0 ? pp[i-1][0] : pp[i][0], y0 = i > 0 ? pp[i-1][1] : pp[i][1];
                  const x1 = pp[i][0], y1 = pp[i][1];
                  const x2 = pp[i+1][0], y2 = pp[i+1][1];
                  const x3 = i < pp.length-2 ? pp[i+2][0] : x2, y3 = i < pp.length-2 ? pp[i+2][1] : y2;
                  const cp1x = x1 + (x2-x0)/5, cp1y = y1 + (y2-y0)/5;
                  const cp2x = x2 - (x3-x1)/5, cp2y = y2 - (y3-y1)/5;
                  d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
                }
                return d;
              };
              const smoothArea = (pp) => {
                if (pp.length < 2) return '';
                return `${smooth(pp)} L${pp[pp.length-1][0]},${H-pad.b} L${pp[0][0]},${H-pad.b} Z`;
              };
              return (
                <>
                  {colPts.length > 1 && <path d={smoothArea(colPts)} fill="url(#collectedAreaGrad)" />}
                  {pts.length > 1 && <path d={smoothArea(pts)} fill="url(#trendAreaGrad)" />}
                  {compareEnabled && prevPts.length > 1 && <path d={smooth(prevPts)} fill="none" stroke={COLORS.purple} strokeWidth="2" strokeDasharray="6 3" opacity="0.75" strokeLinecap="round" strokeLinejoin="round" />}
                  {selectedServices.length > 0 && svcPts.length > 1 && <path d={smooth(svcPts)} fill="none" stroke={COLORS.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                  {colPts.length > 1 && <path d={smooth(colPts)} fill="none" stroke={COLORS.emeraldGreen} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" filter="url(#glowGreen)" />}
                  {pts.length > 1 && <path d={smooth(pts)} fill="none" stroke={COLORS.mediumBlue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#glowBlue)" />}
                  {pts.map(([x, y], i) => (
                    <g key={i}>
                      <circle cx={x} cy={y} r="7" fill={COLORS.mediumBlue} opacity="0.10" />
                      <circle cx={x} cy={y} r="3.5" fill="white" stroke={COLORS.mediumBlue} strokeWidth="2.5" />
                      {i === pts.length - 1 && currentData[i]?.revenue > 0 && (
                        <>
                          <rect x={x-24} y={y-22} width="48" height="14" rx="4" fill={COLORS.mediumBlue} opacity="0.92" />
                          <text x={x} y={y-12} textAnchor="middle" fontSize="7.5" fill="white" fontFamily="monospace" fontWeight="bold">{fmtAxis(currentData[i].revenue)}</text>
                        </>
                      )}
                      <text x={x} y={H-6} textAnchor="middle" fontSize="8" fill={isDark ? '#475569' : '#94a3b8'}>{currentData[i]?.label}</text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
          <div className="flex flex-wrap gap-4 text-[10px] mt-2 text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block rounded-full" style={{ background: COLORS.mediumBlue }} />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block rounded-full border-t-2 border-dashed" style={{ borderColor: COLORS.emeraldGreen }} />Collected</span>
            {compareEnabled && <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block border-t-2 border-dashed" style={{ borderColor: COLORS.purple }} />Prev Period</span>}
            {selectedServices.length > 0 && <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block rounded-full" style={{ background: COLORS.amber }} />Selected Services</span>}
          </div>
        </div>
      )}

      {/* Comparative table */}
      {compareEnabled && currentData.length > 0 && (
        <div className={`mt-4 rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className={`px-4 py-2 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Month-by-Month Comparison</p>
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>
                {['Month','Revenue','Collected','Prev Revenue','Change'].map(h => (
                  <th key={h} className={`px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {currentData.map((d, i) => {
                  const prev = prevData[i];
                  const chg = prev != null ? d.revenue - prev.revenue : null;
                  return (
                    <tr key={d.month} className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                      <td className={`px-3 py-2 font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{d.label}</td>
                      <td className={`px-3 py-2 font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(d.revenue)}</td>
                      <td className="px-3 py-2 text-emerald-600">{fmtC(d.collected)}</td>
                      <td className={`px-3 py-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{prev != null ? fmtC(prev.revenue) : '—'}</td>
                      <td className={`px-3 py-2 font-bold ${chg == null ? '' : chg >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {chg == null ? '—' : `${chg >= 0 ? '+' : ''}${fmtC(chg)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Service breakdown table */}
      {showServiceBreakdown && serviceBreakdown.length > 0 && (
        <div className={`mt-4 rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className={`px-4 py-2.5 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Revenue by Service / Item — click to toggle chart highlight</p>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {serviceBreakdown.map((s, i) => {
              const pct = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
              const isSelected = selectedServices.includes(s.description);
              return (
                <div key={s.description}
                  onClick={() => setSelectedServices(prev => prev.includes(s.description) ? prev.filter(n => n !== s.description) : [...prev, s.description])}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-0 cursor-pointer transition-colors ${isSelected ? (isDark ? 'bg-emerald-900/20' : 'bg-emerald-50') : (isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50')} ${isDark ? 'border-slate-700' : 'border-slate-50'}`}>
                  <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: isSelected ? COLORS.emeraldGreen : `linear-gradient(135deg,${COLORS.deepBlue},${COLORS.mediumBlue})` }}>
                    {isSelected ? '✓' : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{s.description}</p>
                    <div className={`h-1 rounded-full mt-1 ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg,${COLORS.deepBlue},${COLORS.mediumBlue})` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: COLORS.mediumBlue }}>{fmtC(s.revenue)}</p>
                    <p className="text-[9px] text-slate-400">{pct.toFixed(1)}% · {s.count}×</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PAYMENT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const PaymentModal = ({ invoice, open, onClose, onSuccess, isDark }) => {
  // ── useState ──
  const [form, setForm] = useState({ amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), payment_mode: 'neft', reference_no: '', notes: '' });
  const [loading, setLoading] = useState(false);

  // ── useEffect ──
  useEffect(() => { if (open && invoice) setForm(p => ({ ...p, amount: invoice.amount_due?.toFixed(2) || '' })); }, [open, invoice]);

  // ── Handlers ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post('/payments', { invoice_id: invoice.id, amount: parseFloat(form.amount), payment_date: form.payment_date, payment_mode: form.payment_mode, reference_no: form.reference_no, notes: form.notes });
      toast.success('Payment recorded!'); onSuccess?.(); onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to record payment'); }
    finally { setLoading(false); }
  };

  if (!invoice) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Record Payment</DialogTitle>
        <DialogDescription className="sr-only">Record payment</DialogDescription>
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><IndianRupee className="h-5 w-5 text-white" /></div>
            <div><p className="text-white/60 text-[10px] uppercase tracking-widest">Record Payment</p><h2 className="text-white font-bold text-lg">{invoice.invoice_no}</h2></div>
          </div>
          <div className="mt-4 flex gap-4">
            {[['Invoice Total', invoice.grand_total, 'text-white'], ['Paid So Far', invoice.amount_paid, 'text-emerald-300'], ['Balance Due', invoice.amount_due, 'text-amber-300']].map(([l, v, cls]) => (
              <div key={l} className="flex-1 bg-white/10 rounded-xl px-3 py-2"><p className="text-white/50 text-[9px] uppercase tracking-wider">{l}</p><p className={`font-bold text-sm ${cls}`}>{fmtC(v)}</p></div>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Amount (₹) *</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span><Input type="number" step="0.01" min="0.01" className="pl-8 h-11 rounded-xl" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required /></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Date *</label><Input type="date" className="h-11 rounded-xl" value={form.payment_date} onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))} required /></div>
            <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Payment Mode</label><Select value={form.payment_mode} onValueChange={v => setForm(p => ({ ...p, payment_mode: v }))}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{PAY_MODES.map(m => <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Reference / UTR No.</label><Input className="h-11 rounded-xl" placeholder="Transaction / cheque reference" value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))} /></div>
          <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Notes</label><Textarea className="rounded-xl text-sm min-h-[70px] resize-none" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <div className="flex gap-3 pt-2"><Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-11 rounded-xl">Cancel</Button><Button type="submit" disabled={loading} className="flex-1 h-11 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)` }}>{loading ? 'Recording…' : '✓ Record Payment'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE FORM
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceForm = ({ open, onClose, editingInv, companies, clients, leads, onSuccess, isDark }) => {
  const navigate = useNavigate();
  const defaultForm = {
    invoice_type: 'tax_invoice', company_id: '', client_id: '', lead_id: '',
    client_name: '', client_address: '', client_email: '', client_phone: '', client_gstin: '', client_state: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',  // intentionally empty — user sets this manually or via quick-fill buttons
    supply_state: '', is_interstate: false,
    items: [emptyItem()],
    gst_rate: 18, discount_amount: 0, shipping_charges: 0, other_charges: 0,
    payment_terms: 'Due on receipt', notes: '', terms_conditions: '', reference_no: '',
    is_recurring: false, recurrence_pattern: 'monthly', status: 'draft',
    invoice_template: 'prestige', invoice_theme: 'classic_blue', invoice_custom_color: '#0D3B66',
  };

  // ── useState ──
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [products, setProducts] = useState([]);

  // ── useRef ──
  const previewRef = useRef(null);

  // ── useEffect ──
  const INV_DRAFT_KEY = 'taskosphere_invoice_add_draft';
  useEffect(() => {
    if (open) {
      if (editingInv) {
        setForm({
          ...defaultForm,
          ...editingInv,
          invoice_date: (editingInv.invoice_date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
          due_date: (editingInv.due_date || '').slice(0, 10) || '',
        });
      } else {
        // Restore draft if available
        try {
          const saved = localStorage.getItem(INV_DRAFT_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed?.client_name?.trim() || parsed?.items?.length > 1) {
              setForm(prev => ({ ...defaultForm, ...parsed }));
            } else { setForm(defaultForm); }
          } else { setForm(defaultForm); }
        } catch { setForm(defaultForm); }
      }
      setActiveTab('details');
    }
  }, [open, editingInv]);

  // Save draft when form changes in add mode
  useEffect(() => {
    if (open && !editingInv) {
      try { localStorage.setItem(INV_DRAFT_KEY, JSON.stringify(form)); } catch {}
    }
  }, [form, open, editingInv]);

  useEffect(() => { api.get('/products').then(r => setProducts(r.data || [])).catch(() => {}); }, []);

  // ── useMemo ──
  const totals = useMemo(() => computeTotals(form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges), [form.items, form.is_interstate, form.discount_amount, form.shipping_charges, form.other_charges]);

  // ── useCallback ──
  const setField = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  // Auto-fill Due Date when Payment Terms is changed (only if invoice_date is set)
  const TERMS_DAYS = {
    'Due on receipt': 0, 'Due in 7 days': 7, 'Due in 15 days': 15,
    'Due in 30 days': 30, 'Due in 45 days': 45, 'Due in 60 days': 60,
    'Due in 90 days': 90,
  };
  const setPaymentTerms = useCallback((terms) => {
    setForm(p => {
      const days = TERMS_DAYS[terms];
      if (days !== undefined && p.invoice_date) {
        const base = new Date(p.invoice_date);
        base.setDate(base.getDate() + days);
        return { ...p, payment_terms: terms, due_date: format(base, 'yyyy-MM-dd') };
      }
      return { ...p, payment_terms: terms };
    });
  }, []);

  // Quick-fill due date from invoice_date + N days
  const quickFillDueDate = useCallback((days) => {
    setForm(p => {
      const base = p.invoice_date ? new Date(p.invoice_date) : new Date();
      base.setDate(base.getDate() + days);
      return { ...p, due_date: format(base, 'yyyy-MM-dd') };
    });
  }, []);
  const updateItem = useCallback((idx, k, val) => setForm(p => ({ ...p, items: p.items.map((it, i) => i !== idx ? it : { ...it, [k]: val }) })), []);
  const addItem = useCallback(() => setForm(p => ({ ...p, items: [...p.items, emptyItem()] })), []);
  const removeItem = useCallback((idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) })), []);

  const handleClientSelect = useCallback((client) => {
    if (!client) { setForm(p => ({ ...p, client_id: '', client_name: '', client_email: '', client_phone: '', client_address: '', client_state: '', client_gstin: '' })); return; }
    const addressParts = [client.address, client.city, client.state].filter(Boolean).join(', ');
    setForm(p => ({
      ...p, client_id: client.id, client_name: client.company_name || '',
      client_email: client.email || '', client_phone: client.phone || '',
      client_address: addressParts, client_state: client.state || '',
      client_gstin: client.client_gstin || client.gstin || '',
      is_interstate: p.supply_state ? (p.supply_state.toLowerCase() !== (client.state || '').toLowerCase()) : p.is_interstate,
    }));
    toast.success(`Auto-filled from "${client.company_name}"`, { duration: 1500 });
  }, []);

  const fillFromProduct = useCallback((idx, productId) => {
    if (productId === '__none__') return;
    const prod = products.find(x => x.id === productId);
    if (!prod) return;
    setForm(p => ({ ...p, items: p.items.map((it, i) => i !== idx ? it : { ...it, product_id: productId, description: prod.name, hsn_sac: prod.hsn_sac || '', unit: prod.unit || 'service', unit_price: prod.unit_price || 0, gst_rate: prod.gst_rate || 18 }) }));
  }, [products]);

  const handlePreview = useCallback(() => {
    const company = (companies || []).find(c => c.id === form.company_id) || {};
    const previewInv = {
      ...form,
      invoice_no: editingInv?.invoice_no || 'PREVIEW-001',
      invoice_date: form.invoice_date || format(new Date(), 'yyyy-MM-dd'),
      due_date: form.due_date || format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
      client_name: form.client_name || 'Client Name'
    };
    const html = generateInvoiceHTML(previewInv, {
      company,
      template: form.invoice_template,
      theme: form.invoice_theme,
      customColor: form.invoice_custom_color
    });
    if (previewRef.current) {
      previewRef.current.srcdoc = html;
    }
  }, [companies, form, editingInv]);

  const handleSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.company_id) { toast.error('Please select a company profile'); return; }
    if (!form.client_name?.trim()) { toast.error('Client name is required'); return; }
    if (!form.items.some(it => it.description?.trim())) { toast.error('Add at least one item'); return; }
    setLoading(true);
    try {
      const payload = { ...form, ...totals };
      if (editingInv) await api.put(`/invoices/${editingInv.id}`, payload);
      else {
        await api.post('/invoices', payload);
        try { localStorage.removeItem(INV_DRAFT_KEY); } catch {}
      }
      toast.success(editingInv ? 'Invoice updated successfully' : 'Invoice created successfully');
      saveItemMemory(form.items);
      onSuccess?.();
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to save invoice'); }
    finally { setLoading(false); }
  }, [form, totals, editingInv, onSuccess, onClose]);

  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";
  const inputCls = `h-11 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;
  const sectionCls = `border rounded-2xl p-5 ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50/60 border-slate-100'}`;
  const tabs = [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'items', label: 'Items', icon: Package },
    { id: 'totals', label: 'Totals', icon: IndianRupee },
    { id: 'settings', label: 'Settings', icon: Layers },
    { id: 'design', label: 'Design & Preview', icon: Palette },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-5xl max-h-[96vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 [&>button.absolute]:hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <DialogTitle className="sr-only">{editingInv ? 'Edit Invoice' : 'Create Invoice'}</DialogTitle>
        <DialogDescription className="sr-only">Invoice form</DialogDescription>
        <div className="sticky top-0 z-20 flex-shrink-0">
          <div className="px-7 py-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            <div className="absolute right-0 top-0 w-56 h-56 rounded-full -mr-20 -mt-20 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center"><Receipt className="h-5 w-5 text-white" /></div>
                <div><p className="text-white/50 text-[10px] uppercase tracking-widest">{editingInv ? `Edit · ${editingInv.invoice_no}` : 'New Document'}</p><h2 className="text-white font-bold text-xl">{editingInv ? 'Edit Invoice' : 'Create Invoice / Estimate'}</h2></div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Select value={form.invoice_type} onValueChange={v => setField('invoice_type', v)}>
                  <SelectTrigger className="w-44 h-9 rounded-xl border-white/20 bg-white/10 text-white text-xs font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>{INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <button type="button" onClick={onClose}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </div>
          <div className={`flex border-b overflow-x-auto scrollbar-none ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
            {tabs.map(t => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
                  activeTab === t.id
                    ? `border-blue-500 ${isDark ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-50/60'}`
                    : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`
                }`}>
                <t.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <form className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}20, ${COLORS.mediumBlue}20)` }}>
                      <FileText className="h-3.5 w-3.5" style={{ color: COLORS.mediumBlue }} />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Invoice Details</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={labelCls}>Company Profile *</label>
                      <Select value={form.company_id} onValueChange={v => setField('company_id', v)}>
                        <SelectTrigger className={`${inputCls} ${!form.company_id ? 'border-amber-300 dark:border-amber-600' : ''}`}>
                          <SelectValue placeholder="— Select company profile —" />
                        </SelectTrigger>
                        <SelectContent>{(companies || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {!form.company_id && <p className="text-[10px] text-amber-500 mt-1">⚠ Required to generate invoice</p>}
                    </div>
                    <div>
                      <label className={labelCls}>Reference No. <span className="text-slate-400 font-normal normal-case">(PO / Order no.)</span></label>
                      <Input className={inputCls} placeholder="e.g. PO-2024-001" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Invoice Date *</label>
                      <Input type="date" className={inputCls} value={form.invoice_date} onChange={e => setField('invoice_date', e.target.value)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className={labelCls + " mb-0"}>Due Date <span className={`font-normal normal-case ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(optional)</span></label>
                        {form.due_date && (
                          <button type="button" onClick={() => setField('due_date', '')}
                            className="text-[10px] text-slate-400 hover:text-red-400 transition-colors">✕ Clear</button>
                        )}
                      </div>
                      <Input type="date" className={inputCls} value={form.due_date}
                        onChange={e => setField('due_date', e.target.value)}
                        placeholder="dd-mm-yyyy" />
                      {/* Quick-fill shortcuts */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Quick set:</span>
                        {[['0d', 0, 'On receipt'], ['7d', 7, '+7'], ['15d', 15, '+15'], ['30d', 30, '+30'], ['45d', 45, '+45'], ['60d', 60, '+60']].map(([key, days, lbl]) => (
                          <button key={key} type="button" onClick={() => quickFillDueDate(days)}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                              isDark ? 'bg-slate-700 text-slate-300 hover:bg-blue-900/40 hover:text-blue-300' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                            }`}>{lbl}</button>
                        ))}
                      </div>
                      <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                        Tip: selecting a Payment Term below auto-fills this date
                      </p>
                    </div>
                  </div>
                </div>
                <div className={sectionCls}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${COLORS.emeraldGreen}20` }}>
                        <Users className="h-3.5 w-3.5" style={{ color: COLORS.emeraldGreen }} />
                      </div>
                      <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Client Details</h3>
                    </div>
                    {form.client_name && (
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                        ✓ Client selected
                      </span>
                    )}
                  </div>
                  <div className="mb-4">
                    <label className={labelCls}>Search & Select Client <span className={`font-normal normal-case ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>— auto-fills fields below</span></label>
                    <ClientSearchCombobox
                      clients={clients || []}
                      value={form.client_id}
                      onSelect={handleClientSelect}
                      onAddNew={() => navigate('/clients')}
                      isDark={isDark}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={labelCls}>Client / Company Name *</label><Input className={inputCls} placeholder="Client name" value={form.client_name} onChange={e => setField('client_name', e.target.value)} /></div>
                    <div><label className={labelCls}>GSTIN</label><Input className={inputCls} placeholder="15-digit GSTIN" value={form.client_gstin} onChange={e => setField('client_gstin', e.target.value.toUpperCase())} /></div>
                    <div><label className={labelCls}>Email</label><Input type="email" className={inputCls} value={form.client_email} onChange={e => setField('client_email', e.target.value)} /></div>
                    <div><label className={labelCls}>Phone</label><Input className={inputCls} value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} /></div>
                    <div className="md:col-span-2"><label className={labelCls}>Billing Address</label><Textarea className={`rounded-xl text-sm min-h-[72px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={form.client_address} onChange={e => setField('client_address', e.target.value)} /></div>
                    <div><label className={labelCls}>Client State</label><Input className={inputCls} placeholder="Maharashtra, Delhi…" value={form.client_state} onChange={e => setField('client_state', e.target.value)} /></div>
                    <div><label className={labelCls}>Your Supply State</label><Input className={inputCls} placeholder="Your state" value={form.supply_state} onChange={e => { setField('supply_state', e.target.value); if (form.client_state) setField('is_interstate', e.target.value.toLowerCase() !== form.client_state.toLowerCase()); }} /></div>
                  </div>
                  <div className="flex items-center gap-3 mt-4 p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-700">
                    <Switch checked={form.is_interstate} onCheckedChange={v => setField('is_interstate', v)} />
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Interstate Supply (IGST)</p>
                      <p className="text-xs text-slate-400">{form.is_interstate ? 'IGST applies — inter-state transaction' : 'CGST + SGST applies — intra-state transaction'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'items' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${COLORS.mediumBlue}20` }}>
                      <Package className="h-3.5 w-3.5" style={{ color: COLORS.mediumBlue }} />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Line Items</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{form.items.length}</span>
                  </div>
                  <Button type="button" size="sm" onClick={addItem} className="h-8 px-3 text-xs rounded-xl text-white gap-1.5" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Plus className="h-3.5 w-3.5" /> Add Item</Button>
                </div>
                {form.items.map((item, idx) => {
                  const comp = computeItem(item, form.is_interstate);
                  const mem = getItemMemory();
                  const suggestions = Object.values(mem).filter(m => m.description.toLowerCase().includes((item.description || '').toLowerCase()) && item.description.length > 1).slice(0, 5);
                  return (
                    <div key={idx} className={`border rounded-2xl p-4 ${isDark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50/40'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Item #{idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <Select value={item.product_id || '__none__'} onValueChange={v => fillFromProduct(idx, v)}>
                            <SelectTrigger className="h-7 w-36 text-[10px] rounded-lg border-dashed"><SelectValue placeholder="From catalog" /></SelectTrigger>
                            <SelectContent><SelectItem value="__none__">— From catalog —</SelectItem>{(products || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                          </Select>
                          {form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"><X className="h-3.5 w-3.5" /></button>}
                        </div>
                      </div>
                      <div className="grid grid-cols-6 gap-3 mb-3">
                        <div className="col-span-6 md:col-span-3 relative">
                          <label className={labelCls}>Description *</label>
                          <Input className={inputCls} placeholder="Item / Service description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                          {suggestions.length > 0 && item.description && (
                            <div className={`absolute z-10 w-full mt-1 rounded-xl border shadow-lg ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                              {suggestions.map(s => (
                                <button key={s.description} type="button"
                                  onClick={() => { updateItem(idx, 'description', s.description); updateItem(idx, 'unit_price', s.unit_price); updateItem(idx, 'gst_rate', s.gst_rate); updateItem(idx, 'unit', s.unit); }}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 first:rounded-t-xl last:rounded-b-xl ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                  {s.description} <span className="text-slate-400">· {fmtC(s.unit_price)} · {s.gst_rate}%</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div><label className={labelCls}>HSN/SAC</label><Input className={inputCls} placeholder="HSN" value={item.hsn_sac} onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} /></div>
                        <div><label className={labelCls}>Qty</label><Input type="number" min="0" step="any" className={inputCls} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                        <div><label className={labelCls}>Unit</label>
                          <Select value={item.unit} onValueChange={v => updateItem(idx, 'unit', v)}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-3">
                        <div><label className={labelCls}>Unit Price (₹)</label><Input type="number" min="0" step="any" className={inputCls} value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} /></div>
                        <div><label className={labelCls}>Disc %</label><Input type="number" min="0" max="100" step="any" className={inputCls} value={item.discount_pct} onChange={e => updateItem(idx, 'discount_pct', parseFloat(e.target.value) || 0)} /></div>
                        <div><label className={labelCls}>GST %</label>
                          <Select value={String(item.gst_rate)} onValueChange={v => updateItem(idx, 'gst_rate', parseFloat(v))}>
                            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                            <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><label className={labelCls}>Taxable</label><div className={`h-11 px-3 rounded-xl flex items-center text-sm font-medium ${isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>{fmtC(comp.taxable_value)}</div></div>
                        <div><label className={labelCls}>Total</label><div className={`h-11 px-3 rounded-xl flex items-center text-sm font-bold ${isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>{fmtC(comp.total_amount)}</div></div>
                      </div>
                      {item.item_details !== undefined && (
                        <div className="mt-3"><label className={labelCls}>Item Details / Notes</label><Input className={`${inputCls} text-xs`} placeholder="Optional item notes" value={item.item_details || ''} onChange={e => updateItem(idx, 'item_details', e.target.value)} /></div>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="outline" onClick={addItem} className="w-full h-10 rounded-xl border-dashed text-xs gap-2"><Plus className="h-3.5 w-3.5" /> Add Another Item</Button>
              </div>
            )}
            {activeTab === 'totals' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${COLORS.amber}20` }}>
                      <IndianRupee className="h-3.5 w-3.5" style={{ color: COLORS.amber }} />
                    </div>
                    <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Additional Charges</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><label className={labelCls}>Discount (₹)</label><Input type="number" min="0" step="any" className={inputCls} value={form.discount_amount} onChange={e => setField('discount_amount', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className={labelCls}>Shipping (₹)</label><Input type="number" min="0" step="any" className={inputCls} value={form.shipping_charges} onChange={e => setField('shipping_charges', parseFloat(e.target.value) || 0)} /></div>
                    <div><label className={labelCls}>Other Charges (₹)</label><Input type="number" min="0" step="any" className={inputCls} value={form.other_charges} onChange={e => setField('other_charges', parseFloat(e.target.value) || 0)} /></div>
                  </div>
                </div>
                <div className={`${sectionCls} space-y-2`}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Invoice Summary</h3>
                  {[
                    ['Subtotal', fmtC(totals.subtotal)],
                    ['Total Discount', `− ${fmtC(totals.total_discount)}`],
                    ['Taxable Value', fmtC(totals.total_taxable)],
                    form.is_interstate ? ['IGST', fmtC(totals.total_igst)] : null,
                    !form.is_interstate ? ['CGST', fmtC(totals.total_cgst)] : null,
                    !form.is_interstate ? ['SGST', fmtC(totals.total_sgst)] : null,
                    ['Total GST', fmtC(totals.total_gst)],
                    ['Shipping', fmtC(form.shipping_charges)],
                    ['Other Charges', fmtC(form.other_charges)],
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm py-1.5 border-b border-dashed border-slate-200 dark:border-slate-700">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span>
                      <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-base font-bold pt-3">
                    <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>Grand Total</span>
                    <span style={{ color: COLORS.mediumBlue }}>{fmtC(totals.grand_total)}</span>
                  </div>
                </div>
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Payment Terms</h3>
                  <Select value={form.payment_terms} onValueChange={setPaymentTerms}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Due on receipt','Due in 7 days','Due in 15 days','Due in 30 days','Due in 45 days','Due in 60 days','Due in 90 days','Advance payment'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Changing this will auto-update the Due Date field</p>
                  <div className="mt-4">
                    <Select value={form.status} onValueChange={v => setField('status', v)}>
                      <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Notes & Terms</h3>
                  <div className="space-y-4">
                    {[['Notes (shown on invoice)', 'notes'], ['Terms & Conditions', 'terms_conditions']].map(([label, key]) => (
                      <div key={key}><label className={labelCls}>{label}</label><Textarea className={`rounded-xl text-sm min-h-[80px] resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-slate-200'}`} value={form[key]} onChange={e => setField(key, e.target.value)} /></div>
                    ))}
                  </div>
                </div>
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Recurring Settings</h3>
                  <div className="flex items-center gap-3 mb-4"><Switch checked={form.is_recurring} onCheckedChange={v => setField('is_recurring', v)} /><div><p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Enable Recurring Invoice</p><p className="text-xs text-slate-400">Auto-generate new invoice on schedule</p></div></div>
                  {form.is_recurring && (
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className={labelCls}>Recurrence Pattern</label><Select value={form.recurrence_pattern} onValueChange={v => setField('recurrence_pattern', v)}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select></div>
                      <div><label className={labelCls}>Recurrence End Date</label><Input type="date" className={inputCls} value={form.recurrence_end || ''} onChange={e => setField('recurrence_end', e.target.value)} /></div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'design' && (
              <div className="space-y-5">
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><Layout className="h-4 w-4" /> Invoice Template</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {INVOICE_TEMPLATES.map(t => (
                      <button key={t.id} type="button" onClick={() => setField('invoice_template', t.id)}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${form.invoice_template === t.id ? 'border-blue-500 shadow-md' : (isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300')}`}>
                        {form.invoice_template === t.id && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><Check className="h-3 w-3 text-white" /></div>}
                        {t.badge && <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 mb-2">{t.badge}</span>}
                        <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{t.name}</p>
                        <p className={`text-[10px] mt-1 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={sectionCls}>
                  <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><Palette className="h-4 w-4" /> Color Theme</h3>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                    {COLOR_THEMES.map(theme => (
                      <button key={theme.id} type="button" onClick={() => setField('invoice_theme', theme.id)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${form.invoice_theme === theme.id ? 'border-blue-500 shadow-md' : (isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300')}`}>
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"><div className="absolute inset-0" style={{ background: theme.primary }} /><div className="absolute bottom-0 right-0 w-4 h-4" style={{ background: theme.secondary }} />{form.invoice_theme === theme.id && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Check className="h-3 w-3 text-white" /></div>}</div>
                        <p className={`text-[9px] font-semibold text-center leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{theme.name}</p>
                      </button>
                    ))}
                    <div className="flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
                      <label className="cursor-pointer"><div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-300"><input type="color" value={form.invoice_custom_color} onChange={e => { setField('invoice_custom_color', e.target.value); setField('invoice_theme', 'custom'); }} className="w-12 h-12 -ml-1 -mt-1 cursor-pointer border-0 p-0" /></div></label>
                      <p className={`text-[9px] font-semibold text-center leading-tight ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Custom</p>
                    </div>
                  </div>
                </div>
                <div className={sectionCls}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}><Eye className="h-4 w-4" /> Live Preview</h3>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={handlePreview} className="h-8 px-3 text-xs rounded-xl gap-1.5">
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => {
                          const company = (companies || []).find(c => c.id === form.company_id) || {};
                          const previewInv = {
                            ...form,
                            invoice_no: editingInv?.invoice_no || 'PREVIEW-001',
                            invoice_date: form.invoice_date || format(new Date(), 'yyyy-MM-dd'),
                            due_date: form.due_date || format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
                            client_name: form.client_name || 'Client Name'
                          };
                          const html = generateInvoiceHTML(previewInv, {
                            company,
                            template: form.invoice_template,
                            theme: form.invoice_theme,
                            customColor: form.invoice_custom_color
                          });
                          const blob = new Blob([html], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const win = window.open(url, '_blank');
                          win.onload = () => win.print();
                        }}
                        className="h-8 px-3 text-xs rounded-xl gap-1.5"><Printer className="h-3.5 w-3.5" /> Open Print Preview</Button>
                    </div>
                  </div>
                  <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-600' : 'border-slate-200'}`} style={{ height: 600 }}>
                    <iframe
                      ref={previewRef}
                      className="w-full h-[600px] border rounded-xl bg-white"
                      title="Invoice Preview"
                      sandbox="allow-scripts"
                    />
                  </div>
                  <p className={`text-[10px] mt-2 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    Click <strong>Preview</strong> to load the invoice in the iframe below.<br />
                    Use "Open Print Preview" to open in a new tab for printing/saving as PDF.
                  </p>
                </div>
              </div>
            )}
          </div>
        </form>
        <div className={`flex-shrink-0 flex items-center justify-between gap-3 px-7 py-4 border-t ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-white'}`}>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-5 text-sm rounded-xl text-slate-500">Cancel</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab('design')} className="h-10 px-4 text-xs rounded-xl gap-1.5 border-purple-200 text-purple-600 hover:bg-purple-50"><Palette className="h-3.5 w-3.5" /> Design & Preview</Button>
          </div>
          <div className="flex items-center gap-3">
            {totals.grand_total > 0 && (<span className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Total: <span style={{ color: COLORS.mediumBlue }}>{fmtC(totals.grand_total)}</span></span>)}
            {activeTab !== 'design' ? (
              <Button type="button" onClick={() => { const order = ['details', 'items', 'totals', 'settings', 'design']; const next = order[order.indexOf(activeTab) + 1]; if (next) setActiveTab(next); }}
                className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm gap-2" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>Next <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={loading} className="h-10 px-7 text-sm rounded-xl text-white font-semibold shadow-sm" style={{ background: loading ? '#94a3b8' : `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{loading ? 'Saving…' : editingInv ? '✓ Update Invoice' : '✓ Create Invoice'}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PANEL
// ════════════════════════════════════════════════════════════════════════════════
const InvoiceDetailPanel = ({
  invoice,
  open,
  onClose,
  onPayment,
  onEdit,
  onDelete,
  onDownloadPdf,
  onSendEmail,
  isDark,
  companies // ✅ REQUIRED for DriveUploadBtn
}) => {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (open && invoice) {
      api
        .get('/payments', { params: { invoice_id: invoice.id } })
        .then(r => setPayments(r.data || []))
        .catch(() => setPayments([]));
    }
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const meta = getStatusMeta(invoice);
  const isInterstate = invoice.is_interstate;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        hideClose
        className={`max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        }`}
      >
        <DialogTitle className="sr-only">Invoice Detail</DialogTitle>
        <DialogDescription className="sr-only">
          Invoice details
        </DialogDescription>

        {/* HEADER */}
        <div
          className="px-7 py-5 relative overflow-hidden flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`
          }}
        >
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-white" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-white font-bold text-lg">
                    {invoice.invoice_no}
                  </p>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}
                  >
                    {meta.label}
                  </span>
                </div>

                <p className="text-white/60 text-sm">
                  {invoice.client_name}
                </p>

                <p className="text-white/40 text-xs mt-0.5">
                  {invoice.invoice_date} ·{' '}
                  {INV_TYPES.find(t => t.value === invoice.invoice_type)
                    ?.label || 'Tax Invoice'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-7 space-y-5">

            {/* LINE ITEMS */}
            <div className={`border rounded-2xl overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className={`px-5 py-3 border-b ${isDark ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Line Items ({invoice.items?.length || 0})
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className={isDark ? 'bg-slate-700/30' : 'bg-slate-50/60'}>
                      {['#', 'Description', 'HSN', 'Qty', 'Rate', 'Taxable', isInterstate ? 'IGST' : 'CGST+SGST', 'Total'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold uppercase text-[9px] text-slate-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {(invoice.items || []).map((it, i) => (
                      <tr key={i} className={`border-t ${isDark ? 'border-slate-700 hover:bg-slate-700/20' : 'border-slate-100 hover:bg-slate-50'}`}>
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-400">{i + 1}</td>
                        <td className={`${isDark ? 'text-slate-200' : 'text-slate-800'} px-3 py-2.5 font-medium`}>{it.description}</td>
                        <td className="px-3 py-2.5 text-slate-500">{it.hsn_sac || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600">{it.quantity} {it.unit}</td>
                        <td className="px-3 py-2.5 text-slate-600">{fmtC(it.unit_price)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{fmtC(it.taxable_value)}</td>
                        <td className="px-3 py-2.5 text-amber-600 font-medium">
                          {isInterstate ? fmtC(it.igst_amount) : fmtC((it.cgst_amount || 0) + (it.sgst_amount || 0))}
                        </td>
                        <td className="px-3 py-2.5 font-bold">{fmtC(it.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 space-y-1.5 border-t">
                <div className="flex justify-between text-xs">
                  <span>Taxable Value</span>
                  <span>{fmtC(invoice.total_taxable)}</span>
                </div>

                <div className="flex justify-between text-xs font-bold pt-2 border-t">
                  <span>Grand Total</span>
                  <span>{fmtC(invoice.grand_total)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}
        <div
          className={`flex-shrink-0 flex items-center gap-2 px-7 py-4 border-t flex-wrap ${
            isDark
              ? 'border-slate-700 bg-slate-800'
              : 'border-slate-100 bg-white'
          }`}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              onEdit?.(invoice);
            }}
            className="rounded-xl text-xs h-9 gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadPdf?.(invoice)}
            className="rounded-xl text-xs h-9 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>

          {/* ✅ FIXED: inv → invoice */}
          <DriveUploadBtn
            invoiceId={invoice.id}
            invoiceNo={invoice.invoice_no}
            invoice={invoice}
            companies={companies}
          />

          {invoice.client_email && (
            <Button
              size="sm"
              onClick={() => {
                onClose();
                onSendEmail?.(invoice);
              }}
              className="rounded-xl text-xs h-9 gap-1.5 bg-blue-600 text-white"
            >
              <Send className="h-3.5 w-3.5" /> Send Email
            </Button>
          )}

          {invoice.amount_due > 0 && (
            <Button
              size="sm"
              onClick={() => {
                onClose();
                onPayment?.(invoice);
              }}
              className="rounded-xl text-xs h-9 gap-1.5 text-white"
              style={{
                background: `linear-gradient(135deg, ${COLORS.emeraldGreen}, #15803d)`
              }}
            >
              <IndianRupee className="h-3.5 w-3.5" /> Record Payment
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(invoice)}
            className="rounded-xl text-xs h-9 gap-1.5 text-red-500 hover:bg-red-50 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// PRODUCT MODAL
// ════════════════════════════════════════════════════════════════════════════════
const ProductModal = ({ open, onClose, isDark, onSaved }) => {
  // ── useState ──
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── useEffect ──
  useEffect(() => { if (open) api.get('/products').then(r => setProducts(r.data || [])).catch(() => {}); }, [open]);

  // ── Handlers ──
  const handleSave = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editing) await api.put(`/products/${editing.id}`, form);
      else await api.post('/products', form);
      toast.success(editing ? 'Product updated!' : 'Product created!');
      const r = await api.get('/products'); setProducts(r.data || []);
      setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true });
      setEditing(null); onSaved?.();
    } catch { toast.error('Failed to save product'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/products/${id}`); setProducts(p => p.filter(x => x.id !== id)); toast.success('Deleted'); }
    catch { toast.error('Failed'); }
  };

  const inputCls = `h-10 rounded-xl text-sm border-slate-200 dark:border-slate-600 focus:border-blue-400 ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white'}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={`max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border shadow-2xl p-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white'}`}>
        <DialogTitle className="sr-only">Product Catalog</DialogTitle>
        <DialogDescription className="sr-only">Manage products and services</DialogDescription>
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}><Package className="h-5 w-5" /></div><div><h2 className={`font-bold text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Product / Service Catalog</h2><p className="text-xs text-slate-400">Reusable items for quick invoice creation</p></div></div>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className={`w-72 flex-shrink-0 p-5 border-r overflow-y-auto ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50/40'}`}>
            <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{editing ? 'Edit Item' : 'New Item'}</h4>
            <form onSubmit={handleSave} className="space-y-3">
              <Input className={inputCls} placeholder="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              <Input className={inputCls} placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input className={inputCls} placeholder="HSN/SAC" value={form.hsn_sac} onChange={e => setForm(p => ({ ...p, hsn_sac: e.target.value }))} />
                <Select value={form.unit} onValueChange={v => setForm(p => ({ ...p, unit: v }))}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" className={inputCls} placeholder="Unit Price" value={form.unit_price} onChange={e => setForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} />
                <Select value={String(form.gst_rate)} onValueChange={v => setForm(p => ({ ...p, gst_rate: parseFloat(v) }))}><SelectTrigger className={inputCls}><SelectValue /></SelectTrigger><SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}% GST</SelectItem>)}</SelectContent></Select>
              </div>
              <Input className={inputCls} placeholder="Category (optional)" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} />
              <div className="flex gap-2">
                <Button type="submit" disabled={loading} size="sm" className="flex-1 h-9 rounded-xl text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>{loading ? 'Saving…' : editing ? 'Update' : 'Add Item'}</Button>
                {editing && <Button type="button" variant="ghost" size="sm" className="h-9 rounded-xl text-xs" onClick={() => { setEditing(null); setForm({ name: '', description: '', hsn_sac: '', unit: 'service', unit_price: 0, gst_rate: 18, category: '', is_service: true }); }}>Cancel</Button>}
              </div>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-slate-400"><Package className="h-10 w-10 mb-3 opacity-30" /><p className="text-sm">No products yet — add one!</p></div>
            ) : products.map(p => (
              <div key={p.id} className={`flex items-center gap-3 px-5 py-3.5 border-b group transition-colors ${isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-100 hover:bg-slate-50'}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ background: p.is_service ? `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` : 'linear-gradient(135deg, #065f46, #059669)' }}>{p.is_service ? 'S' : 'P'}</div>
                <div className="flex-1 min-w-0"><p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p><p className="text-xs text-slate-400">{p.unit} · {fmtC(p.unit_price)} · GST {p.gst_rate}%{p.hsn_sac && ` · HSN ${p.hsn_sac}`}</p></div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(p); setForm({ name: p.name, description: p.description || '', hsn_sac: p.hsn_sac || '', unit: p.unit || 'service', unit_price: p.unit_price || 0, gst_rate: p.gst_rate || 18, category: p.category || '', is_service: p.is_service !== false }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><Edit className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════════
const LIST_PAGE_SIZE = 20;
const SECTION_PAGE_SIZE = 10; // rows per page inside Outstanding / Received sections
function Invoicing() {
  // ── A. ALL useState (top of component) ──────────────────────────────────────
  const [invoices, setInvoices] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInv, setEditingInv] = useState(null);
  const [detailInv, setDetailInv] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payInv, setPayInv] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [gstOpen, setGstOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerClient, setLedgerClient] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [outstandingPage, setOutstandingPage] = useState(1);
  const [receivedPage, setReceivedPage] = useState(1);

  // ── B. ALL useRef ─────────────────────────────────────────────────────────
  const iframeRef = useRef(null);
  const searchRef = useRef(null);
  const invoiceListRef = useRef(null); // scroll target for stat-card clicks

  // ── hooks from context/router (treat as stable) ──
  const { user } = useAuth();
  const isDark = useDark();
  const navigate = useNavigate();

  // ── D. ALL useMemo: BASE DATA ─────────────────────────────────────────────

  const availableYears = useMemo(() => {
    const years = new Set((invoices || []).map(i => i.invoice_date?.slice(0, 4)).filter(Boolean));
    return Array.from(years).sort().reverse();
  }, [invoices]);

  const localStats = useMemo(() => {
    const now = new Date();
    const curMonth = format(now, 'yyyy-MM');
    const fy = fyRange(yearFilter === 'all' ? null : yearFilter);
    const base = (invoices || []).filter(inv => {
      if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false;
      if (fy && (inv.invoice_date < fy.from || inv.invoice_date > fy.to)) return false;
      return true;
    });
    const total_revenue = base.reduce((s, i) => s + (i.grand_total || 0), 0);
    const total_outstanding = base.reduce((s, i) => s + (i.amount_due || 0), 0);
    const total_gst = base.reduce((s, i) => s + (i.total_gst || 0), 0);
    const total_invoices = base.length;
    const month_revenue = base.filter(i => i.invoice_date?.startsWith(curMonth)).reduce((s, i) => s + (i.grand_total || 0), 0);
    const month_invoices = base.filter(i => i.invoice_date?.startsWith(curMonth)).length;
    const overdue_count = base.filter(i => i.amount_due > 0 && i.due_date && differenceInDays(new Date(), parseISO(i.due_date)) > 0).length;
    const paid_count = base.filter(i => i.status === 'paid').length;
    const draft_count = base.filter(i => i.status === 'draft').length;
    const monthly_trend = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i); const key = format(d, 'yyyy-MM');
      const monthInvs = base.filter(inv => inv.invoice_date?.startsWith(key));
      return { label: format(d, 'MMM yy'), revenue: monthInvs.reduce((s, inv) => s + (inv.grand_total || 0), 0), collected: monthInvs.reduce((s, inv) => s + (inv.amount_paid || 0), 0) };
    });
    const clientMap = {};
    base.forEach(inv => { if (!inv.client_name) return; clientMap[inv.client_name] = (clientMap[inv.client_name] || 0) + (inv.grand_total || 0); });
    const top_clients = Object.entries(clientMap).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    return { total_revenue, total_outstanding, total_gst, total_invoices, month_revenue, month_invoices, overdue_count, paid_count, draft_count, monthly_trend, top_clients };
  }, [invoices, companyFilter, yearFilter]);

  // ── E. ALL useMemo: DERIVED DATA ──────────────────────────────────────────

  const filtered = useMemo(() => {
    const fy = fyRange(yearFilter === 'all' ? null : yearFilter);
    return (invoices || []).filter(inv => {
      if (companyFilter !== 'all' && inv.company_id !== companyFilter) return false;
      if (fy && (inv.invoice_date < fy.from || inv.invoice_date > fy.to)) return false;
      if (searchTerm && !inv.invoice_no?.toLowerCase().includes(searchTerm.toLowerCase()) && !inv.client_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (statusFilter === 'outstanding') {
        // Outstanding = anything with balance due OR draft (not cancelled, not paid)
        if (inv.status === 'paid' || inv.status === 'cancelled') return false;
        if ((inv.amount_due || 0) <= 0 && inv.status !== 'draft') return false;
      } else if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) return false;
      if (fromDate && inv.invoice_date < fromDate) return false;
      if (toDate && inv.invoice_date > toDate) return false;
      return true;
    });
  }, [invoices, companyFilter, yearFilter, searchTerm, statusFilter, typeFilter, fromDate, toDate]);

  // ── F. ALL useMemo: TOTALS / AGGREGATIONS ────────────────────────────────

  const enrichedFiltered = useMemo(() => (filtered || []).map(inv => {
    if (inv.status === 'sent' && inv.amount_due > 0 && inv.due_date && differenceInDays(parseISO(inv.due_date), new Date()) < 0) return { ...inv, status: 'overdue' };
    return inv;
  }), [filtered]);

  // ── paginatedFiltered: client-side page slice of enrichedFiltered ──────────
  const paginatedFiltered = useMemo(() => {
    const start = (listPage - 1) * LIST_PAGE_SIZE;
    return enrichedFiltered.slice(start, start + LIST_PAGE_SIZE);
  }, [enrichedFiltered, listPage]);

  const totalListPages = useMemo(
    () => Math.max(1, Math.ceil(enrichedFiltered.length / LIST_PAGE_SIZE)),
    [enrichedFiltered]
  );

  // ── Split invoices into Received and Outstanding sections ─────────────────
  const receivedInvoices = useMemo(() =>
    enrichedFiltered.filter(inv => inv.status === 'paid' || (inv.amount_due <= 0 && inv.status !== 'draft' && inv.status !== 'cancelled')),
    [enrichedFiltered]
  );
  const outstandingInvoices = useMemo(() =>
    enrichedFiltered.filter(inv => inv.status !== 'paid' && (inv.amount_due > 0 || inv.status === 'draft' || inv.status === 'cancelled')),
    [enrichedFiltered]
  );

  // ── Paginated slices for each section ─────────────────────────────────────
  const paginatedOutstanding = useMemo(() => {
    const start = (outstandingPage - 1) * SECTION_PAGE_SIZE;
    return outstandingInvoices.slice(start, start + SECTION_PAGE_SIZE);
  }, [outstandingInvoices, outstandingPage]);

  const totalOutstandingPages = useMemo(
    () => Math.max(1, Math.ceil(outstandingInvoices.length / SECTION_PAGE_SIZE)),
    [outstandingInvoices]
  );

  const paginatedReceived = useMemo(() => {
    const start = (receivedPage - 1) * SECTION_PAGE_SIZE;
    return receivedInvoices.slice(start, start + SECTION_PAGE_SIZE);
  }, [receivedInvoices, receivedPage]);

  const totalReceivedPages = useMemo(
    () => Math.max(1, Math.ceil(receivedInvoices.length / SECTION_PAGE_SIZE)),
    [receivedInvoices]
  );

  // ── G. ALL useCallback (AFTER ALL MEMOS) ─────────────────────────────────

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  // toggleSelectAll depends on enrichedFiltered — declared AFTER it ✓
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => prev.size === enrichedFiltered.length ? new Set() : new Set(enrichedFiltered.map(i => i.id)));
  }, [enrichedFiltered]);

  // fetchAll declared before handleBulkDelete ✓
const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, compR, clientR, leadR, statR] = await Promise.allSettled([
        api.get('/invoices', { params: { page: 1, page_size: 5000 } }),
        api.get('/companies'),
        api.get('/clients'),
        api.get('/leads'),
        api.get('/invoices/stats'),
      ]);

      if (invR.status === 'fulfilled') {
        const invPayload = invR.value.data;
        setInvoices(Array.isArray(invPayload) ? invPayload : (invPayload?.invoices || []));
      } else {
        console.error('Failed to load invoices:', invR.reason);
        toast.error('Failed to load invoices');
        setInvoices([]);
      }

      if (compR.status === 'fulfilled') setCompanies(compR.value.data || []);
      else { console.error('Failed to load companies:', compR.reason); setCompanies([]); }

      if (clientR.status === 'fulfilled') setClients(clientR.value.data || []);
      else { console.error('Failed to load clients:', clientR.reason); setClients([]); }

      if (leadR.status === 'fulfilled') setLeads(leadR.value.data || []);
      else { console.error('Failed to load leads:', leadR.reason); setLeads([]); }

      if (statR.status === 'fulfilled') setStats(statR.value.data || null);
      else { console.error('Failed to load stats:', statR.reason); setStats(null); }

    } catch (err) {
      console.error('fetchAll unexpected error:', err);
      toast.error('Failed to load invoicing data');
    } finally {
      setLoading(false);
    }
  }, []);

  // handleBulkDelete depends on fetchAll — declared AFTER it ✓
  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`Delete ${selectedIds.size} invoice${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleteLoading(true);
    let deleted = 0, failed = 0;
    for (const id of selectedIds) {
      try { await api.delete(`/invoices/${id}`); deleted++; }
      catch { failed++; }
    }
    setBulkDeleteLoading(false);
    setSelectedIds(new Set());
    fetchAll();
    toast.success(`Deleted ${deleted} invoice${deleted > 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`);
  }, [selectedIds, fetchAll]);

  const handleEdit = useCallback((inv) => { setEditingInv(inv); setFormOpen(true); }, []);

  const handleDelete = useCallback(async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_no}?`)) return;
    try { await api.delete(`/invoices/${inv.id}`); toast.success('Invoice deleted'); fetchAll(); setDetailOpen(false); }
    catch { toast.error('Failed to delete'); }
  }, [fetchAll]);

  const handleDownloadPdf = useCallback(async (inv) => {
    try {
      toast.info('Generating PDF…', { duration: 1500 });
      const invData = (inv.items?.length || 0) > 0
        ? inv
        : (await api.get(`/invoices/${inv.id}`)).data;
      const baseCompany = (companies || []).find(c => c.id === invData.company_id) || {};
      const invSettings = getInvSettings(invData.company_id);
      const company = {
        ...baseCompany,
        bank_name:        baseCompany.bank_name        || invSettings.bank_name        || '',
        bank_account_no:  baseCompany.bank_account_no  || invSettings.bank_account_no  || '',
        bank_account:     baseCompany.bank_account     || invSettings.bank_account_no  || '',
        bank_ifsc:        baseCompany.bank_ifsc        || invSettings.bank_ifsc        || '',
        bank_branch:      baseCompany.bank_branch      || invSettings.bank_branch      || '',
        upi_id:           baseCompany.upi_id           || invSettings.upi_id           || '',
        show_qr_code:     invSettings.show_qr_code     ?? true,
        invoice_title:    invSettings.invoice_title    || 'Tax Invoice',
        signatory_name:   invSettings.signatory_name   || '',
        signatory_label:  invSettings.signatory_label  || 'Authorised Signatory',
        footer_line:      invSettings.footer_line      || '',
        signature_image:  baseCompany.signature_image  || invSettings.signature_image  || '',
        logo_url:         baseCompany.logo_url         || baseCompany.logo             || '',
      };
      const html = generateInvoiceHTML(invData, {
        company,
        template:    invData.invoice_template     || invSettings.template     || 'classic',
        theme:       invData.invoice_theme        || invSettings.theme        || 'classic_blue',
        customColor: invData.invoice_custom_color || invSettings.custom_color || '#0D3B66',
      });
      const win = window.open('', '_blank', 'width=900,height=700');
      if (!win) { toast.error('Allow pop-ups to download PDF'); return; }
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
      toast.success(`PDF ready: ${inv.invoice_no}`);
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('PDF generation failed');
    }
  }, [companies]);

  const handleMarkSent = useCallback(async (inv) => {
    try { await api.post(`/invoices/${inv.id}/mark-sent`); fetchAll(); toast.success('Marked as sent'); } catch { toast.error('Failed'); }
  }, [fetchAll]);

  const handleSendEmail = useCallback(async (inv) => {
    if (!inv.client_email) { toast.error('Client email address is missing'); return; }
    if (!window.confirm(`Send invoice ${inv.invoice_no} to ${inv.client_email}?`)) return;
    try { await api.post(`/invoices/${inv.id}/send-email`); toast.success(`Email queued for ${inv.invoice_no}`); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to queue email'); }
  }, [fetchAll]);

  const handleExport = useCallback(() => {
    if (!(enrichedFiltered?.length)) { toast.error('No invoices to export'); return; }
    const rows = [['Invoice No','Type','Client','Date','Due Date','Taxable','GST','Total','Paid','Balance','Status'],
      ...enrichedFiltered.map(inv => [inv.invoice_no, INV_TYPES.find(t => t.value === inv.invoice_type)?.label || inv.invoice_type, inv.client_name, inv.invoice_date, inv.due_date, inv.total_taxable, inv.total_gst, inv.grand_total, inv.amount_paid, inv.amount_due, inv.status])];
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, `invoices_${format(new Date(), 'dd-MMM-yyyy')}.xlsx`);
    toast.success(`Exported ${enrichedFiltered.length} invoices`);
  }, [enrichedFiltered]);

  // ── H. ALL useEffect ──────────────────────────────────────────────────────

  useEffect(() => { const t = setTimeout(() => { setSearchTerm(searchInput); setListPage(1); setOutstandingPage(1); setReceivedPage(1); }, 250); return () => clearTimeout(t); }, [searchInput]);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'n' && !formOpen && !detailOpen && !payOpen && !gstOpen && document.activeElement.tagName === 'BODY') setFormOpen(true);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [formOpen, detailOpen, payOpen, gstOpen]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Reset list page whenever filters or search change
  useEffect(() => { setListPage(1); setOutstandingPage(1); setReceivedPage(1); }, [statusFilter, typeFilter, companyFilter, yearFilter, fromDate, toDate, searchTerm]);

  // ── I. JSX return ─────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen p-5 md:p-7 space-y-5 ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {/* PAGE HEADER */}
      <div className="relative overflow-hidden rounded-2xl shadow-sm" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 60%, #1a8fcc 100%)` }}>
        <div className="absolute right-0 top-0 w-72 h-72 rounded-full -mr-24 -mt-24 opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-4 sm:px-6 pt-4 sm:pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 flex-shrink-0"><Receipt className="h-5 w-5 text-white" /></div>
            <div><h1 className="text-2xl font-bold text-white tracking-tight leading-tight">Invoicing & Billing</h1><p className="text-sm text-blue-200 mt-0.5">GST-compliant · Smart client search · GSTR reports · Email invoices · <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">Ctrl+K</kbd> · <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/20 font-mono">N</kbd> new</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setLedgerClient(null); setLedgerOpen(true); }} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold"><BookOpen className="h-4 w-4" /> Party Ledger</Button>
            <Button variant="outline" onClick={() => setGstOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold"><FileSpreadsheet className="h-4 w-4" /> GST Returns</Button>
            <Button variant="outline" onClick={() => setSettingsOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm font-semibold"><Settings className="h-4 w-4" /> Settings</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="h-9 px-4 text-sm bg-emerald-500/20 border-emerald-300/40 text-white hover:bg-emerald-500/30 rounded-xl gap-2 backdrop-blur-sm font-semibold"><Database className="h-4 w-4" /> Import</Button>
            <Button variant="outline" onClick={downloadInvoiceTemplate} className="h-9 px-4 text-sm bg-amber-500/20 border-amber-300/40 text-white hover:bg-amber-500/30 rounded-xl gap-2 backdrop-blur-sm font-semibold"><FileDown className="h-4 w-4" /> Template</Button>
            <Button variant="outline" onClick={() => setCatOpen(true)} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm"><Package className="h-4 w-4" /> Catalog</Button>
            <Button variant="outline" onClick={handleExport} className="h-9 px-4 text-sm bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2 backdrop-blur-sm"><Download className="h-4 w-4" /> Export</Button>
            <Button onClick={() => { setEditingInv(null); setFormOpen(true); }} className="h-9 px-5 text-sm rounded-xl bg-white text-slate-800 hover:bg-blue-50 shadow-sm gap-2 font-semibold border-0"><Plus className="h-4 w-4" /> New Invoice</Button>
          </div>
        </div>
      </div>

      {/* STATS */}
      {((localStats?.total_invoices || 0) > 0 || (invoices?.length || 0) > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Revenue" value={fmtC(localStats.total_revenue)} sub={`${localStats.total_invoices} invoices`} icon={IndianRupee} color={COLORS.mediumBlue} bg={`${COLORS.mediumBlue}12`} isDark={isDark} onClick={() => { setStatusFilter('all'); setFromDate(''); setToDate(''); setTimeout(() => invoiceListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }} />
          <StatCard label="Outstanding" value={fmtC(localStats.total_outstanding)} sub={`${localStats.overdue_count} overdue`} icon={AlertCircle} color={COLORS.coral} bg={`${COLORS.coral}15`} isDark={isDark} onClick={() => { setStatusFilter('outstanding'); setFromDate(''); setToDate(''); setTimeout(() => invoiceListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }} />
          <StatCard label="This Month" value={fmtC(localStats.month_revenue)} sub={`${localStats.month_invoices} invoices`} icon={TrendingUp} color={COLORS.emeraldGreen} bg={`${COLORS.emeraldGreen}12`} isDark={isDark}
            onClick={() => {
              const now = new Date();
              const first = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
              const last  = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
              setFromDate(first); setToDate(last); setStatusFilter('all'); setYearFilter('all');
              setTimeout(() => invoiceListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
            }} />
          <StatCard label="Total GST" value={fmtC(localStats.total_gst)} sub={`${localStats.paid_count} paid · ${localStats.draft_count} draft`} icon={Shield} color={COLORS.amber} bg={`${COLORS.amber}12`} isDark={isDark} onClick={() => setGstOpen(true)} />
        </div>
      )}

      {localStats?.monthly_trend?.some(d => d.revenue > 0) && (
        <EnhancedRevenueTrend invoices={invoices || []} isDark={isDark} />
      )}

      {/* FILTERS */}
      <div className={`rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input ref={searchRef} placeholder="Search invoice no. or client… (Ctrl+K)" className={`pl-10 h-9 border-none focus-visible:ring-1 focus-visible:ring-blue-300 rounded-xl text-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className={`h-9 px-3 flex items-center rounded-xl text-xs font-bold border whitespace-nowrap flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{enrichedFiltered.length} <span className="ml-1 font-normal text-slate-400">invoices</span></div>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2.5 overflow-x-auto scrollbar-none flex-wrap">
          {(companies?.length || 0) > 1 && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}><SelectTrigger className={`h-9 w-[160px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-blue-50 text-blue-700'}`}><Building2 className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Companies</SelectItem>{(companies || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          )}
          <Select value={yearFilter} onValueChange={setYearFilter}><SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><CalendarDays className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Years</SelectItem>{availableYears.map(y => <SelectItem key={y} value={y}>FY {y}-{String(parseInt(y) + 1).slice(2)}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="outstanding">Outstanding</SelectItem>{Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className={`h-9 w-[130px] border-none rounded-xl text-xs flex-shrink-0 font-semibold ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-50'}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{INV_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          <div className="flex items-center gap-1.5">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={`h-9 px-2 rounded-xl text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 [color-scheme:dark]' : 'bg-white border-slate-200'}`} />
            <span className="text-slate-400 text-xs">–</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={`h-9 px-2 rounded-xl text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 [color-scheme:dark]' : 'bg-white border-slate-200'}`} />
          </div>
          {(statusFilter !== 'all' || typeFilter !== 'all' || companyFilter !== 'all' || yearFilter !== 'all' || fromDate || toDate) && (
            <button onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setCompanyFilter('all'); setYearFilter('all'); setFromDate(''); setToDate(''); }} className="h-9 px-3 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-1"><X className="h-3 w-3" /> Clear</button>
          )}
        </div>
        {selectedIds.size > 0 && (
          <div className={`px-4 py-2.5 border-t flex items-center gap-3 ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-blue-50/40'}`}>
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{selectedIds.size} selected</span>
            <Button size="sm" variant="ghost" onClick={handleBulkDelete} disabled={bulkDeleteLoading} className="h-7 px-3 text-xs text-red-500 hover:bg-red-50 rounded-lg gap-1.5">
              {bulkDeleteLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete Selected
            </Button>
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">Deselect all</button>
          </div>
        )}
      </div>

      {/* INVOICE LIST — split into Outstanding and Received */}
      <div ref={invoiceListRef} className="scroll-mt-4" />
      {/* ── Active-filter banner ── */}
      {(statusFilter !== 'all' || fromDate || toDate) && (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
          isDark ? 'bg-slate-800 border-slate-700' : 'bg-blue-50 border-blue-100'
        }`}>
          <Filter className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {statusFilter !== 'all' && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500 text-white">
                {statusFilter === 'outstanding' ? '⚠ Outstanding' : STATUS_META[statusFilter]?.label || statusFilter}
              </span>
            )}
            {(fromDate || toDate) && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
              }`}>
                📅 {fromDate || '…'} → {toDate || '…'}
              </span>
            )}
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {enrichedFiltered.length} invoice{enrichedFiltered.length !== 1 ? 's' : ''} match
            </span>
          </div>
          <button onClick={() => { setStatusFilter('all'); setFromDate(''); setToDate(''); }}
            className="text-xs text-slate-400 hover:text-red-500 font-semibold flex-shrink-0 transition-colors">✕ Clear filter</button>
        </div>
      )}
      {loading ? (
        <GifLoader />
      ) : enrichedFiltered.length === 0 ? (
        <div className={`rounded-2xl border p-16 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}20, ${COLORS.mediumBlue}20)` }}>
            <Receipt className="h-8 w-8" style={{ color: COLORS.mediumBlue }} />
          </div>
          <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>No invoices found</h3>
          <p className={`text-sm mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate ? 'No invoices match the current filter' : 'Create your first GST invoice'}
          </p>
          <Button onClick={() => { setEditingInv(null); setFormOpen(true); }} className="h-10 px-6 rounded-xl text-white gap-2" style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── OUTSTANDING SECTION ───────────────────────────── */}
          {outstandingInvoices.length > 0 && (
            <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              {/* Section header */}
              <div className={`flex items-center gap-3 px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-amber-50/60'}`}>
                <div className="w-2 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #FF6B6B, #F59E0B)' }} />
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Outstanding</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>{outstandingInvoices.length}</span>
                <span className={`ml-auto text-xs font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  {fmtC(outstandingInvoices.reduce((s, i) => s + (i.amount_due || 0), 0))} due
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{minWidth:700}}>
                  <thead>
                    <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-700/40' : 'border-slate-100 bg-slate-50/60'}`}>
                      <th className="w-[5px]" />
                      <th className="px-4 py-3 w-10" />
                      {['Invoice', 'Client', 'Date', 'Type', 'Amount', 'Status', 'Actions'].map(h => (
                        <th key={h} className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOutstanding.map(inv => {
                      const stripe = getInvoiceStripe(inv);
                      const isSelected = selectedIds.has(inv.id);
                      return (
                        <tr key={inv.id}
                          className={`border-b last:border-0 transition-colors cursor-pointer relative ${isSelected ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/60') : (isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-50 hover:bg-slate-50')}`}
                          onClick={() => { setDetailInv(inv); setDetailOpen(true); }}>
                          {/* Colour strip — identical to Tasks page left stripe */}
                          <td className="p-0 w-[5px]">
                            <div className="w-[5px] h-full min-h-[54px] rounded-sm" style={{ backgroundColor: stripe.color }} />
                          </td>
                          <td className="px-4 py-3.5 w-10" />
                          <td className="px-4 py-3.5">
                            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              <Hl text={inv.invoice_no || '—'} query={searchTerm} />
                            </p>
                            {inv.reference_no && <p className="text-[10px] text-slate-400 mt-0.5">Ref: {inv.reference_no}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: avatarGrad(inv.client_name) }}>
                                {(inv.client_name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate max-w-[180px] ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                  <Hl text={inv.client_name || '—'} query={searchTerm} />
                                </p>
                                {inv.client_gstin && <p className="text-[10px] text-slate-400 font-mono truncate">{inv.client_gstin}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{inv.invoice_date}</p>
                            {inv.due_date && <p className="text-[10px] text-slate-400">Due: {inv.due_date}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                              {INV_TYPES.find(t => t.value === inv.invoice_type)?.label || inv.invoice_type}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(inv.grand_total)}</p>
                            {inv.amount_due > 0 && <p className="text-[10px] font-semibold mt-0.5" style={{ color: stripe.color }}>Due: {fmtC(inv.amount_due)}</p>}
                          </td>
                          <td className="px-4 py-3.5"><StatusPill inv={inv} /></td>
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingInv(inv); setFormOpen(true); }} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-blue-900/30' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}><Edit className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDownloadPdf(inv)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/30' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}><Download className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(inv)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* ── Outstanding pagination ── */}
              {totalOutstandingPages > 1 && (
                <div className={`flex items-center justify-between px-5 py-3 border-t ${
                  isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-amber-50/40'
                }`}>
                  <span className={`text-xs ${ isDark ? 'text-slate-400' : 'text-slate-500' }`}>
                    Showing {((outstandingPage - 1) * SECTION_PAGE_SIZE) + 1}–{Math.min(outstandingPage * SECTION_PAGE_SIZE, outstandingInvoices.length)} of {outstandingInvoices.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={outstandingPage === 1}
                      onClick={() => setOutstandingPage(p => Math.max(1, p - 1))}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 ${
                        isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-amber-100 text-slate-600'
                      }`}
                    >‹</button>
                    {Array.from({ length: totalOutstandingPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalOutstandingPages || Math.abs(p - outstandingPage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p); return acc;
                      }, [])
                      .map((p, i) => p === '...' ? (
                        <span key={`od-ellipsis-${i}`} className="px-1 text-xs text-slate-400">…</span>
                      ) : (
                        <button key={p} onClick={() => setOutstandingPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                            outstandingPage === p
                              ? 'text-white shadow-sm'
                              : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-amber-100'
                          }`}
                          style={outstandingPage === p ? { background: 'linear-gradient(135deg, #F59E0B, #D97706)' } : {}}
                        >{p}</button>
                      ))
                    }
                    <button
                      disabled={outstandingPage === totalOutstandingPages}
                      onClick={() => setOutstandingPage(p => Math.min(totalOutstandingPages, p + 1))}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 ${
                        isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-amber-100 text-slate-600'
                      }`}
                    >›</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RECEIVED SECTION ──────────────────────────────── */}
          {receivedInvoices.length > 0 && (
            <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              {/* Section header */}
              <div className={`flex items-center gap-3 px-5 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-700/30' : 'border-slate-100 bg-emerald-50/60'}`}>
                <div className="w-2 h-6 rounded-full bg-emerald-500" />
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Received</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>{receivedInvoices.length}</span>
                <span className={`ml-auto text-xs font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {fmtC(receivedInvoices.reduce((s, i) => s + (i.grand_total || 0), 0))} collected
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full" style={{minWidth:700}}>
                  <thead>
                    <tr className={`border-b ${isDark ? 'border-slate-700 bg-slate-700/40' : 'border-slate-100 bg-slate-50/60'}`}>
                      <th className="w-[5px]" />
                      <th className="px-4 py-3 w-10" />
                      {['Invoice', 'Client', 'Date', 'Type', 'Amount', 'Status', 'Actions'].map(h => (
                        <th key={h} className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReceived.map(inv => {
                      const isSelected = selectedIds.has(inv.id);
                      return (
                        <tr key={inv.id}
                          className={`border-b last:border-0 transition-colors cursor-pointer ${isSelected ? (isDark ? 'bg-blue-900/20' : 'bg-blue-50/60') : (isDark ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-50 hover:bg-slate-50')}`}
                          onClick={() => { setDetailInv(inv); setDetailOpen(true); }}>
                          {/* Green strip for paid invoices */}
                          <td className="p-0 w-[5px]">
                            <div className="w-[5px] h-full min-h-[54px] rounded-sm bg-emerald-500" />
                          </td>
                          <td className="px-4 py-3.5 w-10" />
                          <td className="px-4 py-3.5">
                            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                              <Hl text={inv.invoice_no || '—'} query={searchTerm} />
                            </p>
                            {inv.reference_no && <p className="text-[10px] text-slate-400 mt-0.5">Ref: {inv.reference_no}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: avatarGrad(inv.client_name) }}>
                                {(inv.client_name || '?').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate max-w-[180px] ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                  <Hl text={inv.client_name || '—'} query={searchTerm} />
                                </p>
                                {inv.client_gstin && <p className="text-[10px] text-slate-400 font-mono truncate">{inv.client_gstin}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{inv.invoice_date}</p>
                            {inv.due_date && <p className="text-[10px] text-slate-400">Due: {inv.due_date}</p>}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                              {INV_TYPES.find(t => t.value === inv.invoice_type)?.label || inv.invoice_type}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{fmtC(inv.grand_total)}</p>
                            <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">Paid in full</p>
                          </td>
                          <td className="px-4 py-3.5"><StatusPill inv={inv} /></td>
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingInv(inv); setFormOpen(true); }} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-blue-400 hover:bg-blue-900/30' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}><Edit className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDownloadPdf(inv)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/30' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}><Download className="h-3.5 w-3.5" /></button>
                              <button onClick={() => handleDelete(inv)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* ── Received pagination ── */}
              {totalReceivedPages > 1 && (
                <div className={`flex items-center justify-between px-5 py-3 border-t ${
                  isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-emerald-50/40'
                }`}>
                  <span className={`text-xs ${ isDark ? 'text-slate-400' : 'text-slate-500' }`}>
                    Showing {((receivedPage - 1) * SECTION_PAGE_SIZE) + 1}–{Math.min(receivedPage * SECTION_PAGE_SIZE, receivedInvoices.length)} of {receivedInvoices.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={receivedPage === 1}
                      onClick={() => setReceivedPage(p => Math.max(1, p - 1))}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 ${
                        isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-emerald-100 text-slate-600'
                      }`}
                    >‹</button>
                    {Array.from({ length: totalReceivedPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalReceivedPages || Math.abs(p - receivedPage) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p); return acc;
                      }, [])
                      .map((p, i) => p === '...' ? (
                        <span key={`rc-ellipsis-${i}`} className="px-1 text-xs text-slate-400">…</span>
                      ) : (
                        <button key={p} onClick={() => setReceivedPage(p)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                            receivedPage === p
                              ? 'text-white shadow-sm'
                              : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-emerald-100'
                          }`}
                          style={receivedPage === p ? { background: 'linear-gradient(135deg, #10B981, #059669)' } : {}}
                        >{p}</button>
                      ))
                    }
                    <button
                      disabled={receivedPage === totalReceivedPages}
                      onClick={() => setReceivedPage(p => Math.min(totalReceivedPages, p + 1))}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 ${
                        isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-emerald-100 text-slate-600'
                      }`}
                    >›</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      <InvoiceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingInv(null); }}
        editingInv={editingInv}
        companies={companies}
        clients={clients}
        leads={leads}
        onSuccess={fetchAll}
        isDark={isDark}
      />
      <InvoiceDetailPanel
        invoice={detailInv}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onPayment={inv => { setPayInv(inv); setPayOpen(true); }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDownloadPdf={handleDownloadPdf}
        onSendEmail={handleSendEmail}
        isDark={isDark}
        companies={companies}
      />
      <PaymentModal
        invoice={payInv}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSuccess={() => { fetchAll(); setPayOpen(false); }}
        isDark={isDark}
      />
      <ProductModal open={catOpen} onClose={() => setCatOpen(false)} isDark={isDark} onSaved={fetchAll} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} isDark={isDark} companies={companies} onImportComplete={fetchAll} />
      <GSTReportsModal open={gstOpen} onClose={() => setGstOpen(false)} invoices={invoices} companies={companies} isDark={isDark} />
      {settingsOpen && <InvoiceSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} companies={companies} isDark={isDark} />}
      {ledgerOpen && <PartyLedger open={ledgerOpen} onClose={() => setLedgerOpen(false)} invoices={invoices} clients={clients} companies={companies} isDark={isDark} initialClient={ledgerClient} />}
    </div>
  );
}

export default Invoicing;
