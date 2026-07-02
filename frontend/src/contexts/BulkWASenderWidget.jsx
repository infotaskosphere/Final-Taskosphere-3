/**
 * BulkWASenderWidget.jsx
 * ─────────────────────────────────────────────────────────────────────
 * Floating bottom-right widget. Shows the currently-running WA bulk
 * batch and keeps it alive across page navigations. Two visual states:
 *
 *   • minimized  → small pill with progress ring + batch name + cancel
 *   • expanded   → 340px card with full progress list + pause countdown
 *
 * The actual send loop lives in BulkWASenderContext — this component
 * only renders state and provides controls.
 */
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Minimize2, Maximize2, StopCircle, CheckCircle2, AlertCircle, Loader2, Pause,
} from 'lucide-react';
import { useBulkWASender } from '@/components/BulkWASenderContext';

const WA_GREEN = '#25D366';
const WA_DARK  = '#128C7E';

export default function BulkWASenderWidget() {
  const { state, cancel, dismiss, minimize, expand } = useBulkWASender();

  if (!state.visible) return null;

  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const sent = useMemo(() => state.results.filter(r => r.status === 'sent').length, [state.results]);
  const failed = useMemo(() => state.results.filter(r => r.status === 'failed').length, [state.results]);
  const finished = !state.active;

  // ── Minimized pill ──────────────────────────────────────────────────
  if (state.minimized) {
    return (
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 9998,
          background: '#0f172a', color: '#fff',
          borderRadius: 14, padding: '10px 14px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(37,211,102,0.35)',
          display: 'flex', alignItems: 'center', gap: 12, minWidth: 280, maxWidth: 360,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Progress ring */}
        <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
          <svg width="38" height="38" viewBox="0 0 38 38">
            <circle cx="19" cy="19" r="16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
            <circle
              cx="19" cy="19" r="16" fill="none"
              stroke={finished ? (failed ? '#ef4444' : WA_GREEN) : WA_GREEN}
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 100.5} 100.5`}
              transform="rotate(-90 19 19)"
              style={{ transition: 'stroke-dasharray 0.3s' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 10, fontWeight: 800,
          }}>
            {state.pauseCountdown != null
              ? <Pause size={12} color="#fbbf24" />
              : finished
                ? (failed ? <AlertCircle size={14} color="#ef4444" /> : <CheckCircle2 size={14} color={WA_GREEN} />)
                : <span>{pct}%</span>}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {state.batchName}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {state.pauseCountdown != null
              ? `Paused · resumes in ${state.pauseCountdown}s`
              : finished
                ? `${sent} sent${failed ? ` · ${failed} failed` : ''}`
                : `Sending ${state.done}/${state.total} · WhatsApp`}
          </div>
        </div>

        <button
          onClick={expand}
          title="Expand"
          style={{
            width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Maximize2 size={13} />
        </button>

        {finished && (
          <button
            onClick={dismiss}
            title="Close"
            style={{
              width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', color: '#f87171',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <X size={13} />
          </button>
        )}
      </motion.div>
    );
  }

  // ── Expanded card ───────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.96 }}
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 9998,
        background: '#0f172a', color: '#fff',
        borderRadius: 16, width: 360, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(37,211,102,0.35)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        background: `linear-gradient(135deg, ${WA_DARK}, ${WA_GREEN})`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {state.active
            ? <Loader2 size={16} className="animate-spin" />
            : failed ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {state.batchName}
          </div>
          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 1 }}>
            Bulk WhatsApp · Batch
          </div>
        </div>
        <button
          onClick={minimize}
          title="Minimize"
          style={{
            width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Minimize2 size={13} />
        </button>
        {finished && (
          <button
            onClick={dismiss}
            title="Close"
            style={{
              width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
          <span>{state.done} / {state.total} messages</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: failed ? `linear-gradient(90deg, ${WA_GREEN}, #f87171)` : WA_GREEN,
            transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10 }}>
          <span style={{ color: WA_GREEN, fontWeight: 700 }}>✓ {sent} sent</span>
          {failed > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}>✗ {failed} failed</span>}
          {state.pauseCountdown != null && (
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>
              ⏸ Paused · resumes in {state.pauseCountdown}s
            </span>
          )}
        </div>
      </div>

      {/* Results list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        <AnimatePresence initial={false}>
          {state.results.slice().reverse().slice(0, 60).map((r, idx) => (
            <motion.div
              key={`${r.id || r.phone}-${idx}`}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 8,
                fontSize: 11, color: '#cbd5e1',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: r.status === 'sent' ? WA_GREEN : '#ef4444',
              }} />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.name || r.phone}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: r.status === 'sent' ? WA_GREEN : '#f87171',
              }}>
                {r.status === 'sent' ? 'SENT' : 'FAIL'}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {state.results.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 11 }}>
            Preparing to send…
          </div>
        )}
      </div>

      {/* Footer actions */}
      {state.active && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={cancel}
            style={{
              width: '100%', padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', color: '#f87171',
              fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <StopCircle size={14} /> Stop batch
          </button>
        </div>
      )}
    </motion.div>
  );
}
