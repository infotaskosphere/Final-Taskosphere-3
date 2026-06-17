/**
 * wa-bridge/index.js — Multi-session WhatsApp Web bridge for Taskosphere
 *
 * Key fixes vs original:
 *  ★ Per-session LID map: contacts.upsert + messaging-history.set populate
 *    lidMaps[sessionId]["12345@lid"] = "91xyz@s.whatsapp.net" so we can
 *    resolve @lid JIDs to real phone JIDs before sending or storing.
 *  ★ resolveJid(sessionId, jid): looks up LID map, returns original if unknown
 *  ★ GET /sessions/:id/resolve-jid?jid=... for backend to call before send
 *  ★ Profile picture endpoint: GET /sessions/:id/contacts/:jid/profile-pic
 *  ★ Bulk history sync: POST to /api/whatsapp/hub/webhook/bulk-sync on connect
 *  ★ Media send: /send-media (multipart) + /send-media-base64 (JSON)
 *  ★ Shared send queue with exponential back-off on 429/503
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
} = require("@whiskeysockets/baileys");
const pino = require("pino");

const FALLBACK_WA_VERSION = [2, 3000, 1023125093];

async function getWAVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    return version;
  } catch (e) {
    console.warn("fetchLatestBaileysVersion failed, using fallback:", e.message);
    return FALLBACK_WA_VERSION;
  }
}

const PORT         = parseInt(process.env.PORT || process.env.WA_BRIDGE_PORT || "3002");
const BACKEND_URL  = process.env.BACKEND_URL || "http://localhost:8000";
const SESSIONS_DIR = path.join(__dirname, "sessions");
const UPLOAD_DIR   = path.join(__dirname, "uploads");
const logger       = pino({ level: "warn" });

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR))   fs.mkdirSync(UPLOAD_DIR,   { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g, "_")}`),
});
const upload = multer({ storage, limits: { fileSize: 16 * 1024 * 1024 } });

// ── Session registry ───────────────────────────────────────────────────────────
const sessions = {};

// ── Per-session LID→JID map ───────────────────────────────────────────────────
//
// WhatsApp multi-device uses @lid (Linked Device ID) JIDs for contacts who have
// multi-device enabled.  @lid numbers are NOT phone numbers.  We build a map
// from contacts.upsert / messaging-history.set so we can resolve them.
//
// lidMaps[sessionId]["7344410878126@lid"] = "919876543210@s.whatsapp.net"
//
const lidMaps = {};

function updateLidMap(sessionId, contacts) {
  if (!contacts || contacts.length === 0) return;
  if (!lidMaps[sessionId]) lidMaps[sessionId] = {};
  const map = lidMaps[sessionId];
  for (const c of contacts) {
    const cid = (c.id || "").trim();
    const lid  = (c.lid || "").trim();
    if (lid && cid && !cid.endsWith("@lid") && !cid.endsWith("@g.us")) {
      map[lid] = cid;
      // Also index the bare LID number
      const lidNum = lid.split("@")[0];
      if (lidNum && !map[lidNum]) map[lidNum] = cid;
    }
  }
}

/**
 * Resolve an @lid JID to its real @s.whatsapp.net JID.
 * Returns the original JID unchanged if it is not @lid or if we have no mapping.
 */
function resolveJid(sessionId, jid) {
  if (!jid) return jid;
  if (jid.endsWith("@lid")) {
    const resolved = lidMaps[sessionId]?.[jid];
    if (resolved) return resolved;
    // Also try bare number key
    const num = jid.split("@")[0];
    const resolvedByNum = lidMaps[sessionId]?.[num];
    if (resolvedByNum) return resolvedByNum;
  }
  return jid;
}

// ── Send queue (per session) ───────────────────────────────────────────────────
const sendQueues = {};
function getQ(sid) { if (!sendQueues[sid]) sendQueues[sid] = { running: false, items: [] }; return sendQueues[sid]; }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enqueueSend(sessionId, fn) {
  const q = getQ(sessionId);
  return new Promise((resolve, reject) => {
    q.items.push({ fn, resolve, reject });
    if (!q.running) drainQ(q);
  });
}

