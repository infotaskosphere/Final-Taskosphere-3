/**
 * WhatsAppSendDialog.jsx  — Enhanced with:
 *  1. Auto-send to saved phone number (no extra click when phone is on record)
 *  2. Multi-account picker: when ≥2 WA sessions are connected, prompt which account to use
 *  3. Direct send via WA Bridge API when connected; WA Web fallback otherwise
 *  4. History tab — shows all WA messages sent to this client with stats report
 *  5. Used across: Clients, PassVault, DSC, Invoicing pages.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  MessageCircle, Phone, Send, X, ExternalLink, Loader2,
  CheckCircle2, AlertCircle, Image, Edit2, Link, ChevronRight,
  Smartphone, Wifi, WifiOff, RefreshCw, Copy, Check,
  Clock, History, BarChart2, User, ChevronDown,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatPhoneE164, openWhatsApp, getWASettings } from '@/hooks/useWhatsApp';
import api from '@/lib/api';

const WA_GREEN = '#25D366';
const WA_DARK  = '#128C7E';
const WA_LIGHT = '#dcf8c6';

/* ── WhatsApp SVG icon ──────────────────────────────────────────────────────── */
function WAIcon({ size = 16, color = WA_GREEN }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/* ── Fetch connected WA sessions from backend ────────────────────────────────── */
async function fetchConnectedSessions() {
  try {
    const { data } = await api.get('/whatsapp/sessions');
    return (data?.sessions || []).filter(s => s.status === 'connected');
  } catch {
    return [];
  }
}

/* ── Send directly via WA Bridge API ─────────────────────────────────────────── */
async function sendViaApi(phone, message, sessionId) {
  const to = formatPhoneE164(phone);
  if (!to) return { success: false, error: 'Invalid phone' };
  try {
    const { data } = await api.post('/whatsapp/send', {
      to,
      message,
      session_id: sessionId || null,
      message_type: 'general',
    });
    return { success: true, method: 'api', ...data };
  } catch (err) {
    return { success: false, error: err?.response?.data?.detail || err.message };
  }
}

/* ── Account Picker Card ──────────────────────────────────────────────────────── */
function AccountCard({ session, selected, onSelect, isDark }) {
  const initials = (session.displayName || session.phoneNumber || '?')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const colors = [
    ['#25D366', '#128C7E'],
    ['#4f46e5', '#7c3aed'],
    ['#0ea5e9', '#0284c7'],
    ['#f59e0b', '#d97706'],
  ];
  const colorIdx = (session.sessionId?.charCodeAt(0) || 0) % colors.length;
  const [accent, dark] = colors[colorIdx];

  return (
    <motion.button
      onClick={() => onSelect(session.sessionId)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        borderRadius: 12, cursor: 'pointer',
        border: selected
          ? `2px solid ${accent}`
          : `2px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
        background: selected
          ? (isDark ? `${accent}15` : `${accent}0d`)
          : (isDark ? 'rgba(255,255,255,0.03)' : '#fafbfc'),
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'all 0.15s', position: 'relative', overflow: 'hidden',
      }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(135deg, ${accent}, ${dark})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: -0.5,
        boxShadow: `0 3px 10px ${accent}40`,
      }}>{initials}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 700,
          color: isDark ? '#e2e8f0' : '#0f172a',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{session.displayName || 'Unknown Account'}</p>
        <p style={{
          margin: '2px 0 0', fontSize: 11, fontFamily: 'monospace',
          color: isDark ? '#64748b' : '#94a3b8',
        }}>+{session.phoneNumber || '—'}</p>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontSize: 10, fontWeight: 700, color: WA_GREEN,
        background: `${WA_GREEN}15`, padding: '3px 8px', borderRadius: 20,
      }}>
        <Wifi size={9}/> Live
      </div>

      {selected && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          width: 18, height: 18, borderRadius: '50%',
          background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={10} color="#fff" strokeWidth={3}/>
        </div>
      )}
    </motion.button>
  );
}

/* ── Message bubble (WhatsApp preview style) ─────────────────────────────────── */
function MsgBubble({ text, isDark }) {
  return (
    <div style={{
      background: isDark ? '#1e3a2f' : WA_LIGHT,
      border: `1px solid ${isDark ? '#2d5a3f' : '#b7e4c7'}`,
      borderRadius: '0 14px 14px 14px',
      padding: '10px 12px',
      fontSize: 13, color: isDark ? '#d4edda' : '#1a3a2a',
      lineHeight: 1.55, whiteSpace: 'pre-wrap',
      maxHeight: 140, overflowY: 'auto',
      fontFamily: "'DM Sans', system-ui",
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: -8, width: 0, height: 0,
        borderTop: `8px solid ${isDark ? '#1e3a2f' : WA_LIGHT}`,
        borderLeft: '8px solid transparent',
      }}/>
      {text || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No message</span>}
    </div>
  );
}

/* ── History Tab ─────────────────────────────────────────────────────────────── */
function HistoryTab({ phone, entityName, isDark }) {
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);

  const bg     = isDark ? '#0f172a' : '#fff';
  const card   = isDark ? '#1a2236' : '#f8fafc';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const text   = isDark ? '#f0f4f8' : '#0f172a';
  const muted  = isDark ? '#64748b' : '#94a3b8';

  const normalizedPhone = formatPhoneE164(phone);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/messages', { params: { limit: 200 } });
      const all = Array.isArray(data) ? data : [];
      // Filter to messages sent to this client's number
      const filtered = normalizedPhone
        ? all.filter(m => {
            const to = (m.to || '').replace(/\D/g, '');
            return to === normalizedPhone || to.endsWith(normalizedPhone.slice(-10));
          })
        : all;
      // Sort newest first
      filtered.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      setMessages(filtered);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [normalizedPhone]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const sentCount   = messages.filter(m => m.status === 'sent').length;
  const failedCount = messages.filter(m => m.status === 'failed').length;

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return iso; }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px 22px', textAlign: 'center' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'inline-block' }}>
          <RefreshCw size={24} color={WA_GREEN}/>
        </motion.div>
        <p style={{ color: muted, fontSize: 13, marginTop: 10 }}>Loading history…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 22px 18px' }}>

      {/* ── Report summary row ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16,
      }}>
        {[
          { label: 'Total Sent',  value: messages.length, color: WA_GREEN,   bg: `${WA_GREEN}12`  },
          { label: 'Delivered',   value: sentCount,        color: '#22c55e',  bg: '#dcfce7'         },
          { label: 'Failed',      value: failedCount,      color: '#ef4444',  bg: '#fee2e2'         },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg, borderRadius: 12, padding: '10px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: stat.color, fontWeight: 600, marginTop: 3, opacity: 0.8 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Message list ── */}
      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: card,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px',
          }}>
            <History size={22} color={muted}/>
          </div>
          <p style={{ color: muted, fontSize: 13, margin: 0 }}>
            No messages sent to {entityName || phone || 'this contact'} yet
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {messages.map((msg, idx) => {
            const isExpanded = expanded === idx;
            const isSent = msg.status === 'sent';
            return (
              <motion.div
                key={msg.id || idx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                  border: `1px solid ${border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : idx)}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: isSent ? WA_GREEN : '#ef4444',
                  }}/>

                  {/* Time */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 11, color: muted, fontFamily: 'monospace',
                    }}>{fmtDate(msg.sent_at)}</p>
                    {msg.sent_by && msg.sent_by !== 'system' && (
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <User size={9}/> {msg.sent_by_name || msg.sent_by}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: isSent ? `${WA_GREEN}15` : '#fee2e2',
                    color: isSent ? WA_GREEN : '#ef4444',
                    flexShrink: 0,
                  }}>
                    {isSent ? '✓ Sent' : '✗ Failed'}
                  </span>

                  {/* Expand toggle */}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ flexShrink: 0 }}
                  >
                    <ChevronDown size={13} color={muted}/>
                  </motion.div>
                </div>

                {/* Message preview (collapsed: 1 line; expanded: full) */}
                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <motion.div
                      key="expanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        borderTop: `1px solid ${border}`,
                        padding: '10px 12px',
                        background: isDark ? '#1e3a2f' : WA_LIGHT,
                        fontSize: 12, lineHeight: 1.6, color: isDark ? '#d4edda' : '#1a3a2a',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {msg.message || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>No content</span>}
                      </div>
                      {msg.error && (
                        <div style={{
                          borderTop: `1px solid ${border}`,
                          padding: '6px 12px',
                          background: '#fee2e2',
                          fontSize: 11, color: '#ef4444',
                        }}>
                          Error: {msg.error}
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div style={{
                      padding: '0 12px 10px 30px',
                      fontSize: 12, color: muted,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {msg.message || '—'}
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Refresh */}
      <button
        onClick={fetchHistory}
        style={{
          marginTop: 12, width: '100%', padding: '9px', borderRadius: 10,
          border: `1px solid ${border}`, background: 'transparent',
          color: muted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <RefreshCw size={12}/> Refresh History
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main Dialog
═══════════════════════════════════════════════════════════════════════════════ */
export default function WhatsAppSendDialog({
  open,
  onClose,
  phone: initialPhone = '',
  entityName = '',
  message = '',
  title = 'Send via WhatsApp',
  subtitle = '',
  isDark = false,
  onPhoneSaved,
  canSendScreenshot = false,
  settingsPath = '/settings/whatsapp',
}) {
  const [phone, setPhone]             = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [editedMsg, setEditedMsg]     = useState('');
  const [showMsgEdit, setShowMsgEdit] = useState(false);
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [copied, setCopied]           = useState(false);

  // Tab: 'send' | 'history'
  const [activeTab, setActiveTab]     = useState('send');

  // Multi-account
  const [sessions, setSessions]           = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [step, setStep]                   = useState('compose'); // 'compose' | 'pick_account'

  const settings = getWASettings();
  const hasPhone = !!phone && phone.replace(/\D/g,'').length >= 10;
  const finalMsg = editedMsg || message;

  /* Load sessions when dialog opens */
  useEffect(() => {
    if (!open) return;
    setPhone(initialPhone || '');
    setEditingPhone(!initialPhone);
    setSent(false);
    setSending(false);
    setEditedMsg(message);
    setShowMsgEdit(false);
    setStep('compose');
    setSelectedSession(null);
    setActiveTab('send');

    setSessionsLoading(true);
    fetchConnectedSessions().then(list => {
      setSessions(list);
      if (list.length === 1) setSelectedSession(list[0].sessionId);
      setSessionsLoading(false);
    });
  }, [open, initialPhone, message]);

  const handleSend = async () => {
    const digits = phone.replace(/\D/g,'');
    if (digits.length < 10) { toast.error('Enter a valid 10-digit phone number'); return; }

    if (sessions.length > 1 && !selectedSession && step === 'compose') {
      setStep('pick_account');
      return;
    }

    setSending(true);
    try {
      if (sessions.length > 0) {
        const result = await sendViaApi(phone, finalMsg, selectedSession);
        if (result.success) {
          setSent(true);
          toast.success('Message sent via WhatsApp ✓');
          if (onPhoneSaved && !initialPhone) onPhoneSaved(phone);
          setTimeout(() => { onClose?.(); setSent(false); }, 2200);
          return;
        }
        console.warn('WA API failed, falling back to web:', result.error);
      }
      openWhatsApp(phone, finalMsg);
      setSent(true);
      toast.success('WhatsApp Web opened — message ready to send');
      if (onPhoneSaved && !initialPhone) onPhoneSaved(phone);
      setTimeout(() => { onClose?.(); setSent(false); }, 2200);
    } finally {
      setSending(false);
    }
  };

  const handleCopyMsg = () => {
    navigator.clipboard?.writeText(finalMsg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  /* ── Theming ── */
  const bg     = isDark ? '#0f172a' : '#fff';
  const card   = isDark ? '#1a2236' : '#f8fafc';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const text   = isDark ? '#f0f4f8' : '#0f172a';
  const muted  = isDark ? '#64748b' : '#94a3b8';
  const label  = isDark ? '#94a3b8' : '#64748b';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose?.()}>
      <DialogContent style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 20, padding: 0, maxWidth: 560,
        overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{
          background: `linear-gradient(135deg, ${WA_DARK} 0%, ${WA_GREEN} 100%)`,
          padding: '14px 22px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}>
              <WAIcon size={22} color="#fff"/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>
                {step === 'pick_account' ? 'Choose Account' : title}
              </h2>
              {subtitle && (
                <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{subtitle}</p>
              )}
            </div>

            {/* Session pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {sessionsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px',
                  fontSize: 11, color: '#fff' }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }}/>
                </div>
              ) : sessions.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '3px 10px',
                  fontSize: 11, color: '#fff', fontWeight: 700 }}>
                  <Wifi size={10}/>
                  {sessions.length} connected
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px',
                  fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                  <WifiOff size={10}/> Web mode
                </div>
              )}
            </div>

            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8,
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', flexShrink: 0, backdropFilter: 'blur(4px)',
            }}>
              <X size={14}/>
            </button>
          </div>

          {/* ── Tab bar (only on compose step, not pick_account or sent) ── */}
          {step === 'compose' && !sent && (
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid rgba(255,255,255,0.15)' }}>
              {[
                { id: 'send',    label: 'Send',    icon: <Send size={12}/> },
                { id: 'history', label: 'History', icon: <History size={12}/> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 18px', fontSize: 12, fontWeight: 700,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.55)',
                    display: 'flex', alignItems: 'center', gap: 5,
                    borderBottom: activeTab === tab.id ? '2px solid #fff' : '2px solid transparent',
                    marginBottom: -2, transition: 'all 0.15s',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ══ STEP: PICK ACCOUNT ══════════════════════════════════════════════ */}
          {step === 'pick_account' ? (
            <motion.div key="pick"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}
              style={{ padding: '14px 22px 18px' }}>

              <p style={{ margin: '0 0 14px', fontSize: 13, color: label, lineHeight: 1.5 }}>
                Multiple WhatsApp accounts are connected. Choose which one to send from:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {sessions.map(s => (
                  <AccountCard
                    key={s.sessionId}
                    session={s}
                    selected={selectedSession === s.sessionId}
                    onSelect={setSelectedSession}
                    isDark={isDark}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('compose')} style={{
                  flex: 1, padding: '11px 0', borderRadius: 12,
                  border: `1.5px solid ${border}`, background: 'transparent',
                  color: label, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>← Back</button>
                <motion.button
                  onClick={handleSend}
                  disabled={!selectedSession || sending}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 2, padding: '11px 0', borderRadius: 12, border: 'none',
                    background: selectedSession
                      ? `linear-gradient(135deg, ${WA_DARK}, ${WA_GREEN})`
                      : '#94a3b8',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: selectedSession ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: selectedSession ? `0 4px 14px ${WA_GREEN}40` : 'none',
                  }}>
                  {sending
                    ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Sending…</>
                    : <><WAIcon size={16} color="#fff"/> Send Now</>}
                </motion.button>
              </div>
            </motion.div>

          ) : sent ? (
            /* ══ SENT STATE ════════════════════════════════════════════════════ */
            <motion.div key="sent"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: `${WA_GREEN}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircle2 size={32} color={WA_GREEN}/>
              </div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: text }}>Message Sent!</p>
              <p style={{ margin: 0, fontSize: 13, color: muted }}>
                Delivered to {phone} via WhatsApp
              </p>
            </motion.div>

          ) : activeTab === 'history' ? (
            /* ══ HISTORY TAB ═══════════════════════════════════════════════════ */
            <motion.div key="history"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <HistoryTab phone={phone || initialPhone} entityName={entityName} isDark={isDark}/>
            </motion.div>

          ) : (
            /* ══ COMPOSE / SEND TAB ════════════════════════════════════════════ */
            <motion.div key="compose"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              style={{ padding: '14px 22px 18px' }}>

              {/* Entity */}
              {entityName && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 10, color: muted, textTransform: 'uppercase',
                    letterSpacing: 1, fontWeight: 600, marginBottom: 3 }}>Sending for</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: text,
                    letterSpacing: -0.3 }}>{entityName}</p>
                </div>
              )}

              {/* Phone */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: label,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>WhatsApp Number</label>
                  {hasPhone && !editingPhone && (
                    <button onClick={() => setEditingPhone(true)} style={{
                      fontSize: 11, color: WA_GREEN, background: 'none', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700,
                    }}>
                      <Edit2 size={10}/> Change
                    </button>
                  )}
                </div>

                {!editingPhone && hasPhone ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: card, border: `2px solid ${WA_GREEN}35`, borderRadius: 12,
                    padding: '10px 14px',
                  }}>
                    <WAIcon size={16} color={WA_GREEN}/>
                    <span style={{ color: text, fontWeight: 700, fontSize: 14, fontFamily: 'monospace', flex: 1 }}>
                      {phone}
                    </span>
                    <span style={{
                      fontSize: 11, color: WA_GREEN, fontWeight: 700,
                      background: `${WA_GREEN}15`, padding: '2px 8px', borderRadius: 20,
                    }}>✓ Ready</span>
                  </div>
                ) : (
                  <div>
                    {!initialPhone && (
                      <div style={{
                        background: isDark ? 'rgba(245,158,11,0.08)' : '#fffbeb',
                        border: `1px solid ${isDark ? 'rgba(245,158,11,0.25)' : '#fde68a'}`,
                        borderRadius: 10, padding: '8px 12px', marginBottom: 8,
                        fontSize: 12, color: isDark ? '#fcd34d' : '#92400e',
                        display: 'flex', alignItems: 'flex-start', gap: 6,
                      }}>
                        <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }}/>
                        No phone number on record. Enter one below, or save it to the client record first.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Phone size={13} style={{
                          position: 'absolute', left: 12, top: '50%',
                          transform: 'translateY(-50%)', color: muted, pointerEvents: 'none',
                        }}/>
                        <input
                          type="tel" placeholder="+91 98765 43210"
                          value={phone} onChange={e => setPhone(e.target.value)}
                          style={{
                            width: '100%', paddingLeft: 34, paddingRight: 12, height: 42,
                            border: `2px solid ${border}`, borderRadius: 10, fontSize: 14,
                            background: bg, color: text, outline: 'none',
                            boxSizing: 'border-box', fontFamily: 'monospace',
                            transition: 'border-color 0.2s',
                          }}
                          onFocus={e => e.target.style.borderColor = WA_GREEN}
                          onBlur={e => e.target.style.borderColor = border}
                        />
                      </div>
                      {editingPhone && initialPhone && (
                        <button onClick={() => { setPhone(initialPhone); setEditingPhone(false); }} style={{
                          background: card, border: `1px solid ${border}`,
                          borderRadius: 10, padding: '0 12px', cursor: 'pointer',
                          color: muted, fontSize: 12, fontWeight: 600,
                        }}>Cancel</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Message preview */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: label,
                    textTransform: 'uppercase', letterSpacing: 0.8 }}>Message</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleCopyMsg} style={{
                      fontSize: 11, color: muted, background: 'none', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
                    }}>
                      {copied ? <><Check size={10} color={WA_GREEN}/> <span style={{ color: WA_GREEN }}>Copied!</span></> : <><Copy size={10}/> Copy</>}
                    </button>
                    <button onClick={() => setShowMsgEdit(v => !v)} style={{
                      fontSize: 11, color: muted, background: 'none', border: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
                    }}>
                      <Edit2 size={10}/> {showMsgEdit ? 'Done' : 'Edit'}
                    </button>
                  </div>
                </div>

                {showMsgEdit ? (
                  <textarea
                    value={editedMsg} onChange={e => setEditedMsg(e.target.value)} rows={4}
                    style={{
                      width: '100%', border: `2px solid ${WA_GREEN}40`, borderRadius: 12,
                      background: isDark ? '#1e3a2f' : '#f0fdf4', color: text,
                      fontSize: 13, padding: '10px 12px', resize: 'vertical',
                      outline: 'none', boxSizing: 'border-box',
                      fontFamily: "'DM Sans', system-ui", lineHeight: 1.55,
                    }}
                  />
                ) : (
                  <MsgBubble text={finalMsg} isDark={isDark}/>
                )}
              </div>

              {/* Screenshot tip */}
              {canSendScreenshot && (
                <div style={{
                  background: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff',
                  border: `1px solid ${isDark ? 'rgba(59,130,246,0.2)' : '#bfdbfe'}`,
                  borderRadius: 10, padding: '8px 12px', marginBottom: 14, fontSize: 12,
                  color: isDark ? '#93c5fd' : '#1d4ed8', display: 'flex', alignItems: 'flex-start', gap: 6,
                }}>
                  <Image size={12} style={{ flexShrink: 0, marginTop: 1 }}/>
                  After opening WhatsApp, you can attach a screenshot or PDF from your gallery.
                </div>
              )}

              {/* Account selector (single session) */}
              {sessions.length === 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                  background: isDark ? 'rgba(37,211,102,0.06)' : `${WA_GREEN}08`,
                  border: `1px solid ${WA_GREEN}25`, borderRadius: 10, padding: '8px 12px',
                }}>
                  <Smartphone size={13} color={WA_GREEN}/>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, color: isDark ? '#a0aec0' : '#4a5568' }}>
                      Sending from:{' '}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                      {sessions[0].displayName || `+${sessions[0].phoneNumber}`}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: WA_GREEN,
                    background: `${WA_GREEN}15`, padding: '2px 7px', borderRadius: 20,
                  }}>Connected</span>
                </div>
              )}

              {/* Settings link */}
              <div style={{ marginBottom: 16, fontSize: 11, color: muted,
                display: 'flex', alignItems: 'center', gap: 4 }}>
                <Link size={10}/>
                Template from{' '}
                <a href={settingsPath} style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 700 }}
                  onClick={e => { e.preventDefault(); window.location.href = settingsPath; }}>
                  WhatsApp Settings
                </a>
              </div>

              {/* Send / Pick Account button */}
              <motion.button
                onClick={handleSend}
                disabled={sending || !hasPhone}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%', padding: '13px 20px', borderRadius: 14, border: 'none',
                  background: (!hasPhone || sending)
                    ? (isDark ? '#1e293b' : '#f1f5f9')
                    : `linear-gradient(135deg, ${WA_DARK}, ${WA_GREEN})`,
                  color: (!hasPhone || sending) ? (isDark ? '#475569' : '#94a3b8') : '#fff',
                  fontSize: 15, fontWeight: 800, letterSpacing: -0.3,
                  cursor: (!hasPhone || sending) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  boxShadow: hasPhone ? `0 4px 18px ${WA_GREEN}45` : 'none',
                  transition: 'all 0.2s',
                }}>
                {sending ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> Sending…</>
                ) : sessions.length > 1 && !selectedSession ? (
                  <><WAIcon size={17} color={hasPhone ? '#fff' : '#94a3b8'}/> Choose Account & Send <ChevronRight size={15}/></>
                ) : (
                  <><WAIcon size={17} color={hasPhone ? '#fff' : '#94a3b8'}/>
                    {hasPhone
                      ? (sessions.length > 0 ? 'Send via WhatsApp' : 'Open WhatsApp Web')
                      : 'Enter Number to Send'}</>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </DialogContent>
    </Dialog>
  );
}

/* ── Inline WhatsApp Button — for tables/action columns ─────────────────────── */
export function WhatsAppButton({
  phone, message, entityName = '', size = 'sm',
  isDark = false, disabled = false, onNoPhone, title: btnTitle,
}) {
  const [open, setOpen] = useState(false);
  const hasPhone = !!phone && String(phone).replace(/\D/g,'').length >= 10;

  const handleClick = (e) => {
    e.stopPropagation();
    if (!hasPhone && onNoPhone) { onNoPhone(); return; }
    setOpen(true);
  };

  const sizeMap = { sm: { p: '5px 9px', fs: 12, icon: 13 }, md: { p: '7px 13px', fs: 13, icon: 15 } };
  const s = sizeMap[size] || sizeMap.sm;

  return (
    <>
      <button onClick={handleClick} disabled={disabled}
        title={hasPhone ? (btnTitle || 'Send via WhatsApp') : 'No phone — click to enter one'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: s.p, fontSize: s.fs, fontWeight: 700, borderRadius: 8,
          background: hasPhone
            ? (isDark ? 'rgba(37,211,102,0.15)' : 'rgba(37,211,102,0.12)')
            : (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.1)'),
          color: hasPhone ? WA_GREEN : (isDark ? '#64748b' : '#94a3b8'),
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          border: `1px solid ${hasPhone ? WA_GREEN + '30' : 'transparent'}`,
          opacity: disabled ? 0.5 : 1,
        }}>
        <WAIcon size={s.icon} color={hasPhone ? WA_GREEN : (isDark ? '#64748b' : '#94a3b8')}/>
        {!hasPhone && <span style={{ fontSize: 9, opacity: 0.6 }}>No #</span>}
      </button>

      <WhatsAppSendDialog
        open={open} onClose={() => setOpen(false)}
        phone={phone || ''} entityName={entityName}
        message={message} title="Send via WhatsApp" isDark={isDark}
      />
    </>
  );
}
