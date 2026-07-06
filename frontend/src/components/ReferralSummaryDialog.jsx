/**
 * ReferralSummaryDialog
 * ─────────────────────
 * Shows every referrer (the person/company via whom a client was
 * introduced) grouped with the clients they brought in, plus rolled-up
 * invoice totals (billed / collected / due) for that group.
 *
 * This is what lets the Invoicing screen answer: "which clients came
 * through referrer X, and how much have we billed/collected for them?" —
 * useful for tracking referral commissions.
 *
 * Data comes from GET /invoices/referral-summary, which groups by the
 * `referred_by` field already stored on each client.
 *
 * Props:
 *   open    — boolean
 *   onClose — () => void
 *   isDark  — boolean
 */

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Share2, Users, IndianRupee, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';

function money(v) {
  return `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function ReferralSummaryDialog({ open, onClose, isDark }) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/invoices/referral-summary');
        if (!cancelled) setGroups(res.data?.groups || []);
      } catch (err) {
        console.error('Failed to load referral summary:', err);
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const toggle = (key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`max-w-2xl max-h-[85vh] overflow-y-auto ${isDark ? 'bg-slate-800 text-slate-100' : ''}`}>
        <DialogTitle className="flex items-center gap-2">
          <Share2 className="h-4.5 w-4.5" /> Clients by Referrer
        </DialogTitle>
        <DialogDescription className={isDark ? 'text-slate-400' : ''}>
          Every client grouped by who referred them, with total billed, collected, and due — so referral payouts can be tracked from Invoicing.
        </DialogDescription>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : groups.length === 0 ? (
          <p className={`text-sm text-center py-10 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            No invoices yet — referral grouping will appear once clients and invoices exist.
          </p>
        ) : (
          <div className="space-y-2.5 mt-2">
            {groups.map((g) => {
              const key = g.referrer || '__unreferred__';
              const isOpen = expanded.has(key);
              return (
                <div key={key} className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <button
                    onClick={() => toggle(key)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold truncate ${g.is_unreferred ? 'italic text-slate-400' : (isDark ? 'text-slate-100' : 'text-slate-800')}`}>
                        {g.is_unreferred ? 'No referrer recorded' : g.referrer}
                      </p>
                      <p className={`text-[11px] flex items-center gap-1 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <Users className="h-3 w-3" /> {g.client_count} client{g.client_count !== 1 ? 's' : ''} · {g.invoice_count} invoice{g.invoice_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-blue-600 flex items-center gap-0.5 justify-end">
                        <IndianRupee className="h-3 w-3" />{money(g.total_invoiced).replace('₹', '')}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-semibold">{money(g.total_collected)} collected</p>
                      {g.total_due > 0 && <p className="text-[10px] text-red-500 font-semibold">{money(g.total_due)} due</p>}
                    </div>
                  </button>
                  {isOpen && (
                    <div className={`px-4 pb-3 pt-1 border-t ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50/60'}`}>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {g.clients.map((c) => (
                          <span
                            key={c.id || c.company_name}
                            className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-white border border-slate-200 text-slate-600'}`}
                          >
                            {c.company_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
