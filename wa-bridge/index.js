/**
 * wa-bridge/index.js
 * Multi-session WhatsApp Web bridge for Taskosphere
 *
 * Features:
 *  - Admin can add multiple WhatsApp numbers via QR scan or phone pairing code
 *  - Each session is isolated and stored in ./sessions/<sessionId>/
 *  - All users can send messages from any connected number
 *  - QR polling endpoint for live QR code display
 *  - Webhook back to Taskosphere backend on connect/disconnect
 *  - Rate-limit resilience: exponential backoff on WA 429s
 *  - Media send: image / PDF / document via /send-media and /send-media-base64
 *  - ★ Incoming message webhook → WhatsApp Hub unified inbox
 *  - ★ Chat history sync on session connect (messaging-history.set)
 *  - ★ LID JID resolution: @lid → actual @s.whatsapp.net via contacts map
 *  - ★ Profile picture endpoint
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
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const pino = require("pino");

// Known stable WA Web version — fallback if fetchLatestBaileysVersion() fails
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
const PORT         = parseInt(process.env.PORT || process.env.WA_BRIDGE_PORT || "3002");
const BACKEND_URL  = process.env.BACKEND_URL || "http://localhost:8000";
const SESSIONS_DIR = path.join(__dirname, "sessions");
const UPLOAD_DIR   = path.join(__dirname, "uploads");
const logger       = pino({ level: "warn" });

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR))   fs.mkdirSync(UPLOAD_DIR,   { recursive: true });

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g, "_")}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg","image/png","image/webp","image/gif",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "video/mp4","audio/mpeg","audio/ogg",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// ─── In-memory session registry ──────────────────────────────────────────────
const sessions = {};

// ─────────────────────────────────────────────────────────────────────────────
// ★ Per-session LID → JID mapping
//
// WhatsApp multi-device uses @lid (Linked Device ID) JIDs for contacts who
// have multi-device enabled.  @lid is NOT a phone number — stripping it gives
// a numeric LID, not a dialable phone.  We must resolve it to a real
// @s.whatsapp.net JID before sending or storing.
//
// The contacts.upsert and messaging-history.set events provide the mapping:
//   contact.id  = "919876543210@s.whatsapp.net"
//   contact.lid = "7344410878126@lid"
//
// We build lidMaps[sessionId][lid_jid] = real_jid so resolveJid() can look up
// the real JID before we forward anything to the backend.
// ─────────────────────────────────────────────────────────────────────────────

const lidMaps = {};   // sessionId -> { "12345@lid": "91xyz@s.whatsapp.net" }

/**
 * Build or refresh the LID map for a session from a contacts list
 * (from messaging-history.set or contacts.upsert).
 */
function updateLidMap(sessionId, contacts) {
  if (!contacts || contacts.length === 0) return;
  if (!lidMaps[sessionId]) lidMaps[sessionId] = {};
  const map = lidMaps[sessionId];
  for (const c of contacts) {
    const cid = c.id || "";
    const lid  = c.lid || "";
    // Map the LID to the real JID
    if (lid && cid && !cid.endsWith("@lid") && !cid.endsWith("@g.us")) {
      map[lid] = cid;
    }
    // Also index by the raw LID string without @lid in case the caller strips it
    if (lid && cid && !cid.endsWith("@lid")) {
      const lidNum = lid.split("@")[0];
      if (lidNum && !map[lidNum]) map[lidNum] = cid;
    }
  }
}

/**
 * Resolve a JID to its canonical form:
 *  @lid  → look up in lidMaps, fall back to @s.whatsapp.net (best effort)
 *  anything else → return as-is
 */
function resolveJid(sessionId, jid) {
  if (!jid) return jid;
  if (jid.endsWith("@lid")) {
    const resolved = lidMaps[sessionId]?.[jid];
    if (resolved) return resolved;
    // Can't resolve without the map; keep the original @lid JID rather than
    // silently converting to a wrong @s.whatsapp.net JID.
    return jid;
  }
  return jid;
}

