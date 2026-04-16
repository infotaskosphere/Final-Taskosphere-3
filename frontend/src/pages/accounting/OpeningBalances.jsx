import React, { useState, useEffect, useCallback } from 'react';
import { useDark } from '@/hooks/useDark';
import api from '@/lib/api';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Search, RefreshCw, Scale, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const COLORS = { mediumBlue: '#1F6FB2', emerald: '#1FAF5A', coral: '#EF4444', amber: '#F59E0B', purple: '#7C3AED' };
const card = 'rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm';

const TYPE_COLORS = {
  Asset: '#1F6FB2', Liability: '#F59E0B', Capital: '#7C3AED', Revenue: '#1FAF5A', Expense: '#EF4444',
};
const TYPES = ['Asset', 'Liability', 'Capital', 'Revenue', 'Expense'];

const fmt = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

export default function OpeningBalances() {
  const dark = useDark();
  const [accounts, setAccounts]   = useState([]);
  const [balances, setBalances]   = useState({});   // { code: value }
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [search,   setSearch]     = useState('');
  const [expanded, setExpanded]   = useState({});
  const [saved,    setSaved]      = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/accounting/accounts');
      const list = r.data || [];
      setAccounts(list);
      // Seed local balances from existing opening_balance values
      const init = {};
      list.forEach(a => { init[a.code] = a.opening_balance ?? 0; });
      setBalances(init);
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleChange = (code, val) => {
    setBalances(prev => ({ ...prev, [code]: parseFloat(val) || 0 }));
    setSaved(false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Build payload: array of { code, opening_balance }
      const payload = Object.entries(balances).map(([code, opening_balance]) => ({ code, opening_balance }));
      await api.post('/api/accounting/opening-balances', payload);
      toast.success('Opening balances saved successfully');
      setSaved(true);
      fetchAccounts();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save opening balances');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const filtered = accounts.filter(a => {
    if (!search) return true;
    return a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase());
  });

  const grouped = TYPES.reduce((acc, t) => {
    acc[t] = filtered.filter(a => a.type === t);
    return acc;
  }, {});

  // Dr-side: Assets + Expenses  /  Cr-side: Liabilities + Capital + Revenue
  const totalDebit  = accounts
    .filter(a => ['Asset', 'Expense'].includes(a.type))
    .reduce((s, a) => s + (balances[a.code] || 0), 0);
  const totalCredit = accounts
    .filter(a => ['Liability', 'Capital', 'Revenue'].includes(a.type))
    .reduce((s, a) => s + (balances[a.code] || 0), 0);
  const difference  = totalDebit - totalCredit;
  const balanced    = Math.abs(difference) < 0.01;

  return (
    <div className="p-4 md:p-6 min-h-screen" style={{ background: dark ? '#0f172a' : '#f1f5f9' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Scale size={22} style={{ color: COLORS.mediumBlue }} /> Opening Balances
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Set opening balances for all accounts at the start of the financial year
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
          style={{ background: COLORS.mediumBlue }}
        >
          {saving
            ? <RefreshCw size={14} className="animate-spin" />
            : saved
              ? <CheckCircle size={14} />
              : <Save size={14} />}
          {saving ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Debit (Dr)',  value: totalDebit,  color: COLORS.mediumBlue },
          { label: 'Total Credit (Cr)', value: totalCredit, color: COLORS.amber },
          {
            label: balanced ? 'Balanced ✓' : `Difference`,
            value: Math.abs(difference),
            color: balanced ? COLORS.emerald : COLORS.coral,
          },
        ].map(({ label, value, color }) => (
          <div key={label} className={`${card} p-4 text-center`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="text-lg font-bold" style={{ color }}>₹{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Balance-mismatch warning */}
      <AnimatePresence>
        {!balanced && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 mb-4 p-3 rounded-xl text-sm"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: COLORS.coral }}
          >
            <AlertCircle size={15} />
            Trial balance is out of balance by ₹{fmt(Math.abs(difference))}. Please adjust entries.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <div className="relative mb-4 w-64">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search account…"
          className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-white w-full"
        />
      </div>

      {/* Account Groups */}
      {loading ? (
        <div className={`${card} p-8 text-center text-gray-400 text-sm`}>Loading accounts…</div>
      ) : (
        <div className="space-y-3">
          {TYPES.map(type => {
            const accs  = grouped[type] || [];
            if (accs.length === 0) return null;
            const isOpen = expanded[type] !== false;
            const total  = accs.reduce((s, a) => s + (balances[a.code] || 0), 0);

            return (
              <div key={type} className={card}>
                {/* Group Header */}
                <button
                  className="w-full flex items-center justify-between p-4"
                  onClick={() => setExpanded(e => ({ ...e, [type]: !isOpen }))}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[type] }} />
                    <span className="font-semibold text-gray-800 dark:text-white text-sm">{type}</span>
                    <span className="text-xs text-gray-400">({accs.length})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Total: ₹{fmt(total)}
                    </span>
                    {isOpen
                      ? <ChevronUp size={14} className="text-gray-400" />
                      : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </button>

                {/* Rows */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-gray-100 dark:border-gray-800">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase tracking-wide">
                              <th className="text-left px-4 py-2">Code</th>
                              <th className="text-left px-4 py-2">Account Name</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Sub Type</th>
                              <th className="text-left px-4 py-2 hidden md:table-cell">Dr/Cr</th>
                              <th className="text-right px-4 py-2 w-40">Opening Balance (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {accs.map(a => (
                              <tr key={a.code} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                <td className="px-4 py-2 font-mono font-semibold" style={{ color: TYPE_COLORS[a.type] }}>
                                  {a.code}
                                </td>
                                <td className="px-4 py-2 text-gray-800 dark:text-white font-medium">{a.name}</td>
                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                  {a.sub_type}
                                </td>
                                <td className="px-4 py-2 hidden md:table-cell">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    a.normal_balance === 'Dr'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  }`}>
                                    {a.normal_balance || 'Dr'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={balances[a.code] ?? 0}
                                    onChange={e => handleChange(a.code, e.target.value)}
                                    className="w-36 text-right text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Save Bar */}
      {!loading && accounts.length > 0 && (
        <div className="mt-6 flex items-center justify-between p-4 rounded-2xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            {balanced
              ? <><CheckCircle size={16} style={{ color: COLORS.emerald }} /><span className="text-green-600 dark:text-green-400 font-medium">Trial balance is balanced</span></>
              : <><AlertCircle size={16} style={{ color: COLORS.coral }} /><span className="text-red-500 font-medium">Difference: ₹{fmt(Math.abs(difference))}</span></>}
          </div>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold shadow hover:opacity-90 transition disabled:opacity-50"
            style={{ background: COLORS.mediumBlue }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Opening Balances'}
          </button>
        </div>
      )}
    </div>
  );
}
