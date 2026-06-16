/**
 * WhatsAppHub.jsx
 *
 * Unified inbox for all connected WhatsApp numbers.
 *
 * Layout (desktop):
 *   ┌────────────────────────────────────────────────────────┐
 *   │  Header: "WhatsApp Hub"  │  Session filter  │  Search  │
 *   ├──────────────┬─────────────────────────────────────────┤
 *   │              │  Contact name & phone          [Assign]  │
 *   │  Contacts    │  ─────────────────────────────────────  │
 *   │  list        │                                          │
 *   │  (sorted by  │         message thread                   │
 *   │  recency)    │                                          │
 *   │              │  ─────────────────────────────────────  │
 *   │              │  [Reply box]              [Send]         │
 *   └──────────────┴─────────────────────────────────────────┘
 *
 * Mobile: contact list → tap → slide to thread view (back button returns).
 *
 * Access model:
 *   - Admin & users with wa_hub_access = true  → full UI
 *   - Others                                   → "Request Access" screen
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageCircle, Send, ChevronLeft, Search, RefreshCw,
  CheckCheck, Clock, User2, Shield, AlertCircle,
  Phone, MessageSquare, Loader2, X, Filter,
  UserCheck, Trash2, ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext.jsx';

/* ── helpers ──────────────────────────────────────────────────────────────── */

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
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

/* ── AccessRequest screen ─────────────────────────────────────────────────── */

function AccessRequestScreen({ onRequested }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (reason.trim().length < 5) { setErr('Please explain why you need access.'); return; }
    setLoading(true); setErr('');
    try {
      await api.post('/whatsapp/hub/access/request', { reason });
      setDone(true);
      onRequested?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Request failed.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Request Submitted</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm">
          Your access request has been sent to the admin. You'll be notified once it's approved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
        <Shield className="w-8 h-8 text-[var(--text-secondary)]" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">WhatsApp Hub Access Required</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Only admins and approved team members can use the WhatsApp Hub.
        </p>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-3">
        <textarea
          className="w-full h-28 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Why do you need access to the WhatsApp Hub?"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Request Access
        </button>
      </div>
    </div>
  );
}

/* ── Contact list item ───────────────────────────────────────────────────────*/

