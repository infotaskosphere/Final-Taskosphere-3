/**
 * WhatsAppHub.jsx — Multi-account WhatsApp Web
 *
 * A fully self-contained WhatsApp Web-style page.
 * ─ Connect up to 10 WhatsApp numbers (QR code or phone pairing).
 * ─ All conversations from all numbers appear in one unified inbox.
 * ─ Each conversation shows which number it came from.
 * ─ Send replies from any connected number.
 * ─ Completely independent from WhatsApp Settings (that page is for
 *   message templates only; this page owns all number management).
 *
 * Access:  Admin → always. Others → via can_access_whatsapp_hub permission.
 * Number management (add / remove) → Admin only tab inside this page.
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  MessageCircle, Send, ChevronLeft, Search, RefreshCw,
  CheckCheck, AlertCircle, Phone, Loader2, Filter,
  Trash2, Smartphone, QrCode, Wifi, WifiOff,
  Plus, Pencil, Check, X, Hash, Copy, ShieldCheck,
  Settings2, Users2, Circle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext.jsx';

// ─── Brand colours ────────────────────────────────────────────────────────────
const EMERALD   = '#128C7E';
const GREEN     = '#25D366';
const GRAD_BTN  = `linear-gradient(135deg, ${EMERALD}, ${GREEN})`;

// Colour palette for session chips (up to 10 accounts)
const SESSION_COLORS = [
  '#25D366', '#128C7E', '#3b82f6', '#8b5cf6',
  '#f59e0b', '#ef4444', '#06b6d4', '#10b981',
  '#f97316', '#ec4899',
];

function sessionColor(idx) {
  return SESSION_COLORS[idx % SESSION_COLORS.length];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtTime(ts) {
  if (!ts) return '';
  const d   = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString('en-IN', { weekday: 'short' });
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

const AVATAR_COLORS = [
  '#10b981','#3b82f6','#8b5cf6','#f59e0b',
  '#ef4444','#06b6d4','#6366f1','#0f766e',
];
function avatarBg(jid) {
  let h = 0;
  for (const c of (jid || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ── Status badge ─────────────────────────────────────────────────────────── */
function StatusDot({ status, size = 8 }) {
  const map = {
    connected:     '#22c55e',
    awaiting_scan: '#f59e0b',
    connecting:    '#6366f1',
    reconnecting:  '#f97316',
    disconnected:  '#ef4444',
  };
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: map[status] || '#9ca3af',
      flexShrink: 0,
    }} />
  );
}