async function drainQ(q) {
  q.running = true;
  while (q.items.length > 0) {
    const { fn, resolve, reject } = q.items.shift();
    let attempt = 0;
    while (attempt < 4) {
      try { resolve(await fn()); break; }
      catch (err) {
        const s = err?.output?.statusCode || err?.status;
        if ((s === 429 || s === 408 || s === 503) && attempt < 3) {
          const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
          console.warn(`[queue] attempt ${attempt + 1} rate-limited, retrying in ${Math.round(delay)}ms`);
          await sleep(delay); attempt++;
        } else { reject(err); break; }
      }
    }
    await sleep(800);
  }
  q.running = false;
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const _lastHit = {};
function throttle(key, ms = 2000) {
  return (req, res, next) => {
    const now = Date.now(), last = _lastHit[key] || 0;
    if (now - last < ms) return res.status(429).json({ error: "Too many requests", retryAfterMs: ms - (now - last) });
    _lastHit[key] = now; next();
  };
}

// ── Hub: forward incoming message to backend ───────────────────────────────────
async function notifyHubIncoming(sessionId, sessionLabel, msg) {
  try {
    if (msg.key?.fromMe) return;
    const rawJid = msg.key?.remoteJid || "";
    const jid    = resolveJid(sessionId, rawJid);
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return;

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

    const ts = msg.messageTimestamp;
    const timestamp = ts ? (typeof ts === "object" ? ts.low : ts) : Math.floor(Date.now() / 1000);

    await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/message`, {
      session_id: sessionId, session_label: sessionLabel || sessionId,
      jid, message_id: msg.key?.id || "",
      from: jid.split("@")[0],
      contact_name: msg.pushName || null,
      body, media_url: null, media_type: mediaType, timestamp,
    }, { timeout: 5000 });
  } catch (err) {
    console.warn(`[${sessionId}] Hub webhook failed:`, err.message);
  }
}

// ── Hub: bulk history sync on connect ─────────────────────────────────────────
async function syncHubHistory(sessionId, sessionLabel, chats, messages, contacts) {
  try {
    const MAX_C = 150, MAX_M = 300;
    const contactPayloads = [];
    for (const c of (chats || []).slice(0, MAX_C)) {
      const cjid = resolveJid(sessionId, c.id);
      if (!cjid) continue;
      const phone  = cjid.split("@")[0];
      const ts     = c.lastMsgTimestamp;
      const lastAt = ts ? new Date((typeof ts === "object" ? ts.low : ts) * 1000).toISOString() : null;
      const info   = (contacts || []).find(ct => resolveJid(sessionId, ct.id) === cjid);
      contactPayloads.push({ jid: cjid, phone, display_name: info?.name || c.name || phone, last_message_at: lastAt });
    }
    const messagePayloads = [];
    for (const msg of (messages || []).slice(0, MAX_M)) {
      const jid = resolveJid(sessionId, msg.key?.remoteJid || "");
      if (!jid || jid === "status@broadcast") continue;
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        (msg.message?.imageMessage   ? `[image]${msg.message.imageMessage.caption ? ": " + msg.message.imageMessage.caption : ""}` : null) ||
        (msg.message?.videoMessage   ? `[video]${msg.message.videoMessage.caption ? ": " + msg.message.videoMessage.caption : ""}` : null) ||
        (msg.message?.audioMessage   ? "[voice message]" : null) ||
        (msg.message?.documentMessage ? `[${msg.message.documentMessage.fileName || "document"}]` : null) ||
        null;
      if (!body) continue;
      const ts = msg.messageTimestamp;
      const timestamp = ts ? (typeof ts === "object" ? ts.low : ts) : Math.floor(Date.now() / 1000);
      messagePayloads.push({
        session_id: sessionId, session_label: sessionLabel,
        jid, message_id: msg.key?.id || "",
        from: jid.split("@")[0],
        contact_name: msg.pushName || null,
        body, direction: msg.key?.fromMe ? "out" : "in", timestamp,
      });
    }
    if (contactPayloads.length === 0 && messagePayloads.length === 0) return;
    await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/bulk-sync`, {
      session_id: sessionId, session_label: sessionLabel,
      contacts: contactPayloads, messages: messagePayloads,
    }, { timeout: 30000 });
    console.log(`[${sessionId}] Hub sync: ${contactPayloads.length} contacts, ${messagePayloads.length} messages`);
  } catch (err) {
    console.warn(`[${sessionId}] Hub history sync failed:`, err.message);
  }
}

