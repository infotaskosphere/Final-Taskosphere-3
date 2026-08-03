import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

/**
 * SearchableSelect — drop-in replacement for a native <select> that lets the
 * user type to filter options (by initials or any substring), not just jump
 * to the first match. Works with any {value, label} option list, so it's
 * safe to use for clients/companies or anything else.
 *
 * Props:
 *  - options: [{ value, label, sublabel? }]   (sublabel renders faded, e.g. phone/GSTIN)
 *  - value: currently selected value
 *  - onChange: (value, option) => void
 *  - placeholder: string shown when nothing selected
 *  - isDark: bool — matches the app's existing dark-mode styling convention
 *  - disabled: bool
 *  - allowClear: bool — show an "x" to clear selection
 *  - loading: bool — shows "Loading…" row (useful when options are fetched async)
 *  - emptyText: string — shown when filter matches nothing
 *  - className: extra classes for the trigger button
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  isDark = false,
  disabled = false,
  allowClear = false,
  loading = false,
  emptyText = 'No matches',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        String(o.label || '').toLowerCase().includes(q) ||
        String(o.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commit = (opt) => {
    onChange?.(opt.value, opt);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) commit(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const border = isDark ? 'border-slate-700' : 'border-slate-300';
  const bg = isDark ? 'bg-slate-950' : 'bg-white';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-slate-500' : 'text-slate-400';
  const hoverBg = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100';
  const highlightBg = isDark ? 'bg-slate-800' : 'bg-slate-100';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-left ${border} ${bg} ${text} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      >
        <span className={`truncate ${!selected ? muted : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled && (
            <X
              className={`h-3.5 w-3.5 ${muted} hover:opacity-80`}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.('', null);
              }}
            />
          )}
          <ChevronDown className={`h-4 w-4 ${muted}`} />
        </span>
      </button>

      {open && !disabled && (
        <div
          className={`absolute z-50 mt-1 w-full rounded-lg border shadow-lg ${border} ${bg}`}
        >
          <div className={`flex items-center gap-2 border-b px-2.5 py-2 ${border}`}>
            <Search className={`h-3.5 w-3.5 shrink-0 ${muted}`} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search…"
              className={`w-full bg-transparent text-sm outline-none ${text} placeholder:${muted}`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className={`px-3 py-2 text-sm ${muted}`}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div className={`px-3 py-2 text-sm ${muted}`}>{emptyText}</div>
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={opt.value}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commit(opt)}
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer ${
                    i === highlight ? highlightBg : ''
                  } ${hoverBg} ${text}`}
                >
                  <span className="truncate">
                    {opt.label}
                    {opt.sublabel && (
                      <span className={`ml-1.5 text-xs ${muted}`}>{opt.sublabel}</span>
                    )}
                  </span>
                  {String(opt.value) === String(value) && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
