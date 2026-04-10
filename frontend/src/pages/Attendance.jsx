import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── DESIGN TOKENS ─────────────────────────────────────────────────────────
const C = {
  deepBlue:  '#0D3B66',
  blue:      '#1F6FB2',
  green:     '#10B981',
  greenL:    '#34D399',
  amber:     '#F59E0B',
  orange:    '#F97316',
  red:       '#EF4444',
  purple:    '#8B5CF6',
};

const D = {
  bg:      '#0f172a',
  card:    '#1e293b',
  raised:  '#263348',
  border:  '#334155',
  text:    '#f1f5f9',
  muted:   '#94a3b8',
  dimmer:  '#64748b',
};

// ─── MOCK DATA ──────────────────────────────────────────────────────────────
const MOCK_USER = { name: 'Arjun Sharma', role: 'developer', initials: 'AS' };

const MOCK_TODAY = {
  punch_in: '2026-04-10T09:14:00+05:30',
  punch_out: null,
  duration_minutes: 254,
  is_late: false,
  status: 'present',
};

const MOCK_STATS = {
  monthHours: 142,
  daysPresent: 18,
  daysLate: 1,
  daysAbsent: 0,
  streak: 12,
  rank: 3,
  avgHours: 7.9,
};

const MOCK_HOLIDAYS = [
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti', type: 'national' },
  { date: '2026-04-21', name: 'Ram Navami', type: 'national' },
  { date: '2026-04-30', name: 'Buddha Purnima', type: 'national' },
];

const MOCK_HISTORY = [
  { date: '2026-04-10', punch_in: '2026-04-10T09:14:00+05:30', punch_out: null, duration_minutes: 254, is_late: false, status: 'present' },
  { date: '2026-04-09', punch_in: '2026-04-09T09:02:00+05:30', punch_out: '2026-04-09T18:34:00+05:30', duration_minutes: 572, is_late: false, status: 'present' },
  { date: '2026-04-08', punch_in: '2026-04-08T09:45:00+05:30', punch_out: '2026-04-08T18:20:00+05:30', duration_minutes: 515, is_late: true, status: 'present' },
  { date: '2026-04-07', punch_in: '2026-04-07T09:05:00+05:30', punch_out: '2026-04-07T18:30:00+05:30', duration_minutes: 565, is_late: false, status: 'present' },
  { date: '2026-04-06', punch_in: '2026-04-06T09:11:00+05:30', punch_out: '2026-04-06T17:58:00+05:30', duration_minutes: 527, is_late: false, status: 'present' },
  { date: '2026-04-05', status: 'absent', punch_in: null, punch_out: null, duration_minutes: 0, is_late: false },
  { date: '2026-04-04', punch_in: '2026-04-04T09:00:00+05:30', punch_out: '2026-04-04T18:15:00+05:30', duration_minutes: 555, is_late: false, status: 'present' },
  { date: '2026-04-03', punch_in: '2026-04-03T09:08:00+05:30', punch_out: '2026-04-03T18:02:00+05:30', duration_minutes: 534, is_late: false, status: 'present' },
];

const WEEK_DATA = [
  { day: 'Mon', hours: 9.4, status: 'present' },
  { day: 'Tue', hours: 8.6, status: 'present' },
  { day: 'Wed', hours: 8.8, status: 'present' },
  { day: 'Thu', hours: 0,   status: 'absent'  },
  { day: 'Fri', hours: 9.1, status: 'present' },
  { day: 'Sat', hours: 4.2, status: 'present' },
  { day: 'Sun', hours: 0,   status: 'future'  },
];

const MONTH_CALENDAR = (() => {
  const days = [];
  const year = 2026, month = 3; // April 2026
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `2026-04-${String(d).padStart(2, '0')}`;
    const rec = MOCK_HISTORY.find(h => h.date === dateStr);
    const holiday = MOCK_HOLIDAYS.find(h => h.date === dateStr);
    days.push({ d, dateStr, rec, holiday });
  }
  return days;
})();

