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
 *  - Rate-limit resilience: exponential backoff on WA 429s
 *  - Media send: image / PDF / document via /send-media
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
const multer     = require("multer");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require("@whiskeysockets/baileys");
const pino       = require("pino");

// Known stable WA Web version — used as fallback if fetchLatestBaileysVersion() fails
const FALLBACK_WA_VERSION = [2, 3000, 1023125093];

async function getWAVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    console.log("WA version fetched:", version);
    return version;
  } catch (e) {
    console.warn("fetchLatestBaileysVersion failed, using fallback:", FALLBACK_WA_VERSION, e.message);
    return FALLBACK_WA_VERSION;
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PORT || process.env.WA_BRIDGE_PORT || "3002");
const BACKEND_URL    = process.env.BACKEND_URL || "http://localhost:8000";
const SESSIONS_DIR   = path.join(__dirname, "sessions");
const UPLOAD_DIR     = path.join(__dirname, "uploads");
const logger         = pino({ level: "warn" });

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR))   fs.mkdirSync(UPLOAD_DIR,   { recursive: true });

// ─── Multer for media uploads ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g, "_")}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4", "audio/mpeg", "audio/ogg",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// ─── In-memory session registry ──────────────────────────────────────────────
const sessions = {};

// ─── Shared send queue to prevent 429 flooding ───────────────────────────────
// Per-session queues ensure messages are serialized with delays
const sendQueues = {};

function getQueue(sessionId) {
  if (!sendQueues[sessionId]) {
    sendQueues[sessionId] = { running: false, items: [] };
  }
  return sendQueues[sessionId];
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enqueueSend(sessionId, fn) {
  const q = getQueue(sessionId);
  return new Promise((resolve, reject) => {
    q.items.push({ fn, resolve, reject });
    if (!q.running) drainQueue(q);
  });
}

async function drainQueue(q) {
  q.running = true;
  while (q.items.length > 0) {
    const { fn, resolve, reject } = q.items.shift();
    let attempts = 0;
    const maxAttempts = 4;
    while (attempts < maxAttempts) {
      try {
        const result = await fn();
        resolve(result);
        break;
      } catch (err) {
        const status = err?.output?.statusCode || err?.status;
        if ((status === 429 || status === 408 || status === 503) && attempts < maxAttempts - 1) {
          const delay = Math.pow(2, attempts + 1) * 1000 + Math.random() * 500;
          console.warn(`[queue] 429/rate-limit on attempt ${attempts + 1}, retrying in ${Math.round(delay)}ms`);
          await sleep(delay);
          attempts++;
        } else {
          reject(err);
          break;
        }
      }
    }
    // Inter-message spacing to avoid flood (1s between sends)
    await sleep(1000);
  }
  q.running = false;
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

async function startSession(sessionId, webhookOnConnect = true) {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  sessions[sessionId] = sessions[sessionId] || {};
  sessions[sessionId].status    = "connecting";
  sessions[sessionId].qrBase64  = null;
  sessions[sessionId].retryCount = (sessions[sessionId].retryCount || 0);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const version = await getWAVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Taskosphere", "Chrome", "1.0"],
    generateHighQualityLinkPreview: false,
    // Reduce 429s: increase retry delays
    retryRequestDelayMs: 2000,
  });

  sessions[sessionId].socket = sock;

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

      try {
        await axios.post(`${BACKEND_URL}/whatsapp/webhook/disconnected`, { sessionId, reason });
      } catch (_) {}

      if (shouldReconnect && sessions[sessionId].retryCount < 5) {
        sessions[sessionId].retryCount++;
        const delay = Math.min(8000 * sessions[sessionId].retryCount, 60000);
        console.log(`[${sessionId}] Reconnecting in ${delay}ms (attempt ${sessions[sessionId].retryCount})`);
        setTimeout(() => startSession(sessionId, false), delay);
      } else if (!shouldReconnect) {
        try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true }); } catch (_) {}
        delete sessions[sessionId];
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

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