function StatusBadge({ status }) {
  const map = {
    connected:     { label: 'Connected',    bg: '#dcfce7', color: '#16a34a' },
    awaiting_scan: { label: 'Scan QR',      bg: '#fef3c7', color: '#d97706' },
    connecting:    { label: 'Connecting',   bg: '#ede9fe', color: '#7c3aed' },
    reconnecting:  { label: 'Reconnecting', bg: '#ffedd5', color: '#ea580c' },
    disconnected:  { label: 'Disconnected', bg: '#fee2e2', color: '#dc2626' },
  };
  const s = map[status] || { label: status || 'Unknown', bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

/* ── QR Modal ─────────────────────────────────────────────────────────────── */
function QRModal({ sessionId, label, onClose, isDark }) {
  const [qr,     setQr]     = useState(null);
  const [status, setStatus] = useState('loading');
  const timerRef            = useRef(null);
  const card  = isDark ? '#1e293b' : '#fff';
  const muted = isDark ? '#94a3b8' : '#64748b';

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/qr`);
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(timerRef.current); setTimeout(onClose, 1400); return; }
      if (data.qr) { setQr(data.qr); setStatus('ready'); }
      else          { setStatus(data.status || 'waiting'); }
      timerRef.current = setTimeout(poll, 10000);
    } catch { setStatus('error'); }
  }, [sessionId, onClose]);

  useEffect(() => { poll(); return () => clearTimeout(timerRef.current); }, [poll]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} style={{ background:card, borderRadius:20, padding:28, maxWidth:360, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div><div style={{ fontWeight:700, fontSize:16, color: isDark ? '#f1f5f9' : '#0f172a' }}>Scan QR Code</div><div style={{ fontSize:12, color:muted, marginTop:2 }}>{label}</div></div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:muted }}><X size={18}/></button>
        </div>
        <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius:14, padding:20, display:'flex', alignItems:'center', justifyContent:'center', minHeight:260, flexDirection:'column', gap:12 }}>
          {status === 'connected' && <motion.div initial={{ scale:0 }} animate={{ scale:1 }} style={{ textAlign:'center' }}><CheckCheck size={52} color='#22c55e'/><p style={{ color:'#22c55e', fontWeight:700, marginTop:8 }}>Connected!</p></motion.div>}
          {status === 'ready' && qr && <motion.img key={qr} initial={{ opacity:0 }} animate={{ opacity:1 }} src={qr} alt='QR' style={{ width:210, height:210, borderRadius:8 }}/>}
          {['loading','waiting','connecting'].includes(status) && <div style={{ textAlign:'center' }}><motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}><RefreshCw size={34} color={GREEN}/></motion.div><p style={{ color:muted, fontSize:13, marginTop:10 }}>Waiting for QR…</p></div>}
          {status === 'error' && <div style={{ textAlign:'center' }}><AlertCircle size={34} color='#ef4444'/><p style={{ color:'#ef4444', fontSize:13, marginTop:8 }}>Failed</p><button onClick={poll} style={{ marginTop:6, background:GRAD_BTN, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12 }}>Retry</button></div>}
        </div>
        <p style={{ textAlign:'center', fontSize:12, color:muted, marginTop:12, lineHeight:1.6 }}>Open WhatsApp → Linked Devices → Link a Device → Scan this QR</p>
        <p style={{ textAlign:'center', fontSize:11, color:muted, marginTop:4, opacity:0.7 }}>QR refreshes automatically</p>
      </motion.div>
    </div>
  );
}

/* ── Pair Code Modal ──────────────────────────────────────────────────────── */
function PairCodeModal({ sessionId, label, onClose, isDark }) {
  const [code,   setCode]   = useState(null);
  const [status, setStatus] = useState('loading');
  const [copied, setCopied] = useState(false);
  const timerRef            = useRef(null);
  const card  = isDark ? '#1e293b' : '#fff';
  const muted = isDark ? '#94a3b8' : '#64748b';

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/pair-code`);
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(timerRef.current); setTimeout(onClose, 1400); return; }
      if (data.code) { setCode(data.code); setStatus('ready'); }
      else           { setStatus(data.status || 'waiting'); }
      timerRef.current = setTimeout(poll, 8000);
    } catch { setStatus('error'); }
  }, [sessionId, onClose]);

  useEffect(() => { poll(); return () => clearTimeout(timerRef.current); }, [poll]);

  const formatted = code ? `${code.slice(0,4)}-${code.slice(4)}` : null;
  const handleCopy = () => { if (code) { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} style={{ background:card, borderRadius:20, padding:28, maxWidth:380, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div><div style={{ fontWeight:700, fontSize:16, color: isDark ? '#f1f5f9' : '#0f172a' }}>Phone Pairing Code</div><div style={{ fontSize:12, color:muted, marginTop:2 }}>{label}</div></div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:muted }}><X size={18}/></button>
        </div>
        <div style={{ background: isDark ? '#0f172a' : '#f8fafc', borderRadius:14, padding:24, minHeight:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
          {status === 'connected' && <motion.div initial={{ scale:0 }} animate={{ scale:1 }} style={{ textAlign:'center' }}><CheckCheck size={52} color='#22c55e'/><p style={{ color:'#22c55e', fontWeight:700, marginTop:8 }}>Connected!</p></motion.div>}
          {status === 'ready' && formatted && (
            <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} style={{ textAlign:'center', width:'100%' }}>
              <div style={{ fontSize:38, fontWeight:900, letterSpacing:'0.12em', color: isDark ? '#f1f5f9' : '#0f172a', fontFamily:'monospace', marginBottom:14 }}>{formatted}</div>
              <button onClick={handleCopy} style={{ display:'flex', alignItems:'center', gap:8, margin:'0 auto', background: copied ? '#22c55e22' : GRAD_BTN, color: copied ? '#22c55e' : '#fff', border: copied ? '1.5px solid #22c55e' : 'none', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {copied ? <><Check size={13}/> Copied!</> : <><Copy size={13}/> Copy Code</>}
              </button>
            </motion.div>
          )}
          {['loading','waiting','connecting'].includes(status) && <div style={{ textAlign:'center' }}><motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}><RefreshCw size={34} color={GREEN}/></motion.div><p style={{ color:muted, fontSize:13, marginTop:10 }}>Generating code…</p></div>}
          {status === 'error' && <div style={{ textAlign:'center' }}><AlertCircle size={34} color='#ef4444'/><p style={{ color:'#ef4444', fontSize:13, marginTop:8 }}>Failed</p><button onClick={poll} style={{ marginTop:6, background:GRAD_BTN, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12 }}>Retry</button></div>}
        </div>
        {status === 'ready' && <p style={{ fontSize:12, color:muted, lineHeight:1.7, marginTop:14 }}><strong style={{ color: isDark ? '#e2e8f0' : '#334155' }}>Steps:</strong><br/>1. Open WhatsApp → Linked Devices → Link a Device<br/>2. Tap "Link with phone number instead"<br/>3. Enter your phone, then enter the code above</p>}
      </motion.div>
    </div>
  );
}

/* ── Add Number Panel (inline, inside hub) ─────────────────────────────────── */
function AddNumberPanel({ isDark, onSuccess }) {
  const [authMode,  setAuthMode]  = useState('qr');
  const [label,     setLabel]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null); // { sessionId, label, mode }
  const [cooldown,  setCooldown]  = useState(0);   // seconds until retry allowed
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [cooldown]);

  const card   = isDark ? '#1e293b' : '#fff';
  const inner  = isDark ? '#0f172a' : '#f8fafc';
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';
  const inputStyle = {
    width: '100%', border: `1px solid ${border}`, borderRadius: 10,
    padding: '9px 12px', fontSize: 14, outline: 'none',
    background: inner, color: txt, boxSizing: 'border-box',
  };

  async function handleAdd() {
    if (cooldown > 0) return;
    if (!label.trim()) { toast.error('Enter a label for this number'); return; }
    if (authMode === 'phone' && !phone.trim()) { toast.error('Enter the phone number with country code'); return; }
    setLoading(true);
    try {
      const payload = { label: label.trim() };
      if (authMode === 'phone') payload.pairing_phone = phone.replace(/\D/g, '');
      const { data } = await api.post('/whatsapp/sessions', payload);
      toast.success(authMode === 'phone' ? 'Session started — get your pairing code!' : 'Session started — scan the QR code!');
      setResult({ sessionId: data.sessionId, label: label.trim(), mode: authMode });
      setLabel(''); setPhone('');
    } catch (e) {
      const status = e?.response?.status;
      const msg    = e?.response?.data?.detail || 'Failed to start session';
      if (status === 429) {
        const wait = parseInt(e?.response?.headers?.['retry-after'] || '30', 10);
        setCooldown(wait || 30);
        toast.error(`Bridge is rate-limiting. Please wait ${wait || 30} seconds.`);
      } else {
        toast.error(msg);
      }
    }
    finally { setLoading(false); }
  }

  if (result) {
    return (
      <div>
        {result.mode === 'qr'
          ? <QRModal   sessionId={result.sessionId} label={result.label} isDark={isDark} onClose={() => { setResult(null); onSuccess(); }} />
          : <PairCodeModal sessionId={result.sessionId} label={result.label} isDark={isDark} onClose={() => { setResult(null); onSuccess(); }} />
        }
      </div>
    );
  }

  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <Plus size={16} color={GREEN} />
        <span style={{ fontSize:14, fontWeight:700, color:txt }}>Connect a WhatsApp Number</span>
      </div>

      {/* Auth mode toggle */}
      <div style={{ display:'flex', gap:4, background: inner, padding:4, borderRadius:12, marginBottom:14, width:'fit-content' }}>
        {[{id:'qr', label:'QR Code', icon:QrCode}, {id:'phone', label:'Phone Number', icon:Phone}].map(({ id, label: lbl, icon: Icon }) => (
          <button key={id} onClick={() => setAuthMode(id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer', border:'none', transition:'all 0.15s',
              background: authMode === id ? GRAD_BTN : 'transparent',
              color: authMode === id ? '#fff' : muted }}>
            <Icon size={12}/>{lbl}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {authMode === 'phone' && (
          <div>
            <input style={inputStyle} placeholder='Phone with country code, e.g. 919876543210' value={phone} onChange={e => setPhone(e.target.value)} type='tel'/>
            <p style={{ fontSize:11, color:muted, marginTop:4 }}>No + or spaces — country code + number, e.g. 91 for India</p>
          </div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ ...inputStyle, flex:1 }} placeholder='Label — e.g. "GST Office", "Support Line"…' value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}/>
          <button onClick={handleAdd} disabled={loading || cooldown > 0}
            style={{ display:'flex', alignItems:'center', gap:6, border:'none', borderRadius:10, padding:'9px 18px', fontWeight:700, fontSize:13, whiteSpace:'nowrap', transition:'all 0.2s',
              background: (loading || cooldown > 0) ? (isDark ? '#334155' : '#e2e8f0') : GRAD_BTN,
              color:       (loading || cooldown > 0) ? muted : '#fff',
              cursor:      (loading || cooldown > 0) ? 'not-allowed' : 'pointer' }}>
            {loading
              ? <><RefreshCw size={13} style={{ animation:'spin 1s linear infinite' }}/> Starting…</>
              : cooldown > 0
                ? <>{cooldown}s — wait</>
                : <>{authMode === 'phone' ? <Hash size={13}/> : <QrCode size={13}/>} {authMode === 'phone' ? 'Get Code' : 'Get QR'}</>}
          </button>
        </div>
        <div style={{ background: inner, borderRadius:10, padding:'10px 12px', fontSize:12, color:muted, lineHeight:1.6 }}>
          {authMode === 'phone'
            ? <><strong style={{ color:txt }}>Phone pairing:</strong> No QR camera needed. An 8-digit code appears — enter it in WhatsApp → Linked Devices → Link with phone number.</>
            : <><strong style={{ color:txt }}>QR code:</strong> A QR code appears on screen. Scan it in WhatsApp → Linked Devices → Link a Device.</>}
        </div>
      </div>
    </div>
  );
}

