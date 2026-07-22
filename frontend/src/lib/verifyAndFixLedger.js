import api from '@/lib/api';

/**
 * Re-syncs every invoice/bill/payment into the ledger and runs the
 * consistency engine (Revenue=Collections+Outstanding, TB Debits=Credits,
 * AR=Outstanding, Customer Ledger=AR, Sales Ledger=Invoice Revenue,
 * GST+NonGST+Export+Exempt=Revenue, Bank GL=Real Balance).
 *
 * Mirrors backend/accounting_ai/reconciliation_validator.py::run_validation_engine
 * via GET /reports/validation-engine.
 *
 * @param {string} companyId - pass '' to run across every book (all companies).
 * @returns {Promise<object>} validation report (or { books: [...] } when companyId is '').
 */
export async function runVerifyAndFix(companyId = '') {
  const { data } = await api.get('/reports/validation-engine', {
    params: companyId ? { company_id: companyId } : {},
  });
  return data;
}

/**
 * Turns a validation report (or { books: [...] } for the all-companies
 * variant) into a toast-friendly { variant, title, text } triple.
 */
export function describeValidationResult(summary) {
  const reports = Array.isArray(summary?.books) ? summary.books : [summary];
  const allMismatches = reports.flatMap((r) => r?.mismatches || []);
  const anyHealed = reports.some((r) => r?.healed_by_rebuild);
  const allPassed = reports.every((r) => r?.passed);

  if (allPassed) {
    return {
      variant: 'success',
      title: 'Ledger verified',
      text: anyHealed
        ? 'Everything re-synced cleanly and all checks now pass.'
        : 'All consistency checks passed — no discrepancies found.',
    };
  }

  const ruleNames = [...new Set(allMismatches.map((m) => m.rule))];
  const preview = ruleNames.slice(0, 2).join('; ');
  const more = ruleNames.length > 2 ? ` (+${ruleNames.length - 2} more)` : '';

  return {
    variant: 'warning',
    title: anyHealed ? 'Some issues fixed, some remain' : 'Discrepancies found',
    text: `${allMismatches.length} mismatch${allMismatches.length === 1 ? '' : 'es'} in: ${preview}${more}.`,
  };
}
