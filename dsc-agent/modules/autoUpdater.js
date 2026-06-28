'use strict';

/**
 * autoUpdater.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Auto-update system for Taskosphere Agent.
 *
 * Features:
 *   - Version check against backend
 *   - Secure download with signature verification
 *   - Silent installation
 *   - Automatic restart after update
 *   - Rollback support (keeps previous version backup)
 *   - Forced updates (admin can require immediate update)
 */

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const config = require('../config');

// ── Config ───────────────────────────────────────────────────────────────────
const AGENT_DIR     = path.join(os.homedir(), '.taskosphere-agent');
const BACKUP_DIR    = path.join(AGENT_DIR, 'backup');
const UPDATE_DIR    = path.join(AGENT_DIR, 'updates');
const CURRENT_VER_FILE = path.join(AGENT_DIR, 'current_version');

// Ensure dirs
[AGENT_DIR, BACKUP_DIR, UPDATE_DIR].forEach(d => {
  try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch {}
});

// ── State ────────────────────────────────────────────────────────────────────
let isRunning       = false;
let checkTimer      = null;
let currentVersion  = '1.0.0';
let token           = null;
let onUpdateStart   = null;  // callback
let onUpdateComplete = null; // callback
let onRestart       = null;  // callback

// ── Helpers ──────────────────────────────────────────────────────────────────

function readCurrentVersion() {
  try {
    if (fs.existsSync(CURRENT_VER_FILE)) {
      return fs.readFileSync(CURRENT_VER_FILE, 'utf8').trim();
    }
  } catch {}
  return currentVersion;
}

function writeCurrentVersion(ver) {
  try {
    fs.writeFileSync(CURRENT_VER_FILE, ver, 'utf8');
    currentVersion = ver;
  } catch {}
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// ── Check for updates ────────────────────────────────────────────────────────

function checkForUpdate() {
  return new Promise((resolve, reject) => {
    if (!token) {
      resolve({ update_available: false });
      return;
    }

    let baseUrl = config.BACKEND_URL;
    if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    const url = new URL('/api/desktop/version', baseUrl);
    const isHttps = url.protocol === 'https:';

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
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
          if (data.update_available && data.version) {
            const hasUpdate = compareVersions(data.version, currentVersion) > 0;
            resolve({
              ...data,
              update_available: hasUpdate,
              needs_restart: data.forced || false,
            });
          } else {
            resolve({ update_available: false });
          }
        } catch {
          resolve({ update_available: false });
        }
      });
    });

    req.on('error', () => resolve({ update_available: false }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ update_available: false }); });
    req.end();
  });
}

// ── Download update ──────────────────────────────────────────────────────────

function downloadUpdate(downloadUrl, destPath) {
  return new Promise((resolve, reject) => {
    if (!downloadUrl) {
      reject(new Error('No download URL'));
      return;
    }

    const url    = new URL(downloadUrl);
    const isHttps = url.protocol === 'https:';
    const file   = fs.createWriteStream(destPath);

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   'GET',
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        downloadUpdate(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    req.setTimeout(300000, () => {
      req.destroy();
      fs.unlink(destPath, () => {});
      reject(new Error('Download timeout'));
    });

    req.end();
  });
}

// ── Verify signature ─────────────────────────────────────────────────────────

function verifySignature(filePath, expectedSignature) {
  if (!expectedSignature) return true; // skip if no signature provided

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hash       = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    return hash === expectedSignature;
  } catch {
    return false;
  }
}

// ── Apply update (Windows NSIS installer) ────────────────────────────────────