/* ── Sessions Manager Panel ───────────────────────────────────────────────── */
function SessionsManager({ isDark, sessions, loading, onRefresh }) {
  const [deletingId,  setDeletingId]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editLabel,   setEditLabel]   = useState('');

  const card   = isDark ? '#1e293b' : '#fff';
  const inner  = isDark ? '#0f172a' : '#f8fafc';
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';
  const inputStyle = { border: `1px solid ${border}`, borderRadius:8, padding:'5px 10px', fontSize:13, outline:'none', background:inner, color:txt, flex:1 };

  const handleDelete = async (sessionId) => {
    setDeletingId(sessionId);
    try { await api.delete(`/whatsapp/sessions/${sessionId}`); toast.success('Number disconnected'); onRefresh(); }
    catch { toast.error('Failed to remove'); }
    finally { setDeletingId(null); }
  };

  const handleSaveLabel = async (sessionId) => {
    try { await api.patch(`/whatsapp/sessions/${sessionId}/label`, { label: editLabel }); setEditingId(null); onRefresh(); }
    catch { toast.error('Failed to update label'); }
  };

  const connectedCount = sessions.filter(s => s.status === 'connected').length;

  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius:16, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid ${border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Smartphone size={15} color={GREEN}/>
          <span style={{ fontSize:14, fontWeight:700, color:txt }}>Connected Numbers</span>
          <span style={{ background:'#dcfce7', color:'#16a34a', fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:20 }}>{connectedCount}/{sessions.length}</span>
        </div>
        <button onClick={onRefresh} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:4 }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
        </button>
      </div>

      {sessions.length === 0 ? (
        <div style={{ padding:24, textAlign:'center', color:muted, fontSize:13 }}>
          <Smartphone size={32} style={{ margin:'0 auto 8px', opacity:0.3, display:'block' }}/>
          No numbers connected yet — add one above
        </div>
      ) : (
        sessions.map((s, idx) => (
          <div key={s.sessionId} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: idx < sessions.length-1 ? `1px solid ${border}` : 'none' }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background: sessionColor(idx), flexShrink:0 }}/>
            <div style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background: s.status === 'connected' ? '#dcfce7' : (isDark ? '#1e293b' : '#f1f5f9') }}>
              {s.status === 'connected' ? <Wifi size={16} color='#22c55e'/> : <WifiOff size={16} color='#9ca3af'/>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              {editingId === s.sessionId ? (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input style={inputStyle} value={editLabel} onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if (e.key==='Enter') handleSaveLabel(s.sessionId); if (e.key==='Escape') setEditingId(null); }} autoFocus/>
                  <button onClick={() => handleSaveLabel(s.sessionId)} style={{ background:'none', border:'none', cursor:'pointer', color:'#22c55e', padding:4 }}><Check size={14}/></button>
                  <button onClick={() => setEditingId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:4 }}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label || s.sessionId}</span>
                  <button onClick={() => { setEditingId(s.sessionId); setEditLabel(s.label || ''); }} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:2 }}><Pencil size={11}/></button>
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <StatusBadge status={s.status}/>
                {s.phoneNumber && <span style={{ fontSize:11, color:muted }}>+{s.phoneNumber}</span>}
              </div>
            </div>
            <button onClick={() => handleDelete(s.sessionId)} disabled={deletingId === s.sessionId} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:6, borderRadius:8, opacity: deletingId===s.sessionId ? 0.4 : 1 }}>
              {deletingId === s.sessionId ? <RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Trash2 size={14}/>}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Contact list item ────────────────────────────────────────────────────── */
