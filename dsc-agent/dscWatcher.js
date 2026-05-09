'use strict';

/**
 * dscWatcher.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Continuously watches PC/SC readers for DSC token insertion / removal.
 *
 * When a token is inserted it attempts to read the X.509 certificate WITHOUT
 * a PIN (using only SELECT + READ BINARY APDUs). The parsed cert is stored
 * in memory and served by the /dsc-status HTTP endpoint so the Taskosphere
 * web-app can auto-populate the DSC register popup without the user having
 * to click anything.
 *
 * If the cert file is PIN-protected the auto-read will fail silently —
 * the popup will still appear but the user will need to enter their PIN
 * and click "Fetch Data" (which calls /read-dsc?pin=… as before).
 */

const pcsclite = require('pcsclite');

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  plugged:    false,
  cert:       null,
  reader:     null,
  insertedAt: null,
  error:      null,
};

// ── DER / ASN.1 parsing helpers ───────────────────────────────────────────────

function readLength(der, pos) {
  const first = der[pos++];
  if (first < 0x80) return { len: first, pos };
  const nBytes = first & 0x7F;
  let len = 0;
  for (let i = 0; i < nBytes; i++) len = (len << 8) | der[pos++];
  return { len, pos };
}

function readTlv(der, pos) {
  const tag = der[pos++];
  const { len, pos: afterLen } = readLength(der, pos);
  return { tag, len, valueStart: afterLen, nextPos: afterLen + len };
}

function parseSequenceOf(der, start, end) {
  const items = [];
  let pos = start;
  while (pos < end) {
    const tlv = readTlv(der, pos);
    items.push({ ...tlv, value: der.slice(tlv.valueStart, tlv.nextPos) });
    pos = tlv.nextPos;
  }
  return items;
}

function decodeString(der, start, len, tag) {
  const bytes = der.slice(start, start + len);
  if (tag === 0x1E) {
    let s = '';
    for (let i = 0; i < bytes.length - 1; i += 2)
      s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeOid(bytes) {
  let oid = '';
  const first = bytes[0];
  oid += Math.floor(first / 40) + '.' + (first % 40);
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7F);
    if (!(bytes[i] & 0x80)) { oid += '.' + value; value = 0; }
  }
  return oid;
}

function parseTime(bytes, tag) {
  const s = Buffer.from(bytes).toString('ascii');
  let year, month, day;
  if (tag === 0x17) {
    const y2 = parseInt(s.substring(0, 2));
    year  = y2 >= 50 ? 1900 + y2 : 2000 + y2;
    month = s.substring(2, 4);
    day   = s.substring(4, 6);
  } else {
    year  = s.substring(0, 4);
    month = s.substring(4, 6);
    day   = s.substring(6, 8);
  }
  return `${year}-${month}-${day}`;
}

const OID_MAP = {
  '2.5.4.3':  'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU',
  '2.5.4.6':  'C',  '1.2.840.113549.1.9.1': 'emailAddress',
  '2.5.4.41': 'name', '2.5.4.4': 'SN', '2.5.4.42': 'GN',
};

function parseName(der, start, len) {
  const result = {};
  for (const rdn of parseSequenceOf(der, start, start + len)) {
    if (rdn.tag !== 0x31) continue;
    for (const attr of parseSequenceOf(der, rdn.valueStart, rdn.nextPos)) {
      if (attr.tag !== 0x30) continue;
      const children = parseSequenceOf(der, attr.valueStart, attr.nextPos);
      if (children.length < 2) continue;
      const oidItem = children[0], valItem = children[1];
      if (oidItem.tag !== 0x06) continue;
      const oid = decodeOid(der.slice(oidItem.valueStart, oidItem.nextPos));
      result[OID_MAP[oid] || oid] = decodeString(der, valItem.valueStart, valItem.len, valItem.tag);
    }
  }
  return result;
}

function parseDerCertificate(der) {
  try {
    let pos = 0;
    const outer = readTlv(der, pos);
    if (outer.tag !== 0x30) return null;
    const tbs = readTlv(der, outer.valueStart);
    if (tbs.tag !== 0x30) return null;

    let p = tbs.valueStart;
    if (der[p] === 0xA0) { const v = readTlv(der, p); p = v.nextPos; }

    const serial = readTlv(der, p); p = serial.nextPos;
    let serialHex = '';
    for (let i = serial.valueStart; i < serial.nextPos; i++)
      serialHex += der[i].toString(16).padStart(2, '0').toUpperCase();

    const sigAlg    = readTlv(der, p); p = sigAlg.nextPos;
    const issuerTlv = readTlv(der, p); p = issuerTlv.nextPos;
    const issuer    = parseName(der, issuerTlv.valueStart, issuerTlv.len);

    const validity     = readTlv(der, p); p = validity.nextPos;
    let vp             = validity.valueStart;
    const notBeforeTlv = readTlv(der, vp); vp = notBeforeTlv.nextPos;
    const notAfterTlv  = readTlv(der, vp);
    const notBefore    = parseTime(der.slice(notBeforeTlv.valueStart, notBeforeTlv.nextPos), notBeforeTlv.tag);
    const notAfter     = parseTime(der.slice(notAfterTlv.valueStart,  notAfterTlv.nextPos),  notAfterTlv.tag);

    const subjectTlv = readTlv(der, p);
    const subject    = parseName(der, subjectTlv.valueStart, subjectTlv.len);

    return {
      holder_name:   subject.CN || subject.name || subject.GN || null,
      organization:  subject.O  || null,
      email:         subject['emailAddress']   || null,
      serial_number: serialHex,
      issue_date:    notBefore,
      expiry_date:   notAfter,
      issuer:        issuer.CN  || issuer.O    || null,
      read_method:   'agent-auto-no-pin',
    };
  } catch (e) {
    console.error('[dscWatcher] DER parse error:', e.message);
    return null;
  }
}

