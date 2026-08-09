import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Phone, Users, Mail, RefreshCw, CheckSquare,
  FileText, Pin, Trash2, Send, Loader2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

// ── Config: icon + color per activity type ──────────────────────────────
const TYPE_CONFIG = {
  note:          { icon: FileText,     label: 'Note',           color: '#0D3B66' },
  call:          { icon: Phone,        label: 'Call',           color: '#15803D' },
  meeting:       { icon: Users,        label: 'Meeting',        color: '#7C3AED' },
  whatsapp:      { icon: MessageSquare,label: 'WhatsApp',       color: '#25D366' },
  email:         { icon: Mail,         label: 'Email',          color: '#DC2626' },
  status_change: { icon: RefreshCw,    label: 'Status Change',  color: '#EA580C' },
  task:          { icon: CheckSquare,  label: 'Task',           color: '#0891B2' },
  document:      { icon: FileText,     label: 'Document',       color: '#6366F1' },
  system:        { icon: Clock,        label: 'System',         color: '#64748B' },
};

const COMPOSER_TYPES = ['note', 'call', 'meeting'];

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ClientActivityTimeline({ clientId, isDark, currentUserId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [composerType, setComposerType] = useState('note');
  const [composerText, setComposerText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchActivities = useCallback(async (pageNum, type, replace) => {
    try {
      const params = { page: pageNum, page_size: 20 };
      if (type) params.type = type;
      const res = await api.get(`/clients/${clientId}/activities`, { params });
      setHasMore(res.data.length === 20);
      setActivities(prev => (replace ? res.data : [...prev, ...res.data]));
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load activity timeline');
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    setPage(1);
    fetchActivities(1, filterType, true).finally(() => setLoading(false));
  }, [clientId, filterType, fetchActivities]);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    await fetchActivities(next, filterType, false);
    setPage(next);
    setLoadingMore(false);
  };

  const submitEntry = async () => {
    if (!composerText.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/clients/${clientId}/activities`, {
        type: composerType,
        content: composerText.trim(),
      });
      setActivities(prev => [res.data, ...prev]);
      setComposerText('');
      toast.success('Added to timeline');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to add entry');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (activity) => {
    try {
      const res = await api.patch(`/clients/${clientId}/activities/${activity.id}`, {
        pinned: !activity.pinned,
      });
      setActivities(prev =>
        [...prev]
          .map(a => (a.id === activity.id ? res.data : a))
          .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created_at) - new Date(a.created_at)))
      );
    } catch (err) {
      toast.error('Failed to update pin');
    }
  };

  const deleteEntry = async (activity) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await api.delete(`/clients/${clientId}/activities/${activity.id}`);
      setActivities(prev => prev.filter(a => a.id !== activity.id));
      toast.success('Entry removed');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete entry');
    }
  };

  const border = isDark ? 'border-slate-700' : 'border-slate-200';
  const cardBg = isDark ? 'bg-slate-800' : 'bg-white';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="flex flex-col h-full">
      {/* Composer */}
      <div className={`rounded-xl border ${border} ${cardBg} p-3 mb-4 flex-shrink-0`}>
        <div className="flex items-center gap-1.5 mb-2">
          {COMPOSER_TYPES.map(t => {
            const cfg = TYPE_CONFIG[t];
            const Icon = cfg.icon;
            const active = composerType === t;
            return (
              <button
                key={t}
                onClick={() => setComposerType(t)}
                className="flex items-center gap-1 h-7 px-3 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: active ? cfg.color : 'transparent',
                  color: active ? '#fff' : cfg.color,
                  border: `1px solid ${cfg.color}`,
                }}
              >
                <Icon className="h-3 w-3" /> {cfg.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
            placeholder={
              composerType === 'note' ? 'Add a note about this client…' :
              composerType === 'call' ? 'Log call summary — who, when, what was discussed…' :
              'Log meeting notes — attendees, outcome, next steps…'
            }
            rows={2}
            className={`flex-1 text-sm rounded-lg border px-3 py-2 resize-none outline-none ${border} ${
              isDark ? 'bg-slate-900 text-slate-100 placeholder:text-slate-500' : 'bg-slate-50 text-slate-800 placeholder:text-slate-400'
            }`}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitEntry();
            }}
          />
          <button
            onClick={submitEntry}
            disabled={submitting || !composerText.trim()}
            className="h-9 w-9 flex-shrink-0 rounded-lg flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0D3B66, #1F6FB2)' }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-3 flex-shrink-0 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setFilterType('')}
          className={`h-6 px-2.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${
            filterType === '' ? 'text-white' : mutedText
          }`}
          style={{ background: filterType === '' ? '#0D3B66' : (isDark ? '#1e293b' : '#f1f5f9') }}
        >
          All
        </button>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`h-6 px-2.5 rounded-full text-[11px] font-semibold flex-shrink-0 flex items-center gap-1 ${
              filterType === key ? 'text-white' : mutedText
            }`}
            style={{ background: filterType === key ? cfg.color : (isDark ? '#1e293b' : '#f1f5f9') }}
          >
            <cfg.icon className="h-2.5 w-2.5" /> {cfg.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : activities.length === 0 ? (
          <div className={`text-center py-10 text-sm ${mutedText}`}>
            No activity yet — add a note or log a call above.
          </div>
        ) : (
          <div className="relative pl-6">
            <div className={`absolute left-[9px] top-1 bottom-1 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
            {activities.map(activity => {
              const cfg = TYPE_CONFIG[activity.type] || TYPE_CONFIG.system;
              const Icon = cfg.icon;
              const isOwner = activity.created_by === currentUserId;
              const isManual = ['note', 'call', 'meeting', 'task', 'document'].includes(activity.type);
              return (
                <div key={activity.id} className="relative mb-3 last:mb-0">
                  <div
                    className="absolute -left-6 top-1 h-[18px] w-[18px] rounded-full flex items-center justify-center ring-4"
                    style={{ background: cfg.color, ringColor: isDark ? '#0f172a' : '#fff' }}
                  >
                    <Icon className="h-2.5 w-2.5 text-white" />
                  </div>
                  <div className={`rounded-lg border ${border} ${cardBg} px-3 py-2`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: cfg.color }}>
                        {cfg.label}
                        {activity.pinned && <Pin className="h-2.5 w-2.5" />}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`text-[10px] ${mutedText}`}>{timeAgo(activity.created_at)}</span>
                        {isManual && (isOwner || true) && (
                          <button onClick={() => togglePin(activity)} className={`p-0.5 rounded ${mutedText} hover:text-amber-500`}>
                            <Pin className="h-3 w-3" />
                          </button>
                        )}
                        {isManual && isOwner && (
                          <button onClick={() => deleteEntry(activity)} className={`p-0.5 rounded ${mutedText} hover:text-red-500`}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className={`text-sm mt-1 whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {activity.content}
                    </p>
                    <div className={`text-[10px] mt-1.5 ${mutedText}`}>
                      {activity.created_by_name} · {new Date(activity.created_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className={`w-full text-xs font-semibold py-2 rounded-lg mt-1 ${mutedText} hover:text-slate-600`}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