function ContactItem({ contact, active, onClick }) {
  const color = avatarColor(contact.jid);
  const name = contact.display_name || contact.phone;
  const preview = contact.latest_message?.body || '';
  const isOut = contact.latest_message?.direction === 'out';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
        ${active
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-r-2 border-emerald-500'
          : 'hover:bg-[var(--bg-secondary)]'}
      `}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-11 h-11 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold`}>
        {initials(name)}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm text-[var(--text-primary)] truncate">{name}</span>
          <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">
            {fmtTime(contact.last_message_at)}
          </span>
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
      <div
        className={`
          max-w-[75%] px-3 py-2 rounded-2xl text-sm
          ${isOut
            ? 'bg-emerald-500 text-white rounded-br-sm'
            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-bl-sm border border-[var(--border)]'}
        `}
      >
        {msg.session_label && !isOut && (
          <p className="text-[10px] font-semibold mb-0.5 opacity-60 uppercase tracking-wide">
            via {msg.session_label}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <p className={`text-[10px] mt-1 text-right ${isOut ? 'text-emerald-100' : 'text-[var(--text-secondary)]'}`}>
          {fmtFull(msg.timestamp)}
        </p>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */

export default function WhatsAppHub() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(null); // null=checking
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [activeJid, setActiveJid] = useState(null);
  const [thread, setThread] = useState([]);
  const [contact, setContact] = useState(null);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'thread'
  const [showAccessPanel, setShowAccessPanel] = useState(false);
  const [accessUsers, setAccessUsers] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [selectedSession, setSelectedSession] = useState(''); // for sending
  const threadEndRef = useRef(null);
  const pollRef = useRef(null);

  /* ── check access ── */
  useEffect(() => {
    api.get('/whatsapp/hub/unread-count')
      .then(({ data }) => setHasAccess(data.has_access))
      .catch(() => setHasAccess(false));
  }, []);

  /* ── load sessions (for filter / send) ── */
  useEffect(() => {
    if (!hasAccess) return;
    api.get('/whatsapp/sessions')
      .then(({ data }) => setSessions(data?.sessions || []))
      .catch(() => {});
  }, [hasAccess]);

  /* ── load contacts ── */
  const loadContacts = useCallback(async () => {
    if (!hasAccess) return;
    setLoadingContacts(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '60');
      if (sessionFilter) params.set('session_id', sessionFilter);
      if (unreadOnly) params.set('unread_only', 'true');
      const { data } = await api.get(`/whatsapp/hub/inbox?${params}`);
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingContacts(false);
    }
  }, [hasAccess, sessionFilter, unreadOnly]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Poll inbox every 15 s
  useEffect(() => {
    if (!hasAccess) return;
    pollRef.current = setInterval(loadContacts, 15000);
    return () => clearInterval(pollRef.current);
  }, [hasAccess, loadContacts]);

  /* ── load thread ── */
  const loadThread = useCallback(async (jid) => {
    if (!jid) return;
    setLoadingThread(true);
    try {
      const { data } = await api.get(`/whatsapp/hub/conversations/${encodeURIComponent(jid)}`);
      setThread(data.messages || []);
      setContact(data.contact);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (activeJid) {
      loadThread(activeJid);
      // Mark read
      api.patch(`/whatsapp/hub/conversations/${encodeURIComponent(activeJid)}/read`).catch(() => {});
    }
  }, [activeJid, loadThread]);

  // Scroll to bottom of thread
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread]);

  // Poll thread every 8 s when open
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
      await api.post('/whatsapp/hub/reply', {
        jid: activeJid,
        message: reply.trim(),
        session_id: selectedSession || null,
      });
      setReply('');
      await loadThread(activeJid);
      await loadContacts();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }

  /* ── access management (admin) ── */
  async function loadAccessPanel() {
    const [{ data: ud }, { data: rd }] = await Promise.all([
      api.get('/whatsapp/hub/access'),
      api.get('/whatsapp/hub/access/requests'),
    ]);
    setAccessUsers(ud.users || []);
    setAccessRequests(rd.requests || []);
    setShowAccessPanel(true);
  }

  async function toggleAccess(userId, current) {
    await api.patch(`/whatsapp/hub/access/${userId}`, { user_id: userId, grant: !current });
    loadAccessPanel();
  }

  async function decideRequest(reqId, approved) {
    await api.post('/whatsapp/hub/access/decide', { request_id: reqId, approved });
    loadAccessPanel();
    loadContacts();
  }

  /* ── filtered contacts ── */
  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  /* ── render: access check ── */
  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="h-full">
        <AccessRequestScreen />
      </div>
    );
  }

  /* ── render: access panel modal (admin only) ── */
  const AccessPanel = showAccessPanel && user?.role === 'admin' && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-[var(--text-primary)]">Manage Hub Access</h2>
          <button onClick={() => setShowAccessPanel(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Pending requests */}
          {accessRequests.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                Pending Requests ({accessRequests.length})
              </h3>
              <div className="space-y-2">
                {accessRequests.map(r => (
                  <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{r.user_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{r.reason}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => decideRequest(r.id, true)}
                        className="px-2 py-1 rounded text-xs bg-emerald-500 text-white hover:bg-emerald-600"
                      >Approve</button>
                      <button
                        onClick={() => decideRequest(r.id, false)}
                        className="px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                      >Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All users */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              All Users
            </h3>
            <div className="space-y-1">
              {accessUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2">
                    <User2 className="w-4 h-4 text-[var(--text-secondary)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{u.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{u.email}</p>
                    </div>
                  </div>
                  {u.role === 'admin' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium">Admin</span>
                  ) : (
                    <button
                      onClick={() => toggleAccess(u.id, u.wa_hub_access)}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                        u.wa_hub_access
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300'
                      }`}
                    >
                      {u.wa_hub_access ? '✓ Granted' : 'Grant Access'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Sidebar (contacts list) ── */
  const Sidebar = (
    <div className={`
      flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border)]
      ${mobileView === 'thread' ? 'hidden' : 'flex'}
      md:flex w-full md:w-80 lg:w-96 flex-shrink-0
    `}>
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            WhatsApp Hub
          </h1>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && (
              <button
                onClick={loadAccessPanel}
                title="Manage Access"
                className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              >
                <UserCheck className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={loadContacts}
              disabled={loadingContacts}
              title="Refresh"
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            >
              <RefreshCw className={`w-4 h-4 ${loadingContacts ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Search contacts..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2">
          {sessions.length > 1 && (
            <select
              value={sessionFilter}
              onChange={e => setSessionFilter(e.target.value)}
              className="flex-1 text-xs rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] px-2 py-1 focus:outline-none"
            >
              <option value="">All Numbers</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.label || s.id}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setUnreadOnly(v => !v)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              unreadOnly
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {loadingContacts && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-6">
            <MessageSquare className="w-10 h-10 text-[var(--text-secondary)] opacity-40" />
            <p className="text-sm text-[var(--text-secondary)]">
              {search ? 'No contacts match your search.' : 'No messages yet. Connect a WhatsApp number to get started.'}
            </p>
          </div>
        ) : (
          filteredContacts.map(c => (
            <ContactItem
              key={c.jid}
              contact={c}
              active={c.jid === activeJid}
              onClick={() => {
                setActiveJid(c.jid);
                setMobileView('thread');
                // Optimistically clear unread badge
                setContacts(prev => prev.map(x => x.jid === c.jid ? { ...x, unread_count: 0 } : x));
              }}
            />
          ))
        )}
      </div>

      {/* Footer count */}
      {total > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] text-xs text-[var(--text-secondary)] text-center">
          {filteredContacts.length} of {total} conversations
        </div>
      )}
    </div>
  );

  /* ── Thread panel ── */
  const ThreadPanel = (
    <div className={`
      flex-1 flex flex-col bg-[var(--bg-primary)] min-w-0
      ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}
    `}>
      {!activeJid ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <MessageCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">WhatsApp Hub</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xs">
              Select a conversation from the left to view messages from all connected numbers in one place.
            </p>
          </div>
          {sessions.filter(s => s.status === 'connected').length === 0 && (
            <p className="text-xs px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              No WhatsApp numbers connected. Go to <strong>Settings → WhatsApp</strong> to connect a number.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Thread header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-primary)]">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              onClick={() => setMobileView('list')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className={`w-9 h-9 rounded-full ${avatarColor(activeJid)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
              {initials(contact?.display_name || contact?.phone)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                {contact?.display_name || contact?.phone}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {contact?.phone}
                {contact?.session_id && (
                  <span className="ml-1 opacity-60">via {sessions.find(s => s.id === contact.session_id)?.label || contact.session_id}</span>
                )}
              </p>
            </div>

            <button
              onClick={() => loadThread(activeJid)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loadingThread ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {loadingThread && thread.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              </div>
            ) : thread.length === 0 ? (
              <p className="text-center text-sm text-[var(--text-secondary)] py-8 italic">
                No messages in this conversation yet.
              </p>
            ) : (
              thread.map(msg => <Bubble key={msg.id || msg.message_id} msg={msg} />)
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Reply box */}
          <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]">
            {/* Session selector for reply */}
            {sessions.filter(s => s.status === 'connected').length > 1 && (
              <div className="mb-2">
                <select
                  value={selectedSession}
                  onChange={e => setSelectedSession(e.target.value)}
                  className="text-xs w-full rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] px-2 py-1 focus:outline-none"
                >
                  <option value="">Auto (first connected number)</option>
                  {sessions.filter(s => s.status === 'connected').map(s => (
                    <option key={s.id} value={s.id}>{s.label || s.id}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Type a message…"
                value={reply}
                onChange={e => {
                  setReply(e.target.value);
                  // Auto-grow textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={!reply.trim() || sending}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 text-right">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {Sidebar}
      {ThreadPanel}
      {AccessPanel}
    </div>
  );
}
