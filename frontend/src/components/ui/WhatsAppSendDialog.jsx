/**
 * WhatsAppSendDialog.jsx
 * Reusable WhatsApp send dialog.
 * - If phone is provided → one-click send button
 * - If phone is missing → show input to manually enter number
 * - Optional image/screenshot attachment hint
 * Used across: Clients, PassVault, DSC, Invoicing pages.
 * All message templates come from /settings/whatsapp (wa_global_settings).
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  MessageCircle, Phone, Send, X, ExternalLink, Loader2,
  CheckCircle2, AlertCircle, Image, Edit2, Link,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPhoneE164, openWhatsApp, getWASettings } from '@/hooks/useWhatsApp';

const WA_GREEN = '#25D366';
const WA_DARK  = '#128C7E';

// WhatsApp SVG Icon
function WAIcon({ size = 16, color = WA_GREEN }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/**
 * Props:
 *   open          — boolean
 *   onClose       — () => void
 *   phone         — string | null   (pre-filled phone number)
 *   entityName    — string          (e.g. "Infosys Ltd", "Invoice #INV-001")
 *   message       — string          (pre-built message text)
 *   title         — string          (dialog title)
 *   subtitle      — string          (optional context subtitle)
 *   isDark        — boolean
 *   onPhoneSaved  — (phone) => void (optional: called when user enters a new number)
 *   canSendScreenshot — boolean     (show "send screenshot" tip)
 *   settingsPath  — string          (link to /settings/whatsapp, default)
 */
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
  const [phone, setPhone]       = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [editedMsg, setEditedMsg] = useState('');
  const [showMsgEdit, setShowMsgEdit] = useState(false);

  const settings = getWASettings();
  const hasPhone = !!phone && phone.replace(/\D/g,'').length >= 10;

  useEffect(() => {
    if (open) {
      setPhone(initialPhone || '');
      setEditingPhone(!initialPhone);
      setSent(false);
      setSending(false);
      setEditedMsg(message);
      setShowMsgEdit(false);
    }
  }, [open, initialPhone, message]);

  const finalMessage = editedMsg || message;

  const doSend = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { toast.error('Enter a valid 10-digit phone number'); return; }
    setSending(true);
    try {
      const opened = openWhatsApp(phone, finalMessage);
      if (opened) {
        setSent(true);
        toast.success('WhatsApp opened — message ready to send');
        if (onPhoneSaved && !initialPhone) { onPhoneSaved(phone); }
        setTimeout(() => { onClose?.(); setSent(false); }, 2000);
      }
    } finally {
      setSending(false);
    }
  };

  const bg    = isDark ? '#111827' : '#fff';
  const card  = isDark ? '#1a2236' : '#f8fafc';
  const border= isDark ? '#1e3a5f' : '#e2e8f0';
  const text  = isDark ? '#f0f4f8' : '#0f172a';
  const muted = isDark ? '#8fa3bf' : '#64748b';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose?.()}>
      <DialogContent
        style={{ background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: 0,
          maxWidth: 440, overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${WA_DARK}, ${WA_GREEN})`,
          padding: '20px 24px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WAIcon size={24} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700 }}>{title}</h2>
            {subtitle && <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none',
            borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
            <X size={15}/>
          </button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>

          {/* Entity label */}
          {entityName && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 11, color: muted, textTransform: 'uppercase',
                letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>Sending for</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: text }}>{entityName}</p>
            </div>
          )}

          {/* Phone section */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                WhatsApp Number
              </label>
              {hasPhone && !editingPhone && (
                <button onClick={() => setEditingPhone(true)}
                  style={{ fontSize: 11, color: WA_GREEN, background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                  <Edit2 size={11}/> Change
                </button>
              )}
            </div>

            {!editingPhone && hasPhone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                background: card, border: `1.5px solid ${WA_GREEN}40`, borderRadius: 12,
                padding: '10px 14px' }}>
                <WAIcon size={18} color={WA_GREEN} />
                <span style={{ color: text, fontWeight: 600, fontSize: 15, fontFamily: 'monospace' }}>{phone}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: WA_GREEN, fontWeight: 600,
                  background: `${WA_GREEN}15`, padding: '2px 8px', borderRadius: 20 }}>Ready</span>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {!initialPhone && (
                  <div style={{ background: isDark ? 'rgba(245,158,11,0.1)' : '#fffbeb',
                    border: `1px solid ${isDark ? 'rgba(245,158,11,0.3)' : '#fde68a'}`,
                    borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12,
                    color: isDark ? '#fcd34d' : '#92400e', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }}/>
                    No phone number on record. Enter one below to send, or update the record first.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%',
                      transform: 'translateY(-50%)', color: muted, pointerEvents: 'none' }}/>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      style={{ width: '100%', paddingLeft: 34, paddingRight: 12, height: 42,
                        border: `1.5px solid ${border}`, borderRadius: 10, fontSize: 14,
                        background: bg, color: text, outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'monospace' }}
                    />
                  </div>
                  {editingPhone && initialPhone && (
                    <button onClick={() => { setPhone(initialPhone); setEditingPhone(false); }}
                      style={{ background: isDark ? '#1e3a5f' : '#f1f5f9', border: `1px solid ${border}`,
                        borderRadius: 10, padding: '0 12px', cursor: 'pointer', color: muted, fontSize: 12 }}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Message preview */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Message Preview
              </label>
              <button onClick={() => setShowMsgEdit(v => !v)}
                style={{ fontSize: 11, color: muted, background: 'none', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                <Edit2 size={11}/> {showMsgEdit ? 'Done' : 'Edit'}
              </button>
            </div>
            {showMsgEdit ? (
              <textarea
                value={editedMsg}
                onChange={e => setEditedMsg(e.target.value)}
                rows={6}
                style={{ width: '100%', border: `1.5px solid ${border}`, borderRadius: 10,
                  background: card, color: text, fontSize: 13, padding: '10px 12px',
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  fontFamily: "'DM Sans', system-ui", lineHeight: 1.5 }}
              />
            ) : (
              <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10,
                padding: '10px 12px', fontSize: 13, color: text, maxHeight: 120, overflowY: 'auto',
                whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {finalMessage || <span style={{ color: muted, fontStyle: 'italic' }}>No message</span>}
              </div>
            )}
          </div>

          {/* Screenshot tip */}
          {canSendScreenshot && (
            <div style={{ background: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff',
              border: `1px solid ${isDark ? 'rgba(59,130,246,0.25)' : '#bfdbfe'}`,
              borderRadius: 10, padding: '8px 12px', marginBottom: 16, fontSize: 12,
              color: isDark ? '#93c5fd' : '#1d4ed8', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Image size={13} style={{ flexShrink: 0, marginTop: 1 }}/>
              Tip: After opening WhatsApp, you can attach a screenshot or PDF from your gallery.
            </div>
          )}

          {/* Settings link */}
          <div style={{ marginBottom: 16, fontSize: 12, color: muted, display: 'flex',
            alignItems: 'center', gap: 4 }}>
            <Link size={11}/>
            Message template controlled from{' '}
            <a href={settingsPath} style={{ color: WA_GREEN, textDecoration: 'none', fontWeight: 600 }}
              onClick={e => { e.preventDefault(); window.location.href = settingsPath; }}>
              WhatsApp Settings
            </a>
          </div>

          {/* Send button */}
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div key="sent" initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: `${WA_GREEN}15`, border: `1px solid ${WA_GREEN}40`,
                  borderRadius: 12, padding: '12px 20px', color: WA_GREEN, fontWeight: 700, fontSize: 14 }}>
                <CheckCircle2 size={18}/> WhatsApp Opened!
              </motion.div>
            ) : (
              <motion.button key="send" onClick={doSend} disabled={sending || !phone}
                whileTap={{ scale: 0.97 }}
                style={{ width: '100%', padding: '13px 20px',
                  background: (!phone || sending) ? '#94a3b8' : `linear-gradient(135deg, ${WA_DARK}, ${WA_GREEN})`,
                  color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
                  cursor: (!phone || sending) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: phone ? `0 4px 14px ${WA_GREEN}40` : 'none', transition: 'all 0.2s' }}>
                {sending
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> Opening…</>
                  : <><WAIcon size={18} color="#fff"/> {hasPhone ? 'Open WhatsApp & Send' : 'Enter number & Send'}</>}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </DialogContent>
    </Dialog>
  );
}

/** Inline WhatsApp button — for use in tables/lists */
export function WhatsAppButton({
  phone, message, entityName = '', size = 'sm', isDark = false, disabled = false,
  onNoPhone, className = '', title: btnTitle = 'Send via WhatsApp',
}) {
  const [open, setOpen] = useState(false);
  const hasPhone = !!phone && String(phone).replace(/\D/g,'').length >= 10;

  const handleClick = (e) => {
    e.stopPropagation();
    if (!hasPhone && onNoPhone) { onNoPhone(); return; }
    setOpen(true);
  };

  const sizeMap = { sm: { p: '5px 10px', fs: 12 }, md: { p: '7px 14px', fs: 13 }, lg: { p: '9px 18px', fs: 14 } };
  const s = sizeMap[size] || sizeMap.sm;

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled}
        title={hasPhone ? btnTitle : 'No phone number — click to enter one'}
        className={className}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: s.p, fontSize: s.fs, fontWeight: 600, borderRadius: 8, border: 'none',
          background: hasPhone
            ? (isDark ? 'rgba(37,211,102,0.15)' : 'rgba(37,211,102,0.12)')
            : (isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.12)'),
          color: hasPhone ? WA_GREEN : (isDark ? '#64748b' : '#94a3b8'),
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          border: `1px solid ${hasPhone ? WA_GREEN + '30' : 'transparent'}`,
          opacity: disabled ? 0.5 : 1,
        }}>
        <WAIcon size={13} color={hasPhone ? WA_GREEN : (isDark ? '#64748b' : '#94a3b8')}/>
        {!hasPhone && <span style={{ fontSize: 10, color: isDark ? '#475569' : '#94a3b8' }}>No #</span>}
      </button>

      <WhatsAppSendDialog
        open={open}
        onClose={() => setOpen(false)}
        phone={phone || ''}
        entityName={entityName}
        message={message}
        title="Send via WhatsApp"
        isDark={isDark}
      />
    </>
  );
}
