/**
 * WhatsAppHub.jsx — Multi-account WhatsApp Web (Enhanced)
 *
 * Fixes / new features:
 * ─ LID JID resolution: bridge resolves @lid → real phone JID before sending
 * ─ Display normalization: shows phone number instead of raw "12345@lid"
 * ─ Chat history sync: messages load immediately on session connect
 * ─ Profile pictures: lazy-loaded per contact
 * ─ WhatsApp Web-style attachments: paperclip → image/video/document picker
 *   with preview and caption before sending
 * ─ Back button, Groups tab, Number filter tabs, Manage Numbers slide-over
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  MessageCircle, Send, ChevronLeft, Search, RefreshCw,
  CheckCheck, AlertCircle, Phone, Loader2, Filter,
  Trash2, Smartphone, QrCode, Wifi, WifiOff,
  Plus, Pencil, Check, X, Hash, Copy,
  Settings2, Circle, Users, ArrowLeft,
  Paperclip, Image, FileText, File, Mic, Camera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext.jsx';

// ─── Brand colours ────────────────────────────────────────────────────────────
const EMERALD  = '#128C7E';
const GREEN    = '#25D366';
const GRAD_BTN = `linear-gradient(135deg, ${EMERALD}, ${GREEN})`;

const SESSION_COLORS = [
  '#25D366','#128C7E','#3b82f6','#8b5cf6',
  '#f59e0b','#ef4444','#06b6d4','#10b981','#f97316','#ec4899',
];
function sessionColor(idx) { return SESSION_COLORS[idx % SESSION_COLORS.length]; }

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return d.toLocaleDateString('en-IN', { weekday:'short' });
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
}
function fmtFull(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

/**
 * Normalize a JID for display.
 * @lid = Linked Device ID — show the numeric part as a phone-like identifier.
 * The bridge resolves these to real phone numbers when sending; for display
 * we just strip the @lid suffix and show the numeric part.
 */
function displayJid(jid) {
  if (!jid) return '';
  if (jid.endsWith('@lid'))            return `+${jid.split('@')[0]}`;
  if (jid.endsWith('@s.whatsapp.net')) return `+${jid.split('@')[0]}`;
  if (jid.endsWith('@g.us'))           return jid.split('@')[0];
  return jid;
}