// ── Start a session ────────────────────────────────────────────────────────────
async function startSession(sessionId, webhookOnConnect = true, pairingPhone = null) {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  sessions[sessionId] = sessions[sessionId] || {};
  Object.assign(sessions[sessionId], { status: "connecting", qrBase64: null, pairCode: null });
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

  // Phone pairing
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

  // Connection state
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        sessions[sessionId].qrBase64 = await QRCode.toDataURL(qr);
        sessions[sessionId].status   = "awaiting_scan";
      } catch (e) { console.error(`[${sessionId}] QR error:`, e.message); }
    }
    if (connection === "open") {
      const info = sock.user;
      Object.assign(sessions[sessionId], {
        status: "connected", qrBase64: null,
        phoneNumber: info?.id?.split(":")[0] || "",
        displayName: info?.name || info?.verifiedName || "",
        connectedAt: new Date().toISOString(),
        retryCount: 0,
      });
      console.log(`[${sessionId}] Connected as ${sessions[sessionId].displayName}`);
      if (webhookOnConnect) {
        axios.post(`${BACKEND_URL}/api/whatsapp/webhook/connected`, {
          sessionId, phoneNumber: sessions[sessionId].phoneNumber,
          displayName: sessions[sessionId].displayName, connectedAt: sessions[sessionId].connectedAt,
        }).catch(e => console.warn(`[${sessionId}] Connect webhook failed:`, e.message));
      }
    }
    if (connection === "close") {
      const code   = lastDisconnect?.error?.output?.statusCode;
      const should = code !== DisconnectReason.loggedOut;
      sessions[sessionId].status = should ? "reconnecting" : "disconnected";
      sessions[sessionId].socket = null;
      axios.post(`${BACKEND_URL}/api/whatsapp/webhook/disconnected`, { sessionId, reason: DisconnectReason[code] || code }).catch(() => {});
      if (should && sessions[sessionId].retryCount < 5) {
        sessions[sessionId].retryCount++;
        const delay = Math.min(8000 * sessions[sessionId].retryCount, 60000);
        setTimeout(() => startSession(sessionId, false), delay);
      } else if (!should) {
        try { fs.rmSync(path.join(SESSIONS_DIR, sessionId), { recursive: true, force: true }); } catch (_) {}
        delete sessions[sessionId];
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ★ Build LID map from contacts.upsert
  sock.ev.on("contacts.upsert", (list) => {
    updateLidMap(sessionId, list);
  });
  sock.ev.on("contacts.update", (list) => {
    updateLidMap(sessionId, list);
  });

  // ★ History sync → bulk-forward to backend + build LID map
  sock.ev.on("messaging-history.set", async ({ chats, messages, contacts }) => {
    const label = sessions[sessionId]?.displayName || sessionId;
    // Build LID map BEFORE resolving JIDs
    updateLidMap(sessionId, contacts);
    syncHubHistory(sessionId, label, chats, messages, contacts).catch(() => {});
  });

  // ★ Real-time incoming messages
  sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
    if (type !== "notify") return;
    const label = sessions[sessionId]?.displayName || sessionId;
    for (const msg of msgs) {
      notifyHubIncoming(sessionId, label, msg).catch(() => {});
    }
  });
}

// ── Boot persisted sessions ────────────────────────────────────────────────────
async function bootPersistedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
    fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
  );
  console.log(`Booting ${dirs.length} persisted session(s)…`);
  for (const sid of dirs) await startSession(sid, false);
}

function pickSession(sessionId) {
  if (sessionId && sessions[sessionId]?.status === "connected") return sessions[sessionId];
  return Object.values(sessions).find(s => s.status === "connected");
}

function buildMediaPayload(buffer, mimeType, filename, caption) {
  if (mimeType.startsWith("image/")) return { image: buffer, caption: caption || undefined };
  if (mimeType.startsWith("video/")) return { video: buffer, caption: caption || undefined };
  if (mimeType.startsWith("audio/")) return { audio: buffer, mimetype: mimeType, ptt: false };
  return { document: buffer, mimetype: mimeType, fileName: filename || "file", caption: caption || undefined };
}

/** Resolve JID for sending: handle @lid → real JID, then format for Baileys */
function buildSendJid(sessionId, to) {
  let jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
  if (jid.endsWith("@lid")) {
    const resolved = resolveJid(sessionId, jid);
    jid = resolved.endsWith("@lid")
      ? `${jid.split("@")[0]}@s.whatsapp.net`  // last-resort fallback
      : resolved;
  }
  return jid;
}

// ─── REST API ─────────────────────────────────────────────────────────────────

app.get("/sessions", throttle("get_sessions", 1500), (req, res) => {
  res.json({ sessions: Object.entries(sessions).map(([id, s]) => ({
    id, sessionId: id, status: s.status, label: s.displayName || id,
    phoneNumber: s.phoneNumber || null, displayName: s.displayName || null,
    connectedAt: s.connectedAt || null, qrAvailable: !!s.qrBase64,
  })) });
});

