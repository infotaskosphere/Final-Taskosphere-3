'use strict';

/**
 * tray.js
 * ─────────────────────────────────────────────────────────────────────────────
 * System tray icon for Taskosphere Agent (Windows).
 *
 * Features:
 *   - Fluent Design tray icon
 *   - Context menu:
 *     - Open Dashboard
 *     - Sync Now
 *     - Notifications
 *     - Settings
 *     - About
 *     - Restart Agent
 *     - Exit (Administrator only)
 *
 * Uses node-tray (or @nut-tree/tray for production builds).
 * Falls back to a simple PowerShell tray if native module unavailable.
 */

const path = require('path');
const { execSync, spawn } = require('child_process');
const os   = require('os');

// ── State ────────────────────────────────────────────────────────────────────
let tray       = null;
let menuItems  = {};
let isCreated  = false;

// ── Tray Icon (embedded as base64 for portability) ───────────────────────────
// Simple 16x16 taskosphere icon (purple circle with "T")
// In production, use a proper .ico file from the build directory
const ICON_PATH = path.join(__dirname, '..', 'assets', 'tray-icon.ico');

// ── Open URL in default browser ──────────────────────────────────────────────

function openUrl(url) {
  if (process.platform === 'win32') {
    execSync(`start "" "${url}"`, { windowsHide: true, detached: true });
  } else {
    execSync(`open "${url}"`);
  }
}

// ── Create tray (fallback: PowerShell NotifyIcon) ────────────────────────────

function createTrayFallback(callbacks) {
  // For headless / server environments, we just log
  console.log('[tray] System tray: Running in background mode');
  console.log('[tray] Access via http://127.0.0.1:' + require('../config').AGENT_PORT);
}

/**
 * Create native system tray.
 * Requires 'electron' or a native tray module.
 * For the PyInstaller/NSIS build, the agent runs as an Electron app.
 * For development, falls back to a console-only mode.
 */
function create(callbacks = {}) {
  if (isCreated) return;

  // Try native tray module
  try {
    // If running inside Electron, use Electron's Tray
    if (typeof require !== 'undefined') {
      try {
        const electron = require('electron');
        if (electron && electron.app) {
          const { Tray, Menu, nativeImage } = electron;
          const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');

          tray = new Tray(
            fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty()
          );

          const contextMenu = Menu.buildFromTemplate([
            {
              label: 'Taskosphere Agent',
              enabled: false,
            },
            { type: 'separator' },
            {
              label: 'Open Dashboard',
              click: () => {
                if (callbacks.onDashboard) callbacks.onDashboard();
                else openUrl('http://127.0.0.1:' + require('../config').AGENT_PORT);
              },
            },
            {
              label: 'Sync Now',
              click: () => {
                if (callbacks.onSync) callbacks.onSync();
              },
            },
            {
              label: 'Notifications',
              click: () => {
                if (callbacks.onNotifications) callbacks.onNotifications();
              },
            },
            { type: 'separator' },
            {
              label: 'Settings',
              click: () => {
                if (callbacks.onSettings) callbacks.onSettings();
              },
            },
            {
              label: 'About',
              click: () => {
                if (callbacks.onAbout) callbacks.onAbout();
                else {
                  const { execSync: es } = require('child_process');
                  es(`msg * "Taskosphere Agent v${require('../package.json').version}\nEnterprise Desktop Agent\n\n(c) Taskosphere"`,
                    { windowsHide: true });
                }
              },
            },
            { type: 'separator' },
            {
              label: 'Restart Agent',
              click: () => {
                if (callbacks.onRestart) callbacks.onRestart();
              },
            },
            {
              label: 'Exit',
              click: () => {
                // Check if admin
                if (process.platform === 'win32') {
                  try {
                    execSync('net session', { stdio: 'ignore' });
                    // Is admin — allow exit
                    if (callbacks.onExit) callbacks.onExit();
                    else process.exit(0);
                  } catch {
                    // Not admin — show message
                    try {
                      execSync('msg * "Only administrators can exit the Taskosphere Agent."',
                        { windowsHide: true });
                    } catch {}
                  }
                } else {
                  if (callbacks.onExit) callbacks.onExit();
                  else process.exit(0);
                }
              },
            },
          ]);

          tray.setToolTip('Taskosphere Agent');
          tray.setContextMenu(contextMenu);
          isCreated = true;
          console.log('[tray] System tray created (Electron)');
          return;
        }
      } catch (e) {
        // Not in Electron
      }
    }
  } catch {}

  // Fallback: no tray, console mode
  createTrayFallback(callbacks);
  isCreated = true;
}

function destroy() {
  if (tray) {
    try { tray.destroy(); } catch {}
    tray = null;
  }
  isCreated = false;
}

function updateTooltip(text) {
  if (tray) {
    try { tray.setToolTip(text); } catch {}
  }
}

module.exports = { create, destroy, updateTooltip };
