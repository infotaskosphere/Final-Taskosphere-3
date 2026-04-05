import { useState } from 'react';

/**
 * usePageLayout
 * Stores and manages section order for any page.
 * Order is saved to localStorage so it persists across page refreshes.
 *
 * @param {string} pageKey       - Unique key for this page (e.g. 'dashboard', 'reports')
 * @param {string[]} defaultOrder - Array of section IDs in default order
 */
export function usePageLayout(pageKey, defaultOrder) {
  const storageKey = `page_layout_${pageKey}_v1`;

  const [order, setOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Keep only valid IDs, append any new sections at end
        const valid   = parsed.filter(id => defaultOrder.includes(id));
        const missing = defaultOrder.filter(id => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch {}
    return [...defaultOrder];
  });

  /** Move section from one index to another */
  const moveSection = (fromIndex, toIndex) => {
    setOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  /** Reset to default order */
  const resetOrder = () => {
    try { localStorage.removeItem(storageKey); } catch {}
    setOrder([...defaultOrder]);
  };

  return { order, moveSection, resetOrder };
}
