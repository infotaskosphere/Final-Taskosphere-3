/**
 * wa-bridge/index.js
 * Multi-session WhatsApp Web bridge for Taskosphere
 *
 * Features:
 *  - Admin can add multiple WhatsApp numbers via QR scan
 *  - Each session is isolated and stored in ./sessions/<sessionId>/
 *  - All users can send messages from any connected number
 *  - QR polling endpoint for live QR code display
 *  - Webhook back to Taskosphere backend on connect/disconnect
 *
 * Uses @whiskeysockets/baileys (open-source WhatsApp Web library)
 * Port: 3002 (set WA_BRIDGE_PORT env to override)
 */

const express    = require("express");
const cors       = require("cors");
const QRCode     = require("qrcode");
const axios      = require("axios");
const path       = require("path");
const fs         = require("fs");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino       = require("pino");

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.WA_BRIDGE_PORT  || "3002");
const BACKEND_URL    = process.env.BACKEND_URL || "http://localhost:8000";
const SESSIONS_DIR   = path.join(__dirname, "sessions");
const logger         = pino({ level: "warn" });         // suppress baileys noise

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ─── In-memory session registry ──────────────────────────────────────────────
// sessions[sessionId] = {
//   socket, status, qrBase64, phoneNumber, displayName, connectedAt, retryCount
// }
const sessions = {};

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

async function startSession(sessionId, webhookOnConnect = true) {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Mark as initialising
  sessions[sessionId] = sessions[sessionId] || {};
  sessions[sessionId].status    = "connecting";
  sessions[sessionId].qrBase64  = null;
  sessions[sessionId].retryCount = (sessions[sessionId].retryCount || 0);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Taskosphere", "Chrome", "1.0"],
    generateHighQualityLinkPreview: false,
  });

  sessions[sessionId].socket = sock;

  // QR event
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sessions[sessionId].qrBase64 = await QRCode.toDataURL(qr);
        sessions[sessionId].status   = "awaiting_scan";
        console.log(`[${sessionId}] QR ready`);
      } catch (e) {
        console.error(`[${sessionId}] QR generation failed:`, e.message);
      }
    }

    if (connection === "open") {
      const info = sock.user;
      sessions[sessionId].status      = "connected";
      sessions[sessionId].qrBase64    = null;
      sessions[sessionId].phoneNumber = info?.id?.split(":")[0] || "";
      sessions[sessionId].displayName = info?.name || info?.verifiedName || "";
      sessions[sessionId].connectedAt = new Date().toISOString();
      sessions[sessionId].retryCount  = 0;
      console.log(`[${sessionId}] Connected as ${sessions[sessionId].displayName} (${sessions[sessionId].phoneNumber})`);

      if (webhookOnConnect) {
        try {
          await axios.post(`${BACKEND_URL}/whatsapp/webhook/connected`, {
            sessionId,
            phoneNumber:  sessions[sessionId].phoneNumber,
            displayName:  sessions[sessionId].displayName,
            connectedAt:  sessions[sessionId].connectedAt,
          });
        } catch (e) {
          console.warn(`[${sessionId}] Webhook failed:`, e.message);
        }
      }
    }

    if (connection === "close") {
      const code   = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[code] || code;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      console.log(`[${sessionId}] Disconnected (${reason}). Reconnect: ${shouldReconnect}`);
      sessions[sessionId].status  = shouldReconnect ? "reconnecting" : "disconnected";
      sessions[sessionId].socket  = null;

      // Notify backend
      try {
        await axios.post(`${BACKEND_URL}/whatsapp/webhook/disconnected`, { sessionId, reason });
      } catch (_) {}

      if (shouldReconnect && sessions[sessionId].retryCount < 5) {
        sessions[sessionId].retryCount++;
        const delay = Math.min(5000 * sessions[sessionId].retryCount, 30000);
        setTimeout(() => startSession(sessionId, false), delay);
      } else if (!shouldReconnect) {
        // Logged out — remove persisted creds
        try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true }); } catch (_) {}
        delete sessions[sessionId];
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

// ─── Boot existing sessions from disk ────────────────────────────────────────
async function bootPersistedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
    fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
  );
  console.log(`Booting ${dirs.length} persisted session(s)…`);
  for (const sessionId of dirs) {
    await startSession(sessionId, false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API
// ─────────────────────────────────────────────────────────────────────────────

// GET /sessions — list all sessions and their status
app.get("/sessions", (req, res) => {
  const list = Object.entries(sessions).map(([id, s]) => ({
    sessionId:   id,
    status:      s.status,
    phoneNumber: s.phoneNumber || null,
    displayName: s.displayName || null,
    connectedAt: s.connectedAt || null,
    qrAvailable: !!s.qrBase64,
  }));
  res.json({ sessions: list });
});

// POST /sessions — create a new session (admin initiates QR scan)
app.post("/sessions", async (req, res) => {
  const sessionId = req.body.sessionId || `session_${Date.now()}`;
  if (sessions[sessionId]?.status === "connected") {
    return res.status(409).json({ error: "Session already connected" });
  }
  await startSession(sessionId);
  res.json({ sessionId, status: "connecting", message: "Poll /sessions/:id/qr for QR code" });
});

// GET /sessions/:id — get status for a single session
app.get("/sessions/:id", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json({
    sessionId:   req.params.id,
    status:      s.status,
    phoneNumber: s.phoneNumber || null,
    displayName: s.displayName || null,
    connectedAt: s.connectedAt || null,
    qrAvailable: !!s.qrBase64,
  });
});

// GET /sessions/:id/qr — return current QR as base64 PNG
app.get("/sessions/:id/qr", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (!s.qrBase64) {
    return res.json({ qr: null, status: s.status || "not_ready" });
  }
  res.json({ qr: s.qrBase64, status: s.status });
});

// DELETE /sessions/:id — disconnect and delete session
app.delete("/sessions/:id", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });

  try {
    if (s.socket) await s.socket.logout();
  } catch (_) {}

  try {
    fs.rmSync(path.join(SESSIONS_DIR, req.params.id), { recursive: true, force: true });
  } catch (_) {}

  delete sessions[req.params.id];
  res.json({ message: "Session deleted" });
});

// POST /send — send message from a specific session (or first available)
app.post("/send", async (req, res) => {
  const { to, message, sessionId } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to and message are required" });

  // Normalise number
  const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;

  // Pick session
  let session;
  if (sessionId && sessions[sessionId]?.status === "connected") {
    session = sessions[sessionId];
  } else {
    // Auto-pick first connected
    session = Object.values(sessions).find(s => s.status === "connected");
  }

  if (!session || !session.socket) {
    return res.status(503).json({ error: "No connected WhatsApp session available" });
  }

  try {
    const result = await session.socket.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result?.key?.id });
  } catch (e) {
    console.error("Send failed:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /status — legacy single-session compat (returns first connected)
app.get("/status", (req, res) => {
  const connected = Object.values(sessions).find(s => s.status === "connected");
  res.json({
    connected:   !!connected,
    qrAvailable: Object.values(sessions).some(s => s.qrBase64),
    sessionsCount: Object.keys(sessions).length,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`WA Bridge running on port ${PORT}`);
  await bootPersistedSessions();
});
