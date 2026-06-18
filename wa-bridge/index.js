/**
   * wa-bridge/index.js — Multi-session WhatsApp Web bridge for Taskosphere
   * v3.0 — Full WhatsApp Web parity
   *   ★ MEDIA DOWNLOAD: auto-downloads images/videos/audio/documents on arrival
   *   ★ MEDIA SERVE: GET /media/:filename — serves saved media to frontend
   *   ★ REAL-TIME SSE: GET /events — Server-Sent Events stream for live updates
   *   ★ FORCE SYNC: POST /sessions/:id/sync — re-sends full history to backend
   *   ★ ALL CHATS: MAX_C 250→2000, MAX_M 500→3000
   *   ★ CHAT HISTORY: GET /sessions/:id/messages/:jid — fetch history per chat
   *   ★ GROUP JID safety + @lid resolution (unchanged from v2.1)
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

  const PORT           = parseInt(process.env.PORT || process.env.WA_BRIDGE_PORT || "3002");
  const BACKEND_URL    = process.env.BACKEND_URL    || "http://localhost:8000";
  const BRIDGE_PUBLIC_URL = (process.env.BRIDGE_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
  const SESSIONS_DIR   = path.join(__dirname, "sessions");
  const UPLOAD_DIR     = path.join(__dirname, "uploads");
  const logger         = pino({ level: "warn" });

  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  if (!fs.existsSync(UPLOAD_DIR))   fs.mkdirSync(UPLOAD_DIR,   { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g, "_")}`),
  });
  const upload = multer({ storage, limits: { fileSize: 16 * 1024 * 1024 } });

  // ── Session registry + LID maps ──────────────────────────────────────────────
  const sessions    = {};
  const lidMaps     = {};
  // ★ Cache of the last messaging-history.set payload per session, so a manual
  //   "Force Sync" can re-push it even when WhatsApp doesn't re-fire the event
  //   (which only happens once, right after a fresh QR/pairing-code login).
  const historyCache = {};

  function updateLidMap(sessionId, contacts) {
    if (!contacts || contacts.length === 0) return;
    if (!lidMaps[sessionId]) lidMaps[sessionId] = {};
    const map = lidMaps[sessionId];
    for (const c of contacts) {
      const cid = (c.id  || "").trim();
      const lid = (c.lid || "").trim();
      if (lid && cid && !cid.endsWith("@lid") && !cid.endsWith("@g.us")) {
        map[lid] = cid;
        const lidNum = lid.split("@")[0];
        if (lidNum && !map[lidNum]) map[lidNum] = cid;
      }
    }
  }

  function captureLidFromMessage(sessionId, msg) {
    if (!msg?.key) return;
    if (!lidMaps[sessionId]) lidMaps[sessionId] = {};
    const map = lidMaps[sessionId];
    const pairs = [
      [msg.key.remoteJid,   msg.key.senderPn || msg.key.remoteJidAlt],
      [msg.key.participant, msg.key.participantPn || msg.key.participantAlt],
    ];
    for (const [lidJid, pnJid] of pairs) {
      if (!lidJid || !pnJid) continue;
      if (!String(lidJid).endsWith("@lid"))           continue;
      if (!String(pnJid).endsWith("@s.whatsapp.net")) continue;
      map[lidJid] = pnJid;
      const num = lidJid.split("@")[0];
      if (num && !map[num]) map[num] = pnJid;
    }
  }

  function resolveJid(sessionId, jid) {
    if (!jid) return jid;
    if (jid.endsWith("@lid")) {
      const m = lidMaps[sessionId] || {};
      return m[jid] || m[jid.split("@")[0]] || jid;
    }
    return jid;
  }

  // ★ Merge a batch of new items into an existing cached array, keyed by id,
  //   so repeated messaging-history.set chunks (or live messages) don't
  //   duplicate entries and newer copies overwrite older ones.
  function mergeById(existing, incoming, keyFn) {
    if (!incoming || incoming.length === 0) return existing;
    const map = new Map();
    for (const item of existing) {
      const k = keyFn(item);
      if (k) map.set(k, item);
    }
    for (const item of incoming) {
      const k = keyFn(item);
      if (k) map.set(k, item);
    }
    // Cap size so long-running sessions don't grow the cache unbounded
    const arr = Array.from(map.values());
    const MAX = 5000;
    return arr.length > MAX ? arr.slice(arr.length - MAX) : arr;
  }

  async function resolveJidStrict(sessionId, jid) {
    if (!jid || !jid.endsWith("@lid")) return jid;
    const cached = resolveJid(sessionId, jid);
    if (cached !== jid) return cached;
    const sock = sessions[sessionId]?.socket;
    if (!sock) return null;
    try {
      const store = (await sock.store?.contacts) || {};
      for (const [pnJid, contact] of Object.entries(store)) {
        if (contact?.lid === jid && pnJid.endsWith("@s.whatsapp.net")) {
          if (!lidMaps[sessionId]) lidMaps[sessionId] = {};
          lidMaps[sessionId][jid] = pnJid;
          return pnJid;
        }
      }
    } catch (_) {}
    return null;
  }

  // ── SSE event bus ────────────────────────────────────────────────────────────
  const sseClients = new Set();

  function pushSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch (_) { sseClients.delete(res); }
    }
  }

  // ── Media download & save ────────────────────────────────────────────────────
  const MIME_EXT = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/opus": "opus",
    "application/pdf": "pdf",
  };

  async function downloadAndSaveMedia(sessionId, msg) {
    try {
      const m = msg.message;
      if (!m) return null;
      const mediaMsg =
        m.imageMessage    || m.videoMessage    || m.audioMessage    ||
        m.documentMessage || m.stickerMessage  || m.ptvMessage      || null;
      if (!mediaMsg) return null;

      const mimeType = mediaMsg.mimetype || "application/octet-stream";
      const ext      = MIME_EXT[mimeType] || mimeType.split("/")[1]?.split(";")[0] || "bin";
      const filename = `${sessionId}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // downloadMediaMessage requires the full message object
      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger, reuploadRequest: sessions[sessionId]?.socket?.updateMediaMessage }
      );
      if (!buffer || buffer.length === 0) return null;

      fs.writeFileSync(filepath, buffer);
      return {
        url:      `${BRIDGE_PUBLIC_URL}/media/${filename}`,
        filename: m.documentMessage?.fileName || mediaMsg.fileName || filename,
        mimeType,
        size:     buffer.length,
      };
    } catch (e) {
      console.warn(`[${sessionId}] Media download failed:`, e.message);
      return null;
    }
  }

  // ── Send queue ───────────────────────────────────────────────────────────────
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

  // ── Express ──────────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors({ origin: "*", exposedHeaders: ["Content-Disposition"] }));
  app.use(express.json({ limit: "2mb" }));

  // ★ Serve saved media files
  app.use("/media", express.static(UPLOAD_DIR, {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  }));

  // ★ SSE endpoint — real-time event stream
  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch (_) {}
    }, 20000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
  });

  const _lastHit = {};
  function throttle(key, ms = 2000) {
    return (req, res, next) => {
      const now = Date.now(), last = _lastHit[key] || 0;
      if (now - last < ms) return res.status(429).json({ error: "Too many requests", retryAfterMs: ms - (now - last) });
      _lastHit[key] = now; next();
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function extractBody(msg, mediaInfo) {
    return msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption
      || msg.message?.documentMessage?.caption
      || msg.message?.buttonsResponseMessage?.selectedDisplayText
      || msg.message?.listResponseMessage?.title
      || (mediaInfo ? `[${mediaInfo.mimeType.split("/")[0]}]` : "[media]");
  }
  function extractMediaType(msg) {
    if (msg.message?.imageMessage)    return "image";
    if (msg.message?.videoMessage)    return "video";
    if (msg.message?.audioMessage)    return "audio";
    if (msg.message?.ptvMessage)      return "audio";
    if (msg.message?.documentMessage) return "document";
    if (msg.message?.stickerMessage)  return "sticker";
    return null;
  }
  function tsOf(msg) {
    const ts = msg.messageTimestamp;
    return ts ? (typeof ts === "object" ? ts.low : ts) : Math.floor(Date.now() / 1000);
  }

  // ── Hub: forward incoming message ────────────────────────────────────────────
  async function notifyHubIncoming(sessionId, sessionLabel, msg) {
    try {
      if (msg.key?.fromMe) return;
      const rawJid = msg.key?.remoteJid || "";
      if (!rawJid || rawJid === "status@broadcast") return;

      captureLidFromMessage(sessionId, msg);

      const isGroup = rawJid.endsWith("@g.us");
      const jid     = isGroup ? rawJid : resolveJid(sessionId, rawJid);
      if (!jid) return;

      const rawSender = msg.key?.participant || null;
      const sender    = rawSender ? resolveJid(sessionId, rawSender) : null;

      // ★ Download media if present
      const mediaType = extractMediaType(msg);
      let mediaInfo   = null;
      if (mediaType) {
        mediaInfo = await downloadAndSaveMedia(sessionId, msg);
      }

      const body = extractBody(msg, mediaInfo);

      const payload = {
        session_id:    sessionId,
        session_label: sessionLabel || sessionId,
        jid,
        is_group:      isGroup,
        group_subject: isGroup ? (sessions[sessionId]?.groupSubjects?.[jid] || null) : null,
        sender_jid:    sender,
        sender_phone:  sender ? sender.split("@")[0] : null,
        message_id:    msg.key?.id || "",
        from:          (sender || jid).split("@")[0],
        contact_name:  msg.pushName || null,
        body,
        media_url:     mediaInfo?.url   || null,
        media_type:    mediaType        || null,
        filename:      mediaInfo?.filename || null,
        file_size:     mediaInfo?.size  || null,
        timestamp:     tsOf(msg),
      };

      await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/message`, payload, { timeout: 8000 });

      // ★ Push SSE event to bridge subscribers
      pushSSE("message", { jid, session_id: sessionId, timestamp: payload.timestamp });
    } catch (err) {
      console.warn(`[${sessionId}] Hub webhook failed:`, err.message);
    }
  }

  // ── Hub: bulk history sync ────────────────────────────────────────────────────
  async function syncHubHistory(sessionId, sessionLabel, chats, messages, contacts) {
    try {
      const MAX_C = 2000, MAX_M = 3000;  // ★ increased limits
      const contactPayloads = [];
      for (const c of (chats || []).slice(0, MAX_C)) {
        const isGrp = (c.id || "").endsWith("@g.us");
        const cjid  = isGrp ? c.id : resolveJid(sessionId, c.id);
        if (!cjid) continue;
        const phone  = cjid.split("@")[0];
        const ts     = c.lastMsgTimestamp;
        const lastAt = ts ? new Date((typeof ts === "object" ? ts.low : ts) * 1000).toISOString() : null;
        const info   = (contacts || []).find(ct => resolveJid(sessionId, ct.id) === cjid);
        contactPayloads.push({
          jid: cjid, phone,
          display_name:    info?.name || c.name || (isGrp ? c.name || "Group" : phone),
          is_group:        isGrp,
          last_message_at: lastAt,
        });
      }

      const messagePayloads = [];
      for (const msg of (messages || []).slice(0, MAX_M)) {
        captureLidFromMessage(sessionId, msg);
        const raw   = msg.key?.remoteJid || "";
        if (!raw || raw === "status@broadcast") continue;
        const isGrp = raw.endsWith("@g.us");
        const jid   = isGrp ? raw : resolveJid(sessionId, raw);
        if (!jid) continue;

        const mType = extractMediaType(msg);
        const body  = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || (msg.message?.imageMessage    ? `[image]${msg.message.imageMessage.caption ? ": " + msg.message.imageMessage.caption : ""}` : null)
          || (msg.message?.videoMessage    ? `[video]${msg.message.videoMessage.caption ? ": " + msg.message.videoMessage.caption : ""}` : null)
          || (msg.message?.audioMessage    ? "[voice message]" : null)
          || (msg.message?.ptvMessage      ? "[voice note]"    : null)
          || (msg.message?.documentMessage ? `[${msg.message.documentMessage.fileName || "document"}]` : null)
          || null;
        if (!body) continue;

        const sender = msg.key?.participant ? resolveJid(sessionId, msg.key.participant) : null;
        messagePayloads.push({
          session_id:    sessionId,
          session_label: sessionLabel,
          jid,
          is_group:      isGrp,
          sender_jid:    sender,
          sender_phone:  sender ? sender.split("@")[0] : null,
          message_id:    msg.key?.id || "",
          from:          (sender || jid).split("@")[0],
          contact_name:  msg.pushName || null,
          body,
          media_type:    mType || null,
          direction:     msg.key?.fromMe ? "out" : "in",
          timestamp:     tsOf(msg),
        });
      }
      if (contactPayloads.length === 0 && messagePayloads.length === 0) return;
      await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/bulk-sync`, {
        session_id: sessionId, session_label: sessionLabel,
        contacts: contactPayloads, messages: messagePayloads,
      }, { timeout: 60000 });
      console.log(`[${sessionId}] Hub sync: ${contactPayloads.length} contacts, ${messagePayloads.length} messages`);

      // Notify SSE that a sync happened
      pushSSE("sync", { session_id: sessionId, contacts: contactPayloads.length, messages: messagePayloads.length });
    } catch (err) {
      console.warn(`[${sessionId}] Hub history sync failed:`, err.message);
    }
  }

  // ── Hub: forward group metadata ──────────────────────────────────────────────
  async function notifyHubGroups(sessionId, sessionLabel, groupsArray) {
    try {
      if (!groupsArray?.length) return;
      const payload = groupsArray.map(g => ({
        jid:          g.id,
        subject:      g.subject || "Group",
        description:  g.desc    || null,
        owner:        g.owner   || null,
        participants: (g.participants || []).map(p => ({
          jid:    resolveJid(sessionId, p.id),
          admin:  p.admin || null,
        })),
        created_at:   g.creation || null,
      }));
      if (!sessions[sessionId].groupSubjects) sessions[sessionId].groupSubjects = {};
      for (const g of payload) sessions[sessionId].groupSubjects[g.jid] = g.subject;
      await axios.post(`${BACKEND_URL}/api/whatsapp/hub/webhook/groups`, {
        session_id: sessionId, session_label: sessionLabel, groups: payload,
      }, { timeout: 15000 }).catch(e => console.warn(`[${sessionId}] groups webhook (non-fatal):`, e.message));
    } catch (err) {
      console.warn(`[${sessionId}] notifyHubGroups failed:`, err.message);
    }
  }

  // ── Start a session ──────────────────────────────────────────────────────────
  async function startSession(sessionId, webhookOnConnect = true, pairingPhone = null) {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    sessions[sessionId] = sessions[sessionId] || {};
    Object.assign(sessions[sessionId], { status: "connecting", qrBase64: null, pairCode: null });
    sessions[sessionId].retryCount    = sessions[sessionId].retryCount    || 0;
    sessions[sessionId].groupSubjects = sessions[sessionId].groupSubjects || {};

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const version = await getWAVersion();

    const sock = makeWASocket({
      version, auth: state, logger,
      printQRInTerminal: false,
      browser: ["Taskosphere", "Chrome", "1.0"],
      generateHighQualityLinkPreview: false,
      retryRequestDelayMs: 2000,
      syncFullHistory: true,
    });
    sessions[sessionId].socket = sock;

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
          retryCount:  0,
        });
        console.log(`[${sessionId}] Connected as ${sessions[sessionId].displayName}`);
        pushSSE("connected", { session_id: sessionId, phone: sessions[sessionId].phoneNumber });

        // ★ Pull full group list
        try {
          const groups = await sock.groupFetchAllParticipating();
          const arr    = Object.values(groups || {});
          console.log(`[${sessionId}] Fetched ${arr.length} groups`);
          notifyHubGroups(sessionId, sessions[sessionId].displayName, arr).catch(() => {});
        } catch (e) {
          console.warn(`[${sessionId}] groupFetchAllParticipating failed:`, e.message);
        }

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
        pushSSE("disconnected", { session_id: sessionId });
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
    sock.ev.on("contacts.upsert", (list) => updateLidMap(sessionId, list));
    sock.ev.on("contacts.update", (list) => updateLidMap(sessionId, list));

    sock.ev.on("messaging-history.set", async ({ chats, messages, contacts }) => {
      const label = sessions[sessionId]?.displayName || sessionId;
      updateLidMap(sessionId, contacts);

      // ★ Merge into the per-session cache (Baileys may fire this event in
      //   several chunks during initial sync) so a later manual sync has
      //   something to re-push even if WhatsApp never sends this again.
      if (!historyCache[sessionId]) historyCache[sessionId] = { chats: [], messages: [], contacts: [] };
      const cache = historyCache[sessionId];
      cache.chats    = mergeById(cache.chats,    chats    || [], c => c.id);
      cache.contacts = mergeById(cache.contacts, contacts || [], c => c.id);
      cache.messages = mergeById(cache.messages, messages || [], m => m.key?.id);

      syncHubHistory(sessionId, label, chats, messages, contacts).catch(() => {});
    });

    sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
      if (type !== "notify") return;
      const label = sessions[sessionId]?.displayName || sessionId;
      if (!historyCache[sessionId]) historyCache[sessionId] = { chats: [], messages: [], contacts: [] };
      historyCache[sessionId].messages = mergeById(historyCache[sessionId].messages, msgs || [], m => m.key?.id);
      for (const msg of msgs) {
        captureLidFromMessage(sessionId, msg);
        notifyHubIncoming(sessionId, label, msg).catch(() => {});
      }
    });

    // ★ Real-time message status updates
    sock.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        if (u.key?.id) {
          pushSSE("message_status", {
            message_id: u.key.id,
            jid:        u.key.remoteJid,
            status:     u.update?.status,
          });
        }
      }
    });

    sock.ev.on("groups.upsert", (groups) => {
      const label = sessions[sessionId]?.displayName || sessionId;
      notifyHubGroups(sessionId, label, groups).catch(() => {});
    });
    sock.ev.on("groups.update", async (updates) => {
      try {
        const label = sessions[sessionId]?.displayName || sessionId;
        const full  = [];
        for (const u of updates) {
          if (!u.id) continue;
          try { const meta = await sock.groupMetadata(u.id); full.push(meta); } catch (_) {}
        }
        if (full.length) notifyHubGroups(sessionId, label, full).catch(() => {});
      } catch (_) {}
    });
  }

  // ── Boot persisted sessions ──────────────────────────────────────────────────
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

  async function buildSendJid(sessionId, to) {
    if (!to) return null;
    let jid = to.includes("@") ? to : `${to.replace(/\D/g, "")}@s.whatsapp.net`;
    if (jid.endsWith("@g.us"))           return jid;
    if (jid.endsWith("@s.whatsapp.net")) return jid;
    if (jid.endsWith("@lid")) {
      const resolved = await resolveJidStrict(sessionId, jid);
      if (!resolved || resolved.endsWith("@lid")) return null;
      return resolved;
    }
    return jid;
  }

  // ─── REST API ────────────────────────────────────────────────────────────────

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
    res.json({ id: req.params.id, sessionId: req.params.id, status: s.status,
      label: s.displayName || req.params.id, phoneNumber: s.phoneNumber || null,
      displayName: s.displayName || null, connectedAt: s.connectedAt || null });
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
    delete historyCache[req.params.id];
    res.json({ message: "Session deleted" });
  });

  // ★ Force history re-sync
  // Previously this only re-fetched groups, so a session that was already
  // connected (e.g. restored after a bridge restart, instead of freshly
  // QR/pairing-code logged-in) could show "connected" forever with 0 chats —
  // messaging-history.set only fires once, right after a brand-new login.
  // Now it also re-pushes whatever chat/message history we have cached from
  // that event (or from live messages since), and falls back to asking
  // Baileys for fresh on-demand history when nothing is cached yet.
  app.post("/sessions/:id/sync", async (req, res) => {
    const id  = req.params.id;
    const s   = sessions[id];
    if (!s || s.status !== "connected" || !s.socket)
      return res.status(503).json({ error: "Session not connected" });
    try {
      // Re-fetch groups
      const groups = await s.socket.groupFetchAllParticipating();
      const arr    = Object.values(groups || {});
      await notifyHubGroups(id, s.displayName, arr);

      // Re-push cached chat/message history (covers sessions that were
      // already connected before this server start, where Baileys won't
      // fire messaging-history.set again).
      const cache = historyCache[id];
      let pushedContacts = 0, pushedMessages = 0;
      if (cache && (cache.chats.length || cache.messages.length)) {
        await syncHubHistory(id, s.displayName, cache.chats, cache.messages, cache.contacts);
        pushedContacts = cache.chats.length;
        pushedMessages = cache.messages.length;
      } else {
        // Nothing cached at all (e.g. server restarted and this session
        // reconnected from saved creds with no history.set yet). Ask
        // WhatsApp for on-demand history on each known chat so the next
        // sync has something to push.
        try {
          const chats = Object.values(groups || {}).map(g => ({ id: g.id }));
          for (const chat of chats.slice(0, 50)) {
            await s.socket.fetchMessageHistory(20, { remoteJid: chat.id, fromMe: false, id: "" }, 0).catch(() => {});
          }
        } catch (_) { /* fetchMessageHistory not always available; non-fatal */ }
      }

      res.json({
        ok: true,
        message: pushedMessages || pushedContacts
          ? "Sync triggered — re-pushed cached history"
          : "Sync triggered — no cached history yet, requested fresh data",
        groups: arr.length,
        contacts: pushedContacts,
        messages: pushedMessages,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/sessions/:id/resolve-jid", async (req, res) => {
    const jid = req.query.jid || "";
    if (!jid) return res.status(400).json({ error: "jid query param required" });
    const resolved = await resolveJidStrict(req.params.id, jid);
    res.json({
      jid, resolved_jid: resolved || jid, resolved: !!resolved && resolved !== jid,
      safe_to_send: !!resolved && !resolved.endsWith("@lid"),
      lid_map_size: Object.keys(lidMaps[req.params.id] || {}).length,
    });
  });

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

  app.get("/sessions/:id/groups", async (req, res) => {
    const s = sessions[req.params.id];
    if (!s || s.status !== "connected" || !s.socket)
      return res.status(503).json({ error: "Session not connected" });
    try {
      const groups = await s.socket.groupFetchAllParticipating();
      const out = Object.values(groups || {}).map(g => ({
        jid: g.id, subject: g.subject, description: g.desc || null, owner: g.owner || null,
        size: g.size || (g.participants?.length || 0),
        participants: (g.participants || []).map(p => ({ jid: resolveJid(req.params.id, p.id), admin: p.admin || null })),
        created_at: g.creation || null,
      }));
      res.json({ groups: out });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/sessions/:id/groups/:gjid/participants", async (req, res) => {
    const s = sessions[req.params.id];
    if (!s || s.status !== "connected" || !s.socket)
      return res.status(503).json({ error: "Session not connected" });
    try {
      const gjid = decodeURIComponent(req.params.gjid);
      const meta = await s.socket.groupMetadata(gjid);
      res.json({
        jid: meta.id, subject: meta.subject,
        participants: (meta.participants || []).map(p => ({ jid: resolveJid(req.params.id, p.id), admin: p.admin || null })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ★ Send text
  app.post("/send", async (req, res) => {
    const { to, message, sessionId } = req.body;
    if (!to || !message) return res.status(400).json({ error: "to and message required" });
    const session = pickSession(sessionId);
    if (!session || !session.socket) return res.status(503).json({ error: "No connected session" });
    const sid = sessionId || Object.keys(sessions).find(k => sessions[k] === session) || "default";
    const jid = await buildSendJid(sid, to);
    if (!jid) return res.status(422).json({ error: "Could not resolve @lid recipient to a real phone JID." });
    try {
      const result = await enqueueSend(sid, () => session.socket.sendMessage(jid, { text: message }));
      res.json({ success: true, messageId: result?.key?.id, sentTo: jid });
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
      const sid = sessionId || Object.keys(sessions).find(k => sessions[k] === session) || "default";
      const jid = await buildSendJid(sid, to);
      if (!jid) return res.status(422).json({ error: "Could not resolve @lid recipient." });
      const buffer = fs.readFileSync(req.file.path);
      fs.unlink(req.file.path, () => {});
      const result = await enqueueSend(sid, () =>
        session.socket.sendMessage(jid, buildMediaPayload(buffer, req.file.mimetype, req.file.originalname, caption))
      );
      res.json({ success: true, messageId: result?.key?.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ★ Send media (base64 JSON)
  app.post("/send-media-base64", express.json({ limit: "25mb" }), async (req, res) => {
    try {
      const { to, sessionId, caption, base64, mimeType, filename } = req.body;
      if (!to || !base64 || !mimeType) return res.status(400).json({ error: "to, base64, mimeType required" });
      const session = pickSession(sessionId);
      if (!session || !session.socket) return res.status(503).json({ error: "No connected session" });
      const sid = sessionId || Object.keys(sessions).find(k => sessions[k] === session) || "default";
      const jid = await buildSendJid(sid, to);
      if (!jid) return res.status(422).json({ error: "Could not resolve @lid recipient." });
      const buffer = Buffer.from(base64, "base64");
      const result = await enqueueSend(sid, () =>
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
      bridgePublicUrl: BRIDGE_PUBLIC_URL,
    });
  });

  app.listen(PORT, async () => {
    console.log(`WA Bridge v3.0 running on port ${PORT} — public URL: ${BRIDGE_PUBLIC_URL}`);
    console.log(`BACKEND_URL is set to: ${BACKEND_URL}`);

    // ★ Startup self-test: BACKEND_URL is the #1 cause of "session shows
    //   connected but the Hub never gets any chats" — every webhook/sync
    //   call below silently swallows its own errors (.catch(()=>{})) so a
    //   wrong URL here produces zero visible errors anywhere in the UI.
    //   render.yaml ships this as a *placeholder* domain; if it wasn't
    //   updated to the real backend URL in the Render dashboard, every
    //   POST to ${BACKEND_URL}/api/whatsapp/hub/webhook/* fails forever.
    try {
      const probe = await axios.get(`${BACKEND_URL}/health`, { timeout: 8000 }).catch(e => e.response || null);
      if (!probe) {
        console.error(`⚠️  STARTUP CHECK FAILED: could not reach BACKEND_URL (${BACKEND_URL}). ` +
          `Chat history will NEVER sync to the Hub until this is fixed. ` +
          `Set the correct backend URL as the BACKEND_URL env var on this service.`);
      } else if (probe.status >= 500) {
        console.warn(`⚠️  STARTUP CHECK: BACKEND_URL responded with ${probe.status} — backend may be misconfigured.`);
      } else {
        console.log(`✓ BACKEND_URL reachable (status ${probe.status})`);
      }
    } catch (e) {
      console.warn("Startup BACKEND_URL check errored (non-fatal):", e.message);
    }

    await bootPersistedSessions();
  });
  
