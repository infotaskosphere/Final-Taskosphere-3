/**
 * FinancialYearSelect.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A dropdown selector for Indian Financial Years (e.g. "2024-25").
 *
 * Props:
 *   value    {string}   – currently selected FY label, e.g. "2024-25"
 *   onChange {function} – called with the full FY option object when selection changes
 */

import React from 'react';
import { FY_OPTIONS, getFYOption } from '@/lib/financialYears';

export default function FinancialYearSelect({ value, onChange }) {
  const handleChange = (e) => {
    const option = getFYOption(e.target.value);
    if (onChange) onChange(option);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className="
        px-3 py-2 rounded-xl text-sm font-medium
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700
        text-gray-700 dark:text-gray-200
        hover:bg-gray-50 dark:hover:bg-gray-700
        focus:outline-none focus:ring-2 focus:ring-blue-500
        transition cursor-pointer
      "
      aria-label="Select Financial Year"
    >
      {FY_OPTIONS.map((fy) => (
        <option key={fy.label} value={fy.label}>
          FY {fy.label}
        </option>
      ))}
    </select>
  );
}