// ─── Shared send queue ────────────────────────────────────────────────────────
const sendQueues = {};

function getQueue(sessionId) {
  if (!sendQueues[sessionId]) sendQueues[sessionId] = { running: false, items: [] };
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
    while (attempts < 4) {
      try {
        resolve(await fn()); break;
      } catch (err) {
        const status = err?.output?.statusCode || err?.status;
        if ((status === 429 || status === 408 || status === 503) && attempts < 3) {
          const delay = Math.pow(2, attempts + 1) * 1000 + Math.random() * 500;
          console.warn(`[queue] rate-limit attempt ${attempts + 1}, retrying in ${Math.round(delay)}ms`);
          await sleep(delay); attempts++;
        } else { reject(err); break; }
      }
    }
    await sleep(1000);
  }
  q.running = false;
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─── Throttle helper ──────────────────────────────────────────────────────────
const _lastHit = {};
function throttle(routeKey, minIntervalMs = 2000) {
  return (req, res, next) => {
    const now = Date.now(), last = _lastHit[routeKey] || 0;
    if (now - last < minIntervalMs)
      return res.status(429).json({ error: "Too many requests", retryAfterMs: minIntervalMs - (now - last) });
    _lastHit[routeKey] = now;
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ Hub incoming-message notifier
// ─────────────────────────────────────────────────────────────────────────────

async function notifyHubIncoming(sessionId, sessionLabel, msg) {
  try {
    if (msg.key?.fromMe) return;

    // ★ Resolve @lid JID to actual phone JID
    const rawJid = msg.key?.remoteJid || "";
    const jid    = resolveJid(sessionId, rawJid);

    // Skip groups and broadcasts
    if (jid.endsWith("@g.us") || jid === "status@broadcast") return;
    // Skip if still @lid and we have no resolution (no map entry yet)
    // — we still forward it but with the original JID
    const effectiveJid = jid;

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.documentMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedDisplayText ||
      msg.message?.listResponseMessage?.title ||
      "[media]";

    let mediaType = null;
    if (msg.message?.imageMessage)         mediaType = "image";
    else if (msg.message?.videoMessage)    mediaType = "video";
    else if (msg.message?.audioMessage)    mediaType = "audio";
    else if (msg.message?.documentMessage) mediaType = "document";
    else if (msg.message?.stickerMessage)  mediaType = "sticker";

    const phone = effectiveJid.split("@")[0];
    const contactName = msg.pushName || null;
    const ts  = msg.messageTimestamp;
    const timestamp = ts ? (typeof ts === "object" ? ts.low : ts) : Math.floor(Date.now() / 1000);

    await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/message`, {
      session_id:    sessionId,
      session_label: sessionLabel || sessionId,
      jid:           effectiveJid,
      message_id:    msg.key?.id || "",
      from:          phone,
      contact_name:  contactName,
      body,
      media_url:     null,
      media_type:    mediaType,
      timestamp,
    }, { timeout: 5000 });

    console.log(`[${sessionId}] Hub: forwarded incoming from ${phone} (jid=${effectiveJid})`);
  } catch (err) {
    console.warn(`[${sessionId}] Hub webhook failed:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ★ Hub history sync
// ─────────────────────────────────────────────────────────────────────────────

async function syncHubHistory(sessionId, sessionLabel, chats, messages, contacts) {
  try {
    const MAX_CONTACTS = 150, MAX_MESSAGES = 300;

    const contactPayloads = [];
    for (const c of (chats || []).slice(0, MAX_CONTACTS)) {
      const cjid = resolveJid(sessionId, c.id);
      if (!cjid) continue;
      const phone = cjid.split("@")[0];
      const ts    = c.lastMsgTimestamp;
      const lastAt = ts ? new Date((typeof ts === "object" ? ts.low : ts) * 1000).toISOString() : null;
      const contactEntry = (contacts || []).find(ct => resolveJid(sessionId, ct.id) === cjid);
      const displayName  = contactEntry?.name || c.name || phone;
      contactPayloads.push({ jid: cjid, phone, display_name: displayName, last_message_at: lastAt });
    }

    const messagePayloads = [];
    for (const msg of (messages || []).slice(0, MAX_MESSAGES)) {
      const jid = resolveJid(sessionId, msg.key?.remoteJid || "");
      if (!jid || jid === "status@broadcast") continue;
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        (msg.message?.imageMessage   ? `[image]${msg.message.imageMessage.caption ? ": " + msg.message.imageMessage.caption : ""}` : null) ||
        (msg.message?.videoMessage   ? `[video]${msg.message.videoMessage.caption ? ": " + msg.message.videoMessage.caption : ""}` : null) ||
        (msg.message?.audioMessage   ? "[voice message]" : null) ||
        (msg.message?.documentMessage ? `[${msg.message.documentMessage.fileName || "document"}]` : null) ||
        (msg.message?.stickerMessage ? "[sticker]" : null) ||
        "[media]";
      if (!body) continue;
      const ts = msg.messageTimestamp;
      const timestamp = ts ? (typeof ts === "object" ? ts.low : ts) : Math.floor(Date.now() / 1000);
      messagePayloads.push({
        session_id: sessionId, session_label: sessionLabel,
        jid, message_id: msg.key?.id || "",
        from: jid.split("@")[0],
        contact_name: msg.pushName || null,
        body,
        direction: msg.key?.fromMe ? "out" : "in",
        timestamp,
      });
    }

    if (contactPayloads.length === 0 && messagePayloads.length === 0) return;

    await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/bulk-sync`, {
      session_id: sessionId, session_label: sessionLabel,
      contacts: contactPayloads, messages: messagePayloads,
    }, { timeout: 30000 });

    console.log(`[${sessionId}] Hub: history synced — ${contactPayloads.length} contacts, ${messagePayloads.length} messages`);
  } catch (err) {
    console.warn(`[${sessionId}] Hub history sync failed:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

async function startSession(sessionId, webhookOnConnect = true, pairingPhone = null) {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  sessions[sessionId] = sessions[sessionId] || {};
  sessions[sessionId].status     = "connecting";
  sessions[sessionId].qrBase64   = null;
  sessions[sessionId].pairCode   = null;
  sessions[sessionId].retryCount = sessions[sessionId].retryCount || 0;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const version = await getWAVersion();

  const sock = makeWASocket({
    version, auth: state, logger,
    printQRInTerminal: false,
    browser: ["Taskosphere", "Chrome", "1.0"],
    generateHighQualityLinkPreview: false,
    retryRequestDelayMs: 2000,
  });

  sessions[sessionId].socket = sock;

  // ── Phone pairing ─────────────────────────────────────────────────────────
  if (pairingPhone && !state.creds?.registered) {
    setTimeout(async () => {
      try {
        if (sessions[sessionId]?.status === "connected") return;
        const code = await sock.requestPairingCode(pairingPhone);
        sessions[sessionId].pairCode = code;
        sessions[sessionId].status   = "awaiting_pairing";
        console.log(`[${sessionId}] Pairing code: ${code}`);
      } catch (e) {
        console.error(`[${sessionId}] requestPairingCode failed:`, e.message);
        if (sessions[sessionId]) { sessions[sessionId].status = "error"; sessions[sessionId].error = e.message; }
      }
    }, 3000);
  }

  // ── Connection state ──────────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sessions[sessionId].qrBase64 = await QRCode.toDataURL(qr);
        sessions[sessionId].status   = "awaiting_scan";
        console.log(`[${sessionId}] QR ready`);
      } catch (e) { console.error(`[${sessionId}] QR error:`, e.message); }
    }

    if (connection === "open") {
      const info = sock.user;
      sessions[sessionId].status      = "connected";
      sessions[sessionId].qrBase64    = null;
      sessions[sessionId].phoneNumber = info?.id?.split(":")[0] || "";
      sessions[sessionId].displayName = info?.name || info?.verifiedName || "";
      sessions[sessionId].connectedAt = new Date().toISOString();
      sessions[sessionId].retryCount  = 0;
      console.log(`[${sessionId}] Connected as ${sessions[sessionId].displayName}`);

      if (webhookOnConnect) {
        try {
          await axios.post(`${BACKEND_URL}/api/whatsapp/webhook/connected`, {
            sessionId, phoneNumber: sessions[sessionId].phoneNumber,
            displayName: sessions[sessionId].displayName,
            connectedAt: sessions[sessionId].connectedAt,
          });
        } catch (e) { console.warn(`[${sessionId}] Connect webhook failed:`, e.message); }
      }
    }

    if (connection === "close") {
      const code   = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[code] || code;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      console.log(`[${sessionId}] Disconnected (${reason}). Reconnect: ${shouldReconnect}`);
      sessions[sessionId].status = shouldReconnect ? "reconnecting" : "disconnected";
      sessions[sessionId].socket = null;

      try { await axios.post(`${BACKEND_URL}/api/whatsapp/webhook/disconnected`, { sessionId, reason }); } catch (_) {}

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

  // ── Credentials persistence ───────────────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ── ★ Contacts upsert: build LID → JID map ───────────────────────────────
  //
  // Baileys fires this when contacts are loaded or updated.
  // Each contact object has:
  //   c.id  = "919876543210@s.whatsapp.net"   (real phone-based JID)
  //   c.lid = "7344410878126@lid"              (linked-device ID)
  // We index lid → id so resolveJid() can find the real JID.
  //
  sock.ev.on("contacts.upsert", (updatedContacts) => {
    updateLidMap(sessionId, updatedContacts);
    console.log(`[${sessionId}] contacts.upsert: lidMap now has ${Object.keys(lidMaps[sessionId] || {}).length} entries`);
  });

  sock.ev.on("contacts.update", (updatedContacts) => {
    updateLidMap(sessionId, updatedContacts);
  });

  // ── ★ Chat history sync on session connect ────────────────────────────────
  sock.ev.on("messaging-history.set", async ({ chats, messages, contacts, isLatest }) => {
    const sessionLabel = sessions[sessionId]?.displayName || sessionId;
    // ★ Build LID map from contacts BEFORE resolving JIDs in messages
    updateLidMap(sessionId, contacts);
    console.log(`[${sessionId}] messaging-history.set: chats=${(chats||[]).length}, msgs=${(messages||[]).length}, contacts=${(contacts||[]).length}, lidMapSize=${Object.keys(lidMaps[sessionId]||{}).length}`);
    syncHubHistory(sessionId, sessionLabel, chats, messages, contacts).catch(() => {});
  });

  // ── ★ Real-time incoming messages ─────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;
    const sessionLabel = sessions[sessionId]?.displayName || sessionId;
    for (const msg of msgs) {
      notifyHubIncoming(sessionId, sessionLabel, msg).catch(() => {});
    }
  });
}

// ─── Boot persisted sessions ──────────────────────────────────────────────────
async function bootPersistedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
    fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
  );
  console.log(`Booting ${dirs.length} persisted session(s)…`);
  for (const sessionId of dirs) await startSession(sessionId, false);
}

// ─── Session picker ───────────────────────────────────────────────────────────
function pickSession(sessionId) {
  if (sessionId && sessions[sessionId]?.status === "connected") return sessions[sessionId];
  return Object.values(sessions).find(s => s.status === "connected");
}

// ─── Media payload builder ────────────────────────────────────────────────────
function buildMediaPayload(buffer, mimeType, filename, caption) {
  if (mimeType.startsWith("image/")) return { image: buffer, caption: caption || undefined };
  if (mimeType.startsWith("video/")) return { video: buffer, caption: caption || undefined };
  if (mimeType.startsWith("audio/")) return { audio: buffer, mimetype: mimeType, ptt: false };
  return { document: buffer, mimetype: mimeType, fileName: filename || "file", caption: caption || undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /sessions ─────────────────────────────────────────────────────────────
app.get("/sessions", throttle("get_sessions", 1500), (req, res) => {
  res.json({ sessions: Object.entries(sessions).map(([id, s]) => ({
    id, sessionId: id,
    status:      s.status,
    label:       s.displayName || id,
    phoneNumber: s.phoneNumber || null,
    displayName: s.displayName || null,
    connectedAt: s.connectedAt || null,
    qrAvailable: !!s.qrBase64,
  })) });
});

// ── POST /sessions ────────────────────────────────────────────────────────────
app.post("/sessions", async (req, res) => {
  const sessionId    = req.body.sessionId    || `session_${Date.now()}`;
  const pairingPhone = req.body.pairingPhone || null;
  if (sessions[sessionId]?.status === "connected")
    return res.status(409).json({ error: "Session already connected" });
  try {
    await startSession(sessionId, true, pairingPhone);
    res.json({ sessionId, status: "connecting", message: `Poll /sessions/:id/${pairingPhone ? "pair-code" : "qr"}` });
  } catch (e) {
    console.error(`Failed to start session ${sessionId}:`, e.message);
    res.status(500).json({ error: `Failed to start session: ${e.message}` });
  }
});

// ── GET /sessions/:id ─────────────────────────────────────────────────────────
app.get("/sessions/:id", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json({
    id: req.params.id, sessionId: req.params.id,
    status: s.status, label: s.displayName || req.params.id,
    phoneNumber: s.phoneNumber || null, displayName: s.displayName || null,
    connectedAt: s.connectedAt || null, qrAvailable: !!s.qrBase64,
  });
});

// ── GET /sessions/:id/qr ──────────────────────────────────────────────────────
app.get("/sessions/:id/qr", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (!s.qrBase64) return res.json({ qr: null, status: s.status || "not_ready" });
  res.json({ qr: s.qrBase64, status: s.status });
});

// ── GET /sessions/:id/pair-code ───────────────────────────────────────────────
app.get("/sessions/:id/pair-code", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (s.status === "connected") return res.json({ code: null, status: "connected" });
  if (!s.pairCode) return res.json({ code: null, status: s.status || "waiting", error: s.error || null });
  res.json({ code: s.pairCode, status: s.status || "awaiting_pairing" });
});