// ─── HELPERS ────────────────────────────────────────────────────────────────
const fmtTime = (isoStr: string | null) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtDur = (mins: number) => {
  if (!mins) return '0h 0m';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const fmtDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ─── INJECT PULSE STYLES ────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('att-new-styles')) {
  const s = document.createElement('style');
  s.id = 'att-new-styles';
  s.textContent = `
    @keyframes pulsGreen { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.45)} 50%{box-shadow:0 0 0 10px rgba(16,185,129,0)} }
    @keyframes pulsRed   { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}  50%{box-shadow:0 0 0 10px rgba(239,68,68,0)} }
    @keyframes pulsAmber { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.4)}  50%{box-shadow:0 0 0 10px rgba(245,158,11,0)} }
    .pulseGreen { animation: pulsGreen 2s ease-in-out infinite; }
    .pulseRed   { animation: pulsRed   1.6s ease-in-out infinite; }
    .pulseAmber { animation: pulsAmber 2s ease-in-out infinite; }
    .att-slim-scroll::-webkit-scrollbar{width:3px}
    .att-slim-scroll::-webkit-scrollbar-track{background:transparent}
    .att-slim-scroll::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}
    .att-slim-scroll::-webkit-scrollbar-thumb:hover{background:#475569}
  `;
  document.head.appendChild(s);
}

// ─── ANIMATION VARIANTS ─────────────────────────────────────────────────────
const fadeUp = {
  hidden:  { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.23,1,0.32,1] } },
};
const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden backdrop-blur-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon, iconColor, title, subtitle, right, count,
}: {
  icon: React.ReactNode; iconColor: string; title: string; subtitle?: string; right?: React.ReactNode; count?: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${iconColor}18` }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-100 leading-none truncate">{title}</p>
            {count !== undefined && count > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none" style={{ background: iconColor, color: '#fff' }}>{count}</span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-none truncate">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 ml-3 flex-shrink-0">{right}</div>}
    </div>
  );
}

// ─── STATUS DOT ─────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    present: C.green, absent: C.red, leave: C.orange, holiday: C.amber, late: C.red,
  };
  return (
    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colors[status] || '#64748b' }} />
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
function StatPill({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -2, transition: { duration: 0.15 } }}>
      <div className="rounded-2xl border border-slate-700/60 overflow-hidden" style={{ background: 'rgba(30,41,59,0.7)' }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
              <span style={{ color, fontSize: 12 }}>{icon}</span>
            </div>
          </div>
          <p className="text-2xl font-black leading-none" style={{ color }}>{value}</p>
        </div>
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${color}60, transparent)` }} />
      </div>
    </motion.div>
  );
}