function initials(name) {
  if (!name) return '?';
  if (/^\+?\d{5,}/.test(name.trim())) return name.trim().slice(-2);
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const AVATAR_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#6366f1','#0f766e'];
function avatarBg(jid) {
  let h = 0;
  for (const c of (jid || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function isGroup(jid) { return (jid || '').endsWith('@g.us'); }

function getDisplayName(contact) {
  if (!contact) return '';
  if (contact.display_name) return contact.display_name;
  if (contact.phone) return `+${contact.phone}`;
  return displayJid(contact.jid) || contact.jid || '';
}

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

/* ── Profile picture (lazy) ──────────────────────────────────────────────── */
const picCache = {};

function ProfileAvatar({ jid, name, size = 44, isGrp = false, profilePicUrl = null }) {
  const [picUrl,   setPicUrl]   = useState(() => profilePicUrl || picCache[jid] || null);
  const [picError, setPicError] = useState(false);
  const bg = avatarBg(jid);

  useEffect(() => {
    if (profilePicUrl) { setPicUrl(profilePicUrl); return; }
    if (isGrp) return;
    if (picCache[jid] === 'loading') return;
    if (picCache[jid] !== undefined) { setPicUrl(picCache[jid]); return; }
    picCache[jid] = 'loading';
    api.get(`/whatsapp/hub/contacts/${encodeURIComponent(jid)}/profile-pic`)
      .then(({ data }) => { picCache[jid] = data.url || null; setPicUrl(data.url || null); })
      .catch(() => { picCache[jid] = null; });
  }, [jid, profilePicUrl, isGrp]);

  const radius  = isGrp ? '30%' : '50%';
  const showPic = picUrl && !picError;

  return (
    <div style={{ flexShrink:0, width:size, height:size, borderRadius:radius, background:showPic?'transparent':bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:Math.round(size*0.32), overflow:'hidden' }}>
      {showPic
        ? <img src={picUrl} alt={name||''} onError={() => setPicError(true)} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:radius }}/>
        : isGrp ? <Users size={Math.round(size*0.45)} color='#fff'/> : initials(name)
      }
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    connected:     { label:'Connected',    bg:'#dcfce7', color:'#16a34a' },
    awaiting_scan: { label:'Scan QR',      bg:'#fef3c7', color:'#d97706' },
    connecting:    { label:'Connecting',   bg:'#ede9fe', color:'#7c3aed' },
    reconnecting:  { label:'Reconnecting', bg:'#ffedd5', color:'#ea580c' },
    disconnected:  { label:'Disconnected', bg:'#fee2e2', color:'#dc2626' },
  };
  const s = map[status] || { label: status || 'Unknown', bg:'#f3f4f6', color:'#6b7280' };
  return <span style={{ background:s.bg, color:s.color, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{s.label}</span>;
}

/* ── QR Modal ─────────────────────────────────────────────────────────────── */
function QRModal({ sessionId, label, onClose, isDark }) {
  const [qr, setQr]         = useState(null);
  const [status, setStatus] = useState('loading');
  const timerRef            = useRef(null);
  const card = isDark ? '#1e293b' : '#fff', muted = isDark ? '#94a3b8' : '#64748b';

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/qr`);
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(timerRef.current); setTimeout(onClose, 1400); return; }
      if (data.qr) { setQr(data.qr); setStatus('ready'); } else { setStatus(data.status || 'waiting'); }
      timerRef.current = setTimeout(poll, 8000);
    } catch { setStatus('error'); }
  }, [sessionId, onClose]);

  useEffect(() => { poll(); return () => clearTimeout(timerRef.current); }, [poll]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} style={{ background:card, borderRadius:20, padding:28, maxWidth:360, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div><div style={{ fontWeight:700, fontSize:16, color:isDark?'#f1f5f9':'#0f172a' }}>Scan QR Code</div><div style={{ fontSize:12, color:muted, marginTop:2 }}>{label}</div></div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:muted }}><X size={18}/></button>
        </div>
        <div style={{ background:isDark?'#0f172a':'#f8fafc', borderRadius:14, padding:20, display:'flex', alignItems:'center', justifyContent:'center', minHeight:260, flexDirection:'column', gap:12 }}>
          {status === 'connected' && <motion.div initial={{ scale:0 }} animate={{ scale:1 }} style={{ textAlign:'center' }}><CheckCheck size={52} color='#22c55e'/><p style={{ color:'#22c55e', fontWeight:700, marginTop:8 }}>Connected!</p></motion.div>}
          {status === 'ready' && qr && <motion.img key={qr} initial={{ opacity:0 }} animate={{ opacity:1 }} src={qr} alt='QR' style={{ width:210, height:210, borderRadius:8 }}/>}
          {['loading','waiting','connecting'].includes(status) && <div style={{ textAlign:'center' }}><motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}><RefreshCw size={34} color={GREEN}/></motion.div><p style={{ color:muted, fontSize:13, marginTop:10 }}>Waiting for QR…</p></div>}
          {status === 'error' && <div style={{ textAlign:'center' }}><AlertCircle size={34} color='#ef4444'/><p style={{ color:'#ef4444', fontSize:13, marginTop:8 }}>Failed</p><button onClick={poll} style={{ marginTop:6, background:GRAD_BTN, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12 }}>Retry</button></div>}
        </div>
        <p style={{ textAlign:'center', fontSize:12, color:muted, marginTop:12, lineHeight:1.6 }}>Open WhatsApp → Linked Devices → Link a Device → Scan this QR</p>
      </motion.div>
    </div>
  );
}

/* ── Pair Code Modal ──────────────────────────────────────────────────────── */
function PairCodeModal({ sessionId, label, onClose, isDark }) {
  const [code, setCode]     = useState(null);
  const [status, setStatus] = useState('loading');
  const [copied, setCopied] = useState(false);
  const timerRef            = useRef(null);
  const card = isDark ? '#1e293b' : '#fff', muted = isDark ? '#94a3b8' : '#64748b';

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get(`/whatsapp/sessions/${sessionId}/pair-code`);
      if (data.status === 'connected') { setStatus('connected'); clearTimeout(timerRef.current); setTimeout(onClose, 1400); return; }
      if (data.code) { setCode(data.code); setStatus('ready'); } else { setStatus(data.status || 'waiting'); }
      timerRef.current = setTimeout(poll, 8000);
    } catch { setStatus('error'); }
  }, [sessionId, onClose]);

  useEffect(() => { poll(); return () => clearTimeout(timerRef.current); }, [poll]);

  const formatted  = code ? `${code.slice(0,4)}-${code.slice(4)}` : null;
  const handleCopy = () => { if (code) { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <motion.div initial={{ scale:0.9, opacity:0 }} animate={{ scale:1, opacity:1 }} style={{ background:card, borderRadius:20, padding:28, maxWidth:380, width:'90%', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div><div style={{ fontWeight:700, fontSize:16, color:isDark?'#f1f5f9':'#0f172a' }}>Phone Pairing Code</div><div style={{ fontSize:12, color:muted, marginTop:2 }}>{label}</div></div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:muted }}><X size={18}/></button>
        </div>
        <div style={{ background:isDark?'#0f172a':'#f8fafc', borderRadius:14, padding:24, minHeight:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
          {status === 'connected' && <motion.div initial={{ scale:0 }} animate={{ scale:1 }} style={{ textAlign:'center' }}><CheckCheck size={52} color='#22c55e'/><p style={{ color:'#22c55e', fontWeight:700, marginTop:8 }}>Connected!</p></motion.div>}
          {status === 'ready' && formatted && (
            <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} style={{ textAlign:'center', width:'100%' }}>
              <div style={{ fontSize:38, fontWeight:900, letterSpacing:'0.12em', color:isDark?'#f1f5f9':'#0f172a', fontFamily:'monospace', marginBottom:14 }}>{formatted}</div>
              <button onClick={handleCopy} style={{ display:'flex', alignItems:'center', gap:8, margin:'0 auto', background:copied?'#22c55e22':GRAD_BTN, color:copied?'#22c55e':'#fff', border:copied?'1.5px solid #22c55e':'none', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {copied ? <><Check size={13}/> Copied!</> : <><Copy size={13}/> Copy Code</>}
              </button>
            </motion.div>
          )}
          {['loading','waiting','connecting','awaiting_pairing'].includes(status) && <div style={{ textAlign:'center' }}><motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:1, ease:'linear' }}><RefreshCw size={34} color={GREEN}/></motion.div><p style={{ color:muted, fontSize:13, marginTop:10 }}>Generating code…</p></div>}
          {status === 'error' && <div style={{ textAlign:'center' }}><AlertCircle size={34} color='#ef4444'/><p style={{ color:'#ef4444', fontSize:13, marginTop:8 }}>Failed</p><button onClick={poll} style={{ marginTop:6, background:GRAD_BTN, color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12 }}>Retry</button></div>}
        </div>
        {status === 'ready' && <p style={{ fontSize:12, color:muted, lineHeight:1.7, marginTop:14 }}><strong style={{ color:isDark?'#e2e8f0':'#334155' }}>Steps:</strong><br/>1. Open WhatsApp → Linked Devices → Link a Device<br/>2. Tap "Link with phone number instead"<br/>3. Enter your phone number, then type the code above</p>}
      </motion.div>
    </div>
  );
}

/* ── Add Number Panel ─────────────────────────────────────────────────────── */
function AddNumberPanel({ isDark, onSuccess }) {
  const [authMode, setAuthMode] = useState('qr');
  const [label,    setLabel]    = useState('');
  const [phone,    setPhone]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(cooldownRef.current);
  }, [cooldown]);

  const card = isDark?'#1e293b':'#fff', inner = isDark?'#0f172a':'#f8fafc', border = isDark?'#334155':'#e2e8f0', txt = isDark?'#f1f5f9':'#0f172a', muted = isDark?'#94a3b8':'#64748b';
  const inp = { width:'100%', border:`1px solid ${border}`, borderRadius:10, padding:'9px 12px', fontSize:14, outline:'none', background:inner, color:txt, boxSizing:'border-box' };

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
      if (status === 429) { const w = 30; setCooldown(w); toast.error(`Rate-limited — wait ${w}s`); }
      else toast.error(e?.response?.data?.detail || 'Failed to start session');
    } finally { setLoading(false); }
  }

  if (result) {
    return result.mode === 'qr'
      ? <QRModal sessionId={result.sessionId} label={result.label} isDark={isDark} onClose={() => { setResult(null); onSuccess(); }}/>
      : <PairCodeModal sessionId={result.sessionId} label={result.label} isDark={isDark} onClose={() => { setResult(null); onSuccess(); }}/>;
  }

  return (
    <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:20, marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <Plus size={16} color={GREEN}/><span style={{ fontSize:14, fontWeight:700, color:txt }}>Connect a WhatsApp Number</span>
      </div>
      <div style={{ display:'flex', gap:4, background:inner, padding:4, borderRadius:12, marginBottom:14, width:'fit-content' }}>
        {[{id:'qr',label:'QR Code',icon:QrCode},{id:'phone',label:'Phone Number',icon:Phone}].map(({id,label:lbl,icon:Icon}) => (
          <button key={id} onClick={() => setAuthMode(id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:9, fontSize:12, fontWeight:700, cursor:'pointer', border:'none', background:authMode===id?GRAD_BTN:'transparent', color:authMode===id?'#fff':muted }}>
            <Icon size={12}/>{lbl}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {authMode === 'phone' && (
          <div>
            <input style={inp} placeholder='Phone with country code e.g. 919876543210' value={phone} onChange={e => setPhone(e.target.value)} type='tel'/>
            <p style={{ fontSize:11, color:muted, marginTop:4 }}>No + or spaces — e.g. 91 for India</p>
          </div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <input style={{ ...inp, flex:1 }} placeholder='Label — e.g. "GST Office", "Personal"…' value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key==='Enter' && handleAdd()}/>
          <button onClick={handleAdd} disabled={loading||cooldown>0} style={{ display:'flex', alignItems:'center', gap:6, border:'none', borderRadius:10, padding:'9px 18px', fontWeight:700, fontSize:13, whiteSpace:'nowrap', background:(loading||cooldown>0)?(isDark?'#334155':'#e2e8f0'):GRAD_BTN, color:(loading||cooldown>0)?muted:'#fff', cursor:(loading||cooldown>0)?'not-allowed':'pointer' }}>
            {loading ? <><RefreshCw size={13} style={{ animation:'spin 1s linear infinite' }}/> Starting…</> : cooldown>0 ? <>{cooldown}s</> : <>{authMode==='phone'?<Hash size={13}/>:<QrCode size={13}/>} {authMode==='phone'?'Get Code':'Get QR'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sessions Manager ─────────────────────────────────────────────────────── */
function SessionsManager({ isDark, sessions, loading, onRefresh }) {
  const [deletingId,  setDeletingId]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);
  const [editLabel,   setEditLabel]   = useState('');
  const [qrSession,   setQrSession]   = useState(null);
  const [pairSession, setPairSession] = useState(null);

  const card = isDark?'#1e293b':'#fff', inner = isDark?'#0f172a':'#f8fafc', border = isDark?'#334155':'#e2e8f0', txt = isDark?'#f1f5f9':'#0f172a', muted = isDark?'#94a3b8':'#64748b';
  const inp = { border:`1px solid ${border}`, borderRadius:8, padding:'5px 10px', fontSize:13, outline:'none', background:inner, color:txt, flex:1 };

  const handleDelete = async (sid) => {
    setDeletingId(sid);
    try { await api.delete(`/whatsapp/sessions/${sid}`); toast.success('Number disconnected'); onRefresh(); }
    catch { toast.error('Failed to remove'); } finally { setDeletingId(null); }
  };
  const handleSaveLabel = async (sid) => {
    try { await api.patch(`/whatsapp/sessions/${sid}/label`, { label: editLabel }); setEditingId(null); onRefresh(); }
    catch { toast.error('Failed to update'); }
  };
  const connected = sessions.filter(s => s.status === 'connected').length;

  return (
    <>
      {qrSession   && <QRModal       sessionId={qrSession.sessionId}   label={qrSession.label}   isDark={isDark} onClose={() => { setQrSession(null);   onRefresh(); }}/>}
      {pairSession && <PairCodeModal sessionId={pairSession.sessionId} label={pairSession.label} isDark={isDark} onClose={() => { setPairSession(null); onRefresh(); }}/>}
      <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid ${border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}><Smartphone size={15} color={GREEN}/><span style={{ fontSize:14, fontWeight:700, color:txt }}>Connected Numbers</span><span style={{ background:'#dcfce7', color:'#16a34a', fontSize:11, fontWeight:700, padding:'1px 8px', borderRadius:20 }}>{connected}/{sessions.length}</span></div>
          <button onClick={onRefresh} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:4 }}><RefreshCw size={14} style={{ animation:loading?'spin 1s linear infinite':'none' }}/></button>
        </div>
        {sessions.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:muted, fontSize:13 }}><Smartphone size={32} style={{ margin:'0 auto 8px', opacity:0.3, display:'block' }}/>No numbers connected yet — add one above</div>
        ) : sessions.map((s, idx) => (
          <div key={s.sessionId} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:idx<sessions.length-1?`1px solid ${border}`:'none' }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:sessionColor(idx), flexShrink:0 }}/>
            <div style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:s.status==='connected'?'#dcfce7':(isDark?'#1e293b':'#f1f5f9') }}>
              {s.status === 'connected' ? <Wifi size={16} color='#22c55e'/> : <WifiOff size={16} color='#9ca3af'/>}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              {editingId === s.sessionId ? (
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input style={inp} value={editLabel} onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if(e.key==='Enter') handleSaveLabel(s.sessionId); if(e.key==='Escape') setEditingId(null); }} autoFocus/>
                  <button onClick={() => handleSaveLabel(s.sessionId)} style={{ background:'none', border:'none', cursor:'pointer', color:'#22c55e', padding:4 }}><Check size={14}/></button>
                  <button onClick={() => setEditingId(null)} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:4 }}><X size={14}/></button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label || s.sessionId}</span>
                  <button onClick={() => { setEditingId(s.sessionId); setEditLabel(s.label||''); }} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:2 }}><Pencil size={11}/></button>
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}><StatusBadge status={s.status}/>{s.phoneNumber && <span style={{ fontSize:11, color:muted }}>+{s.phoneNumber}</span>}</div>
            </div>
            {s.status !== 'connected' && (
              <div style={{ display:'flex', gap:4 }}>
                <button onClick={() => setQrSession({ sessionId:s.sessionId, label:s.label })} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', border:'none', borderRadius:8, fontSize:11, fontWeight:700, background:GRAD_BTN, color:'#fff', cursor:'pointer' }}><QrCode size={11}/> QR</button>
                <button onClick={() => setPairSession({ sessionId:s.sessionId, label:s.label })} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', border:`1px solid ${border}`, borderRadius:8, fontSize:11, fontWeight:700, background:'transparent', color:muted, cursor:'pointer' }}><Hash size={11}/> Code</button>
              </div>
            )}
            <button onClick={() => handleDelete(s.sessionId)} disabled={deletingId===s.sessionId} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:6, borderRadius:8, opacity:deletingId===s.sessionId?0.4:1 }}>
              {deletingId===s.sessionId ? <RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }}/> : <Trash2 size={14}/>}
            </button>
          </div>
        ))}
        <p style={{ textAlign:'center', fontSize:11, color:muted, padding:'10px 16px', margin:0 }}>You can connect up to 10 WhatsApp numbers. All messages appear in the Inbox tab.</p>
      </div>
    </>
  );
}

/* ── Contact / Group list item ────────────────────────────────────────────── */
function ContactItem({ contact, active, onClick, sessionColorMap }) {
  const name     = getDisplayName(contact);
  const preview  = contact.latest_message?.body || '';
  const isOut    = contact.latest_message?.direction === 'out';
  const numColor = sessionColorMap[contact.session_id] || '#25d366';
  const isGrp    = isGroup(contact.jid);

  return (
    <button onClick={onClick} style={{ width:'100%', display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', textAlign:'left', cursor:'pointer', border:'none', borderRight:active?'2.5px solid #25D366':'2.5px solid transparent', background:active?'rgba(37,211,102,0.08)':'transparent', transition:'background 0.12s' }}>
      <div style={{ position:'relative', flexShrink:0 }}>
        <ProfileAvatar jid={contact.jid} name={name} size={44} isGrp={isGrp} profilePicUrl={contact.profile_pic_url}/>
        <div style={{ position:'absolute', bottom:1, right:1, width:11, height:11, borderRadius:'50%', background:numColor, border:'2px solid white' }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:4 }}>
          <span style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {isGrp && <span style={{ fontSize:10, background:'rgba(37,211,102,0.15)', color:'#128C7E', borderRadius:4, padding:'1px 5px', marginRight:5, fontWeight:700 }}>GROUP</span>}
            {name}
          </span>
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
  const isOut    = msg.direction === 'out';
  const numColor = sessionColorMap[msg.session_id];
  const isMedia  = msg.media_type && msg.media_type !== 'text';

  return (
    <div style={{ display:'flex', justifyContent:isOut?'flex-end':'flex-start', marginBottom:4 }}>
      <div style={{ maxWidth:'75%', padding:'8px 12px', borderRadius:isOut?'16px 16px 4px 16px':'16px 16px 16px 4px', fontSize:13, lineHeight:1.5,
        background:isOut?(numColor||'#25D366'):'var(--bg-secondary, #f1f5f9)',
        color:isOut?'#fff':'var(--text-primary, #0f172a)',
        border:isOut?'none':'1px solid var(--border, #e2e8f0)' }}>
        {msg.session_label && !isOut && (
          <p style={{ fontSize:10, fontWeight:700, opacity:0.6, textTransform:'uppercase', letterSpacing:'0.05em', margin:'0 0 3px' }}>via {msg.session_label}</p>
        )}
        {/* Media indicator */}
        {isMedia && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, opacity:0.8 }}>
            {msg.media_type === 'image'    && <Image size={14}/>}
            {msg.media_type === 'video'    && <Camera size={14}/>}
            {msg.media_type === 'audio'    && <Mic size={14}/>}
            {msg.media_type === 'document' && <FileText size={14}/>}
            {msg.filename && <span style={{ fontSize:12, fontStyle:'italic' }}>{msg.filename}</span>}
          </div>
        )}
        <p style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{msg.body}</p>
        <p style={{ margin:'4px 0 0', fontSize:10, textAlign:'right', opacity:isOut?0.75:0.6 }}>{fmtFull(msg.timestamp)}</p>
      </div>
    </div>
  );
}

/* ── Attachment preview panel ─────────────────────────────────────────────── */
function AttachmentPreview({ attachment, caption, onCaptionChange, onRemove, isDark }) {
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';
  const isImg  = attachment.mimeType.startsWith('image/');
  const isVid  = attachment.mimeType.startsWith('video/');
  const showPreview = isImg || isVid;

  return (
    <div style={{ background:isDark?'#1e293b':'#fff', border:`1px solid ${border}`, borderRadius:12, padding:12, margin:'0 0 8px', position:'relative' }}>
      <button onClick={onRemove} style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,0.4)', border:'none', cursor:'pointer', borderRadius:'50%', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', zIndex:1 }}><X size={12}/></button>
      <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
        {/* Thumbnail */}
        <div style={{ width:60, height:60, borderRadius:8, overflow:'hidden', flexShrink:0, background:isDark?'#0f172a':'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {showPreview && attachment.preview
            ? <img src={attachment.preview} alt='preview' style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : isVid ? <Camera size={24} color={muted}/> : <FileText size={24} color={muted}/>
          }
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:600, color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{attachment.filename}</p>
          <p style={{ margin:'0 0 8px', fontSize:11, color:muted }}>{attachment.mimeType} · {fmtFileSize(attachment.size)}</p>
          {/* Caption input */}
          <input
            value={caption}
            onChange={e => onCaptionChange(e.target.value)}
            placeholder={isImg || isVid ? 'Add a caption (optional)…' : 'Add a message (optional)…'}
            style={{ width:'100%', border:`1px solid ${border}`, borderRadius:8, padding:'6px 10px', fontSize:12, outline:'none', background:isDark?'#0f172a':'#f8fafc', color:txt, boxSizing:'border-box' }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Attachment menu ──────────────────────────────────────────────────────── */
function AttachMenu({ onPickFile, onClose, isDark }) {
  const bg     = isDark ? '#1e293b' : '#fff';
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';

  const items = [
    { label:'Photos & Videos', icon:Image,    accept:'image/*,video/*',              color:'#8b5cf6' },
    { label:'Document',        icon:FileText, accept:'.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt', color:'#3b82f6' },
  ];

  return (
    <motion.div
      initial={{ opacity:0, y:10, scale:0.95 }}
      animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0, y:10, scale:0.95 }}
      transition={{ duration:0.15 }}
      style={{ position:'absolute', bottom:'calc(100% + 8px)', left:0, background:bg, border:`1px solid ${border}`, borderRadius:14, padding:8, boxShadow:'0 8px 32px rgba(0,0,0,0.18)', zIndex:100, minWidth:180 }}>
      {items.map(item => (
        <label key={item.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', borderRadius:10, transition:'background 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.background=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background='transparent'}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:item.color+'22', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <item.icon size={18} color={item.color}/>
          </div>
          <span style={{ fontSize:13, fontWeight:600, color:txt }}>{item.label}</span>
          <input type='file' accept={item.accept} style={{ display:'none' }} onChange={e => { onPickFile(e.target.files[0]); onClose(); e.target.value=''; }}/>
        </label>
      ))}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ── Main Page                                                              ── */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function WhatsAppHub() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [isDark, setIsDark] = useState(() => typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!document.getElementById('wa-hub-spin')) {
      const s = document.createElement('style');
      s.id = 'wa-hub-spin';
      s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }, []);

  const [activeTab,  setActiveTab]  = useState('inbox');
  const [mobileView, setMobileView] = useState('list');
  const [showManage, setShowManage] = useState(false);

  const [sessions,    setSessions]    = useState([]);
  const [sessLoading, setSessLoading] = useState(true);
  const sessTimerRef = useRef(null);

  const [contacts, setContacts] = useState([]);
  const [loadingC, setLoadingC] = useState(false);
  const [groups,   setGroups]   = useState([]);
  const [loadingG, setLoadingG] = useState(false);

  const [activeJid,   setActiveJid]   = useState(null);
  const [activeIsGrp, setActiveIsGrp] = useState(false);
  const [thread,      setThread]      = useState([]);
  const [contact,     setContact]     = useState(null);
  const [loadingT,    setLoadingT]    = useState(false);

  const [search,     setSearch]     = useState('');
  const [numFilter,  setNumFilter]  = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // compose
  const [reply,       setReply]       = useState('');
  const [sending,     setSending]     = useState(false);
  const [fromSession, setFromSession] = useState('');

  // ★ attachment state
  const [attachment,     setAttachment]     = useState(null);   // { file, base64, mimeType, filename, size, preview }
  const [attachCaption,  setAttachCaption]  = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef(null);

  const threadEndRef = useRef(null);

  const sessionColorMap = useMemo(() => {
    const map = {};
    sessions.forEach((s, i) => { map[s.sessionId] = sessionColor(i); });
    return map;
  }, [sessions]);

  /* ── Close attach menu on outside click ─────────────────────────────────── */
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  /* ── Load sessions ── */
  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try { const { data } = await api.get('/whatsapp/sessions'); setSessions(data?.sessions || []); }
    catch { /* bridge may be offline */ } finally { setSessLoading(false); }
  }, []);

  useEffect(() => {
    loadSessions();
    const schedule = () => { sessTimerRef.current = setTimeout(async () => { await loadSessions(); schedule(); }, 60000); };
    schedule();
    return () => clearTimeout(sessTimerRef.current);
  }, [loadSessions]);

  /* ── Load contacts ── */
  const loadContacts = useCallback(async () => {
    setLoadingC(true);
    try {
      const p = new URLSearchParams({ limit:'100' });
      if (numFilter)  p.set('session_id', numFilter);
      if (unreadOnly) p.set('unread_only', 'true');
      const { data } = await api.get(`/whatsapp/hub/inbox?${p}`);
      setContacts((data.contacts || []).filter(c => !isGroup(c.jid)));
    } catch { /* silently */ } finally { setLoadingC(false); }
  }, [numFilter, unreadOnly]);

  /* ── Load groups ── */
  const loadGroups = useCallback(async () => {
    setLoadingG(true);
    try {
      const { data } = await api.get('/whatsapp/hub/inbox?limit=200');
      const all = (data.contacts || []).filter(c => isGroup(c.jid));
      const byName = {};
      for (const g of all) {
        const key = (g.display_name || g.jid).toLowerCase().trim();
        if (!byName[key]) byName[key] = { ...g, _session_count:1 };
        else {
          byName[key]._session_count++;
          if (new Date(g.last_message_at) > new Date(byName[key].last_message_at))
            byName[key] = { ...g, _session_count: byName[key]._session_count };
        }
      }
      setGroups(Object.values(byName).sort((a,b) => new Date(b.last_message_at||0)-new Date(a.last_message_at||0)));
    } catch { /* silently */ } finally { setLoadingG(false); }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    const t = setInterval(() => { loadContacts(); loadGroups(); }, 30000);
    return () => clearInterval(t);
  }, [loadContacts, loadGroups]);

  /* ── Load thread ── */
  const loadThread = useCallback(async (jid) => {
    if (!jid) return;
    setLoadingT(true);
    try { const { data } = await api.get(`/whatsapp/hub/conversations/${encodeURIComponent(jid)}`); setThread(data.messages || []); setContact(data.contact); }
    catch { /* silently */ } finally { setLoadingT(false); }
  }, []);

  useEffect(() => {
    if (activeJid) {
      loadThread(activeJid);
      api.patch(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}/read`).catch(() => {});
    }
  }, [activeJid, loadThread]);

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [thread]);

  useEffect(() => {
    if (!activeJid) return;
    const t = setInterval(() => loadThread(activeJid), 20000);
    return () => clearInterval(t);
  }, [activeJid, loadThread]);

  const openConversation = (c) => { setActiveJid(c.jid); setActiveIsGrp(isGroup(c.jid)); setMobileView('thread'); };
  const goBack = () => { setMobileView('list'); setActiveJid(null); setThread([]); setContact(null); clearAttachment(); };

  /* ── Attachment helpers ── */
  const clearAttachment = () => { setAttachment(null); setAttachCaption(''); setShowAttachMenu(false); };

  const handlePickFile = (file) => {
    if (!file) return;
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) { toast.error('File too large (max 15 MB)'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      const preview = file.type.startsWith('image/') ? dataUrl : null;
      setAttachment({ file, base64, mimeType: file.type, filename: file.name, size: file.size, preview });
      setAttachCaption('');
    };
    reader.readAsDataURL(file);
  };

  /* ── Send text message ── */
  async function handleSend() {
    if (sending) return;
    if (!activeJid) return;

    // If there's an attachment, send it instead
    if (attachment) { await handleSendMedia(); return; }

    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post('/whatsapp/hub/reply', { jid: activeJid, message: reply.trim(), session_id: fromSession || null });
      setReply('');
      await loadThread(activeJid);
      await loadContacts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to send'); }
    finally { setSending(false); }
  }

  /* ── Send media attachment ── */
  async function handleSendMedia() {
    if (!attachment || !activeJid || sending) return;
    setSending(true);
    try {
      await api.post('/whatsapp/hub/reply-media', {
        jid:        activeJid,
        session_id: fromSession || null,
        base64:     attachment.base64,
        mime_type:  attachment.mimeType,
        filename:   attachment.filename,
        caption:    attachCaption.trim() || null,
      });
      clearAttachment();
      setReply('');
      await loadThread(activeJid);
      await loadContacts();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to send attachment'); }
    finally { setSending(false); }
  }

  /* ── Derived ── */
  const currentList = activeTab === 'groups' ? groups : contacts;
  const filteredList = useMemo(() => currentList.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (getDisplayName(c)||'').toLowerCase().includes(q) || (c.phone||'').includes(q);
  }), [currentList, search]);

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const noSessions        = sessions.length === 0 && !sessLoading;

  /* ── Colours ── */
  const bg     = isDark ? '#0f172a' : '#f0f2f5';
  const panel  = isDark ? '#1e293b' : '#fff';
  const border = isDark ? '#334155' : '#e2e8f0';
  const txt    = isDark ? '#f1f5f9' : '#0f172a';
  const muted  = isDark ? '#94a3b8' : '#64748b';

  const numTabs = [
    { id:'', label:'All', color:'#25D366' },
    ...sessions.map((s,i) => ({ id:s.sessionId, label:s.label||`Acct ${i+1}`, color:sessionColor(i) })),
  ];

  /* ── Can send ── */
  const canSend = !sending && (reply.trim().length > 0 || attachment !== null);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, margin:'-16px', overflow:'hidden', background:bg }}>

      {/* Manage Numbers slide-over */}
      <AnimatePresence>
        {showManage && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:900, backdropFilter:'blur(2px)' }} onClick={() => setShowManage(false)}/>
            <motion.div initial={{ x:'100%' }} animate={{ x:0 }} exit={{ x:'100%' }} transition={{ type:'spring', damping:28, stiffness:300 }} style={{ position:'fixed', top:0, right:0, bottom:0, width:420, maxWidth:'95vw', background:panel, zIndex:901, overflowY:'auto', padding:20, boxShadow:'-8px 0 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <button onClick={() => setShowManage(false)} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:6, borderRadius:8, display:'flex', alignItems:'center', gap:4 }}><X size={18}/> <span style={{ fontSize:13, fontWeight:600 }}>Close</span></button>
                <span style={{ fontSize:16, fontWeight:800, color:txt, flex:1, textAlign:'center' }}>Manage Numbers</span>
              </div>
              <AddNumberPanel isDark={isDark} onSuccess={() => { loadSessions(); loadContacts(); loadGroups(); }}/>
              <SessionsManager isDark={isDark} sessions={sessions} loading={sessLoading} onRefresh={loadSessions}/>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div style={{ flexShrink:0, background:`linear-gradient(135deg, ${EMERALD} 0%, ${GREEN} 100%)`, padding:'12px 16px 0', boxShadow:'0 2px 12px rgba(18,140,126,0.25)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
          {activeJid && <button onClick={goBack} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, background:'rgba(255,255,255,0.18)', color:'#fff' }}><ArrowLeft size={14}/> Back</button>}
          {!activeJid && <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><MessageCircle size={20} color='#fff'/></div>}
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:18, fontWeight:800, color:'#fff', lineHeight:1.2 }}>WhatsApp Hub</h1>
            <p style={{ margin:0, fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>{connectedSessions.length} of {sessions.length} number{sessions.length!==1?'s':''} connected</p>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {activeTab === 'inbox' && !activeJid && (
              <>
                <button onClick={() => setUnreadOnly(v => !v)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, background:unreadOnly?'#fff':'rgba(255,255,255,0.18)', color:unreadOnly?'#128C7E':'#fff' }}><Filter size={11}/>{unreadOnly?'Unread':'All'}</button>
                <button onClick={() => { loadContacts(); loadGroups(); }} style={{ padding:6, borderRadius:8, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.18)', color:'#fff' }} title='Refresh'><RefreshCw size={13} style={{ animation:loadingC?'spin 1s linear infinite':'none' }}/></button>
              </>
            )}
            {isAdmin && <button onClick={() => setShowManage(true)} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, background:'rgba(255,255,255,0.18)', color:'#fff' }}><Settings2 size={11}/> Manage Numbers</button>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginBottom:0 }}>
          {[
            { id:'inbox',  label:'Messages', icon:MessageCircle, count:contacts.filter(c=>c.unread_count>0).length },
            { id:'groups', label:'Groups',   icon:Users,         count:groups.length },
          ].map(tab => {
            const Icon = tab.icon; const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setActiveJid(null); setMobileView('list'); }} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, borderRadius:'8px 8px 0 0', transition:'all 0.15s', background:isActive?panel:'rgba(255,255,255,0.1)', color:isActive?EMERALD:'rgba(255,255,255,0.85)' }}>
                <Icon size={13}/>{tab.label}
                {tab.count > 0 && <span style={{ background:isActive?GREEN:'rgba(255,255,255,0.3)', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, minWidth:18 }}>{tab.count}</span>}
              </button>
            );
          })}
          {sessions.length > 0 && !activeJid && (
            <div style={{ display:'flex', gap:4, overflowX:'auto', paddingBottom:10, marginLeft:'auto', scrollbarWidth:'none' }}>
              {numTabs.map(t => (
                <button key={t.id} onClick={() => setNumFilter(t.id)} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'4px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, transition:'all 0.15s', background:numFilter===t.id?'#fff':'rgba(255,255,255,0.15)', color:numFilter===t.id?t.color:'rgba(255,255,255,0.85)' }}>
                  {t.id !== '' && <Circle size={7} fill={t.color} color={t.color}/>}{t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, display:'flex', minHeight:0, overflow:'hidden' }}>

        {/* Contact list */}
        <div style={{ width:320, minWidth:240, flexShrink:0, display:mobileView==='thread'?'none':'flex', flexDirection:'column', borderRight:`1px solid ${border}`, background:panel }}>
          {/* Search */}
          <div style={{ padding:'10px 12px', borderBottom:`1px solid ${border}` }}>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:muted }}/>
              <input style={{ width:'100%', paddingLeft:32, paddingRight:12, paddingTop:7, paddingBottom:7, fontSize:13, border:`1px solid ${border}`, borderRadius:10, outline:'none', background:isDark?'#0f172a':'#f8fafc', color:txt, boxSizing:'border-box' }} placeholder={activeTab==='groups'?'Search groups…':'Search contacts…'} value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
          </div>
          {activeTab === 'groups' && groups.length > 0 && (
            <div style={{ padding:'6px 14px', background:isDark?'rgba(37,211,102,0.08)':'rgba(37,211,102,0.06)', borderBottom:`1px solid ${border}`, display:'flex', alignItems:'center', gap:6 }}>
              <Users size={12} color={GREEN}/><span style={{ fontSize:11, color:muted }}>{groups.length} group{groups.length!==1?'s':''} across all numbers — duplicates merged</span>
            </div>
          )}
          <div style={{ flex:1, overflowY:'auto', color:txt }}>
            {noSessions && (
              <div style={{ padding:24, textAlign:'center', color:muted }}>
                <Smartphone size={40} style={{ margin:'0 auto 10px', display:'block', opacity:0.3 }}/>
                <p style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>No WhatsApp numbers connected</p>
                <p style={{ fontSize:12, lineHeight:1.6, marginBottom:14, opacity:0.8 }}>Connect a number to start receiving messages.</p>
                {isAdmin ? <button onClick={() => setShowManage(true)} style={{ background:GRAD_BTN, color:'#fff', border:'none', borderRadius:10, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700, display:'inline-flex', alignItems:'center', gap:6 }}><Plus size={14}/> Connect a Number</button> : <p style={{ fontSize:12, color:muted, fontStyle:'italic' }}>Ask your admin to connect a WhatsApp number.</p>}
              </div>
            )}
            {!noSessions && (loadingC||loadingG) && filteredList.length === 0 && (
              <div style={{ padding:20, textAlign:'center', color:muted }}><RefreshCw size={20} style={{ margin:'0 auto 6px', display:'block', animation:'spin 1s linear infinite' }}/><p style={{ fontSize:12 }}>Loading…</p></div>
            )}
            {!noSessions && !(loadingC||loadingG) && filteredList.length === 0 && (
              <div style={{ padding:24, textAlign:'center', color:muted }}>
                {activeTab === 'groups'
                  ? <><Users size={36} style={{ margin:'0 auto 8px', display:'block', opacity:0.25 }}/><p style={{ fontSize:13 }}>{search?'No groups match':'No group conversations yet'}</p></>
                  : <><MessageCircle size={36} style={{ margin:'0 auto 8px', display:'block', opacity:0.25 }}/><p style={{ fontSize:13 }}>{search?'No contacts match':'No conversations yet'}</p>{!search && connectedSessions.length>0 && <p style={{ fontSize:12, marginTop:4, opacity:0.7 }}>Chat history syncs automatically when a number connects.</p>}</>
                }
              </div>
            )}
            {filteredList.map(c => (
              <ContactItem key={c.jid} contact={c} active={activeJid===c.jid} sessionColorMap={sessionColorMap} onClick={() => openConversation(c)}/>
            ))}
          </div>
        </div>

        {/* Thread panel */}
        <div style={{ flex:1, display:mobileView==='list'?'none':'flex', flexDirection:'column', minWidth:0, background:isDark?'#0b141a':'#efeae2' }}>
          {!activeJid ? (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:muted, padding:32 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:isDark?'#1e293b':'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}><MessageCircle size={36} color={GREEN}/></div>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:16, fontWeight:700, color:txt, margin:'0 0 4px' }}>WhatsApp Hub</p>
                <p style={{ fontSize:13, color:muted, margin:0 }}>{noSessions?(isAdmin?'Click "Manage Numbers" to connect your first WhatsApp number.':'No numbers connected yet.'):'Select a conversation to view messages.'}</p>
                {sessions.length > 0 && <p style={{ fontSize:12, color:muted, marginTop:6 }}>{sessions.length} number{sessions.length!==1?'s':''} · {contacts.length+groups.length} conversation{(contacts.length+groups.length)!==1?'s':''}</p>}
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:panel, borderBottom:`1px solid ${border}`, flexShrink:0 }}>
                <button onClick={goBack} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:`1px solid ${border}`, cursor:'pointer', color:txt, padding:'5px 10px', borderRadius:8, fontSize:12, fontWeight:600, flexShrink:0 }} title='Back'><ChevronLeft size={16}/> Back</button>
                <ProfileAvatar jid={activeJid} name={getDisplayName(contact)} size={38} isGrp={activeIsGrp} profilePicUrl={contact?.profile_pic_url}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontWeight:700, fontSize:14, color:txt, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {activeIsGrp && <span style={{ fontSize:10, background:'rgba(37,211,102,0.15)', color:'#128C7E', borderRadius:4, padding:'1px 5px', marginRight:5, fontWeight:700 }}>GROUP</span>}
                    {getDisplayName(contact) || displayJid(activeJid)}
                  </p>
                  {contact?.session_id && sessionColorMap[contact.session_id] && (
                    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:1 }}>
                      <Circle size={8} fill={sessionColorMap[contact.session_id]} color={sessionColorMap[contact.session_id]}/>
                      <span style={{ fontSize:11, color:muted }}>{sessions.find(s=>s.sessionId===contact.session_id)?.label || contact.session_id}</span>
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <button title='Delete conversation' onClick={() => { if (window.confirm('Delete this conversation and all its messages?')) { api.delete(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}`).then(() => { goBack(); loadContacts(); loadGroups(); }).catch(() => toast.error('Failed to delete')); } }} style={{ background:'none', border:'none', cursor:'pointer', color:muted, padding:6, borderRadius:8 }}><Trash2 size={15}/></button>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
                {loadingT && thread.length === 0
                  ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}><Loader2 size={20} color={GREEN} style={{ animation:'spin 1s linear infinite' }}/></div>
                  : thread.length === 0
                    ? <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:8, color:muted }}><MessageCircle size={32} style={{ opacity:0.25 }}/><p style={{ fontSize:13 }}>No messages yet — send the first one!</p></div>
                    : thread.map(msg => <Bubble key={msg.id} msg={msg} sessionColorMap={sessionColorMap}/>)
                }
                <div ref={threadEndRef}/>
              </div>

              {/* ── Compose area ── */}
              <div style={{ padding:12, background:panel, borderTop:`1px solid ${border}`, flexShrink:0 }}>

                {/* Send-from selector for multiple sessions */}
                {connectedSessions.length > 1 && (
                  <div style={{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:11, color:muted, marginRight:4 }}>Send from:</span>
                    {[{sessionId:'',label:'Auto'}, ...connectedSessions].map((s, i) => {
                      const col = s.sessionId ? sessionColorMap[s.sessionId] : '#94a3b8';
                      const isActive = fromSession === s.sessionId;
                      return (
                        <button key={s.sessionId||'auto'} onClick={() => setFromSession(s.sessionId)}
                          style={{ padding:'3px 10px', borderRadius:20, border:`1.5px solid ${isActive?col:(isDark?'#334155':'#e2e8f0')}`, cursor:'pointer', fontSize:11, fontWeight:700, background:isActive?col+'22':'transparent', color:isActive?col:muted }}>
                          {s.sessionId !== '' && <Circle size={7} fill={col} color={col} style={{ marginRight:4, verticalAlign:'middle' }}/>}
                          {s.label || `Acct ${i}`}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Attachment preview */}
                {attachment && (
                  <AttachmentPreview
                    attachment={attachment}
                    caption={attachCaption}
                    onCaptionChange={setAttachCaption}
                    onRemove={clearAttachment}
                    isDark={isDark}
                  />
                )}

                {/* Input row */}
                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>

                  {/* ★ Attachment button */}
                  <div ref={attachMenuRef} style={{ position:'relative', flexShrink:0 }}>
                    <button
                      onClick={() => setShowAttachMenu(v => !v)}
                      title='Attach file'
                      style={{ width:40, height:40, borderRadius:'50%', border:`1px solid ${border}`, cursor:'pointer', background:showAttachMenu?(isDark?'#334155':'#e2e8f0'):'transparent', color:muted, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
                      <Paperclip size={18}/>
                    </button>
                    <AnimatePresence>
                      {showAttachMenu && (
                        <AttachMenu onPickFile={handlePickFile} onClose={() => setShowAttachMenu(false)} isDark={isDark}/>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Text input — hidden when attachment without caption is shown */}
                  {!attachment && (
                    <textarea rows={2} value={reply} onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder='Type a message…  (Enter to send · Shift+Enter for new line)'
                      style={{ flex:1, border:`1px solid ${border}`, borderRadius:12, padding:'10px 14px', fontSize:13, resize:'none', outline:'none', background:isDark?'#0f172a':'#f8fafc', color:txt, lineHeight:1.5 }}/>
                  )}

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    title={attachment ? 'Send attachment' : 'Send message'}
                    style={{ width:40, height:40, borderRadius:'50%', border:'none', cursor:canSend?'pointer':'not-allowed', background:canSend?GRAD_BTN:(isDark?'#334155':'#e2e8f0'), color:canSend?'#fff':muted, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                    {sending
                      ? <Loader2 size={16} style={{ animation:'spin 1s linear infinite' }}/>
                      : <Send size={16}/>
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Desktop right empty state */}
        {mobileView === 'list' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:muted, background:isDark?'#0b141a':'#efeae2', padding:32 }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background:isDark?'#1e293b':'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}><MessageCircle size={36} color={GREEN}/></div>
            <div style={{ textAlign:'center' }}>
              <p style={{ fontSize:16, fontWeight:700, color:txt, margin:'0 0 4px' }}>WhatsApp Hub</p>
              <p style={{ fontSize:13, color:muted, margin:0 }}>{noSessions?(isAdmin?'Click "Manage Numbers" to connect your first WhatsApp number.':'No numbers connected yet — ask your admin.'):`Select a ${activeTab==='groups'?'group':'conversation'} to view messages.`}</p>
              {sessions.length > 0 && <p style={{ fontSize:12, color:muted, marginTop:6 }}>{sessions.length} number{sessions.length!==1?'s':''} · {contacts.length} chat{contacts.length!==1?'s':''} · {groups.length} group{groups.length!==1?'s':''}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
