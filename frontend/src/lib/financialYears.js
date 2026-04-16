/**
 * financialYears.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Modular, auto-generating Indian Financial Year utility.
 *
 * Indian FY runs April 1 → March 31.
 * e.g. "2024-25" → from: 2024-04-01, to: 2025-03-31
 *
 * HOW TO ADD A NEW YEAR: Just change START_YEAR or END_YEAR below — the list
 * auto-generates. No other edits needed anywhere in the codebase.
 *
 * Usage:
 *   import { FY_OPTIONS, FY_STRINGS, getFYOption, getCurrentFY } from '@/lib/financialYears';
 */

// ── Config ────────────────────────────────────────────────────────────────────
/** Earliest financial year to include (e.g. 2018 → "2018-19") */
const START_YEAR = 2018;

/**
 * Latest financial year to include.
 * Set to null to auto-detect from current date (always includes current + 1 ahead).
 */
const END_YEAR = null;

// ── Generator ─────────────────────────────────────────────────────────────────
function buildFYList() {
  const now  = new Date();
  const year = now.getMonth() >= 3          // April = month 3 (0-indexed)
    ? now.getFullYear()
    : now.getFullYear() - 1;

  // End at current year + 1 (so "next year" is always selectable for planning)
  const end = END_YEAR !== null ? END_YEAR : year + 1;

  const list = [];
  for (let y = end; y >= START_YEAR; y--) {
    const startYear = y;
    const endYear   = y + 1;
    const label     = `${startYear}-${String(endYear).slice(-2)}`;
    list.push({
      label,                                 // "2024-25"
      from:  `${startYear}-04-01`,           // "2024-04-01"
      to:    `${endYear}-03-31`,             // "2025-03-31"
      startYear,
      endYear,
    });
  }
  return list;
}

/** Full array of FY option objects — newest first */
export const FY_OPTIONS = buildFYList();

/** Just the label strings — ["2025-26", "2024-25", ...] */
export const FY_STRINGS = FY_OPTIONS.map(o => o.label);

/** Look up a FY option object by label string */
export function getFYOption(label) {
  return FY_OPTIONS.find(o => o.label === label) ?? FY_OPTIONS[0];
}

/** Return the option for the currently-running financial year */
export function getCurrentFY() {
  const now  = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const label = `${year}-${String(year + 1).slice(-2)}`;
  return getFYOption(label);
}
