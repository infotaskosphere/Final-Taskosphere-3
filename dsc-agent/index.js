/**
 * Taskosphere DSC Local Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on the user's local Windows machine to:
 *
 *   1. ACTIVITY TRACKING — watches the active window every 5 s and pushes a
 *      daily activity report to the Taskosphere backend every 60 s.
 *
 *   2. DSC AUTO-DETECT — watches PC/SC readers. When a DSC token is inserted
 *      it tries to read the certificate WITHOUT a PIN and stores the result.
 *      The web-app polls /dsc-status and auto-fills the DSC register popup.
 *
 *   3. DSC READ WITH PIN — the existing /read-dsc?pin=… endpoint (unchanged).
 *
 * HTTP endpoints
 * ──────────────
 *   GET  /health           → { status, version, features }
 *   GET  /dsc-status       → { plugged, cert, reader, insertedAt, error }
 *   GET  /read-dsc?pin=…   → { success, cert }   (PIN-based full read)
 *   POST /activity/auth    → set JWT token + userId for activity push
 *   GET  /activity/report  → return current in-memory activity snapshot
 *   POST /activity/push    → force-push activity report to backend now
 */

'use strict';

const express        = require('express');
const cors           = require('cors');
const { readCertFromPcSc } = require('./pcscReader');
const dscWatcher     = require('./dscWatcher');
const activityTracker = require('./activityTracker');
const config         = require('./config');

const PORT = config.AGENT_PORT;
const app  = express();
app.use(express.json());

// ── CORS — allow Taskosphere web-app (deployed + local dev) ──────────────────
app.use(cors({
  origin: [
    'https://final-taskosphere-frontend.onrender.com',
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ],
  methods: ['GET', 'POST'],
}));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:   'ok',
    agent:    'taskosphere-dsc-agent',
    version:  '2.0.0',
    features: ['dsc-watch', 'dsc-read', 'activity-tracking'],
  });
});

// ── DSC status (auto-read cert on plug-in, no PIN required) ──────────────────
app.get('/dsc-status', (req, res) => {
  res.json(dscWatcher.getStatus());
});

// ── DSC read with PIN (full certificate read via VERIFY PIN APDU) ─────────────
app.get('/read-dsc', async (req, res) => {
  const pin = (req.query.pin || '').trim();
  if (!pin) {
    return res.status(400).json({ success: false, error: 'PIN is required' });
  }

  try {
    console.log('[agent] Reading certificate from PC/SC with PIN…');
    const cert = await readCertFromPcSc(pin);
    console.log('[agent] Certificate read successfully:', cert.holder_name);
    res.json({ success: true, cert });
  } catch (err) {
    console.error('[agent] Read error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// ── Activity: set auth token (called once after user logs in) ─────────────────
app.post('/activity/auth', (req, res) => {
  const { token, user_id } = req.body || {};
  if (!token || !user_id) {
    return res.status(400).json({ success: false, error: 'token and user_id are required' });
  }
  activityTracker.setAuth(token, user_id);
  res.json({ success: true, message: 'Auth set — activity will be pushed to backend' });
});

// ── Activity: return current in-memory snapshot ───────────────────────────────
app.get('/activity/report', (req, res) => {
  res.json({ success: true, report: activityTracker.getReport() });
});

// ── Activity: force-push to backend right now ─────────────────────────────────
app.post('/activity/push', async (req, res) => {
  try {
    await activityTracker.pushReport();
    res.json({ success: true, message: 'Activity pushed to backend' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Taskosphere Agent v2 — Running ✓                 ║');
  console.log(`║     Listening on http://127.0.0.1:${PORT}              ║`);
  console.log('║                                                      ║');
  console.log('║  Features:                                           ║');
  console.log('║    ✓ DSC token auto-detection (no PIN needed)        ║');
  console.log('║    ✓ DSC certificate read with PIN (/read-dsc)       ║');
  console.log('║    ✓ Activity tracking → pushed to backend           ║');
  console.log('║                                                      ║');
  console.log('║  Keep this window open while using Taskosphere.      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Start DSC watcher (watches for token insertion/removal)
  try {
    dscWatcher.startWatcher();
  } catch (e) {
    console.warn('[agent] DSC watcher could not start (pcsclite unavailable):', e.message);
  }

  // Start activity tracker (no auth yet — push starts after /activity/auth is called)
  try {
    activityTracker.start();
  } catch (e) {
    console.warn('[agent] Activity tracker could not start:', e.message);
  }
});
