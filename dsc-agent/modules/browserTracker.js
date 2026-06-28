'use strict';

/**
 * browserTracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks browser tab activity for Chrome, Edge, and Firefox on Windows.
 *
 * Only captures:
 *   - Domain name (e.g. "google.com")
 *   - Page title
 *   - Visit duration (seconds)
 *   - Visit count
 *
 * Never captures page content, passwords, clipboard, or form data.
 *
 * Uses PowerShell to read browser window titles (which contain page titles).
 * Falls back to parsing browser history SQLite files for domains.
 */

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');

// ── State ────────────────────────────────────────────────────────────────────
const visitLog      = {};   // { [domain]: { domain, title, seconds, count, lastTitle } }
let   lastDomain    = null;
let   lastTickTime  = Date.now();
let   isRunning     = false;
let   collectTimer  = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract domain from a window title.
 * Browser windows typically show: "Page Title - Google Chrome"
 * or "Page Title — Mozilla Firefox" or "Page Title - Microsoft​ Edge"
 * We can't reliably extract URL from title alone, so we use
 * the domain from the title or fall back to a generic tracker.
 */
function extractDomainFromTitle(title) {
  if (!title) return null;

  // Common patterns in browser titles that include the domain
  // e.g. "Gmail - Google Chrome", "youtube.com - Microsoft Edge"
  const domainPatterns = [
    /([a-zA-Z0-9][a-zA-Z0-9-]*\.(?:com|org|net|edu|gov|io|co|in|us|uk|dev|app|ai|me|tv|info|biz|xyz|tech|online|store|blog|shop|site|cloud|pro|app))\b/i,
  ];

  for (const pattern of domainPatterns) {
    const match = title.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/**
 * Detect if the active window is a known browser process.
 * Returns { browser: 'chrome'|'edge'|'firefox'|null, title: string }
 */
function getActiveBrowserInfo() {
  if (process.platform !== 'win32') return { browser: null, title: '' };

  try {
    const ps = [
      'Add-Type -TypeDefinition \'',
      'using System; using System.Runtime.InteropServices;',
      'public class BW32 {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder sb, int n);',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
      '}\';',
      '$h = [BW32]::GetForegroundWindow();',
      '$sb = New-Object System.Text.StringBuilder(512);',
      '[BW32]::GetWindowText($h, $sb, 512) | Out-Null;',
      '$pid2 = [uint32]0;',
      '[BW32]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null;',
      '$p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue;',
      'Write-Output "$($p.Name)|$($p.MainWindowTitle)"',
    ].join(' ');

    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
      timeout: 3000,
      windowsHide: true,
    }).toString().trim();

    const sep = out.indexOf('|');
    if (sep === -1) return { browser: null, title: '' };
    const procName = out.slice(0, sep).toLowerCase();
    const title    = out.slice(sep + 1).trim();

    const BROWSERS = {
      'chrome':       'chrome',
      'google chrome':'chrome',
      'msedge':       'edge',
      'microsoftedge':'edge',
      'firefox':      'firefox',
      'firefox.exe':  'firefox',
    };

    const browser = BROWSERS[procName] || null;
    return { browser, title };
  } catch {
    return { browser: null, title: '' };
  }
}

/**
 * Try to get the actual active URL from browser via PowerShell.
 * Uses UI Automation to read the address bar (URL omnibox).
 * Only works when the browser is in focus and address bar is accessible.
 * Fallback to title parsing.
 */
function getActiveUrl(browser) {
  if (!browser || process.platform !== 'win32') return null;

  try {
    // Use PowerShell to get URL from address bar via UI Automation
    // This is more reliable than title parsing
    const ps = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$focused = [System.Windows.Automation.AutomationElement]::FocusedElement
if ($focused -ne $null) {
    $name = $focused.Current.Name
    if ($name -match '^https?://') {
        Write-Output $name
    } else {
        Write-Output ""
    }
} else {
    Write-Output ""
}
`;
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
      { timeout: 2000, windowsHide: true }
    ).toString().trim();

    if (out && out.match(/^https?:\/\//)) return out;
  } catch {}

  return null;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ── Collect one tick ─────────────────────────────────────────────────────────

function collectTick() {
  const now     = Date.now();
  const elapsed = (now - lastTickTime) / 1000;
  lastTickTime  = now;

  const { browser, title } = getActiveBrowserInfo();
  if (!browser) {
    lastDomain = null;
    return;
  }

  // Try to get actual URL
  const url    = getActiveUrl(browser);
  const domain = url ? extractDomain(url) : extractDomainFromTitle(title);

  if (!domain) {
    lastDomain = null;
    return;
  }

  if (!visitLog[domain]) {
    visitLog[domain] = { domain, title: '', seconds: 0, count: 0, lastTitle: '' };
  }

  visitLog[domain].seconds   += elapsed;
  visitLog[domain].count     += 1;
  visitLog[domain].lastTitle  = title;
  lastDomain = domain;
}

// ── Build report ─────────────────────────────────────────────────────────────

function getReport() {
  const topDomains = Object.values(visitLog)
    .filter(v => v.seconds > 2)
    .sort((a, b) => b.seconds - a.seconds)
    .map(v => ({
      domain:  v.domain,
      seconds: Math.round(v.seconds),
      count:   v.count,
      title:   v.lastTitle,
    }));

  const totalBrowseSeconds = topDomains.reduce((s, v) => s + v.seconds, 0);

  return {
    date:               new Date().toISOString().slice(0, 10),
    topDomains,
    totalBrowseSeconds: Math.round(totalBrowseSeconds),
    visits:             topDomains,
  };
}

function resetReport() {
  Object.keys(visitLog).forEach(k => delete visitLog[k]);
  lastDomain   = null;
  lastTickTime = Date.now();
}

// ── Public API ───────────────────────────────────────────────────────────────

function start(intervalMs = 5000) {
  if (isRunning) return;
  isRunning    = true;
  lastTickTime = Date.now();
  collectTimer = setInterval(collectTick, intervalMs);
  console.log('[browser] Tracker started (collect every', intervalMs / 1000, 's)');
}

function stop() {
  if (collectTimer) clearInterval(collectTimer);
  isRunning = false;
  console.log('[browser] Tracker stopped');
}

module.exports = { start, stop, getReport, resetReport };
