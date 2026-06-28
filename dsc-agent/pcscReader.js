/**
 * pcscReader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads X.509 certificates from DSC USB tokens via the OS PC/SC stack
 * (Windows Smart Card API / pcscd on Linux/Mac).
 *
 * This is the Windows-compatible alternative to WebUSB+CCID.
 * The OS CCID driver claims the USB interface; we talk to it via PC/SC.
 */

let pcsclite;
try {
  pcsclite = require('pcsclite');
} catch (e) {
  // pcsclite is a native addon — not available in all builds
  // The agent falls back to PowerShell-based DSC detection in dscWatcher.js
  console.warn('[pcscReader] pcsclite not available — using PowerShell fallback for DSC detection');
  pcsclite = null;
}

// ─── ASN.1 / DER helpers (same as browser version) ───────────────────────────
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
  if (tag === 0x1E) { // BMPString
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
    year = y2 >= 50 ? 1900 + y2 : 2000 + y2;
    month = s.substring(2, 4);
    day = s.substring(4, 6);
  } else {
    year = s.substring(0, 4);
    month = s.substring(4, 6);
    day = s.substring(6, 8);
  }
  return `${year}-${month}-${day}`;
}

const OID_MAP = {
  '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU',
  '2.5.4.6': 'C', '1.2.840.113549.1.9.1': 'emailAddress',
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

    const sigAlg = readTlv(der, p); p = sigAlg.nextPos;
    const issuerTlv = readTlv(der, p); p = issuerTlv.nextPos;
    const issuer = parseName(der, issuerTlv.valueStart, issuerTlv.len);

    const validity = readTlv(der, p); p = validity.nextPos;
    let vp = validity.valueStart;
    const notBeforeTlv = readTlv(der, vp); vp = notBeforeTlv.nextPos;
    const notAfterTlv = readTlv(der, vp);
    const notBefore = parseTime(der.slice(notBeforeTlv.valueStart, notBeforeTlv.nextPos), notBeforeTlv.tag);
    const notAfter = parseTime(der.slice(notAfterTlv.valueStart, notAfterTlv.nextPos), notAfterTlv.tag);

    const subjectTlv = readTlv(der, p);
    const subject = parseName(der, subjectTlv.valueStart, subjectTlv.len);

    return {
      holder_name: subject.CN || subject.name || subject.GN || null,
      organization: subject.O || null,
      email: subject['emailAddress'] || null,
      serial_number: serialHex,
      issue_date: notBefore,
      expiry_date: notAfter,
      issuer: issuer.CN || issuer.O || null,
      read_method: 'pcsc-local-agent',
    };
  } catch (e) {
    console.error('[pcscReader] DER parse error:', e);
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

// ─── PC/SC APDU sending ───────────────────────────────────────────────────────
function sendApdu(card, protocol, apdu) {
  return new Promise((resolve, reject) => {
    card.transmit(Buffer.from(apdu), 1024, protocol, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

// ─── Known certificate SELECT sequences (same as browser version) ─────────────
const CERT_SELECT_APDUS = [
  // ePass2003 / Feitian
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0, 0x00, 0x00, 0x00, 0x03, 0x08, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x05],
  ],
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0, 0x00, 0x00, 0x00, 0x03, 0x08, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x01],
  ],
  // WatchData / ProxKey / Longmai mToken
  [
    [0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x63, 0x50, 0x4B, 0x43],
    [0x00, 0xA4, 0x02, 0x00, 0x02, 0x00, 0x01],
  ],
  // Generic MF
  [
    [0x00, 0xA4, 0x00, 0x00, 0x02, 0x3F, 0x00],
    [0x00, 0xA4, 0x02, 0x04, 0x02, 0x10, 0x05],
  ],
  // eToken (Gemalto/SafeNet)
  [
    [0x00, 0xA4, 0x04, 0x00, 0x09, 0xA0, 0x00, 0x00, 0x00, 0x18, 0x0A, 0x00, 0x00, 0x01],
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
    const sw1 = resp[resp.length - 2];
    const sw2 = resp[resp.length - 1];
    const data = resp.slice(0, resp.length - 2);
    if (sw1 === 0x90) {
      chunks.push(...data);
      offset += data.length;
      if (data.length < 255) break;
    } else if (sw1 === 0x6C) {
      const fixApdu = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, sw2];
      const fixResp = await sendApdu(card, protocol, fixApdu);
      if (fixResp && fixResp.length >= 2) chunks.push(...fixResp.slice(0, fixResp.length - 2));
      break;
    } else {
      break;
    }
  }
  return Buffer.from(chunks);
}

// ─── Main: read cert from first available PC/SC reader ───────────────────────
exports.readCertFromPcSc = function (pin) {
  return new Promise((resolve, reject) => {
    if (!pcsclite) {
      return reject(new Error('PC/SC native module not available — DSC detection uses PowerShell fallback'));
    }

    const pcsc = pcsclite();

    let settled = false;
    const done = (val, err) => {
      if (settled) return;
      settled = true;
      pcsc.close();
      err ? reject(err) : resolve(val);
    };

    const timeout = setTimeout(() => done(null, new Error('PC/SC timeout — no card reader found')), 8000);

    pcsc.on('error', (err) => {
      clearTimeout(timeout);
      done(null, new Error('PC/SC service not available: ' + err.message));
    });

    pcsc.on('reader', (reader) => {
      reader.on('status', (status) => {
        const changes = reader.state ^ status.state;
        if (!(changes & reader.SCARD_STATE_PRESENT)) return;
        if (!(status.state & reader.SCARD_STATE_PRESENT)) return;

        // Card inserted
        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, async (err, protocol) => {
          if (err) {
            return done(null, new Error('Could not connect to card: ' + err.message));
          }

          clearTimeout(timeout);

          try {
            // Try each certificate path strategy
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

                // VERIFY PIN
                if (pin) {
                  const pinBytes = Buffer.from(pin, 'utf8');
                  const verifyApdu = [0x00, 0x20, 0x00, 0x01, pinBytes.length, ...pinBytes];
                  const verifyResp = await sendApdu(reader, protocol, verifyApdu);
                  if (verifyResp && verifyResp.length >= 2) {
                    const sw1 = verifyResp[verifyResp.length - 2];
                    const sw2 = verifyResp[verifyResp.length - 1];
                    if (sw1 !== 0x90) {
                      reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
                      return done(null, new Error(
                        sw1 === 0x69 && sw2 === 0x82 ? 'Incorrect PIN' :
                        sw1 === 0x69 && sw2 === 0x83 ? 'PIN blocked — token locked' :
                        `PIN verify failed (SW ${sw1.toString(16)} ${sw2.toString(16)})`
                      ));
                    }
                  }
                }

                const rawBytes = await readBinaryPcsc(reader, protocol);
                if (!rawBytes || rawBytes.length < 64) continue;

                const derBytes = extractDerFromBlob(rawBytes);
                const cert = parseDerCertificate(derBytes);

                if (cert && cert.holder_name) {
                  reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
                  return done(cert);
                }
              } catch {
                continue;
              }
            }

            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
            done(null, new Error('Could not read certificate from token. Try a different reader strategy.'));
          } catch (e) {
            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
            done(null, e);
          }
        });
      });

      reader.on('error', (err) => {
        console.error('[pcscReader] reader error:', err);
      });
    });
  });
};
