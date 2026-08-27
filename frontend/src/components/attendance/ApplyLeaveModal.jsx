// ApplyLeaveModal.jsx — the ONE Apply Leave form used everywhere in the app.
//
// Previously the Attendance page and the People Matrix → Leave page each had
// their own, independently-written copy of this modal. They called the same
// backend endpoint (POST /attendance/apply-leave) so a submitted leave was
// always recorded identically either way, but the two forms could drift out
// of sync over time (different leave types, different validation, a fix
// applied to one and not the other). This component is now the single
// source of truth: both pages render <ApplyLeaveModal /> instead of their
// own markup, so "Apply Leave" behaves — and results in exactly the same
// backend call — no matter which page it's opened from.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isBefore, startOfDay } from 'date-fns';
import { Send, X, Clock, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import api from '@/lib/api';

export const LEAVE_TYPES = [
  { value: 'full_day', label: 'Full Day', icon: '🗓️', desc: 'Absent the entire day' },
  { value: 'half_day_morning', label: 'Half Day (Morning Off)', icon: '🌅', desc: 'Off for the morning session' },
  { value: 'half_day_afternoon', label: 'Half Day (Afternoon Off)', icon: '🌇', desc: 'Off for the afternoon session' },
  { value: 'early_leave', label: 'Early Leave', icon: '🚪', desc: 'Present but leaving before office hours end' },
];

const DEFAULT_COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2' };
const DEFAULT_D = {
  card: '#1e293b', raised: '#263348', border: '#334155',
  text: '#f1f5f9', muted: '#94a3b8', dimmer: '#64748b',
};

/**
 * @param open          whether the modal is visible
 * @param onClose       called when the modal should close (cancel / backdrop / X)
 * @param onSubmitted    called after a leave request is successfully submitted — use it to refetch whatever list/calendar this page shows
 * @param isDark         current theme
 * @param colors, tokens optional style overrides — defaults match the Attendance / Leave page palette so the modal looks the same everywhere
 * @param seed           optional { leaveType, leaveFrom, leaveTo } to prefill when the modal opens (e.g. the Attendance page's "Half Day" / "Tomorrow" shortcut buttons)
 * @param monthLeaveCount   optional — how many days of leave the user has already taken this calendar month. Omit if unknown; the banner just won't render.
 * @param monthLeaveRecords optional — array of { date, leave_type, reason } for this month's leave, shown as a compact list under the count.
 */
export default function ApplyLeaveModal({
  open,
  onClose,
  onSubmitted,
  isDark = false,
  colors = DEFAULT_COLORS,
  tokens = DEFAULT_D,
  seed = null,
  monthLeaveCount = null,
  monthLeaveRecords = [],
}) {
  const COLORS = { ...DEFAULT_COLORS, ...colors };
  const D = { ...DEFAULT_D, ...tokens };

  const [leaveType, setLeaveType] = useState('full_day');
  const [leaveFrom, setLeaveFrom] = useState(null);
  const [leaveTo, setLeaveTo] = useState(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [earlyLeaveTime, setEarlyLeaveTime] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the form every time the modal opens (not on every render) so a
  // caller's quick-action button (e.g. "Half Day", "Tomorrow") pre-fills
  // correctly while typing inside the form doesn't get clobbered.
  useEffect(() => {
    if (!open) return;
    setLeaveType(seed?.leaveType || 'full_day');
    setLeaveFrom(seed?.leaveFrom || null);
    setLeaveTo(seed?.leaveTo || null);
    setLeaveReason('');
    setEarlyLeaveTime('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dayCount = leaveFrom
    ? Math.max(1, leaveTo ? Math.ceil((leaveTo.getTime() - leaveFrom.getTime()) / 86400000) + 1 : 1)
    : 0;

  const handleSubmit = async () => {
    if (!leaveFrom) { toast.error('Select a leave start date'); return; }
    if (leaveType === 'early_leave' && !earlyLeaveTime) { toast.error('Please specify your early departure time'); return; }
    const isPartialDay = leaveType !== 'full_day'; // half_day + early_leave are single-day
    const effectiveTo = isPartialDay ? leaveFrom : (leaveTo || leaveFrom);
    setSubmitting(true);
    try {
      await api.post('/attendance/apply-leave', {
        from_date: format(leaveFrom, 'yyyy-MM-dd'),
        to_date: format(effectiveTo, 'yyyy-MM-dd'),
        reason: leaveReason || 'Leave Applied',
        leave_type: leaveType,
        early_leave_time: leaveType === 'early_leave' ? earlyLeaveTime : undefined,
      });
      toast.success('Leave request submitted');
      onClose?.();
      await onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: isDark ? 'rgba(6,78,59,0.85)' : 'rgba(6,95,70,0.75)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
          <motion.div
            className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: isDark ? D.card : '#ffffff', border: isDark ? `1px solid ${D.border}` : '1px solid #e2e8f0' }}
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          >
            {/* Header */}
            <div className="px-7 py-5 flex items-center justify-between"
              style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}>
              <div>
                <h2 className="text-xl font-black text-white">Apply Leave</h2>
                <p className="text-blue-200 text-sm mt-0.5">Select type and dates below</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* This month's leave so far — helps the person decide with context,
                  instead of submitting blind. Renders only when the caller passes
                  a count (Attendance page / People Matrix → Leave both do). */}
              {monthLeaveCount !== null && (
                <div className="rounded-xl border px-4 py-3"
                  style={{
                    backgroundColor: isDark ? `${COLORS.deepBlue}15` : `${COLORS.deepBlue}08`,
                    borderColor: isDark ? 'rgba(31,111,178,0.3)' : `${COLORS.deepBlue}20`,
                  }}>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }} />
                    <p className="text-sm font-semibold" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                      {monthLeaveCount === 0
                        ? "You haven't taken any leave this month yet"
                        : `You've taken ${monthLeaveCount} day${monthLeaveCount !== 1 ? 's' : ''} of leave this month`}
                    </p>
                  </div>
                  {monthLeaveCount > 0 && monthLeaveRecords?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {monthLeaveRecords.slice(0, 6).map((r) => (
                        <span key={r.date} className="text-[11px] font-medium px-2 py-1 rounded-lg"
                          style={{
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                            color: isDark ? D.muted : '#475569',
                            border: `1px solid ${isDark ? D.border : '#e2e8f0'}`,
                          }}>
                          {format(new Date(r.date), 'MMM d')}
                          {r.leave_type && r.leave_type !== 'full_day' ? ` · ${LEAVE_TYPES.find(lt => lt.value === r.leave_type)?.label || r.leave_type}` : ''}
                        </span>
                      ))}
                      {monthLeaveRecords.length > 6 && (
                        <span className="text-[11px] font-medium px-2 py-1" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>
                          +{monthLeaveRecords.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Leave type */}
              <div>
                <p className="text-sm font-semibold mb-2.5" style={{ color: isDark ? D.muted : '#374151' }}>Leave Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {LEAVE_TYPES.map((lt) => (
                    <motion.button key={lt.value} type="button" whileTap={{ scale: 0.97 }}
                      onClick={() => setLeaveType(lt.value)}
                      className="p-3 rounded-xl border text-left transition-all flex items-start gap-2"
                      style={{
                        borderColor: leaveType === lt.value ? COLORS.deepBlue : (isDark ? D.border : '#e2e8f0'),
                        backgroundColor: leaveType === lt.value ? (isDark ? `${COLORS.deepBlue}22` : `${COLORS.deepBlue}0A`) : (isDark ? D.raised : '#f8fafc'),
                      }}>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{lt.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: leaveType === lt.value ? (isDark ? '#60a5fa' : COLORS.deepBlue) : (isDark ? D.text : '#1e293b') }}>
                          {lt.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: isDark ? D.dimmer : '#94a3b8' }}>{lt.desc}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Early leave time */}
              {leaveType === 'early_leave' && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Leaving At</label>
                  <input type="time" value={earlyLeaveTime} onChange={(e) => setEarlyLeaveTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#fff', color: isDark ? D.text : '#0f172a' }} />
                  {earlyLeaveTime && (
                    <div className="flex items-center gap-2 mt-2.5 px-3 py-2 rounded-xl"
                      style={{ backgroundColor: isDark ? `${COLORS.deepBlue}15` : `${COLORS.deepBlue}08` }}>
                      <Clock className="w-4 h-4" style={{ color: COLORS.mediumBlue }} />
                      <p className="text-sm font-semibold" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                        Leaving at {(() => {
                          const [h, m] = earlyLeaveTime.split(':').map(Number);
                          const ampm = h >= 12 ? 'PM' : 'AM';
                          const h12 = h % 12 || 12;
                          return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                        })()}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Date selection */}
              {leaveType === 'full_day' ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[1, 3, 7, 15, 30].map((days) => (
                      <Button key={days} type="button" variant="outline" size="sm"
                        onClick={() => {
                          const from = new Date(); const to = new Date();
                          to.setDate(from.getDate() + days - 1);
                          setLeaveFrom(from); setLeaveTo(to);
                        }}
                        className="rounded-lg font-semibold text-xs"
                        style={{ borderColor: isDark ? D.border : '#e2e8f0', color: isDark ? D.text : '#374151', backgroundColor: isDark ? D.raised : undefined }}>
                        {days === 1 ? '1 Day' : `${days} Days`}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>From Date</label>
                      <Calendar mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                        disabled={(date) => isBefore(date, startOfDay(new Date()))}
                        className="rounded-xl border w-full" style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>To Date</label>
                      <Calendar mode="single" selected={leaveTo} onSelect={setLeaveTo}
                        disabled={(date) => (leaveFrom ? isBefore(date, leaveFrom) : true)}
                        className="rounded-xl border w-full" style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                    </div>
                  </div>
                  {leaveFrom && (
                    <div className="relative px-4 py-3 pl-5 rounded-xl overflow-hidden"
                      style={{ backgroundColor: isDark ? `${COLORS.deepBlue}18` : `${COLORS.deepBlue}08` }}>
                      <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: COLORS.deepBlue }} />
                      <p className="text-xs text-slate-400 mb-0.5">Total Duration</p>
                      <p className="text-2xl font-black" style={{ color: isDark ? '#60a5fa' : COLORS.deepBlue }}>
                        {dayCount} day{dayCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Select Date</label>
                  <Calendar mode="single" selected={leaveFrom} onSelect={setLeaveFrom}
                    numberOfMonths={2}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    className="rounded-xl border w-full" style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : undefined }} />
                  {leaveFrom && (
                    <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-xl border text-sm font-semibold"
                      style={{
                        backgroundColor: isDark ? `${COLORS.deepBlue}12` : `${COLORS.deepBlue}06`,
                        borderColor: isDark ? 'rgba(31,111,178,0.3)' : `${COLORS.deepBlue}25`,
                        color: isDark ? '#60a5fa' : COLORS.deepBlue,
                      }}>
                      <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                      {format(leaveFrom, 'EEEE, MMMM d, yyyy')}
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="text-sm font-semibold mb-2 block" style={{ color: isDark ? D.muted : '#374151' }}>Reason</label>
                <textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Reason for leave…" rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                  style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#fff', color: isDark ? D.text : '#0f172a' }} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex justify-end gap-2 border-t"
              style={{ borderColor: isDark ? D.border : '#e2e8f0', backgroundColor: isDark ? D.raised : '#f8fafc' }}>
              <Button type="button" variant="ghost" onClick={onClose}
                className="font-semibold rounded-xl" style={{ color: isDark ? D.muted : undefined }}>
                Cancel
              </Button>
              <Button type="button"
                disabled={submitting || !leaveFrom || (leaveType === 'early_leave' && !earlyLeaveTime)}
                onClick={handleSubmit}
                className="font-semibold text-white rounded-xl gap-2"
                style={{ backgroundColor: COLORS.deepBlue }}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit Request
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
