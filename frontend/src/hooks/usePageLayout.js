import { useState, useCallback } from 'react';

/**
 * usePageLayout
 * -------------
 * Stores and manages section + card order for any page.
 * Layout changes persist to localStorage across refreshes.
 *
 * @param {string}   pageKey       - Unique key for this page (e.g. 'dashboard')
 * @param {string[]} defaultOrder  - Default array of section IDs
 *
 * Returns: { order, moveSection, resetOrder, cardOrders, moveCard, resetCards }
 */
export function usePageLayout(pageKey, defaultOrder) {
  const sectionKey = `page_layout_${pageKey}_v1`;
  const cardKey    = `page_layout_${pageKey}_cards_v1`;

  /* ── Section order ──────────────────────────────────────────────── */
  const [order, setOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(sectionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Keep only valid IDs, append any new sections at end
        const valid   = parsed.filter(id => defaultOrder.includes(id));
        const missing = defaultOrder.filter(id => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return [...defaultOrder];
  });

  /** Move section from one index to another */
  const moveSection = useCallback((fromIndex, toIndex) => {
    setOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      try { localStorage.setItem(sectionKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [sectionKey]);

  /** Reset sections to default order */
  const resetOrder = useCallback(() => {
    try { localStorage.removeItem(sectionKey); } catch { /* ignore */ }
    setOrder([...defaultOrder]);
  }, [sectionKey, defaultOrder]);

  /* ── Card order (per section) ───────────────────────────────────── */
  const [cardOrders, setCardOrders] = useState(() => {
    try {
      const saved = localStorage.getItem(cardKey);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });

  /**
   * Move a card within its section or to another section.
   * @param {string}   sectionId    - Source section
   * @param {number}   fromIndex    - Card's current index
   * @param {number}   toIndex      - Card's new index
   * @param {string[]} sectionCards - Current card IDs for this section
   * @param {string}  [destSection] - Destination section (optional, defaults to sectionId)
   * @param {string[]} [destCards]  - Current card IDs for destination section (if cross-section)
   */
  const moveCard = useCallback((
    sectionId,
    fromIndex,
    toIndex,
    sectionCards,
    destSection = null,
    destCards   = null,
  ) => {
    setCardOrders(prev => {
      const next = { ...prev };
      const srcCards = [...(next[sectionId] || sectionCards)];
      const target   = destSection && destSection !== sectionId ? destSection : sectionId;

      if (!destSection || destSection === sectionId) {
        // Same-section reorder
        const [moved] = srcCards.splice(fromIndex, 1);
        srcCards.splice(toIndex, 0, moved);
        next[sectionId] = srcCards;
      } else {
        // Cross-section move
        const [moved]  = srcCards.splice(fromIndex, 1);
        const dstCards = [...(next[target] || destCards || [])];
        dstCards.splice(toIndex, 0, moved);
        next[sectionId] = srcCards;
        next[target]    = dstCards;
      }

      try { localStorage.setItem(cardKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [cardKey]);

  /**
   * Get the ordered card IDs for a section.
   * Falls back to the provided default array if no custom order is saved.
   */
  const getSectionCardOrder = useCallback((sectionId, defaultCards = []) => {
    const saved = cardOrders[sectionId];
    if (!saved) return defaultCards;
    // Keep only valid IDs, append any new cards at end
    const valid   = saved.filter(id => defaultCards.includes(id));
    const missing = defaultCards.filter(id => !valid.includes(id));
    return [...valid, ...missing];
  }, [cardOrders]);

  /** Reset all card orders to defaults */
  const resetCards = useCallback(() => {
    try { localStorage.removeItem(cardKey); } catch { /* ignore */ }
    setCardOrders({});
  }, [cardKey]);

  /** Reset everything (sections + cards) */
  const resetAll = useCallback(() => {
    resetOrder();
    resetCards();
  }, [resetOrder, resetCards]);

  return {
    order,
    moveSection,
    resetOrder,
    cardOrders,
    moveCard,
    getSectionCardOrder,
    resetCards,
    resetAll,
  };
}