function ContactItem({ contact, active, onClick, sessionColorMap }) {
  const name    = contact.display_name || contact.phone;
  const preview = contact.latest_message?.body || '';
  const isOut   = contact.latest_message?.direction === 'out';
  const bg      = avatarBg(contact.jid);
  const numColor = sessionColorMap[contact.session_id] || '#25d366';

  return (
    <button onClick={onClick}
      style={{ width:'100%', display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', textAlign:'left', cursor:'pointer', border:'none', borderRight: active ? '2.5px solid #25D366' : '2.5px solid transparent', background: active ? 'rgba(37,211,102,0.08)' : 'transparent', transition:'background 0.12s' }}>
      {/* Avatar */}
      <div style={{ flexShrink:0, width:44, height:44, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, position:'relative' }}>
        {initials(name)}
        {/* Session dot */}
        <div style={{ position:'absolute', bottom:1, right:1, width:11, height:11, borderRadius:'50%', background:numColor, border:'2px solid white' }}/>
      </div>
      {/* Body */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:4 }}>
          <span style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
          <span style={{ fontSize:11, color:'#94a3b8', flexShrink:0 }}>{fmtTime(contact.last_message_at)}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:4, marginTop:2 }}>
          <p style={{ fontSize:12, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', margin:0 }}>
            {isOut && <span style={{ marginRight:4, opacity:0.6 }}>↑</span>}
            {preview || <span style={{ fontStyle:'italic' }}>No messages</span>}
          </p>
          {contact.unread_count > 0 && (
            <span style={{ flexShrink:0, minWidth:18, height:18, borderRadius:9, background:'#25D366', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
              {contact.unread_count > 99 ? '99+' : contact.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Message bubble ───────────────────────────────────────────────────────── */
function Bubble({ msg, sessionColorMap }) {
  const isOut  = msg.direction === 'out';
  const numColor = sessionColorMap[msg.session_id];
  return (
    <div style={{ display:'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', marginBottom:4 }}>
      <div style={{ maxWidth:'75%', padding:'8px 12px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize:13, lineHeight:1.5,
        background: isOut ? (numColor || '#25D366') : 'var(--bg-secondary, #f1f5f9)',
        color: isOut ? '#fff' : 'var(--text-primary, #0f172a)',
        border: isOut ? 'none' : '1px solid var(--border, #e2e8f0)' }}>
        {msg.session_label && !isOut && (
          <p style={{ fontSize:10, fontWeight:700, marginBottom:3, opacity:0.6, textTransform:'uppercase', letterSpacing:'0.05em', margin:'0 0 3px' }}>
            via {msg.session_label}
          </p>
        )}
        <p style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{msg.body}</p>
        <p style={{ margin:'4px 0 0', fontSize:10, textAlign:'right', opacity: isOut ? 0.75 : 0.6 }}>{fmtFull(msg.timestamp)}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ── Main Page                                                              ── */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function WhatsAppHub() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  /* dark mode */
  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  /* view state */
  const [activeTab,  setActiveTab]  = useState('inbox');    // 'inbox' | 'numbers'
  const [mobileView, setMobileView] = useState('list');     // 'list'  | 'thread'

  /* sessions */
  const [sessions,     setSessions]     = useState([]);
  const [sessLoading,  setSessLoading]  = useState(true);
  const sessTimerRef = useRef(null);

  /* inbox */
  const [contacts,    setContacts]    = useState([]);
  const [activeJid,   setActiveJid]   = useState(null);
  const [thread,      setThread]      = useState([]);
  const [contact,     setContact]     = useState(null);
  const [search,      setSearch]      = useState('');
  const [numFilter,   setNumFilter]   = useState('');       // session_id filter
  const [unreadOnly,  setUnreadOnly]  = useState(false);
  const [loadingC,    setLoadingC]    = useState(false);
  const [loadingT,    setLoadingT]    = useState(false);

  /* compose */
  const [reply,       setReply]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [fromSession, setFromSession] = useState('');

  const threadEndRef = useRef(null);

  /* ── CSS for spin ── */
  useEffect(() => {
    if (!document.getElementById('wa-hub-spin')) {
      const s = document.createElement('style');
      s.id = 'wa-hub-spin';
      s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }, []);

  /* ── colour map: sessionId → colour ── */
  const sessionColorMap = useMemo(() => {
    const map = {};
    sessions.forEach((s, i) => { map[s.sessionId] = sessionColor(i); });
    return map;
  }, [sessions]);

  /* ── load sessions ── */
  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const { data } = await api.get('/whatsapp/sessions');
      setSessions(data?.sessions || []);
    } catch { /* bridge may be offline */ }
    finally { setSessLoading(false); }
  }, []);

  useEffect(() => {
    loadSessions();
    const schedule = () => { sessTimerRef.current = setTimeout(async () => { await loadSessions(); schedule(); }, 60000); };
    schedule();
    return () => clearTimeout(sessTimerRef.current);
  }, [loadSessions]);

  /* ── load contacts ── */
  const loadContacts = useCallback(async () => {
    setLoadingC(true);
    try {
      const p = new URLSearchParams({ limit: '80' });
      if (numFilter)  p.set('session_id', numFilter);
      if (unreadOnly) p.set('unread_only', 'true');
      const { data } = await api.get(`/whatsapp/hub/inbox?${p}`);
      setContacts(data.contacts || []);
    } catch { /* silently */ }
    finally { setLoadingC(false); }
  }, [numFilter, unreadOnly]);

  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => {
    const t = setInterval(loadContacts, 30000);
    return () => clearInterval(t);
  }, [loadContacts]);

  /* ── load thread ── */
  const loadThread = useCallback(async (jid) => {
    if (!jid) return;
    setLoadingT(true);
    try {
      const { data } = await api.get(`/whatsapp/hub/conversations/${encodeURIComponent(jid)}`);
      setThread(data.messages || []);
      setContact(data.contact);
    } catch { /* silently */ }
    finally { setLoadingT(false); }
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
    const t = setInterval(() => loadThread(activeJid), 20000);
    return () => clearInterval(t);
  }, [activeJid, loadThread]);

  /* ── send ── */
  async function handleSend() {
    if (!reply.trim() || !activeJid || sending) return;
    setSending(true);
    try {
      await api.post('/whatsapp/hub/reply', { jid: activeJid, message: reply.trim(), session_id: fromSession || null });
      setReply('');
      await loadThread(activeJid);
      await loadContacts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to send message'); }
    finally { setSending(false); }
  }

  /* ── derived ── */
  const filteredContacts = useMemo(() =>
    contacts.filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.display_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
    }),
  [contacts, search]);

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const noSessions        = sessions.length === 0 && !sessLoading;

  /* ── colours for light/dark ── */
  const bg     = isDark ? '#0f172a' : '#f0f2f5';
  const panel  = isDark ? '#1e293b' : '#fff';
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';

  /* ── Number tabs ── */
  const numTabs = [
    { id: '', label: 'All', color: '#25D366' },
    ...sessions.map((s, i) => ({ id: s.sessionId, label: s.label || `Acct ${i+1}`, color: sessionColor(i) })),
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, margin:'-16px', overflow:'hidden', background:bg }}>

      {/* ─── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink:0, background: `linear-gradient(135deg, ${EMERALD} 0%, ${GREEN} 100%)`, padding:'12px 16px 0', boxShadow:'0 2px 12px rgba(18,140,126,0.25)' }}>
        {/* Title row */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <MessageCircle size={20} color='#fff'/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#fff', lineHeight:1.2 }}>WhatsApp Hub</h1>
            <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              {connectedSessions.length} of {sessions.length} number{sessions.length !== 1 ? 's' : ''} connected
            </p>
          </div>
          {/* Actions */}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {activeTab === 'inbox' && (
              <>
                <button onClick={() => setUnreadOnly(v => !v)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, background: unreadOnly ? '#fff' : 'rgba(255,255,255,0.18)', color: unreadOnly ? '#128C7E' : '#fff' }}>
                  <Filter size={11}/>{unreadOnly ? 'Unread' : 'All'}
                </button>
                <button onClick={loadContacts} style={{ padding:6, borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.18)', color:'#fff' }}>
                  <RefreshCw size={13} style={{ animation: loadingC ? 'spin 1s linear infinite' : 'none' }}/>
                </button>
              </>
            )}
            {isAdmin && (
              <button onClick={() => setActiveTab(t => t === 'numbers' ? 'inbox' : 'numbers')}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, background: activeTab==='numbers' ? '#fff' : 'rgba(255,255,255,0.18)', color: activeTab==='numbers' ? '#128C7E' : '#fff' }}>
                <Settings2 size={11}/> Manage Numbers
              </button>
            )}
          </div>
        </div>

        {/* Number filter tabs (inbox mode) */}
        {activeTab === 'inbox' && sessions.length > 0 && (
          <div style={{ display:'flex', gap:4, overflowX:'auto', paddingBottom:10, scrollbarWidth:'none' }}>
            {numTabs.map(t => (
              <button key={t.id} onClick={() => setNumFilter(t.id)}
                style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, transition:'all 0.15s',
                  background: numFilter === t.id ? '#fff' : 'rgba(255,255,255,0.15)',
                  color: numFilter === t.id ? t.color : 'rgba(255,255,255,0.85)' }}>
                {t.id !== '' && <Circle size={8} fill={t.color} color={t.color}/>}
                {t.label}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'inbox' && sessions.length === 0 && (
          <div style={{ paddingBottom:10 }}/>
        )}
      </div>

      {/* ─── Manage Numbers (admin tab) ─────────────────────────────────── */}
      {activeTab === 'numbers' && isAdmin && (
        <div style={{ flex:1, overflowY:'auto', padding:16 }}>
          <AddNumberPanel isDark={isDark} onSuccess={() => { loadSessions(); loadContacts(); }}/>
          <SessionsManager isDark={isDark} sessions={sessions} loading={sessLoading} onRefresh={loadSessions}/>
          <p style={{ textAlign:'center', fontSize:12, color:muted, marginTop:12 }}>
            You can connect up to 10 WhatsApp numbers. All messages appear in the Inbox tab.
          </p>
        </div>
      )}

      {/* ─── Inbox ──────────────────────────────────────────────────────── */}
      {activeTab === 'inbox' && (
        <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

          {/* ── Contact list ── */}
          <div style={{ width:320, minWidth:240, flexShrink:0, display: mobileView === 'thread' ? 'none' : 'flex', flexDirection:'column', borderRight:`1px solid ${border}`, background:panel }}>
            {/* Search */}
            <div style={{ padding:'10px 12px', borderBottom:`1px solid ${border}`, background:panel }}>
              <div style={{ position:'relative' }}>
                <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:muted }}/>
                <input style={{ width:'100%', paddingLeft:32, paddingRight:12, paddingTop:7, paddingBottom:7, fontSize:13, border:`1px solid ${border}`, borderRadius:10, outline:'none', background: isDark ? '#0f172a' : '#f8fafc', color:txt, boxSizing:'border-box' }}
                  placeholder='Search contacts…' value={search} onChange={e => setSearch(e.target.value)}/>
              </div>
            </div>

            {/* Contact items */}
            <div style={{ flex:1, overflowY:'auto', color:txt }}>
              {/* No sessions connected — inline prompt (no redirect to Settings) */}
              {noSessions && (
                <div style={{ padding:24, textAlign:'center', color:muted }}>
                  <Smartphone size={40} style={{ margin:'0 auto 10px', display:'block', opacity:0.3 }}/>
                  <p style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>No WhatsApp numbers connected</p>
                  <p style={{ fontSize:12, lineHeight:1.6, marginBottom:14, opacity:0.8 }}>
                    Connect a WhatsApp number to start receiving and sending messages from all your company accounts in one place.
                  </p>
                  {isAdmin ? (
                    <button onClick={() => setActiveTab('numbers')}
                      style={{ background:GRAD_BTN, color:'#fff', border:'none', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}>
                      <Plus size={14}/> Connect a Number
                    </button>
                  ) : (
                    <p style={{ fontSize:12, color:muted, fontStyle:'italic' }}>Ask your admin to connect a WhatsApp number.</p>
                  )}
                </div>
              )}

              {/* Sessions exist but contacts empty */}
              {!noSessions && filteredContacts.length === 0 && !loadingC && (
                <div style={{ padding:24, textAlign:'center', color:muted }}>
                  <MessageCircle size={36} style={{ margin:'0 auto 8px', display:'block', opacity:0.25 }}/>
                  <p style={{ fontSize:13 }}>{search ? 'No contacts match' : 'No conversations yet'}</p>
                  {!search && sessions.length > 0 && connectedSessions.length === 0 && (
                    <p style={{ fontSize:12, marginTop:4, opacity:0.7 }}>Numbers are not connected. {isAdmin ? <button onClick={() => setActiveTab('numbers')} style={{ background:'none', border:'none', cursor:'pointer', color:'#25D366', fontWeight:700, fontSize:12, padding:0 }}>Fix in Manage Numbers →</button> : 'Ask admin to connect.'}</p>
                  )}
                </div>
              )}
              {loadingC && contacts.length === 0 && (
                <div style={{ padding:20, textAlign:'center', color:muted }}>
                  <RefreshCw size={20} style={{ margin:'0 auto 6px', display:'block', animation:'spin 1s linear infinite' }}/>
                  <p style={{ fontSize:12 }}>Loading…</p>
                </div>
              )}

              {filteredContacts.map(c => (
                <ContactItem key={c.jid} contact={c} active={activeJid === c.jid} sessionColorMap={sessionColorMap}
                  onClick={() => { setActiveJid(c.jid); setMobileView('thread'); }}/>
              ))}
            </div>
          </div>

          {/* ── Thread panel ── */}
          <div style={{ flex:1, display: mobileView === 'list' ? 'none' : 'flex', flexDirection:'column', minWidth:0, background: isDark ? '#0b141a' : '#efeae2' }}>
            {!activeJid ? (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:muted, padding:32 }}>
                <div style={{ width:80, height:80, borderRadius:'50%', background: isDark ? '#1e293b' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}>
                  <MessageCircle size={36} color={GREEN}/>
                </div>
                <div style={{ textAlign:'center' }}>
                  <p style={{ fontSize:16, fontWeight:700, color:txt, margin:'0 0 4px' }}>WhatsApp Hub</p>
                  <p style={{ fontSize:13, color:muted, margin:0 }}>Select a conversation from the left</p>
                  {sessions.length > 1 && <p style={{ fontSize:12, color:muted, marginTop:6 }}>{sessions.length} numbers active · {contacts.length} conversations</p>}
                </div>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:panel, borderBottom:`1px solid ${border}`, flexShrink:0 }}>
                  <button onClick={() => { setMobileView('list'); setActiveJid(null); }} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:4, display: mobileView==='thread' ? 'block' : 'none' }}>
                    <ChevronLeft size={20}/>
                  </button>
                  <div style={{ width:38, height:38, borderRadius:'50%', background: avatarBg(activeJid), display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, flexShrink:0 }}>
                    {initials(contact?.display_name || contact?.phone)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:700, fontSize:14, color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{contact?.display_name || contact?.phone || activeJid}</p>
                    {contact?.session_id && sessionColorMap[contact.session_id] && (
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:1 }}>
                        <Circle size={8} fill={sessionColorMap[contact.session_id]} color={sessionColorMap[contact.session_id]}/>
                        <span style={{ fontSize:11, color:muted }}>{sessions.find(s=>s.sessionId===contact.session_id)?.label || contact.session_id}</span>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <button title='Delete conversation' onClick={() => {
                      if (window.confirm('Delete this conversation and all its messages?')) {
                        api.delete(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}`)
                          .then(() => { setActiveJid(null); setThread([]); loadContacts(); })
                          .catch(() => toast.error('Failed to delete'));
                      }
                    }} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:6, borderRadius:8 }}>
                      <Trash2 size={15}/>
                    </button>
                  )}
                </div>

                {/* Messages */}
                <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
                  {loadingT && thread.length === 0 ? (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><Loader2 size={20} color={GREEN} style={{ animation:'spin 1s linear infinite' }}/></div>
                  ) : (
                    thread.map(msg => <Bubble key={msg.id} msg={msg} sessionColorMap={sessionColorMap}/>)
                  )}
                  <div ref={threadEndRef}/>
                </div>

                {/* Reply box */}
                <div style={{ padding:12, background:panel, borderTop:`1px solid ${border}`, flexShrink:0 }}>
                  {/* Session picker */}
                  {connectedSessions.length > 1 && (
                    <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:muted, alignSelf:'center', marginRight:4 }}>Send from:</span>
                      {[{sessionId:'', label:'Auto'}, ...connectedSessions].map((s, i) => {
                        const col = s.sessionId ? sessionColorMap[s.sessionId] : '#94a3b8';
                        const active = fromSession === s.sessionId;
                        return (
                          <button key={s.sessionId||'auto'} onClick={() => setFromSession(s.sessionId)}
                            style={{ padding:'3px 10px', borderRadius:20, border:`1.5px solid ${active ? col : (isDark?'#334155':'#e2e8f0')}`, cursor:'pointer', fontSize:11, fontWeight:700, background: active ? col+'22' : 'transparent', color: active ? col : muted }}>
                            {s.sessionId !== '' && <Circle size={7} fill={col} color={col} style={{ marginRight:4, verticalAlign:'middle' }}/>}
                            {s.label || `Acct ${i}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                    <textarea rows={2} value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder='Type a message…  (Enter to send · Shift+Enter for new line)'
                      style={{ flex:1, border:`1px solid ${border}`, borderRadius:12, padding:'10px 14px', fontSize:13, resize:'none', outline:'none', background: isDark ? '#0f172a' : '#f8fafc', color:txt, lineHeight:1.5 }}/>
                    <button onClick={handleSend} disabled={sending || !reply.trim()}
                      style={{ padding:'10px 16px', borderRadius:12, border:'none', cursor:'pointer', background: (!sending && reply.trim()) ? GRAD_BTN : (isDark?'#334155':'#e2e8f0'), color: (!sending && reply.trim()) ? '#fff' : muted, display:'flex', alignItems:'center', gap:6, fontWeight:700, fontSize:13, flexShrink:0 }}>
                      {sending ? <Loader2 size={16} style={{ animation:'spin 1s linear infinite' }}/> : <Send size={16}/>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Desktop: always show both panels */}
          {mobileView === 'list' && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:muted, background: isDark ? '#0b141a' : '#efeae2', padding:32 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background: isDark ? '#1e293b' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}>
                <MessageCircle size={36} color={GREEN}/>
              </div>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:16, fontWeight:700, color:txt, margin:'0 0 4px' }}>WhatsApp Hub</p>
                <p style={{ fontSize:13, color:muted, margin:0 }}>
                  {noSessions
                    ? (isAdmin ? 'Click "Manage Numbers" to connect your first WhatsApp number.' : 'No numbers connected yet — ask your admin.')
                    : 'Select a conversation to view messages.'}
                </p>
                {sessions.length > 0 && <p style={{ fontSize:12, color:muted, marginTop:6 }}>{sessions.length} number{sessions.length!==1?'s':''} · {contacts.length} conversation{contacts.length!==1?'s':''}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
