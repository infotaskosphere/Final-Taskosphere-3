'use strict';

/**
 * activityTracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks active window / application usage on Windows using PowerShell.
 * Accumulates per-app time and pushes a report to the Taskosphere backend
 * at a configurable interval.
 *
 * Works silently in the background. No keylogging — only window titles and
 * process names are captured for productivity monitoring.
 */

const os           = require('os');
const { execSync } = require('child_process');
const config       = require('./config');
const apiClient    = require('./apiClient');

// ── State ─────────────────────────────────────────────────────────────────────
const appSeconds = {};   // { [processName]: { name, windowTitle, seconds, count } }
let lastTick     = Date.now();
let isRunning    = false;
let token        = null;
let userId       = null;
let collectTimer = null;
let pushTimer    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSeconds(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Windows: get foreground process name + window title via PowerShell ────────
function getActiveWindowInfo() {
  if (process.platform !== 'win32') {
    return { app: 'Taskosphere Agent', title: 'Background' };
  }
  try {
    const ps = [
      'Add-Type -TypeDefinition \'',
      'using System; using System.Runtime.InteropServices;',
      'public class Win32 {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder sb, int n);',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
      '}\';',
      '$h = [Win32]::GetForegroundWindow();',
      '$sb = New-Object System.Text.StringBuilder(256);',
      '[Win32]::GetWindowText($h, $sb, 256) | Out-Null;',
      '$pid2 = [uint32]0;',
      '[Win32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null;',
      '$p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue;',
      'Write-Output "$($p.Name)|$($sb.ToString())"',
    ].join(' ');

    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      timeout: 2000,
      windowsHide: true,
    }).toString().trim();

    const sep = out.indexOf('|');
    if (sep === -1) return { app: out || 'Unknown', title: '' };
    return { app: out.slice(0, sep) || 'Unknown', title: out.slice(sep + 1) };
  } catch {
    return { app: 'Unknown', title: '' };
  }
}

// ── Collect one tick ──────────────────────────────────────────────────────────
function collectTick() {
  const now     = Date.now();
  const elapsed = (now - lastTick) / 1000;
  lastTick      = now;

  const { app, title } = getActiveWindowInfo();
  const key = app.toLowerCase();

  if (!appSeconds[key]) {
    appSeconds[key] = { name: app, windowTitle: title, seconds: 0, count: 0 };
  }
  appSeconds[key].seconds += elapsed;
  appSeconds[key].count   += 1;
  appSeconds[key].windowTitle = title; // keep most recent title
}

// ── Build report object ───────────────────────────────────────────────────────
function getReport() {
  const topApps = Object.values(appSeconds)
    .filter(a => a.seconds > 2)
    .sort((a, b) => b.seconds - a.seconds)
    .map(a => ({
      name:    a.name,
      seconds: Math.round(a.seconds),
      human:   formatSeconds(a.seconds),
    }));

  const activeSeconds = topApps.reduce((s, a) => s + a.seconds, 0);

  return {
    date:          new Date().toISOString().slice(0, 10),
    machine:       os.hostname(),
    totalActive:   formatSeconds(activeSeconds),
    activeSeconds,
    topApps,
    source:        'taskosphere-agent',
  };
}

// ── Push report to backend ────────────────────────────────────────────────────
async function pushReport() {
  if (!token || !userId) {
    console.log('[activity] No auth — skipping push (run /activity/auth first)');
    return;
  }

  const report = getReport();
  if (report.topApps.length === 0) {
    console.log('[activity] Nothing to push yet');
    return;
  }

  try {
    const result = await apiClient.post('/api/activity/report', {
      user_id: userId,
      ...report,
    }, token);
    console.log('[activity] Report pushed:', report.topApps.length, 'apps,', result?.message || '');
  } catch (err) {
    console.error('[activity] Push failed:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function setAuth(t, uid) {
  token  = t;
  userId = uid;
  console.log('[activity] Auth set for user:', uid);
}

function start() {
  if (isRunning) return;
  isRunning   = true;
  lastTick    = Date.now();
  collectTimer = setInterval(collectTick, config.ACTIVITY_COLLECT_INTERVAL);
  pushTimer    = setInterval(pushReport,  config.ACTIVITY_PUSH_INTERVAL);
  console.log('[activity] Tracker started (collect every', config.ACTIVITY_COLLECT_INTERVAL / 1000, 's, push every', config.ACTIVITY_PUSH_INTERVAL / 1000, 's)');
}

function stop() {
  if (collectTimer) clearInterval(collectTimer);
  if (pushTimer)    clearInterval(pushTimer);
  isRunning = false;
  console.log('[activity] Tracker stopped');
}

module.exports = { start, stop, setAuth, getReport, pushReport };
