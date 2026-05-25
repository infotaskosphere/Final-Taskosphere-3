/**
 * useWhatsApp.js
 * Centralised WhatsApp integration hook.
 * All pages that need WhatsApp sending read settings from here.
 * Settings are stored in localStorage under 'wa_global_settings'
 * and are editable only via /settings/whatsapp.
 */
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const STORAGE_KEY = 'wa_global_settings';

export const DEFAULT_WA_SETTINGS = {
  firmName: '',
  firmTagline: 'Trusted Compliance Partner',
  footerNote: 'Please contact us for any queries.',
  includeGreeting: true,
  includeFooter: true,
  greetingTemplate: 'Dear {name},',
  invoiceTemplate: 'Your invoice *{number}* for *₹{amount}* is ready.\n\nDue Date: {due_date}\nStatus: {status}\n\nPlease make the payment at your earliest convenience.',
  dscTemplate: 'Your DSC certificate for *{holder}* is expiring on *{expiry}* ({days} days left).\n\nPlease arrange renewal at the earliest to avoid any disruption.',
  clientTemplate: 'Hello {name},\n\nThis is a message from {firm}.\n\n{message}',
  passwordTemplate: 'Portal credentials for *{portal}*:\n\nUsername: {username}\nPassword: {password}\n\n⚠️ Please keep this confidential.',
};

export function getWASettings() {
  try {
    return { ...DEFAULT_WA_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_WA_SETTINGS };
  }
}

export function saveWASettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Build message for different contexts
export function buildInvoiceMessage(invoice, settings = getWASettings()) {
  const s = settings;
  const lines = [];
  if (s.includeGreeting) {
    lines.push(s.greetingTemplate.replace('{name}', invoice.client_name || 'Valued Client'));
    lines.push('');
  }
  if (s.firmName) lines.push(`*${s.firmName}*${s.firmTagline ? ` | ${s.firmTagline}` : ''}`);
  lines.push('');
  const msg = (s.invoiceTemplate || DEFAULT_WA_SETTINGS.invoiceTemplate)
    .replace('{number}', invoice.invoice_number || invoice.id || 'N/A')
    .replace('{amount}', invoice.grand_total ? Number(invoice.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00')
    .replace('{due_date}', invoice.due_date || 'N/A')
    .replace('{status}', invoice.status?.replace(/_/g, ' ').toUpperCase() || 'PENDING');
  lines.push(msg);
  if (s.includeFooter && s.footerNote) { lines.push(''); lines.push(s.footerNote); }
  return lines.join('\n');
}

export function buildClientMessage(client, customMsg, settings = getWASettings()) {
  const s = settings;
  const lines = [];
  if (s.includeGreeting) {
    lines.push(s.greetingTemplate.replace('{name}', client.company_name || client.name || 'Valued Client'));
    lines.push('');
  }
  if (s.firmName) lines.push(`*${s.firmName}*${s.firmTagline ? ` | ${s.firmTagline}` : ''}`);
  lines.push('');
  const msg = (s.clientTemplate || DEFAULT_WA_SETTINGS.clientTemplate)
    .replace('{name}', client.company_name || client.name || 'Valued Client')
    .replace('{firm}', s.firmName || 'Our Firm')
    .replace('{message}', customMsg || 'We would like to connect with you.');
  lines.push(msg);
  if (s.includeFooter && s.footerNote) { lines.push(''); lines.push(s.footerNote); }
  return lines.join('\n');
}

export function buildDscMessage(dsc, settings = getWASettings()) {
  const s = settings;
  const lines = [];
  if (s.includeGreeting) {
    lines.push(s.greetingTemplate.replace('{name}', dsc.holder_name || 'Sir/Madam'));
    lines.push('');
  }
  if (s.firmName) lines.push(`*${s.firmName}*${s.firmTagline ? ` | ${s.firmTagline}` : ''}`);
  lines.push('');
  const daysLeft = dsc.expiry_date ? Math.ceil((new Date(dsc.expiry_date) - new Date()) / 86400000) : 0;
  const expiry = dsc.expiry_date ? new Date(dsc.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const msg = (s.dscTemplate || DEFAULT_WA_SETTINGS.dscTemplate)
    .replace('{holder}', dsc.holder_name || 'N/A')
    .replace('{expiry}', expiry)
    .replace('{days}', daysLeft);
  lines.push(msg);
  if (s.includeFooter && s.footerNote) { lines.push(''); lines.push(s.footerNote); }
  return lines.join('\n');
}

export function buildPasswordMessage(entry, password, settings = getWASettings()) {
  const s = settings;
  const lines = [];
  if (s.includeGreeting) {
    lines.push(s.greetingTemplate.replace('{name}', 'Sir/Madam'));
    lines.push('');
  }
  const msg = (s.passwordTemplate || DEFAULT_WA_SETTINGS.passwordTemplate)
    .replace('{portal}', entry.portal_name || entry.title || 'Portal')
    .replace('{username}', entry.username || entry.user_id || 'N/A')
    .replace('{password}', password || '••••••••');
  lines.push(msg);
  if (s.includeFooter && s.footerNote) { lines.push(''); lines.push(s.footerNote); }
  return lines.join('\n');
}

/** Format phone number to international format without '+' */
export function formatPhoneE164(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** Open WhatsApp Web/app with pre-filled message */
export function openWhatsApp(phone, message) {
  const e164 = formatPhoneE164(phone);
  if (!e164) return false;
  const url = `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  return true;
}

/** Hook for WhatsApp status */
export function useWhatsApp() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettingsState] = useState(getWASettings);
  const [connectedSessions, setConnectedSessions] = useState([]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/status');
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/sessions');
      const connected = (data?.sessions || []).filter(s => s.status === 'connected');
      setConnectedSessions(connected);
    } catch {
      setConnectedSessions([]);
    }
  }, []);

  useEffect(() => { refreshStatus(); refreshSessions(); }, [refreshStatus, refreshSessions]);

  const updateSettings = useCallback((newSettings) => {
    saveWASettings(newSettings);
    setSettingsState(newSettings);
  }, []);

  const send = useCallback(async (phone, message, sessionId = null) => {
    const e164 = formatPhoneE164(phone);
    if (!e164) return { success: false, error: 'Invalid phone number' };
    if (status?.connected) {
      try {
        const payload = { to: e164, message, message_type: 'general' };
        if (sessionId) payload.session_id = sessionId;
        await api.post('/whatsapp/send', payload);
        return { success: true, method: 'api' };
      } catch {
        // Fall back to web redirect
      }
    }
    openWhatsApp(phone, message);
    return { success: true, method: 'web' };
  }, [status]);

  return { status, loading, settings, updateSettings, send, refreshStatus, connectedSessions, refreshSessions };
}

export default useWhatsApp;