function extractDerFromBlob(bytes) {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x82) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (i + 4 + len <= bytes.length) return bytes.slice(i, i + 4 + len);
    }
  }
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x81) {
      const len = bytes[i + 2];
      if (i + 3 + len <= bytes.length) return bytes.slice(i, i + 3 + len);
    }
  }
  return bytes;
}

// ── APDU helpers ──────────────────────────────────────────────────────────────

function sendApdu(card, protocol, apdu) {
  return new Promise((resolve, reject) => {
    card.transmit(Buffer.from(apdu), 1024, protocol, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

const CERT_SELECT_APDUS = [
  // ePass2003 / Feitian
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x05],
  ],
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x01],
  ],
  // WatchData / ProxKey / Longmai mToken
  [
    [0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0,0x00,0x00,0x00,0x63,0x50,0x4B,0x43],
    [0x00, 0xA4, 0x02, 0x00, 0x02, 0x00, 0x01],
  ],
  // Generic MF
  [
    [0x00, 0xA4, 0x00, 0x00, 0x02, 0x3F, 0x00],
    [0x00, 0xA4, 0x02, 0x04, 0x02, 0x10, 0x05],
  ],
  // eToken (Gemalto/SafeNet)
  [
    [0x00, 0xA4, 0x04, 0x00, 0x09, 0xA0,0x00,0x00,0x00,0x18,0x0A,0x00,0x00,0x01],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x05],
  ],
];

async function readBinaryPcsc(card, protocol) {
  const chunks = [];
  let offset = 0;
  while (true) {
    const apdu = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, 0xFF];
    const resp = await sendApdu(card, protocol, apdu);
    if (!resp || resp.length < 2) break;
    const sw1  = resp[resp.length - 2];
    const sw2  = resp[resp.length - 1];
    const data = resp.slice(0, resp.length - 2);
    if (sw1 === 0x90) {
      chunks.push(...data);
      offset += data.length;
      if (data.length < 255) break;
    } else if (sw1 === 0x6C) {
      const fix = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, sw2];
      const fr  = await sendApdu(card, protocol, fix);
      if (fr && fr.length >= 2) chunks.push(...fr.slice(0, fr.length - 2));
      break;
    } else { break; }
  }
  return Buffer.from(chunks);
}

// ── Try to read cert without PIN ──────────────────────────────────────────────

async function tryReadCertNoPIN(reader, protocol) {
  for (const selectApdus of CERT_SELECT_APDUS) {
    try {
      let allOk = true;
      for (const apdu of selectApdus) {
        const resp = await sendApdu(reader, protocol, apdu);
        if (!resp || resp.length < 2) { allOk = false; break; }
        const sw1 = resp[resp.length - 2];
        if (sw1 !== 0x90 && sw1 !== 0x61 && sw1 !== 0x62) { allOk = false; break; }
      }
      if (!allOk) continue;

      const raw  = await readBinaryPcsc(reader, protocol);
      if (!raw || raw.length < 64) continue;

      const der  = extractDerFromBlob(raw);
      const cert = parseDerCertificate(der);
      if (cert && cert.holder_name) return cert;
    } catch { continue; }
  }
  return null;
}

// ── Watcher ───────────────────────────────────────────────────────────────────

let pcsc = null;

function startWatcher() {
  try {
    pcsc = pcsclite();
  } catch (e) {
    console.warn('[dscWatcher] pcsclite unavailable:', e.message);
    return;
  }

  pcsc.on('error', err => {
    console.warn('[dscWatcher] PC/SC service error:', err.message);
  });

  pcsc.on('reader', reader => {
    console.log('[dscWatcher] Reader detected:', reader.name);

    reader.on('status', async (status) => {
      const changes     = reader.state ^ status.state;
      const cardPresent = !!(status.state & reader.SCARD_STATE_PRESENT);
      const cardChanged = !!(changes     & reader.SCARD_STATE_PRESENT);
      if (!cardChanged) return;

      if (cardPresent) {
        console.log('[dscWatcher] DSC token inserted into:', reader.name);
        state = {
          plugged:    true,
          cert:       null,
          reader:     reader.name,
          insertedAt: new Date().toISOString(),
          error:      null,
        };

        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, async (err, protocol) => {
          if (err) {
            state.error = 'Could not connect to card: ' + err.message;
            console.warn('[dscWatcher] Connect error:', err.message);
            return;
          }
          try {
            const cert = await tryReadCertNoPIN(reader, protocol);
            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
            if (cert) {
              state.cert = cert;
              console.log('[dscWatcher] Auto-read cert (no PIN):', cert.holder_name);
            } else {
              state.error = 'PIN required — click Fetch Data and enter your PIN';
              console.log('[dscWatcher] Cert requires PIN; popup will prompt for it');
            }
          } catch (e) {
            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
            state.error = e.message;
            console.warn('[dscWatcher] Auto-read failed:', e.message);
          }
        });

      } else {
        console.log('[dscWatcher] DSC token removed from:', reader.name);
        state = { plugged: false, cert: null, reader: reader.name, insertedAt: null, error: null };
      }
    });

    reader.on('error', err => { console.error('[dscWatcher] Reader error:', err.message); });
    reader.on('end',   ()  => {
      if (state.reader === reader.name) {
        state = { plugged: false, cert: null, reader: reader.name, insertedAt: null, error: null };
      }
    });
  });

  console.log('[dscWatcher] Watching for DSC tokens…');
}

function getStatus() { return { ...state }; }

module.exports = { startWatcher, getStatus };
