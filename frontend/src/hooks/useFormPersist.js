/**
 * useFormPersist
 * Persists form state in localStorage so:
 * 1. Minimising / switching tabs never loses entered data.
 * 2. Accidentally closing the browser restores the draft on next visit.
 *
 * Usage:
 *   const [form, setForm, clearPersistedForm] = useFormPersist('add_client_form', initialState);
 *
 * Call clearPersistedForm() after a successful submit to wipe the draft.
 */

import { useState, useEffect, useRef } from 'react';

export function useFormPersist(storageKey, initialState) {
  const [form, setFormState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with initialState so new fields added later still get defaults
        return { ...initialState, ...parsed };
      }
    } catch {
      // ignore parse errors
    }
    return initialState;
  });

  // Write to localStorage whenever form changes, but debounce to avoid
  // hammering storage on every keystroke.
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form));
      } catch {
        // quota exceeded — ignore
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [form, storageKey]);

  const setForm = (updater) => {
    setFormState((prev) =>
      typeof updater === 'function' ? updater(prev) : updater
    );
  };

  const clearPersistedForm = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setFormState(initialState);
  };

  return [form, setForm, clearPersistedForm];
}
