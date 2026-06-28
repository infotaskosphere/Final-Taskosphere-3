'use strict';

/**
 * idleDetector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects user idle time on Windows using GetLastInputInfo Win32 API.
 *
 * Idle = no keyboard or mouse input for a configurable threshold (default: 60s).
 * Used by the productivity engine to separate active vs idle time.
 */

const { execSync } = require('child_process');

let idleThreshold  = 60;  // seconds
let lastActiveTime = Date.now();
let totalIdleSeconds   = 0;
let totalActiveSeconds = 0;
let lastTickTime       = Date.now();
let isRunning          = false;
let tickTimer          = null;

// ── Get idle time in seconds via PowerShell ──────────────────────────────────

function getIdleSeconds() {
  if (process.platform !== 'win32') return 0;

  try {
    const ps = String.raw`
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class IdleTime {
    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }
    public static uint GetIdle() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        GetLastInputInfo(ref lii);
        return (uint)Environment.TickCount - lii.dwTime;
    }
}';
Write-Output ([IdleTime]::GetIdle() / 1000)
`;

    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
      { timeout: 2000, windowsHide: true }
    ).toString().trim();

    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

// ── Tick ─────────────────────────────────────────────────────────────────────

function tick() {
  const now     = Date.now();
  const elapsed = (now - lastTickTime) / 1000;
  lastTickTime  = now;

  const idleSec = getIdleSeconds();

  if (idleSec >= idleThreshold) {
    totalIdleSeconds += elapsed;
  } else {
    totalActiveSeconds += elapsed;
    lastActiveTime = now;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

function start(thresholdSec = 60, intervalMs = 5000) {
  if (isRunning) return;
  idleThreshold = thresholdSec;
  isRunning     = true;
  lastTickTime  = Date.now();
  tickTimer     = setInterval(tick, intervalMs);
  console.log(`[idle] Detector started (threshold: ${thresholdSec}s, poll: ${intervalMs / 1000}s)`);
}

function stop() {
  if (tickTimer) clearInterval(tickTimer);
  isRunning = false;
}

function getMetrics() {
  const idleSec = getIdleSeconds();
  return {
    idleSeconds:       Math.round(totalIdleSeconds),
    activeSeconds:     Math.round(totalActiveSeconds),
    currentIdleSec:    Math.round(idleSec),
    isIdle:            idleSec >= idleThreshold,
    idleThreshold,
    lastActiveTime:    new Date(lastActiveTime).toISOString(),
  };
}

function reset() {
  totalIdleSeconds   = 0;
  totalActiveSeconds = 0;
  lastActiveTime     = Date.now();
  lastTickTime       = Date.now();
}

module.exports = { start, stop, getMetrics, reset };