// ── DELETE /sessions/:id ──────────────────────────────────────────────────────
app.delete("/sessions/:id", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  try { if (s.socket) await s.socket.logout(); } catch (_) {}
  try { fs.rmSync(path.join(SESSIONS_DIR, req.params.id), { recursive: true, force: true }); } catch (_) {}
  delete sessions[req.params.id];
  res.json({ message: "Session deleted" });
});

// ── ★ GET /sessions/:id/resolve-jid — resolve @lid to real JID ───────────────
//
// The backend calls this when it needs to send to a contact whose stored JID
// is an @lid JID.  Returns the resolved @s.whatsapp.net JID if available.
//
app.get("/sessions/:id/resolve-jid", (req, res) => {
  const jid = req.query.jid || "";
  if (!jid) return res.status(400).json({ error: "jid query param required" });

  const resolved = resolveJid(req.params.id, jid);
  res.json({
    jid,
    resolved_jid: resolved,
    resolved:     resolved !== jid,
    lid_map_size: Object.keys(lidMaps[req.params.id] || {}).length,
  });
});

// ── ★ GET /sessions/:id/contacts/:jid/profile-pic ─────────────────────────────
app.get("/sessions/:id/contacts/:jid/profile-pic", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s || s.status !== "connected" || !s.socket)
    return res.status(503).json({ error: "Session not connected" });
  try {
    let jid = decodeURIComponent(req.params.jid);
    if (!jid.includes("@")) jid = `${jid}@s.whatsapp.net`;
    jid = resolveJid(req.params.id, jid);
    const url = await s.socket.profilePictureUrl(jid, "image");
    res.json({ url: url || null, jid });
  } catch (e) {
    res.json({ url: null, jid: req.params.jid, error: e.message });
  }
});

