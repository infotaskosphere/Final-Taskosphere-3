'use strict';

/**
 * notificationReceiver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives notifications from the Taskosphere backend and displays them
 * as native Windows toast notifications.
 *
 * Polls /api/notifications endpoint periodically.
 * Supports:
 *   - Task notifications
 *   - Deadline reminders
 *   - Announcements
 *   - DSC expiry warnings
 *   - Software update alerts
 *
 * Uses Windows Toast notifications via PowerShell.
 */

const { execSync } = require('child_process');
const https        = require('https');
const http         = require('http');
const config       = require('../config');

// ── State ────────────────────────────────────────────────────────────────────
let isRunning     = false;
let pollTimer     = null;
let lastCheckedId = null;
let token         = null;
let userId        = null;
let notifiedIds   = new Set();  // prevent duplicates

// ── Show Windows Toast ───────────────────────────────────────────────────────

function showWindowsToast(title, message, notifType = 'info') {
  if (process.platform !== 'win32') {
    console.log(`[notify] ${title}: ${message}`);
    return;
  }

  try {
    // Use Windows toast via PowerShell
    // BurntToast module would be ideal but we use a simpler approach
    const ps = String.raw`
$title = 'TASKOSPHERE'
$body = '${message.replace(/'/g, "''").replace(/\n/g, ' ').slice(0, 200)}'
$subtitle = '${title.replace(/'/g, "''").slice(0, 100)}'

# Try BurntToast module first
try {
    Import-Module BurntToast -ErrorAction Stop
    New-BurntToastNotification -Text $title, $subtitle, $body -ErrorAction Stop
    exit 0
} catch {}

# Fallback: Windows notification via .NET
Add-Type -AssemblyName System.Windows.Forms
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipTitle = $title
$notify.BalloonTipText = $body
$notify.BalloonTipIcon = 'Info'
$notify.ShowBalloonTip(5000)
Start-Sleep -Milliseconds 100
$notify.Dispose()
`;

    execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
      { timeout: 10000, windowsHide: true }
    );
  } catch (e) {
    // Silent fail - notifications are non-critical
    console.log(`[notify] Toast failed: ${e.message}`);
    console.log(`[notify] ${title}: ${message}`);
  }
}

// ── Fetch notifications from backend ─────────────────────────────────────────

function fetchNotifications() {
  return new Promise((resolve, reject) => {
    if (!token) {
      resolve([]);
      return;
    }

    let baseUrl = config.BACKEND_URL;
    if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    const url = new URL('/api/notifications?unread_only=true&limit=20', baseUrl);
    const isHttps = url.protocol === 'https:';

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'GET',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let buf = '';
      res.on('data', chunk => { buf += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(buf);
          resolve(Array.isArray(data) ? data : []);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Process new notifications ────────────────────────────────────────────────

async function checkAndNotify() {
  if (!token) return;

  try {
    const notifications = await fetchNotifications();
    let newCount = 0;

    for (const n of notifications) {
      const id = n.id || n._id;
      if (id && !notifiedIds.has(id)) {
        notifiedIds.add(id);
        newCount++;

        showWindowsToast(
          n.title || 'Taskosphere',
          n.message || '',
          n.type || 'system'
        );
      }
    }

    if (newCount > 0) {
      console.log(`[notify] ${newCount} new notification(s) displayed`);
    }

    // Keep notifiedIds from growing unbounded
    if (notifiedIds.size > 500) {
      const arr = [...notifiedIds];
      notifiedIds = new Set(arr.slice(-200));
    }
  } catch (e) {
    console.error('[notify] Check failed:', e.message);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

function setAuth(t, uid) {
  token  = t;
  userId = uid;
}

function start(intervalMs = 60000) {
  if (isRunning) return;
  isRunning = true;
  checkAndNotify();  // immediate check
  pollTimer = setInterval(checkAndNotify, intervalMs);
  console.log('[notify] Receiver started (poll every', intervalMs / 1000, 's)');
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  isRunning = false;
}

module.exports = { start, stop, setAuth, showWindowsToast };