async function applyUpdate(installerPath, signature) {
  // Verify signature
  if (!verifySignature(installerPath, signature)) {
    console.error('[updater] Signature verification failed — aborting update');
    return false;
  }

  // Backup current version
  try {
    const currentExe = process.execPath;
    const backupPath = path.join(BACKUP_DIR, `agent_backup_${Date.now()}.exe`);
    if (fs.existsSync(currentExe)) {
      fs.copyFileSync(currentExe, backupPath);
      console.log('[updater] Backup created:', backupPath);
    }
  } catch (e) {
    console.error('[updater] Backup failed:', e.message);
  }

  // Run installer silently
  if (process.platform === 'win32' && installerPath.endsWith('.exe')) {
    try {
      console.log('[updater] Running installer silently...');
      execSync(`"${installerPath}" /S /NORESTART`, {
        timeout: 120000,
        windowsHide: true,
      });
      return true;
    } catch (e) {
      console.error('[updater] Installer failed:', e.message);
      return false;
    }
  }

  return false;
}

// ── Rollback ─────────────────────────────────────────────────────────────────

function rollback() {
  try {
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('agent_backup_') && f.endsWith('.exe'))
      .sort()
      .reverse();

    if (backups.length === 0) {
      console.error('[updater] No backup available for rollback');
      return false;
    }

    const latestBackup = path.join(BACKUP_DIR, backups[0]);
    const currentExe   = process.execPath;

    // Can't replace running exe directly on Windows
    // Schedule replacement on restart via batch file
    const batchPath = path.join(UPDATE_DIR, 'rollback.bat');
    const batch = `@echo off\r\ntimeout /t 2 /nobreak >nul\r\ncopy /y "${latestBackup}" "${currentExe}"\r\ndel "%~f0"\r\n`;
    fs.writeFileSync(batchPath, batch);

    execSync(`start "" "${batchPath}"`, { windowsHide: true, detached: true });
    return true;
  } catch (e) {
    console.error('[updater] Rollback failed:', e.message);
    return false;
  }
}

// ── Full update cycle ────────────────────────────────────────────────────────

async function performUpdate(updateInfo) {
  if (!updateInfo || !updateInfo.update_available) return false;

  console.log(`[updater] Update available: v${updateInfo.version}`);
  if (onUpdateStart) onUpdateStart(updateInfo.version);

  try {
    // Download
    const ext       = '.exe';
    const destPath  = path.join(UPDATE_DIR, `Taskosphere-Agent-${updateInfo.version}${ext}`);
    console.log('[updater] Downloading...');
    await downloadUpdate(updateInfo.download_url, destPath);
    console.log('[updater] Download complete');

    // Apply
    const success = await applyUpdate(destPath, updateInfo.signature);
    if (success) {
      writeCurrentVersion(updateInfo.version);
      console.log(`[updater] Updated to v${updateInfo.version}`);
      if (onUpdateComplete) onUpdateComplete(updateInfo.version);

      // Restart if forced
      if (updateInfo.needs_restart && onRestart) {
        setTimeout(() => onRestart(), 5000);
      }
      return true;
    }
  } catch (e) {
    console.error('[updater] Update failed:', e.message);
    // Try rollback
    rollback();
  }

  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

function setAuth(t) {
  token = t;
}

function start(checkIntervalMs = 3600000) {  // Check every hour
  if (isRunning) return;
  isRunning       = true;
  currentVersion  = readCurrentVersion();
  console.log(`[updater] Started (current: v${currentVersion}, check every ${checkIntervalMs / 60000}min)`);

  // Initial check after 30 seconds
  setTimeout(async () => {
    const info = await checkForUpdate();
    if (info.update_available) {
      await performUpdate(info);
    }
  }, 30000);

  checkTimer = setInterval(async () => {
    const info = await checkForUpdate();
    if (info.update_available) {
      await performUpdate(info);
    }
  }, checkIntervalMs);
}

function stop() {
  if (checkTimer) clearInterval(checkTimer);
  isRunning = false;
}

function getVersion() {
  return readCurrentVersion();
}

function setCallbacks(callbacks) {
  if (callbacks.onUpdateStart)    onUpdateStart    = callbacks.onUpdateStart;
  if (callbacks.onUpdateComplete) onUpdateComplete = callbacks.onUpdateComplete;
  if (callbacks.onRestart)        onRestart        = callbacks.onRestart;
}

module.exports = {
  start, stop, getVersion, setAuth, setCallbacks,
  checkForUpdate, performUpdate, rollback,
};