// ── POST /send — text message ─────────────────────────────────────────────────
app.post("/send", async (req, res) => {
  const { to, message, sessionId } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to and message are required" });

  // to may be a full JID (incl. @lid) or a bare number
  // Resolve @lid to real JID first; then build the sendable JID
  let jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  if (jid.endsWith("@lid")) {
    const resolved = resolveJid(sessionId, jid);
    if (!resolved.endsWith("@lid")) {
      jid = resolved;
    } else {
      // Still @lid — strip it and hope the number is the real phone (rare fallback)
      jid = `${jid.split("@")[0]}@s.whatsapp.net`;
    }
  }

  const session = pickSession(sessionId);
  if (!session || !session.socket)
    return res.status(503).json({ error: "No connected WhatsApp session available" });

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

// ── POST /send-media — send media via multipart ────────────────────────────────
app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to, sessionId, caption } = req.body;
    if (!to) return res.status(400).json({ error: "to is required" });
    if (!req.file) return res.status(400).json({ error: "No file. Use /send-media-base64 for JSON." });

    let jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    if (jid.endsWith("@lid")) {
      const resolved = resolveJid(sessionId, jid);
      jid = resolved.endsWith("@lid") ? `${jid.split("@")[0]}@s.whatsapp.net` : resolved;
    }

    const session = pickSession(sessionId);
    if (!session || !session.socket)
      return res.status(503).json({ error: "No connected WhatsApp session available" });

    const mediaBuffer = fs.readFileSync(req.file.path);
    fs.unlink(req.file.path, () => {});
    const msgPayload = buildMediaPayload(mediaBuffer, req.file.mimetype, req.file.originalname, caption);

    const result = await enqueueSend(session.sessionId || sessionId || "default", () =>
      session.socket.sendMessage(jid, msgPayload)
    );
    res.json({ success: true, messageId: result?.key?.id, filename: req.file.originalname, mimeType: req.file.mimetype });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    console.error("Media send failed:", e.message);
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

// ── POST /send-media-base64 — send media via JSON ─────────────────────────────
app.post("/send-media-base64", express.json({ limit: "25mb" }), async (req, res) => {
  try {
    const { to, sessionId, caption, base64, mimeType, filename } = req.body;
    if (!to)     return res.status(400).json({ error: "to is required" });
    if (!base64) return res.status(400).json({ error: "base64 is required" });
    if (!mimeType) return res.status(400).json({ error: "mimeType is required" });

    let jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    if (jid.endsWith("@lid")) {
      const resolved = resolveJid(sessionId, jid);
      jid = resolved.endsWith("@lid") ? `${jid.split("@")[0]}@s.whatsapp.net` : resolved;
    }

    const session = pickSession(sessionId);
    if (!session || !session.socket)
      return res.status(503).json({ error: "No connected WhatsApp session available" });

    const mediaBuffer = Buffer.from(base64, "base64");
    const fname       = filename || "file";
    const msgPayload  = buildMediaPayload(mediaBuffer, mimeType, fname, caption);

    const result = await enqueueSend(session.sessionId || sessionId || "default", () =>
      session.socket.sendMessage(jid, msgPayload)
    );
    res.json({ success: true, messageId: result?.key?.id, filename: fname, mimeType });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    console.error("Media (base64) send failed:", e.message);
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

// ── GET /status — legacy ──────────────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    connected:     !!Object.values(sessions).find(s => s.status === "connected"),
    qrAvailable:   Object.values(sessions).some(s => s.qrBase64),
    sessionsCount: Object.keys(sessions).length,
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`WA Bridge running on port ${PORT}`);
  await bootPersistedSessions();
});