// ─── CALENDAR MINI ──────────────────────────────────────────────────────────
function MiniCalendar({ onSelectDate, selectedDate }: { onSelectDate: (d: string) => void; selectedDate: string }) {
  const heads = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  return (
    <div className="p-3">
      <div className="grid grid-cols-7 mb-2">
        {heads.map(h => (
          <div key={h} className="text-center text-[9px] font-bold uppercase tracking-wider text-slate-600 py-1">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {MONTH_CALENDAR.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} className="aspect-square" />;
          const { d, dateStr, rec, holiday } = cell;
          const isToday = dateStr === '2026-04-10';
          const isSelected = dateStr === selectedDate;
          let dotColor: string | null = null;
          if (holiday) dotColor = C.amber;
          else if (rec?.status === 'absent') dotColor = C.red;
          else if (rec?.status === 'leave') dotColor = C.orange;
          else if (rec?.is_late) dotColor = C.orange;
          else if (rec?.punch_in) dotColor = C.green;

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className="aspect-square flex flex-col items-center justify-center rounded-lg transition-all relative"
              style={{
                background: isSelected
                  ? `${C.blue}30`
                  : isToday
                  ? `${C.green}18`
                  : 'transparent',
                border: isSelected
                  ? `1px solid ${C.blue}60`
                  : isToday
                  ? `1px solid ${C.green}40`
                  : '1px solid transparent',
              }}
            >
              <span
                className="text-[11px] font-bold leading-none"
                style={{
                  color: isToday ? C.green : isSelected ? C.blue : dotColor ? '#f1f5f9' : '#64748b',
                  fontWeight: isToday || isSelected ? 900 : 600,
                }}
              >
                {d}
              </span>
              {dotColor && (
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{ background: dotColor }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-3 mt-2 border-t border-slate-700/40">
        {[
          { color: C.green, label: 'Present' },
          { color: C.red,   label: 'Absent' },
          { color: C.amber, label: 'Holiday' },
          { color: C.orange, label: 'Leave' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-[10px] text-slate-500 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WEEK BAR CHART ─────────────────────────────────────────────────────────
function WeekBar() {
  const maxH = 10;
  return (
    <div className="flex items-end gap-1.5 h-14">
      {WEEK_DATA.map((d, i) => {
        const pct = d.hours ? Math.max(8, (d.hours / maxH) * 100) : 4;
        const isToday = d.day === 'Fri';
        const barColor = d.status === 'present' ? (isToday ? C.green : C.blue)
          : d.status === 'absent' ? C.red
          : d.status === 'future' ? '#334155'
          : C.orange;

        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
            <motion.div
              className="w-full rounded-t-md"
              style={{
                background: d.status === 'future'
                  ? '#334155'
                  : `linear-gradient(180deg, ${barColor}, ${barColor}90)`,
                opacity: d.status === 'future' ? 0.3 : 0.9,
              }}
              initial={{ height: 0 }}
              animate={{ height: `${pct}%` }}
              transition={{ duration: 0.7, delay: i * 0.06, ease: [0.23,1,0.32,1] }}
            />
            <span className={`text-[9px] font-bold ${isToday ? 'text-emerald-400' : 'text-slate-600'}`}>
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PUNCH BUTTON ─────────────────────────────────────────────────────────
function PunchButton({ type, onClick }: { type: 'in' | 'out'; onClick: () => void }) {
  const isPunchIn = type === 'in';
  return (
    <motion.button
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`flex items-center justify-center gap-2.5 w-full h-11 rounded-xl text-sm font-black text-white transition-all ${isPunchIn ? 'pulseGreen' : ''}`}
      style={{
        background: isPunchIn
          ? `linear-gradient(135deg, ${C.green}, #059669)`
          : `linear-gradient(135deg, ${C.red}, #DC2626)`,
      }}
    >
      {isPunchIn ? (
        <>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          Punch In
        </>
      ) : (
        <>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Punch Out
        </>
      )}
    </motion.button>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState('2026-04-10');
  const [isPunchedIn, setIsPunchedIn] = useState(true);
  const [isPunchedOut, setIsPunchedOut] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const punchInTime = '09:14 AM';
  const liveDuration = '4h 14m';
  const progressPct = Math.round((254 / (8.5 * 60)) * 100);

  const selectedRec = MOCK_HISTORY.find(h => h.date === selectedDate);
  const selectedHoliday = MOCK_HOLIDAYS.find(h => h.date === selectedDate);

  const upcomingHolidays = MOCK_HOLIDAYS.filter(h => h.date >= '2026-04-10').slice(0, 3);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f172a 50%, #0d1f38 100%)' }}
    >
      <motion.div
        className="max-w-[1400px] mx-auto px-4 py-5 space-y-5"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >

        {/* ── PAGE HEADER ────────────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <div
            className="relative rounded-2xl overflow-hidden px-6 py-5"
            style={{ background: `linear-gradient(135deg, #0D3B66, #1F6FB2, #0f2a4a)` }}
          >
            {/* Decorative orbs */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #60a5fa, transparent)', transform: 'translate(30%,-40%)' }} />
            <div className="absolute bottom-0 left-1/4 w-40 h-40 rounded-full opacity-8" style={{ background: 'radial-gradient(circle, #10B981, transparent)', transform: 'translateY(60%)' }} />

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg text-white shadow-lg flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))', border: '1px solid rgba(255,255,255,0.2)' }}>
                  {MOCK_USER.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2.5 mb-0.5">
                    <h1 className="text-xl font-black text-white">Attendance</h1>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: 'rgba(16,185,129,0.25)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                      Live
                    </span>
                  </div>
                  <p className="text-blue-200 text-sm font-medium">{MOCK_USER.name} · April 2026</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(249,115,22,0.2)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                  Apply Leave
                </button>
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.18)' }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  Export PDF
                </button>
              </div>
            </div>

            {/* Live status strip */}
            <div className="relative mt-4 flex flex-wrap gap-3">
              {[
                { label: 'Punch In', value: isPunchedIn ? punchInTime : '—', color: C.green },
                { label: 'Duration', value: isPunchedIn && !isPunchedOut ? liveDuration : '—', color: '#60a5fa' },
                { label: 'Streak',   value: `${MOCK_STATS.streak} days`, color: C.amber },
                { label: 'This Month', value: `${MOCK_STATS.daysPresent} present`, color: C.purple },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] text-blue-200 font-medium">{label}:</span>
                  <span className="text-[11px] font-black text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── STAT CARDS ROW ─────────────────────────────────────────────── */}
        <motion.div
          variants={stagger}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          <StatPill label="Hours Worked" value={`${MOCK_STATS.monthHours}h`} color={C.blue} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          } />
          <StatPill label="Days Present" value={MOCK_STATS.daysPresent} color={C.green} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          } />
          <StatPill label="Days Late" value={MOCK_STATS.daysLate} color={C.amber} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          } />
          <StatPill label="Days Absent" value={MOCK_STATS.daysAbsent} color={MOCK_STATS.daysAbsent > 0 ? C.red : C.green} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
          } />
          <StatPill label="Streak" value={`${MOCK_STATS.streak}d`} color={C.orange} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          } />
          <StatPill label="Your Rank" value={`#${MOCK_STATS.rank}`} color={C.purple} icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          } />
        </motion.div>

        {/* ── MAIN 3-COLUMN GRID ─────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 xl:grid-cols-12 gap-4">

          {/* LEFT: Today Status + Week Chart */}
          <div className="xl:col-span-4 flex flex-col gap-4">

            {/* Today Status Card */}
            <Card>
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
                iconColor={C.green}
                title="Today's Status"
                subtitle="Friday, April 10, 2026 · Live"
                right={
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg"
                    style={{ background: `${C.green}18`, color: C.green }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.green }} />
                    Active
                  </span>
                }
              />
              <div className="p-4 space-y-4">
                {/* Big duration + progress */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time Logged Today</p>
                  <div className="flex items-baseline gap-2 mb-3">
                    <motion.span
                      key={liveDuration}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-4xl font-black"
                      style={{ color: C.green }}
                    >
                      {liveDuration}
                    </motion.span>
                    <span className="text-xs font-semibold text-slate-500">/ 8h 30m goal</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#1e3a2a' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${C.green}, ${C.greenL})` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 1.4, ease: [0.23,1,0.32,1] }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-slate-600 font-medium">0h</span>
                    <span className="text-[10px] font-black" style={{ color: C.green }}>{progressPct}% complete</span>
                    <span className="text-[10px] text-slate-600 font-medium">8.5h</span>
                  </div>
                </div>

                {/* Punch rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                    style={{ background: `${C.green}10`, border: `1px solid ${C.green}22` }}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${C.green}22` }}>
                        <svg className="w-3.5 h-3.5" style={{ color: C.green }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                      </div>
                      <span className="text-sm font-semibold text-slate-400">Punch In</span>
                    </div>
                    <span className="text-sm font-black" style={{ color: C.green }}>{punchInTime}</span>
                  </div>

                  {!isPunchedOut && isPunchedIn ? (
                    <PunchButton type="out" onClick={() => { setIsPunchedOut(true); }} />
                  ) : isPunchedOut ? (
                    <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black border"
                      style={{ background: `${C.green}10`, borderColor: `${C.green}22`, color: C.green }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Day Complete
                    </div>
                  ) : (
                    <PunchButton type="in" onClick={() => setIsPunchedIn(true)} />
                  )}
                </div>

                {/* Goal chips */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center px-3 py-2.5 rounded-xl"
                    style={{ background: `${C.blue}12`, border: `1px solid ${C.blue}22` }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Daily Goal</p>
                    <p className="text-lg font-black" style={{ color: C.blue }}>8.5h</p>
                  </div>
                  <div className="text-center px-3 py-2.5 rounded-xl"
                    style={{ background: `${C.green}10`, border: `1px solid ${C.green}20` }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Avg / Day</p>
                    <p className="text-lg font-black" style={{ color: C.green }}>{MOCK_STATS.avgHours}h</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Weekly chart */}
            <Card>
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>}
                iconColor={C.blue}
                title="This Week"
                subtitle="Mon–Sun performance"
              />
              <div className="px-4 py-3">
                <WeekBar />
              </div>
            </Card>

            {/* Upcoming Holidays */}
            <Card>
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>}
                iconColor={C.amber}
                title="Upcoming Holidays"
                subtitle="April 2026"
                count={upcomingHolidays.length}
              />
              <div className="p-3 space-y-2">
                {upcomingHolidays.map(h => {
                  const d = new Date(h.date);
                  const day = d.getDate();
                  const mon = d.toLocaleString('en', { month: 'short' });
                  const wd = d.toLocaleString('en', { weekday: 'short' });
                  const daysLeft = Math.round((d.getTime() - new Date('2026-04-10').getTime()) / 86400000);
                  return (
                    <motion.div
                      key={h.date}
                      whileHover={{ x: 2 }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{ background: `${C.amber}08`, border: `1px solid ${C.amber}20` }}
                    >
                      <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 text-white font-black"
                        style={{ background: `linear-gradient(135deg, ${C.amber}, #D97706)` }}>
                        <span className="text-[8px] leading-none uppercase">{mon}</span>
                        <span className="text-base leading-none">{day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-200 truncate">{h.name}</p>
                        <p className="text-[11px] text-slate-500">{wd}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
                        style={{ background: `${C.amber}18`, color: C.amber }}>
                        {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* CENTER: Calendar */}
          <div className="xl:col-span-4 flex flex-col gap-4">
            <Card className="flex flex-col">
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>}
                iconColor={C.blue}
                title="Attendance Calendar"
                subtitle="Click a date to view details"
                right={
                  <button
                    onClick={() => setSelectedDate('2026-04-10')}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg transition-all"
                    style={{ background: `${C.blue}18`, color: C.blue }}
                  >
                    Today
                  </button>
                }
              />
              <div className="flex-1">
                <MiniCalendar onSelectDate={setSelectedDate} selectedDate={selectedDate} />
              </div>
            </Card>

            {/* Selected Date Detail */}
            <Card>
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                iconColor={C.purple}
                title="Date Detail"
                subtitle={selectedDate}
              />
              <div className="p-4">
                {selectedHoliday ? (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl"
                    style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}25` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${C.amber}, #D97706)` }}>
                      <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.amber }}>Public Holiday</p>
                      <p className="text-sm font-black text-slate-200">{selectedHoliday.name}</p>
                    </div>
                  </div>
                ) : selectedRec?.status === 'absent' ? (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl"
                    style={{ background: `${C.red}10`, border: `1px solid ${C.red}25` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${C.red}20` }}>
                      <svg className="w-5 h-5" style={{ color: C.red }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-red-400">Absent</p>
                      <p className="text-sm font-black text-slate-200">{fmtDate(selectedDate)}</p>
                    </div>
                  </div>
                ) : selectedRec?.punch_in ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <StatusDot status={selectedRec.is_late ? 'late' : 'present'} />
                      <span className="text-sm font-bold text-slate-300">{fmtDate(selectedDate)}</span>
                      {selectedRec.is_late && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded"
                          style={{ background: `${C.orange}20`, color: C.orange }}>LATE</span>
                      )}
                    </div>
                    {[
                      { label: 'Punch In',  value: fmtTime(selectedRec.punch_in),  color: C.green },
                      { label: 'Punch Out', value: fmtTime(selectedRec.punch_out), color: C.red   },
                      { label: 'Duration',  value: fmtDur(selectedRec.duration_minutes), color: C.blue },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex justify-between items-center px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                        <span className="text-sm font-black" style={{ color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                    <svg className="w-8 h-8 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
                    <p className="text-sm font-semibold text-slate-600">No record for this date</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Apply for Leave quick actions */}
            <Card>
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><line x1="9" y1="16" x2="15" y2="16"/></svg>}
                iconColor={C.orange}
                title="Apply for Leave"
                subtitle="Request time off"
              />
              <div className="p-3 space-y-2">
                <motion.button
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-black transition-all"
                  style={{ background: `linear-gradient(135deg, ${C.orange}22, ${C.orange}10)`, color: C.orange, border: `1.5px solid ${C.orange}35` }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Request Full Day Leave
                </motion.button>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Half Day', icon: '🌗', color: C.purple },
                    { label: 'Early Leave', icon: '🚪', color: C.amber },
                  ].map(({ label, icon, color }) => (
                    <button
                      key={label}
                      onClick={() => setShowLeaveModal(true)}
                      className="flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-black transition-all"
                      style={{ background: `${color}10`, color, border: `1px solid ${color}25` }}
                    >
                      <span>{icon}</span> {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Tomorrow', '3 Days', '1 Week'].map(label => (
                    <button
                      key={label}
                      onClick={() => setShowLeaveModal(true)}
                      className="py-1.5 rounded-lg text-[10px] font-bold transition-all text-center"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT: Recent Attendance + Location */}
          <div className="xl:col-span-4 flex flex-col gap-4">

            {/* Recent Attendance */}
            <Card className="flex flex-col">
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                iconColor={C.blue}
                title="Recent Attendance"
                subtitle="Last 8 records"
              />
              <div className="flex-1 overflow-y-auto att-slim-scroll p-3 space-y-2" style={{ maxHeight: 360 }}>
                {MOCK_HISTORY.map((rec, idx) => {
                  const isAbsent = rec.status === 'absent';
                  const statusColor = isAbsent ? C.red : rec.is_late ? C.orange : C.green;
                  const d = new Date(rec.date);
                  const label = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
                  const isToday = rec.date === '2026-04-10';

                  return (
                    <motion.div
                      key={rec.date}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl overflow-hidden cursor-pointer"
                      style={{
                        background: isToday
                          ? `${C.green}08`
                          : isAbsent
                          ? `${C.red}06`
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isToday ? `${C.green}25` : isAbsent ? `${C.red}20` : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-xl" style={{ background: statusColor }} />
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${statusColor}15` }}>
                        <StatusDot status={isAbsent ? 'absent' : rec.is_late ? 'late' : 'present'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold text-slate-300 truncate">{label}</span>
                          {isToday && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none" style={{ background: `${C.green}20`, color: C.green }}>TODAY</span>
                          )}
                          {rec.is_late && !isAbsent && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded leading-none" style={{ background: `${C.orange}20`, color: C.orange }}>LATE</span>
                          )}
                        </div>
                        {!isAbsent && rec.punch_in ? (
                          <div className="flex items-center gap-2 text-[10px] text-slate-600">
                            <span>{fmtTime(rec.punch_in)}</span>
                            {rec.punch_out && <><span>→</span><span>{fmtTime(rec.punch_out)}</span></>}
                            {!rec.punch_out && isToday && (
                              <span className="text-emerald-400 font-bold animate-pulse">ongoing</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[10px] font-bold" style={{ color: C.red }}>Absent</p>
                        )}
                      </div>
                      {!isAbsent && rec.duration_minutes > 0 && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-black" style={{ color: rec.is_late ? C.orange : C.green }}>
                            {isToday ? liveDuration : fmtDur(rec.duration_minutes)}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>

            {/* Location History */}
            <Card className="flex flex-col flex-1">
              <CardHead
                icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                iconColor="#0d9488"
                title="Location History"
                subtitle="Punch in/out · last 5 records"
                right={
                  <span className="text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-widest"
                    style={{ background: 'rgba(13,148,136,0.2)', color: '#2dd4bf' }}>GPS</span>
                }
              />
              <div className="flex-1 overflow-y-auto att-slim-scroll p-3 space-y-2" style={{ maxHeight: 280 }}>
                {MOCK_HISTORY.filter(r => r.punch_in && r.status !== 'absent').slice(0, 5).map((rec, idx) => {
                  const d = new Date(rec.date);
                  const label = d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
                  const isOngoing = rec.date === '2026-04-10' && !rec.punch_out;

                  return (
                    <motion.div
                      key={rec.date}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="rounded-xl border overflow-hidden"
                      style={{
                        borderColor: isOngoing ? `${C.amber}30` : 'rgba(255,255,255,0.07)',
                        background: isOngoing ? `${C.amber}06` : 'rgba(255,255,255,0.025)',
                      }}
                    >
                      <div className="flex items-center justify-between px-3 py-1.5 border-b"
                        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-black"
                            style={{ background: isOngoing ? C.amber : C.deepBlue }}>
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-300">{label}</span>
                          {isOngoing && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
                              style={{ background: `${C.amber}25`, color: C.amber }}>ONGOING</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black" style={{ color: C.green }}>{fmtDur(rec.duration_minutes)}</span>
                          {rec.is_late && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: `${C.red}20`, color: C.red }}>LATE</span>
                          )}
                        </div>
                      </div>
                      {/* In row */}
                      <div className="flex items-center gap-2.5 px-3 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${C.green}20` }}>
                          <svg className="w-2.5 h-2.5" style={{ color: C.green }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black uppercase" style={{ color: C.green }}>IN</span>
                            <span className="text-[10px] font-mono font-bold text-slate-400">{fmtTime(rec.punch_in)}</span>
                          </div>
                          <p className="text-[9px] text-slate-600 italic truncate">Surat, Gujarat · 200m from office</p>
                        </div>
                      </div>
                      {/* Out row */}
                      <div className="flex items-center gap-2.5 px-3 py-1.5">
                        <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{ background: isOngoing ? `${C.amber}20` : `${C.orange}15` }}>
                          <svg className="w-2.5 h-2.5" style={{ color: isOngoing ? C.amber : C.orange }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black uppercase" style={{ color: isOngoing ? C.amber : C.orange }}>OUT</span>
                            <span className="text-[10px] font-mono font-bold text-slate-400">
                              {rec.punch_out ? fmtTime(rec.punch_out) : '—'}
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-600 italic">
                            {isOngoing ? '⏳ Still clocked in' : 'Surat, Gujarat'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>
        </motion.div>

        {/* ── MONTHLY OVERVIEW STRIP ─────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <Card>
            <CardHead
              icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
              iconColor={C.purple}
              title="Monthly Performance"
              subtitle="April 2026 at a glance"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y divide-slate-700/40">
              {[
                {
                  label: 'Working Days',
                  value: 22,
                  sub: 'Apr 1–30',
                  color: C.blue,
                  icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>,
                },
                {
                  label: 'Days Present',
                  value: `${MOCK_STATS.daysPresent} / 22`,
                  sub: '82% attendance',
                  color: C.green,
                  icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
                },
                {
                  label: 'Total Hours',
                  value: `${MOCK_STATS.monthHours}h`,
                  sub: `Avg ${MOCK_STATS.avgHours}h/day`,
                  color: C.amber,
                  icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                },
                {
                  label: 'Punctuality',
                  value: '94%',
                  sub: `${MOCK_STATS.daysLate} late arrival`,
                  color: C.orange,
                  icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
                },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
                      <span style={{ color }}>{icon}</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                  </div>
                  <p className="text-2xl font-black leading-none mb-1" style={{ color }}>{value}</p>
                  <p className="text-[11px] text-slate-600 font-medium">{sub}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

      </motion.div>

      {/* ── LEAVE MODAL ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeaveModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLeaveModal(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: '#1e293b', border: '1px solid #334155' }}
              initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 24 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 text-white" style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.blue})` }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black">Apply for Leave</h2>
                      <p className="text-blue-200 text-xs">Submit your leave request</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowLeaveModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Form body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Leave Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'full_day', label: 'Full Day', icon: '🗓️' },
                      { value: 'half_day', label: 'Half Day', icon: '🌗' },
                      { value: 'early',    label: 'Early Leave', icon: '🚪' },
                    ].map(({ value, label, icon }) => (
                      <button
                        key={value}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: value === 'full_day' ? `${C.blue}20` : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${value === 'full_day' ? `${C.blue}50` : 'rgba(255,255,255,0.08)'}`,
                          color: value === 'full_day' ? C.blue : '#64748b',
                        }}
                      >
                        <span className="text-base">{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">From Date</label>
                  <input
                    type="date"
                    defaultValue="2026-04-13"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition-all"
                    style={{ background: '#263348', border: '1px solid #334155', color: '#f1f5f9' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Reason</label>
                  <textarea
                    placeholder="Reason for leave…"
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 resize-none transition-all"
                    style={{ background: '#263348', border: '1px solid #334155', color: '#f1f5f9' }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex justify-end gap-2 border-t" style={{ borderColor: '#334155', background: '#263348' }}>
                <button
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowLeaveModal(false)}
                  className="px-5 py-2 rounded-xl text-sm font-black text-white transition-all"
                  style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.blue})` }}
                >
                  Submit Request
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AttendancePage;
