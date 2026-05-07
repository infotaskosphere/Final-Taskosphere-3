/**
 * Taskosphere DSC Local Agent
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this on your local Windows machine to allow Taskosphere to read DSC
 * token certificates via the PC/SC (Windows Smart Card) API.
 *
 * This is needed because Chrome's WebUSB cannot claim the CCID interface on
 * Windows — the OS CCID driver owns it. This agent talks to the OS driver
 * instead and exposes the data via a local HTTP API.
 *
 * Usage:
 *   npm install
 *   node index.js
 *
 * Then click "Fetch Data" in Taskosphere — it will automatically use this agent.
 */

const express = require('express');
const cors = require('cors');
const { readCertFromPcSc } = require('./pcscReader');

const PORT = 7432;
const app = express();

// Allow requests from Taskosphere (deployed) and localhost (dev)
app.use(cors({
  origin: [
    'https://final-taskosphere-frontend.onrender.com',
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ],
  methods: ['GET'],
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'taskosphere-dsc-agent', version: '1.0.0' });
});

// ─── Read certificate from inserted DSC token ─────────────────────────────────
app.get('/read-dsc', async (req, res) => {
  const pin = (req.query.pin || '').trim();
  if (!pin) {
    return res.status(400).json({ success: false, error: 'PIN is required' });
  }

  try {
    console.log('[agent] Reading certificate from PC/SC...');
    const cert = await readCertFromPcSc(pin);
    console.log('[agent] Certificate read successfully:', cert.holder_name);
    res.json({ success: true, cert });
  } catch (err) {
    console.error('[agent] Error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     Taskosphere DSC Local Agent — Running ✓          ║');
  console.log(`║     Listening on http://127.0.0.1:${PORT}              ║`);
  console.log('║                                                      ║');
  console.log('║  Insert your DSC token and click "Fetch Data"        ║');
  console.log('║  in Taskosphere. This window must stay open.         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
