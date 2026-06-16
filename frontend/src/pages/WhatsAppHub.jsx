/**
 * WhatsAppHub.jsx  —  Unified WhatsApp inbox + Hub management
 *
 * Access model (enforced at route level via Permission guard):
 *   - Admin                           → always visible
 *   - User with can_access_whatsapp_hub → visible
 *   - Others                          → redirected to /dashboard by router
 *
 * Tabs:
 *   Inbox           — unified message thread viewer (all sessions)
 *   Connected Numbers — link / manage WhatsApp sessions (admin only tab)
 *   How It Works    — info
 *
 * NOTE: "Manage Hub Access" has been moved to User Governance (/users).
 *       Grant access there via the can_access_whatsapp_hub permission toggle.
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  MessageCircle, Send, ChevronLeft, Search, RefreshCw,
  CheckCheck, User2, AlertCircle, Phone, Loader2, Filter,
  UserCheck, Trash2, Smartphone, QrCode, Wifi, WifiOff,
  Plus, Pencil, Check, X, Hash, Copy, ShieldCheck, Eye,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext.jsx';

// ─── Brand colours ─────────────────────────────────────────────────────────────
const EMERALD  = '#128C7E';
const GREEN    = '#25D366';
const GRADIENT = `linear-gradient(135deg, ${EMERALD} 0%, ${GREEN} 100%)`;
const GRAD_BTN = `linear-gradient(135deg, ${EMERALD}, ${GREEN})`;

/* ── helpers ──────────────────────────────────────────────────────────────── */
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function avatarColor(jid) {
  const colors = [
    'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  ];
  let hash = 0;
  for (const c of (jid || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

/* ── Status badge ────────────────────────────────────────────────────────────*/
function StatusBadge({ status }) {
  const map = {
    connected:     { label: 'Connected',    color: '#22c55e', bg: '#dcfce7' },
    awaiting_scan: { label: 'Scan QR',      color: '#f59e0b', bg: '#fef3c7' },
    connecting:    { label: 'Connecting…',  color: '#6366f1', bg: '#ede9fe' },
    reconnecting:  { label: 'Reconnecting', color: '#f97316', bg: '#ffedd5' },
    disconnected:  { label: 'Disconnected', color: '#ef4444', bg: '#fee2e2' },
  };
  const s = map[status] || { label: status || 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

/* ── QR Modal ────────────────────────────────────────────────────────────────*/
const QR_POLL_BASE_MS = 6000;
function QRModal({ sessionId, label, onClose, isDark }) {
  const [qr, setQr]         = useState(null);
  const [status, setStatus] = useState('loading');
  const pollRef             = useRef(null);
  const backoffRef          = useRef(QR_POLL_BASE_MS);

  const scheduleNext = useCallback((delayMs) => {
    clearTimeout(pollRef.current);
    pollRef.current = setTimeout(() => fetchQR(), delayMs); // eslint-disable-line
  }, []); // eslint-disable-line

  const fetchQR = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/qr`);
      backoffRef.current = QR_POLL_BASE_MS;
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(pollRef.current); setTimeout(onClose, 1500); return; }
      if (data.qr) { setQr(data.qr); setStatus('ready'); } else { setStatus(data.status || 'waiting'); }
      scheduleNext(QR_POLL_BASE_MS);
    } catch (err) {
      if (err?.response?.status === 429) { backoffRef.current = Math.min(backoffRef.current * 2, 60000); scheduleNext(backoffRef.current); }
      else setStatus('error');
    }
  }, [sessionId, onClose, scheduleNext]);

  useEffect(() => { fetchQR(); return () => clearTimeout(pollRef.current); }, [fetchQR]);

  const card  = isDark ? '#1e293b' : '#fff';
  const muted = isDark ? '#94a3b8' : '#64748b';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: card, borderRadius: 20, padding: 32, maxWidth: 380, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a' }}>Scan QR Code</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: muted }}>{label}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, flexDirection: 'column', gap: 12 }}>
          {status === 'connected' && (<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}><CheckCheck size={56} color='#22c55e' /><p style={{ color: '#22c55e', fontWeight: 700, marginTop: 12 }}>Connected!</p></motion.div>)}
          {status === 'ready' && qr && (<motion.img key={qr} initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={qr} alt='WhatsApp QR' style={{ width: 220, height: 220, borderRadius: 8 }} />)}
          {(status === 'loading' || status === 'connecting' || status === 'waiting') && (
            <div style={{ textAlign: 'center' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw size={36} color={GREEN} /></motion.div>
              <p style={{ color: muted, fontSize: 13, marginTop: 12 }}>{status === 'loading' ? 'Loading QR code…' : 'Waiting for QR code…'}</p>
            </div>
          )}
          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <AlertCircle size={36} color='#ef4444' />
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>Failed to load QR</p>
              <button onClick={fetchQR} style={{ marginTop: 8, background: GRAD_BTN, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Retry</button>
            </div>
          )}
        </div>
        {status === 'ready' && <p style={{ textAlign: 'center', fontSize: 12, color: muted, marginTop: 16, lineHeight: 1.6 }}>Open WhatsApp → Linked Devices → Link a Device → Scan this QR</p>}
        <p style={{ textAlign: 'center', fontSize: 11, color: muted, marginTop: 8 }}>QR refreshes automatically every 6 seconds</p>
      </motion.div>
    </div>
  );
}

/* ── Pair Code Modal ─────────────────────────────────────────────────────────*/
const PAIR_POLL_BASE_MS = 4000;
function PairCodeModal({ sessionId, label, onClose, isDark }) {
  const [code,   setCode]   = useState(null);
  const [status, setStatus] = useState('loading');
  const [copied, setCopied] = useState(false);
  const pollRef             = useRef(null);
  const backoffRef          = useRef(PAIR_POLL_BASE_MS);

  const scheduleNext = useCallback((ms) => { clearTimeout(pollRef.current); pollRef.current = setTimeout(() => fetchCode(), ms); }, []); // eslint-disable-line
  const fetchCode = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/pair-code`);
      backoffRef.current = PAIR_POLL_BASE_MS;
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(pollRef.current); setTimeout(onClose, 1500); return; }
      if (data.code) { setCode(data.code); setStatus('ready'); } else { setStatus(data.status || 'waiting'); }
      scheduleNext(PAIR_POLL_BASE_MS);
    } catch (err) {
      if (err?.response?.status === 429) { backoffRef.current = Math.min(backoffRef.current * 2, 30000); scheduleNext(backoffRef.current); }
      else setStatus('error');
    }
  }, [sessionId, onClose, scheduleNext]);

  useEffect(() => { fetchCode(); return () => clearTimeout(pollRef.current); }, [fetchCode]);
  const handleCopy = () => { if (code) { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const card  = isDark ? '#1e293b' : '#fff';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: card, borderRadius: 20, padding: 32, maxWidth: 400, width: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div><h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a' }}>Phone Pairing Code</h3><p style={{ margin: '4px 0 0', fontSize: 12, color: muted }}>{label}</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius: 16, padding: 24, minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {status === 'connected' && (<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}><CheckCheck size={56} color='#22c55e' /><p style={{ color: '#22c55e', fontWeight: 700, marginTop: 12 }}>Connected!</p></motion.div>)}
          {status === 'ready' && formatted && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}><Hash size={20} color={GREEN} /><span style={{ fontSize: 13, fontWeight: 600, color: muted }}>Your Pairing Code</span></div>
              <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '0.12em', color: isDark ? '#f1f5f9' : '#0f172a', fontFamily: 'monospace', marginBottom: 16 }}>{formatted}</div>
              <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto', background: copied ? '#22c55e22' : GRAD_BTN, color: copied ? '#22c55e' : '#fff', border: copied ? '1.5px solid #22c55e' : 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.2s' }}>
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Code</>}
              </button>
            </motion.div>
          )}
          {(status === 'loading' || status === 'connecting' || status === 'waiting') && (
            <div style={{ textAlign: 'center' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><RefreshCw size={36} color={GREEN} /></motion.div>
              <p style={{ color: muted, fontSize: 13, marginTop: 12 }}>Generating pairing code…</p>
            </div>
          )}
          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <AlertCircle size={36} color='#ef4444' />
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>Failed to get pairing code</p>
              <button onClick={fetchCode} style={{ marginTop: 8, background: GRAD_BTN, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Retry</button>
            </div>
          )}
        </div>
        {status === 'ready' && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 12, color: muted, lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: isDark ? '#e2e8f0' : '#334155' }}>Steps:</strong><br />
              1. Open WhatsApp → Linked Devices → Link a Device<br />
              2. Tap "Link with phone number instead"<br />
              3. Enter your phone number, then type the code above
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Connected Numbers Tab (Hub Settings) ────────────────────────────────────*/
const SESSIONS_POLL_MS = 30000;
function ConnectedNumbersTab({ isDark }) {
  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [newLabel,    setNewLabel]    = useState('');
  const [newPhone,    setNewPhone]    = useState('');
  const [authMode,    setAuthMode]    = useState('qr');
  const [adding,      setAdding]      = useState(false);
  const [qrSession,   setQrSession]   = useState(null);
  const [pairSession, setPairSession] = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editLabel,   setEditLabel]   = useState('');
  const [deletingId,  setDeletingId]  = useState(null);
  const backoffRef = useRef(SESSIONS_POLL_MS);
  const timerRef   = useRef(null);

  const card   = isDark ? 'bg-slate-800 border-slate-700'  : 'bg-white border-slate-200';
  const inner  = isDark ? 'bg-slate-900 border-slate-700'  : 'bg-slate-50 border-slate-200';
  const txt    = isDark ? 'text-slate-100'                  : 'text-slate-800';
  const muted  = isDark ? 'text-slate-400'                  : 'text-slate-500';
  const inputC = ['w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 transition',
                   isDark ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-600' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'].join(' ');

  const fetchSessions = useCallback(async () => {
    if (document.hidden) return;
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/sessions');
      backoffRef.current = SESSIONS_POLL_MS;
      setSessions(data.sessions || []);
    } catch (err) {
      if (err?.response?.status === 429) backoffRef.current = Math.min(backoffRef.current * 2, 120000);
      else toast.error('Could not reach WhatsApp bridge — is wa-bridge running?');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchSessions();
    const schedule = () => { timerRef.current = setTimeout(async () => { await fetchSessions(); schedule(); }, backoffRef.current); };
    schedule();
    const onVis = () => { if (!document.hidden) { clearTimeout(timerRef.current); fetchSessions().then(schedule); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(timerRef.current); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchSessions]);

  const handleAddSession = async () => {
    if (!newLabel.trim()) { toast.error('Enter a label for this number'); return; }
    if (authMode === 'phone' && !newPhone.trim()) { toast.error('Enter the phone number with country code'); return; }
    setAdding(true);
    try {
      const payload = { label: newLabel.trim() };
      if (authMode === 'phone') payload.pairing_phone = newPhone.replace(/\D/g, '');
      const { data } = await api.post('/whatsapp/sessions', payload);
      toast.success(authMode === 'phone' ? 'Session started — get your pairing code!' : 'Session started — scan the QR code!');
      setNewLabel(''); setNewPhone('');
      await fetchSessions();
      if (authMode === 'phone') setPairSession({ sessionId: data.sessionId, label: data.label || newLabel });
      else                      setQrSession(  { sessionId: data.sessionId, label: data.label || newLabel });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to start session'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (sessionId) => {
    setDeletingId(sessionId);
    try {
      await api.delete(`/whatsapp/sessions/${sessionId}`);
      toast.success('WhatsApp number disconnected');
      await fetchSessions();
    } catch { toast.error('Failed to remove session'); }
    finally { setDeletingId(null); }
  };

  const handleSaveLabel = async (sessionId) => {
    try {
      await api.patch(`/whatsapp/sessions/${sessionId}/label`, { label: editLabel });
      setEditingId(null);
      await fetchSessions();
    } catch { toast.error('Failed to update label'); }
  };

  const connectedCount = sessions.filter(s => s.status === 'connected').length;

  return (
    <div className="space-y-4">
      {qrSession   && <QRModal       sessionId={qrSession.sessionId}   label={qrSession.label}   isDark={isDark} onClose={() => { setQrSession(null);   fetchSessions(); }} />}
      {pairSession && <PairCodeModal sessionId={pairSession.sessionId} label={pairSession.label} isDark={isDark} onClose={() => { setPairSession(null); fetchSessions(); }} />}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Connected',    value: connectedCount,                                         color: '#22c55e' },
          { label: 'Total Linked', value: sessions.length,                                        color: GREEN },
          { label: 'Pending',      value: sessions.filter(s => s.status !== 'connected').length,  color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 text-center ${card}`}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div className={`text-xs mt-1 ${muted}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Add new number */}
      <div className={`rounded-2xl border shadow-sm p-5 ${card}`}>
        <div className="flex items-center gap-2 mb-4">
          <Plus size={16} className="text-emerald-500" />
          <span className={`text-sm font-bold ${txt}`}>Add WhatsApp Number</span>
        </div>
        <div className={`flex gap-1 p-1 rounded-xl mb-4 ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`} style={{ width: 'fit-content' }}>
          {[{ id: 'qr', label: 'QR Code', icon: QrCode }, { id: 'phone', label: 'Phone Number', icon: Phone }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setAuthMode(id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition ${authMode === id ? 'bg-white text-slate-800 shadow' : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
              style={authMode === id ? { background: isDark ? '#1e293b' : '#fff' } : {}}>
              <Icon size={12} />{label}
            </button>
          ))}
        </div>
        {authMode === 'phone' && (
          <div className="mb-3">
            <input className={`${inputC} mb-1`} placeholder="Phone with country code, e.g. 919876543210" value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel" />
            <p className={`text-[11px] ${muted}`}>Include country code, no + or spaces — e.g. 91 for India</p>
          </div>
        )}
        <div className="flex gap-3">
          <input className={`${inputC} flex-1`} placeholder='Label e.g. "MDA GST", "Office Line"…' value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSession()} />
          <button onClick={handleAddSession} disabled={adding} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-60" style={{ background: GRAD_BTN, whiteSpace: 'nowrap' }}>
            {adding ? <RefreshCw size={14} className="animate-spin" /> : (authMode === 'phone' ? <Hash size={14} /> : <QrCode size={14} />)}
            {adding ? 'Starting…' : (authMode === 'phone' ? 'Get Code' : 'Get QR')}
          </button>
        </div>
        <div className={`mt-3 p-3 rounded-xl text-xs ${isDark ? 'bg-slate-900/60 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
          {authMode === 'phone'
            ? <span><strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>Phone Number method:</strong> No QR camera needed. An 8-digit code appears — enter it in WhatsApp → Linked Devices → Link with phone number.</span>
            : <span><strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>QR Code method:</strong> A QR code appears — scan it in WhatsApp → Linked Devices → Link a Device.</span>
          }
        </div>
      </div>

      {/* Session list */}
      <div className={`rounded-2xl border shadow-sm ${card}`}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
          <div className="flex items-center gap-2"><Smartphone size={16} className="text-emerald-500" /><span className={`text-sm font-bold ${txt}`}>Linked Numbers</span></div>
          <div className="flex items-center gap-2">
            {connectedCount > 0 && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500"><ShieldCheck size={12} /> Auto-reconnect ON</span>}
            <button onClick={fetchSessions} className={`p-1.5 rounded-lg transition hover:bg-slate-100 ${muted}`}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
        {loading && sessions.length === 0 ? (
          <div className={`p-8 text-center ${muted} text-sm`}><RefreshCw size={24} className="animate-spin mx-auto mb-3 opacity-50" />Connecting to bridge…</div>
        ) : sessions.length === 0 ? (
          <div className={`p-10 text-center ${muted}`}><Smartphone size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">No numbers linked yet</p><p className="text-xs mt-1 opacity-70">Add a number above to get started</p></div>
        ) : (
          <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
            <AnimatePresence>
              {sessions.map(s => (
                <motion.div key={s.sessionId} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: s.status === 'connected' ? '#dcfce7' : (isDark ? '#1e293b' : '#f1f5f9') }}>
                    {s.status === 'connected' ? <Wifi size={18} color='#22c55e' /> : <WifiOff size={18} color='#94a3b8' />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === s.sessionId ? (
                      <div className="flex gap-2 items-center">
                        <input className={`${inputC} text-xs py-1`} value={editLabel} onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(s.sessionId); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                        <button onClick={() => handleSaveLabel(s.sessionId)} className="p-1 rounded text-emerald-500 hover:bg-emerald-50"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className={`p-1 rounded ${muted} hover:bg-slate-100`}><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold truncate ${txt}`}>{s.label}</span>
                        <button onClick={() => { setEditingId(s.sessionId); setEditLabel(s.label || ''); }} className={`p-0.5 rounded hover:opacity-100 ${muted}`}><Pencil size={11} /></button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={s.status} />
                      {s.phoneNumber && <span className={`text-[11px] ${muted}`}>+{s.phoneNumber}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDelete(s.sessionId)} disabled={deletingId === s.sessionId} className={`p-2 rounded-lg transition ${muted} hover:bg-red-50 hover:text-red-500 disabled:opacity-40`}>
                    {deletingId === s.sessionId ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Contact list item ───────────────────────────────────────────────────────*/
function ContactItem({ contact, active, onClick }) {
  const color   = avatarColor(contact.jid);
  const name    = contact.display_name || contact.phone;
  const preview = contact.latest_message?.body || '';
  const isOut   = contact.latest_message?.direction === 'out';
  return (
    <button onClick={onClick} className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-emerald-50 dark:bg-emerald-900/20 border-r-2 border-emerald-500' : 'hover:bg-[var(--bg-secondary)]'}`}>
      <div className={`flex-shrink-0 w-11 h-11 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold`}>{initials(name)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm text-[var(--text-primary)] truncate">{name}</span>
          <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">{fmtTime(contact.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {isOut && <span className="mr-1 opacity-60">↑</span>}
            {preview || <span className="italic opacity-60">No messages</span>}
          </p>
          {contact.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {contact.unread_count > 99 ? '99+' : contact.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Message bubble ───────────────────────────────────────────────────────── */
function Bubble({ msg }) {
  const isOut = msg.direction === 'out';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1`}>
      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isOut ? 'bg-emerald-500 text-white rounded-br-sm' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-sm border border-[var(--border)]'}`}>
        {msg.session_label && !isOut && <p className="text-[10px] font-semibold mb-0.5 opacity-60 uppercase tracking-wide">via {msg.session_label}</p>}
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <p className={`text-[10px] mt-1 text-right ${isOut ? 'text-emerald-100' : 'text-[var(--text-secondary)]'}`}>{fmtFull(msg.timestamp)}</p>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function WhatsAppHub() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  // Dark mode
  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    const handler = () => setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(handler);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const [activeTab, setActiveTab] = useState('inbox');

  // Inbox state
  const [contacts,        setContacts]        = useState([]);
  const [sessions,        setSessions]        = useState([]);
  const [activeJid,       setActiveJid]       = useState(null);
  const [thread,          setThread]          = useState([]);
  const [contact,         setContact]         = useState(null);
  const [reply,           setReply]           = useState('');
  const [search,          setSearch]          = useState('');
  const [sessionFilter,   setSessionFilter]   = useState('');
  const [unreadOnly,      setUnreadOnly]      = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingThread,   setLoadingThread]   = useState(false);
  const [sending,         setSending]         = useState(false);
  const [mobileView,      setMobileView]      = useState('list');
  const [selectedSession, setSelectedSession] = useState('');
  const threadEndRef = useRef(null);
  const pollRef      = useRef(null);

  const card   = isDark ? 'bg-slate-800 border-slate-700'  : 'bg-white border-slate-200';
  const txt    = isDark ? 'text-slate-100'                  : 'text-slate-800';
  const muted  = isDark ? 'text-slate-400'                  : 'text-slate-500';

  /* ── load sessions ── */
  useEffect(() => {
    api.get('/whatsapp/sessions').then(({ data }) => setSessions(data?.sessions || [])).catch(() => {});
  }, []);

  /* ── load contacts ── */
  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '60');
      if (sessionFilter) params.set('session_id', sessionFilter);
      if (unreadOnly)    params.set('unread_only', 'true');
      const { data } = await api.get(`/whatsapp/hub/inbox?${params}`);
      setContacts(data.contacts || []);
    } catch (e) { console.error(e); }
    finally { setLoadingContacts(false); }
  }, [sessionFilter, unreadOnly]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    pollRef.current = setInterval(loadContacts, 15000);
    return () => clearInterval(pollRef.current);
  }, [loadContacts]);

  /* ── load thread ── */
  const loadThread = useCallback(async (jid) => {
    if (!jid) return;
    setLoadingThread(true);
    try {
      const { data } = await api.get(`/whatsapp/hub/conversations/${encodeURIComponent(jid)}`);
      setThread(data.messages || []);
      setContact(data.contact);
    } catch (e) { console.error(e); }
    finally { setLoadingThread(false); }
  }, []);

  useEffect(() => {
    if (activeJid) {
      loadThread(activeJid);
      api.patch(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}/read`).catch(() => {});
    }
  }, [activeJid, loadThread]);

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  useEffect(() => {
    if (!activeJid) return;
    const t = setInterval(() => loadThread(activeJid), 8000);
    return () => clearInterval(t);
  }, [activeJid, loadThread]);

  /* ── send reply ── */
  async function handleSend() {
    if (!reply.trim() || !activeJid || sending) return;
    setSending(true);
    try {
      await api.post('/whatsapp/hub/reply', { jid: activeJid, message: reply.trim(), session_id: selectedSession || null });
      setReply('');
      await loadThread(activeJid);
      await loadContacts();
    } catch (e) { alert(e?.response?.data?.detail || 'Failed to send message.'); }
    finally { setSending(false); }
  }

  /* ── filtered contacts ── */
  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.display_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  const TABS = [
    { id: 'inbox',   label: 'Inbox',             icon: MessageCircle },
    ...(isAdmin ? [{ id: 'settings', label: 'Connected Numbers', icon: Smartphone }] : []),
    { id: 'info',    label: 'How It Works',       icon: Eye },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 space-y-0 -m-4 sm:-m-6">
      {/* ── Header ── */}
      <div className="relative overflow-hidden px-4 sm:px-6 pt-4 pb-0 flex-shrink-0"
        style={{ background: GRADIENT, boxShadow: '0 4px 24px rgba(18,140,126,0.2)' }}>
        <div className="absolute right-0 top-0 w-64 h-64 rounded-full -mr-20 -mt-20 opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }} />
        <div className="relative flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white tracking-tight leading-tight">WhatsApp Hub</h1>
            <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
              Unified inbox · All connected numbers
            </p>
          </div>
          {activeTab === 'inbox' && (
            <div className="flex items-center gap-2">
              <button onClick={() => setUnreadOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${unreadOnly ? 'bg-white text-emerald-700' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                <Filter size={12} />{unreadOnly ? 'Unread' : 'All'}
              </button>
              <button onClick={loadContacts} className="p-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 transition">
                <RefreshCw size={14} className={loadingContacts ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => {
            const I = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition ${active ? 'border-white text-white' : 'border-transparent text-white/60 hover:text-white/90'}`}>
                <I size={13} />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Inbox Tab ── */}
      {activeTab === 'inbox' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Contact list */}
          <div className={`${mobileView === 'thread' ? 'hidden lg:flex' : 'flex'} flex-col border-r border-[var(--border)] flex-shrink-0`}
            style={{ width: 320, minWidth: 240 }}>
            {/* Search + session filter */}
            <div className="p-3 border-b border-[var(--border)] space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="Search contacts…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {sessions.length > 1 && (
                <select
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-none"
                  value={sessionFilter}
                  onChange={e => setSessionFilter(e.target.value)}
                >
                  <option value="">All numbers</option>
                  {sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{s.label || s.sessionId}</option>)}
                </select>
              )}
            </div>

            {/* Contacts */}
            <div className="flex-1 overflow-y-auto">
              {loadingContacts && contacts.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)] text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 opacity-50" />Loading…
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-secondary)]">
                  <MessageCircle size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{search ? 'No contacts match your search' : 'No conversations yet'}</p>
                  {!search && <p className="text-xs mt-1 opacity-60">Messages will appear here when WhatsApp numbers receive them</p>}
                </div>
              ) : (
                filteredContacts.map(c => (
                  <ContactItem
                    key={c.jid}
                    contact={c}
                    active={activeJid === c.jid}
                    onClick={() => { setActiveJid(c.jid); setMobileView('thread'); }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Thread panel */}
          <div className={`${mobileView === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0`}>
            {!activeJid ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] gap-3">
                <MessageCircle size={48} className="opacity-20" />
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="text-xs opacity-60">Choose a contact from the list to view messages</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
                  <button onClick={() => { setMobileView('list'); setActiveJid(null); }} className="lg:hidden p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">
                    <ChevronLeft size={20} />
                  </button>
                  <div className={`w-9 h-9 rounded-full ${avatarColor(activeJid)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                    {initials(contact?.display_name || contact?.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{contact?.display_name || contact?.phone || activeJid}</p>
                    {contact?.phone && <p className="text-xs text-[var(--text-secondary)]">+{contact.phone}</p>}
                  </div>
                  {isAdmin && (
                    <button onClick={() => { if (window.confirm('Delete this conversation and all messages?')) { api.delete(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}`).then(() => { setActiveJid(null); setThread([]); loadContacts(); }).catch(() => alert('Failed to delete')); } }}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 transition">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {loadingThread && thread.length === 0 ? (
                    <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /></div>
                  ) : (
                    thread.map(msg => <Bubble key={msg.id} msg={msg} />)
                  )}
                  <div ref={threadEndRef} />
                </div>

                {/* Reply box */}
                <div className="p-3 border-t border-[var(--border)] flex-shrink-0 space-y-2">
                  {sessions.length > 1 && (
                    <select
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-none"
                      value={selectedSession}
                      onChange={e => setSelectedSession(e.target.value)}
                    >
                      <option value="">Auto-pick session</option>
                      {sessions.filter(s => s.status === 'connected').map(s => <option key={s.sessionId} value={s.sessionId}>{s.label || s.sessionId}</option>)}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                      rows={2}
                      placeholder="Type a message…"
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !reply.trim()}
                      className="px-4 rounded-xl text-white font-bold flex items-center gap-1.5 disabled:opacity-40 transition hover:opacity-90"
                      style={{ background: GRAD_BTN }}
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Connected Numbers Tab (Hub Settings — Admin only) ── */}
      {activeTab === 'settings' && isAdmin && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ConnectedNumbersTab isDark={isDark} />
        </div>
      )}

      {/* ── How It Works ── */}
      {activeTab === 'info' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className={`rounded-2xl border shadow-sm p-6 max-w-2xl ${card}`}>
            <div className="flex items-center gap-2 mb-4"><Eye className="h-4 w-4 text-emerald-500" /><span className={`text-base font-bold ${txt}`}>How WhatsApp Hub Works</span></div>
            <div className="space-y-4 text-sm">
              {[
                { step: '1', title: 'Unified inbox for all numbers',      desc: 'All incoming and outgoing messages from every connected WhatsApp number appear here in one place, sorted by recency.' },
                { step: '2', title: 'Connect numbers in Hub Settings',    desc: 'Admin can link WhatsApp numbers using QR code or phone pairing from the Connected Numbers tab above. Numbers auto-reconnect on restart.' },
                { step: '3', title: 'Access is managed in User Governance', desc: 'Admins can grant WhatsApp Hub access to other users from the Users page → select a user → enable "WhatsApp Hub" permission. Admin always has access.' },
                { step: '4', title: 'Reply from any connected number',    desc: 'When multiple numbers are connected, use the session picker to choose which number to reply from. Or leave it on Auto to use the first connected number.' },
                { step: '5', title: 'Message templates in WhatsApp Settings', desc: 'Configure how messages look when sent from Invoicing, DSC alerts, Clients, and Password Vault — those settings live in WhatsApp Settings (sidebar).' },
              ].map(item => (
                <div key={item.step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5" style={{ background: GRAD_BTN }}>{item.step}</div>
                  <div><p className={`font-semibold mb-0.5 ${txt}`}>{item.title}</p><p className={muted}>{item.desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