app.post("/sessions", async (req, res) => {
  const sessionId    = req.body.sessionId    || `session_${Date.now()}`;
  const pairingPhone = req.body.pairingPhone || null;
  if (sessions[sessionId]?.status === "connected")
    return res.status(409).json({ error: "Session already connected" });
  try {
    await startSession(sessionId, true, pairingPhone);
    res.json({ sessionId, status: "connecting" });
  } catch (e) {
    res.status(500).json({ error: `Failed: ${e.message}` });
  }
});

app.get("/sessions/:id", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json({ id: req.params.id, sessionId: req.params.id, status: s.status, label: s.displayName || req.params.id, phoneNumber: s.phoneNumber || null, displayName: s.displayName || null, connectedAt: s.connectedAt || null });
});

app.get("/sessions/:id/qr", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  res.json({ qr: s.qrBase64 || null, status: s.status });
});

app.get("/sessions/:id/pair-code", (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  if (s.status === "connected") return res.json({ code: null, status: "connected" });
  res.json({ code: s.pairCode || null, status: s.status || "waiting", error: s.error || null });
});

app.delete("/sessions/:id", async (req, res) => {
  const s = sessions[req.params.id];
  if (!s) return res.status(404).json({ error: "Session not found" });
  try { if (s.socket) await s.socket.logout(); } catch (_) {}
  try { fs.rmSync(path.join(SESSIONS_DIR, req.params.id), { recursive: true, force: true }); } catch (_) {}
  delete sessions[req.params.id];
  res.json({ message: "Session deleted" });
});

// ★ Resolve @lid JID to real JID
app.get("/sessions/:id/resolve-jid", (req, res) => {
  const jid = req.query.jid || "";
  if (!jid) return res.status(400).json({ error: "jid query param required" });
  const resolved = resolveJid(req.params.id, jid);
  res.json({ jid, resolved_jid: resolved, resolved: resolved !== jid, lid_map_size: Object.keys(lidMaps[req.params.id] || {}).length });
});

// ★ Profile picture
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

// ★ Send text message
app.post("/send", async (req, res) => {
  const { to, message, sessionId } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to and message required" });
  const session = pickSession(sessionId);
  if (!session || !session.socket) return res.status(503).json({ error: "No connected session" });
  const jid = buildSendJid(sessionId, to);
  try {
    const result = await enqueueSend(sessionId || "default", () => session.socket.sendMessage(jid, { text: message }));
    res.json({ success: true, messageId: result?.key?.id });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

// ★ Send media (multipart)
app.post("/send-media", upload.single("file"), async (req, res) => {
  try {
    const { to, sessionId, caption } = req.body;
    if (!to || !req.file) return res.status(400).json({ error: "to and file required" });
    const session = pickSession(sessionId);
    if (!session || !session.socket) return res.status(503).json({ error: "No connected session" });
    const jid    = buildSendJid(sessionId, to);
    const buffer = fs.readFileSync(req.file.path);
    fs.unlink(req.file.path, () => {});
    const result = await enqueueSend(sessionId || "default", () =>
      session.socket.sendMessage(jid, buildMediaPayload(buffer, req.file.mimetype, req.file.originalname, caption))
    );
    res.json({ success: true, messageId: result?.key?.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ★ Send media (base64 JSON) — for backend proxy
app.post("/send-media-base64", express.json({ limit: "25mb" }), async (req, res) => {
  try {
    const { to, sessionId, caption, base64, mimeType, filename } = req.body;
    if (!to || !base64 || !mimeType) return res.status(400).json({ error: "to, base64, mimeType required" });
    const session = pickSession(sessionId);
    if (!session || !session.socket) return res.status(503).json({ error: "No connected session" });
    const jid    = buildSendJid(sessionId, to);
    const buffer = Buffer.from(base64, "base64");
    const result = await enqueueSend(sessionId || "default", () =>
      session.socket.sendMessage(jid, buildMediaPayload(buffer, mimeType, filename || "file", caption))
    );
    res.json({ success: true, messageId: result?.key?.id, filename: filename || "file", mimeType });
  } catch (e) {
    const status = e?.output?.statusCode || e?.status || 500;
    res.status(status === 429 ? 429 : 500).json({ error: e.message, retryable: status === 429 });
  }
});

app.get("/status", (req, res) => {
  res.json({
    connected:     !!Object.values(sessions).find(s => s.status === "connected"),
    sessionsCount: Object.keys(sessions).length,
  });
});

app.listen(PORT, async () => {
  console.log(`WA Bridge running on port ${PORT}`);
  await bootPersistedSessions();
});