// ─── Session picker helper ────────────────────────────────────────────────────
function pickSession(sessionId) {
  if (sessionId && sessions[sessionId]?.status === "connected") return sessions[sessionId];
  return Object.values(sessions).find(s => s.status === "connected");
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API
// ─────────────────────────────────────────────────────────────────────────────

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

app.post("/sessions", async (req, res) => {
  const sessionId = req.body.sessionId || `session_${Date.now()}`;
  if (sessions[sessionId]?.status === "connected") {
    return res.status(409).json({ error: "Session already connected" });
  }
  try {
    await startSession(sessionId);
    res.json({ sessionId, status: "connecting", message: "Poll /sessions/:id/qr for QR code" });
  } catch (e) {
    console.error(`Failed to start session ${sessionId}:`, e.message);
    res.status(500).json({ error: `Failed to start session: ${e.message}` });
  }
});

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

app.get("/sessions/:id/qr", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (!s.qrBase64) {
    return res.json({ qr: null, status: s.status || "not_ready" });
  }
  res.json({ qr: s.qrBase64, status: s.status });
});

app.delete("/sessions/:id", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });

  try { if (s.socket) await s.socket.logout(); } catch (_) {}
  try { fs.rmSync(path.join(SESSIONS_DIR, req.params.id), { recursive: true, force: true }); } catch (_) {}

  delete sessions[req.params.id];
  res.json({ message: "Session deleted" });
});

// ── POST /send — text message with queue + retry ──────────────────────────────
app.post("/send", async (req, res) => {
  const { to, message, sessionId } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to and message are required" });

  const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  const session = pickSession(sessionId);
  if (!session || !session.socket) {
    return res.status(503).json({ error: "No connected WhatsApp session available" });
  }

  try {
    const result = await enqueueSend(session.sessionId || sessionId || "default", () =>
      session.socket.sendMessage(jid, { text: message })
    );
    res.json({ success: true, messageId: result?.key?.id });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    console.error("Send failed:", e.message);
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

// ── POST /send-media — send image / PDF / Excel / doc ────────────────────────
//    Accepts: multipart/form-data OR JSON with base64 data
//    Multipart fields: to, sessionId (opt), caption (opt), file (binary)
//    JSON fields:      to, sessionId (opt), caption (opt), mimeType, base64, filename
app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to, sessionId, caption } = req.body;
    if (!to) return res.status(400).json({ error: "to is required" });

    const jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    const session = pickSession(sessionId);
    if (!session || !session.socket) {
      return res.status(503).json({ error: "No connected WhatsApp session available" });
    }

    let mediaBuffer, mimeType, filename;

    if (req.file) {
      // Multipart upload
      mediaBuffer = fs.readFileSync(req.file.path);
      mimeType     = req.file.mimetype;
      filename     = req.file.originalname;
      // Clean up temp file
      fs.unlink(req.file.path, () => {});
    } else if (req.body.base64 && req.body.mimeType) {
      // Base64 JSON
      mediaBuffer = Buffer.from(req.body.base64, "base64");
      mimeType     = req.body.mimeType;
      filename     = req.body.filename || "file";
    } else {
      return res.status(400).json({ error: "Provide a file (multipart) or base64+mimeType (JSON)" });
    }

    // Determine message type from MIME
    let msgPayload;
    if (mimeType.startsWith("image/")) {
      msgPayload = { image: mediaBuffer, caption: caption || undefined };
    } else if (mimeType.startsWith("video/")) {
      msgPayload = { video: mediaBuffer, caption: caption || undefined };
    } else if (mimeType.startsWith("audio/")) {
      msgPayload = { audio: mediaBuffer, mimetype: mimeType, ptt: false };
    } else {
      // PDF, Excel, Word, etc — send as document
      msgPayload = {
        document: mediaBuffer,
        mimetype: mimeType,
        fileName: filename,
        caption: caption || undefined,
      };
    }

    const result = await enqueueSend(session.sessionId || sessionId || "default", () =>
      session.socket.sendMessage(jid, msgPayload)
    );

    res.json({ success: true, messageId: result?.key?.id, filename, mimeType });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    console.error("Media send failed:", e.message);
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

// ── GET /status — legacy compat ───────────────────────────────────────────────
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
