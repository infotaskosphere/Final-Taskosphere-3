/**
 * MinimizedFormsContext.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Lets ANY create/edit form in the app be "minimized" instead of closed.
 *
 * Problem this solves:
 *   You're halfway through "Create New Task" and realise you need to
 *   check something on the Clients page (or create a client first).
 *   Closing the dialog throws your half-filled form away. This context
 *   lets you shrink it to a small pill in a persistent dock, go do the
 *   other work on any other page, then click the pill to reopen the
 *   form exactly as you left it — including which page it belongs to.
 *
 * Design:
 *   - `forms`: the list of minimized "chips" shown in the dock. Each one
 *     is a lightweight, JSON-serializable snapshot: { key, title,
 *     subtitle, path, icon, data, minimizedAt }.
 *   - `pendingRestore`: a transient map used to hand a chip's `data`
 *     back to the page that owns it. A page reads this via the
 *     `useFormMinimizer` hook (see hooks/useFormMinimizer.js).
 *   - Minimized forms are mirrored into sessionStorage, so an accidental
 *     tab refresh doesn't wipe out unsaved work either. Entries older
 *     than MAX_AGE_MS are dropped on load so the dock never fills up
 *     with stale, forgotten forms.
 *   - Multiple forms — even several of the same type (e.g. two tasks
 *     being edited at once) — can be minimized simultaneously as long
 *     as each is given a distinct `formKey` (see hook doc for the
 *     recommended `type-recordId` convention).
 *
 * This provider must be mounted once near the app root, OUTSIDE the
 * router's route-switching area (see App.jsx), so it — and the dock it
 * powers — survive page navigation.
 */
import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'taskosphere_minimized_forms_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // auto-expire forgotten forms after 24h

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((f) => f && typeof f.key === 'string' && (now - (f.minimizedAt || 0)) < MAX_AGE_MS);
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Data contained something non-serializable (e.g. a File object) —
    // the chip still works for this tab session, it just won't survive
    // a hard refresh. Not fatal, so we swallow the error.
  }
}

const Ctx = createContext(null);

export function MinimizedFormsProvider({ children }) {
  const [forms, setForms] = useState(loadPersisted);
  const [pendingRestore, setPendingRestore] = useState({});
  const navigate = useNavigate();

  useEffect(() => { persist(forms); }, [forms]);

  /** Shrink a form to a dock chip. Calling again with the same `key`
   *  updates that chip in place (e.g. title changed) instead of
   *  duplicating it. */
  const minimizeForm = useCallback(({ key, title, subtitle, path, icon, data }) => {
    setForms((prev) => {
      const others = prev.filter((f) => f.key !== key);
      return [
        ...others,
        {
          key,
          title: title || 'Untitled form',
          subtitle: subtitle || '',
          path: path || window.location.pathname,
          icon: icon || 'FileEdit',
          data,
          minimizedAt: Date.now(),
        },
      ];
    });
  }, []);

  /** Bring a chip back. Navigates to the page that owns it (if we're
   *  not already there) and hands its snapshot back via pendingRestore,
   *  which the owning page consumes through useFormMinimizer. */
  const restoreForm = useCallback((key) => {
    setForms((prev) => {
      const target = prev.find((f) => f.key === key);
      if (!target) return prev;
      setPendingRestore((pr) => ({ ...pr, [key]: { data: target.data, restoredAt: Date.now() } }));
      if (target.path && target.path !== window.location.pathname) {
        navigate(target.path);
      }
      return prev.filter((f) => f.key !== key);
    });
  }, [navigate]);

  /** Discard a minimized form permanently, without reopening it. */
  const discardForm = useCallback((key) => {
    setForms((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const discardAll = useCallback(() => setForms([]), []);

  /** Called by the owning page once it has applied a restored snapshot. */
  const clearRestore = useCallback((key) => {
    setPendingRestore((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const isMinimized = useCallback((key) => forms.some((f) => f.key === key), [forms]);

  const value = {
    forms, pendingRestore, minimizeForm, restoreForm, discardForm, discardAll, clearRestore, isMinimized,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMinimizedForms() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe no-op fallback so consumers don't crash if the provider is
    // ever missing (e.g. isolated component tests).
    return {
      forms: [],
      pendingRestore: {},
      minimizeForm: () => {},
      restoreForm: () => {},
      discardForm: () => {},
      discardAll: () => {},
      clearRestore: () => {},
      isMinimized: () => false,
    };
  }
  return ctx;
}

/**
 * useFormMinimizer — the hook individual forms actually use.
 *
 * Example (inside a page component that already has `formData`,
 * `setFormData`, `dialogOpen`, `setDialogOpen`, `editingTask`):
 *
 *   const { minimize } = useFormMinimizer({
 *     formKey: editingTask ? `create-task-${editingTask.id}` : 'create-task-new',
 *     title: formData.title ? `Task: ${formData.title}` : 'New Task',
 *     subtitle: editingTask ? 'Editing' : 'Creating',
 *     path: '/tasks',
 *     icon: 'ClipboardList',
 *     data: { formData, editingTaskId: editingTask?.id || null },
 *     onRestore: (data) => {
 *       setFormData(data.formData);
 *       setEditingTask(data.editingTaskId ? tasks.find(t => t.id === data.editingTaskId) : null);
 *       setDialogOpen(true);
 *     },
 *   });
 *
 *   // In the dialog header, next to the built-in close (X) button:
 *   <button onClick={() => { minimize(); setDialogOpen(false); }}>
 *     <Minimize2 className="h-4 w-4" />
 *   </button>
 *
 * `formKey` should be unique per in-progress form. Use a stable key
 * like `create-task-new` for the "new" form and `create-task-<id>` per
 * record being edited, so several edits can be minimized at once.
 */
export function useFormMinimizer({ formKey, title, subtitle, path, icon, data, onRestore }) {
  const { pendingRestore, minimizeForm, clearRestore, isMinimized } = useMinimizedForms();
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const dataRef = useRef(data);
  dataRef.current = data;
  const metaRef = useRef({ title, subtitle, path, icon });
  metaRef.current = { title, subtitle, path, icon };

  useEffect(() => {
    const pending = pendingRestore[formKey];
    if (pending) {
      onRestoreRef.current?.(pending.data);
      clearRestore(formKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, pendingRestore[formKey]]);

  const minimize = useCallback(() => {
    const m = metaRef.current;
    minimizeForm({ key: formKey, title: m.title, subtitle: m.subtitle, path: m.path, icon: m.icon, data: dataRef.current });
  }, [formKey, minimizeForm]);

  return { minimize, isMinimized: isMinimized(formKey) };
}
