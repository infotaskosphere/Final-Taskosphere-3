/**
 * BulkWASenderContext.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Runs bulk-WhatsApp send jobs OUTSIDE of any modal / page component,
 * so navigating between pages (or closing the popup) does NOT stop
 * the send loop.
 *
 * Also owns the floating "minimized" widget state and the batch metadata
 * (batch_id + batch_name) that is stamped onto every message so the
 * WhatsApp History can be grouped by batch.
 *
 * Consumers:
 *   const { startBatch, cancel, state } = useBulkWASender();
 *   startBatch({
 *     batchName: 'Income Tax Reminder',
 *     recipients: [{ id, name, phone, message, media? }],
 *     sessionId,
 *     pauseEnabled, pauseAfterCount, pauseDurationSec,
 *   });
 */
import React, {
  createContext, useContext, useRef, useState, useCallback,
} from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';

const Ctx = createContext(null);

const initialState = {
  active: false,          // a job is currently running
  minimized: false,       // widget minimized to corner
  visible: false,         // widget mounted on screen
  batchId: null,
  batchName: '',
  sessionId: null,
  total: 0,
  done: 0,
  results: [],            // [{ id, name, phone, status, error }]
  pauseCountdown: null,   // seconds remaining during auto-pause, else null
  startedAt: null,
  finishedAt: null,
};

function newBatchId() {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits;
}

export function BulkWASenderProvider({ children }) {
  const [state, setState] = useState(initialState);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);

  const patch = useCallback((p) => setState(s => ({ ...s, ...p })), []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    patch({ pauseCountdown: null });
  }, [patch]);

  const dismiss = useCallback(() => {
    if (runningRef.current) return; // don't dismiss while running
    setState(initialState);
  }, []);

  const minimize = useCallback(() => patch({ minimized: true }), [patch]);
  const expand = useCallback(() => patch({ minimized: false }), [patch]);

  const startBatch = useCallback(async ({
    batchName,
    recipients,
    sessionId = null,
    pauseEnabled = false,
    pauseAfterCount = 10,
    pauseDurationSec = 60,
    messageType = 'bulk_client',
  }) => {
    if (runningRef.current) {
      toast.error('A WhatsApp batch is already running. Please wait or cancel it.');
      return;
    }
    const list = (recipients || []).filter(r => r && r.phone && (r.message || r.media));
    if (list.length === 0) {
      toast.error('No recipients with a phone number and message.');
      return;
    }

    const batchId = newBatchId();
    const name = (batchName || '').trim() || `Batch ${new Date().toLocaleString('en-IN')}`;

    runningRef.current = true;
    cancelRef.current = false;

    setState({
      ...initialState,
      active: true,
      visible: true,
      minimized: true, // start minimized so user can keep working
      batchId,
      batchName: name,
      sessionId,
      total: list.length,
      done: 0,
      results: [],
      startedAt: new Date().toISOString(),
    });

    toast.success(`Batch "${name}" started — ${list.length} messages. Sending in background.`);

    const results = [];

    for (let i = 0; i < list.length; i++) {
      if (cancelRef.current) break;
      const r = list[i];
      const to = normalizePhone(r.phone);
      const contextId = r.id || null;
      let status = 'sent';
      let errorMsg = null;

      try {
        if (r.message && r.message.trim()) {
          await api.post('/whatsapp/send', {
            to,
            message: r.message,
            message_type: messageType,
            context_id: contextId,
            session_id: sessionId || undefined,
            batch_id: batchId,
            batch_name: name,
          });
        }
        if (r.media) {
          await api.post('/whatsapp/send-media', {
            to,
            caption: !r.message?.trim() ? `Dear ${r.name || 'Client'},` : undefined,
            base64: r.media.base64,
            mime_type: r.media.mimeType,
            filename: r.media.name,
            message_type: messageType,
            context_id: contextId,
            session_id: sessionId || undefined,
            batch_id: batchId,
            batch_name: name,
          });
        }
      } catch (err) {
        status = 'failed';
        errorMsg = err?.response?.data?.detail || err?.message || 'Failed';
      }

      results.push({
        id: contextId, name: r.name, phone: to, status, error: errorMsg,
      });

      setState(s => ({
        ...s,
        done: i + 1,
        results: [...results],
      }));

      // Auto-pause between chunks
      const isLast = i === list.length - 1;
      if (pauseEnabled && !isLast && (i + 1) % pauseAfterCount === 0) {
        let remaining = pauseDurationSec;
        setState(s => ({ ...s, pauseCountdown: remaining }));
        await new Promise((resolve) => {
          const tick = setInterval(() => {
            if (cancelRef.current) { clearInterval(tick); resolve(); return; }
            remaining -= 1;
            if (remaining <= 0) {
              clearInterval(tick);
              setState(s => ({ ...s, pauseCountdown: null }));
              resolve();
            } else {
              setState(s => ({ ...s, pauseCountdown: remaining }));
            }
          }, 1000);
        });
      }
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    const failCount = results.filter(r => r.status === 'failed').length;
    const aborted = cancelRef.current;

    setState(s => ({
      ...s,
      active: false,
      pauseCountdown: null,
      finishedAt: new Date().toISOString(),
    }));
    runningRef.current = false;
    cancelRef.current = false;

    if (aborted) {
      toast.warning(`Batch "${name}" cancelled — ${sentCount} sent, ${failCount} failed.`);
    } else {
      toast.success(`Batch "${name}" complete — ${sentCount} sent${failCount ? `, ${failCount} failed` : ''}.`);
    }
  }, []);

  const value = {
    state,
    startBatch,
    cancel,
    dismiss,
    minimize,
    expand,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBulkWASender() {
  const v = useContext(Ctx);
  if (!v) {
    // Safe no-op fallback so a component can `useBulkWASender()` even if the
    // provider isn't mounted (e.g. during isolated tests). Real usage should
    // always have the provider at the app root.
    return {
      state: initialState,
      startBatch: async () => { toast.error('Bulk WA sender not initialized'); },
      cancel: () => {},
      dismiss: () => {},
      minimize: () => {},
      expand: () => {},
    };
  }
  return v;
}
