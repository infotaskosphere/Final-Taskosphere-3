/**
 * dscTokenReader.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads X.509 certificates from DSC USB tokens entirely in the browser via
 * WebUSB + CCID protocol. No backend / PKCS#11 middleware required.
 *
 * Flow:
 *   1. Open the USB device (already granted via WebUSB)
 *   2. Claim the CCID interface
 *   3. Send CCID PC_to_RDR_IccPowerOn to get ATR
 *   4. Send ISO 7816 APDUs via CCID PC_to_RDR_XfrBlock:
 *        - SELECT MF / DF
 *        - PIN verify (optional — needed only to access protected EFs)
 *        - SELECT EF containing X.509 cert
 *        - READ BINARY (chunked)
 *   5. Parse the DER certificate with a minimal ASN.1 parser
 *   6. Return { holder_name, serial_number, issue_date, expiry_date, organization }
 */

// ─── CCID message types ────────────────────────────────────────────────────────
const PC_TO_RDR_ICCPOWERON   = 0x62;
const PC_TO_RDR_XFRBLOCK     = 0x6F;
const RDR_TO_PC_DATABLOCK     = 0x80;

// ─── Known DSC token CCID interface configurations ────────────────────────────
// Different tokens put their cert EF at different paths.
const CERT_SELECT_APDUS = [
  // ePass2003 / Feitian (most common Indian DSC token)
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0, 0x00, 0x00, 0x00, 0x03, 0x08, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00], // SELECT AID
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x05],  // SELECT EF cert
  ],
  // ePass2003 alternate
  [
    [0x00, 0xA4, 0x04, 0x00, 0x0C, 0xA0, 0x00, 0x00, 0x00, 0x03, 0x08, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x01],
  ],
  // WatchData / ProxKey / Longmai mToken
  [
    [0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x63, 0x50, 0x4B, 0x43], // SELECT PKI AID
    [0x00, 0xA4, 0x02, 0x00, 0x02, 0x00, 0x01],
  ],
  // Generic: try direct EF select under MF
  [
    [0x00, 0xA4, 0x00, 0x00, 0x02, 0x3F, 0x00],  // SELECT MF
    [0x00, 0xA4, 0x02, 0x04, 0x02, 0x10, 0x05],
  ],
  // eToken (Gemalto/SafeNet)
  [
    [0x00, 0xA4, 0x04, 0x00, 0x09, 0xA0, 0x00, 0x00, 0x00, 0x18, 0x0A, 0x00, 0x00, 0x01],
    [0x00, 0xA4, 0x02, 0x0C, 0x02, 0x10, 0x05],
  ],
];

// ─── Build a CCID PC_to_RDR_XfrBlock message ──────────────────────────────────
function buildXfrBlock(apdu, seq = 0) {
  const len = apdu.length;
  const msg = new Uint8Array(10 + len);
  msg[0] = PC_TO_RDR_XFRBLOCK;
  // dwLength (LE 32-bit)
  msg[1] = len & 0xFF;
  msg[2] = (len >> 8) & 0xFF;
  msg[3] = (len >> 16) & 0xFF;
  msg[4] = (len >> 24) & 0xFF;
  msg[5] = 0x00; // bSlot
  msg[6] = seq & 0xFF; // bSeq
  msg[7] = 0x00; // bBWI
  msg[8] = 0x00; // wLevelParameter lo
  msg[9] = 0x00; // wLevelParameter hi
  msg.set(apdu, 10);
  return msg;
}

// ─── Build CCID IccPowerOn ─────────────────────────────────────────────────────
function buildPowerOn(seq = 0) {
  const msg = new Uint8Array(10);
  msg[0] = PC_TO_RDR_ICCPOWERON;
  msg[5] = 0x00; msg[6] = seq; msg[7] = 0x00; // bPowerSelect = auto
  return msg;
}

// ─── Find CCID bulk-in and bulk-out endpoints ──────────────────────────────────
function findCcidEndpoints(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        // CCID class = 0x0B
        if (alt.interfaceClass === 0x0B) {
          let epIn = null, epOut = null;
          for (const ep of alt.endpoints) {
            if (ep.type === 'bulk') {
              if (ep.direction === 'in')  epIn  = ep.endpointNumber;
              if (ep.direction === 'out') epOut = ep.endpointNumber;
            }
          }
          if (epIn !== null && epOut !== null) {
            return { interfaceNumber: iface.interfaceNumber, epIn, epOut };
          }
        }
      }
    }
  }
  // Fallback: use first interface with bulk endpoints (some tokens use class 0xFF)
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        let epIn = null, epOut = null;
        for (const ep of alt.endpoints) {
          if (ep.type === 'bulk') {
            if (ep.direction === 'in')  epIn  = ep.endpointNumber;
            if (ep.direction === 'out') epOut = ep.endpointNumber;
          }
        }
        if (epIn !== null && epOut !== null) {
          return { interfaceNumber: iface.interfaceNumber, epIn, epOut };
        }
      }
    }
  }
  return null;
}

// ─── Send one APDU, get response bytes ────────────────────────────────────────
async function sendApdu(device, epIn, epOut, apdu, seq) {
  const xfr = buildXfrBlock(apdu, seq);
  await device.transferOut(epOut, xfr);
  // Read response — up to 65556 bytes
  const result = await device.transferIn(epIn, 65556);
  const buf = new Uint8Array(result.data.buffer);
  if (buf[0] !== RDR_TO_PC_DATABLOCK || buf.length < 10) return null;
  const dataLen = buf[1] | (buf[2] << 8) | (buf[3] << 16) | (buf[4] << 24);
  return buf.slice(10, 10 + dataLen);
}

// ─── READ BINARY — read all bytes from currently selected EF ──────────────────
async function readBinary(device, epIn, epOut, seqRef) {
  const chunks = [];
  let offset = 0;
  while (true) {
    const apdu = [
      0x00, 0xB0,
      (offset >> 8) & 0xFF,
      offset & 0xFF,
      0xFF, // Le = 255
    ];
    const resp = await sendApdu(device, epIn, epOut, apdu, seqRef.val++);
    if (!resp || resp.length < 2) break;
    const sw1 = resp[resp.length - 2];
    const sw2 = resp[resp.length - 1];
    const data = resp.slice(0, resp.length - 2);
    if (sw1 === 0x90) {
      chunks.push(...data);
      offset += data.length;
      if (data.length < 255) break; // last chunk
    } else if (sw1 === 0x6C) {
      // Wrong Le — re-read with correct length
      const fixApdu = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, sw2];
      const fixResp = await sendApdu(device, epIn, epOut, fixApdu, seqRef.val++);
      if (fixResp && fixResp.length >= 2) {
        const fixData = fixResp.slice(0, fixResp.length - 2);
        chunks.push(...fixData);
      }
      break;
    } else {
      break;
    }
  }
  return new Uint8Array(chunks);
}

// ─── Minimal ASN.1 / DER parser ────────────────────────────────────────────────
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
    const { tag, len, valueStart, nextPos } = readTlv(der, pos);
    items.push({ tag, len, valueStart, nextPos, value: der.slice(valueStart, nextPos) });
    pos = nextPos;
  }
  return items;
}

// Decode a UTF8String / PrintableString / IA5String / BMPString value
function decodeString(der, start, len, tag) {
  const bytes = der.slice(start, start + len);
  try {
    if (tag === 0x1E) {
      // BMPString — UCS-2 BE
      let s = '';
      for (let i = 0; i < bytes.length - 1; i += 2)
        s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return s;
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

// OID bytes → dotted string
function decodeOid(bytes) {
  let oid = '';
  const first = bytes[0];
  oid += Math.floor(first / 40) + '.' + (first % 40);
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7F);
    if (!(bytes[i] & 0x80)) {
      oid += '.' + value;
      value = 0;
    }
  }
  return oid;
}

// Parse GeneralizedTime / UTCTime → ISO date string
function parseTime(bytes, tag) {
  const s = new TextDecoder().decode(bytes);
  let year, month, day;
  if (tag === 0x17) {
    // UTCTime: YYMMDDHHMMSSZ
    const y2 = parseInt(s.substring(0, 2));
    year  = y2 >= 50 ? 1900 + y2 : 2000 + y2;
    month = s.substring(2, 4);
    day   = s.substring(4, 6);
  } else {
    // GeneralizedTime: YYYYMMDDHHMMSSZ
    year  = s.substring(0, 4);
    month = s.substring(4, 6);
    day   = s.substring(6, 8);
  }
  return `${year}-${month}-${day}`;
}

// Well-known OIDs for DN attributes
const OID_MAP = {
  '2.5.4.3':               'CN',   // commonName
  '2.5.4.10':              'O',    // organizationName
  '2.5.4.11':              'OU',   // organizationalUnit
  '2.5.4.6':               'C',    // country
  '1.2.840.113549.1.9.1':  'emailAddress',
  '2.5.4.41':              'name',
  '2.5.4.4':               'SN',   // surname
  '2.5.4.42':              'GN',   // givenName
};

// Parse a Name (SEQUENCE OF RDNs) → { CN, O, emailAddress, ... }
function parseName(der, start, len) {
  const result = {};
  const rdnSeq = parseSequenceOf(der, start, start + len);
  for (const rdn of rdnSeq) {
    // Each RDN is a SET
    if (rdn.tag !== 0x31) continue;
    const attrSeq = parseSequenceOf(der, rdn.valueStart, rdn.nextPos);
    for (const attr of attrSeq) {
      // SEQUENCE { OID, value }
      if (attr.tag !== 0x30) continue;
      const children = parseSequenceOf(der, attr.valueStart, attr.nextPos);
      if (children.length < 2) continue;
      const oidItem = children[0];
      const valItem = children[1];
      if (oidItem.tag !== 0x06) continue;
      const oid = decodeOid(der.slice(oidItem.valueStart, oidItem.nextPos));
      const key = OID_MAP[oid] || oid;
      result[key] = decodeString(der, valItem.valueStart, valItem.len, valItem.tag);
    }
  }
  return result;
}

// Find first SEQUENCE that looks like a TBSCertificate inside a DER blob
// Returns parsed cert fields or null
function parseDerCertificate(der) {
  try {
    // Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signature }
    let pos = 0;
    const outer = readTlv(der, pos);
    if (outer.tag !== 0x30) return null;

    // tbsCertificate ::= SEQUENCE { version, serialNumber, ... subject, validity, ... }
    const tbs = readTlv(der, outer.valueStart);
    if (tbs.tag !== 0x30) return null;

    let p = tbs.valueStart;
    const tbsEnd = tbs.nextPos;

    // Skip optional [0] version
    if (der[p] === 0xA0) {
      const v = readTlv(der, p); p = v.nextPos;
    }

    // serialNumber INTEGER
    const serial = readTlv(der, p); p = serial.nextPos;
    let serialHex = '';
    for (let i = serial.valueStart; i < serial.nextPos; i++)
      serialHex += der[i].toString(16).padStart(2, '0').toUpperCase();

    // signature AlgorithmIdentifier (skip)
    const sigAlg = readTlv(der, p); p = sigAlg.nextPos;

    // issuer Name
    const issuerTlv = readTlv(der, p); p = issuerTlv.nextPos;
    const issuer = parseName(der, issuerTlv.valueStart, issuerTlv.len);

    // validity SEQUENCE { notBefore, notAfter }
    const validity = readTlv(der, p); p = validity.nextPos;
    let vp = validity.valueStart;
    const notBeforeTlv = readTlv(der, vp); vp = notBeforeTlv.nextPos;
    const notAfterTlv  = readTlv(der, vp);
    const notBefore = parseTime(der.slice(notBeforeTlv.valueStart, notBeforeTlv.nextPos), notBeforeTlv.tag);
    const notAfter  = parseTime(der.slice(notAfterTlv.valueStart,  notAfterTlv.nextPos),  notAfterTlv.tag);

    // subject Name
    const subjectTlv = readTlv(der, p);
    const subject = parseName(der, subjectTlv.valueStart, subjectTlv.len);

    return {
      holder_name:   subject.CN || subject.name || subject.GN || null,
      organization:  subject.O  || null,
      email:         subject['emailAddress'] || null,
      serial_number: serialHex,
      issue_date:    notBefore,
      expiry_date:   notAfter,
      issuer:        issuer.CN || issuer.O || null,
      raw_subject:   JSON.stringify(subject),
      read_method:   'webusbccid',
    };
  } catch (e) {
    console.warn('[dscTokenReader] DER parse error:', e);
    return null;
  }
}

// ─── Find a DER certificate inside a raw byte blob ────────────────────────────
// Some EFs contain TLV-wrapped data; we scan for the 0x30 0x82 sequence start.
function extractDerFromBlob(bytes) {
  // Look for DER SEQUENCE tag (0x30) with 2-byte length (0x82 meaning next 2 bytes are length)
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x82) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (i + 4 + len <= bytes.length) {
        return bytes.slice(i, i + 4 + len);
      }
    }
  }
  // Also try 0x30 0x81 (1-byte length)
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x81) {
      const len = bytes[i + 2];
      if (i + 3 + len <= bytes.length) {
        return bytes.slice(i, i + 3 + len);
      }
    }
  }
  return bytes;
}

// ─── Main exported function ────────────────────────────────────────────────────
/**
 * Read certificate from a WebUSB DSC token.
 *
 * @param {USBDevice} device  — already opened/granted USB device
 * @param {string}    pin     — token PIN (used in VERIFY APDU)
 * @returns {Promise<object|null>}  cert fields or null on failure
 */
export async function readCertFromUsbToken(device, pin) {
  const endpoints = findCcidEndpoints(device);
  if (!endpoints) throw new Error('No CCID interface found on this device.');

  const { interfaceNumber, epIn, epOut } = endpoints;

  await device.selectConfiguration(1);
  try { await device.releaseInterface(interfaceNumber); } catch {}
  await device.claimInterface(interfaceNumber);

  const seqRef = { val: 0 };

  try {
    // Power on the card
    const powerMsg = buildPowerOn(seqRef.val++);
    await device.transferOut(epOut, powerMsg);
    await device.transferIn(epIn, 65536); // ATR — ignore contents

    // Try each known cert path strategy
    for (const selectApdus of CERT_SELECT_APDUS) {
      try {
        // Send all SELECT APDUs in order
        let allOk = true;
        for (const apdu of selectApdus) {
          const resp = await sendApdu(device, epIn, epOut, apdu, seqRef.val++);
          if (!resp || resp.length < 2) { allOk = false; break; }
          const sw1 = resp[resp.length - 2];
          // 0x90 = OK, 0x61 = more data available (both mean success for SELECT)
          if (sw1 !== 0x90 && sw1 !== 0x61 && sw1 !== 0x62) { allOk = false; break; }
        }
        if (!allOk) continue;

        // Try VERIFY PIN (optional — some certs are readable without PIN)
        if (pin) {
          const pinBytes = new TextEncoder().encode(pin);
          const verifyApdu = [0x00, 0x20, 0x00, 0x01, pinBytes.length, ...pinBytes];
          await sendApdu(device, epIn, epOut, verifyApdu, seqRef.val++);
          // Ignore VERIFY result — proceed regardless
        }

        // READ BINARY
        const rawBytes = await readBinary(device, epIn, epOut, seqRef);
        if (!rawBytes || rawBytes.length < 64) continue;

        // Extract and parse DER
        const derBytes = extractDerFromBlob(rawBytes);
        const cert = parseDerCertificate(derBytes);
        if (cert && cert.holder_name) {
          return cert;
        }
      } catch {
        continue;
      }
    }

    return null;
  } finally {
    try { await device.releaseInterface(interfaceNumber); } catch {}
  }
}

// ─── Local Agent Fallback (Windows PC/SC bridge) ──────────────────────────────
/**
 * Check if the local DSC agent is running at localhost:7432.
 * The agent is a small Node.js server the user runs locally to bridge the
 * gap when WebUSB cannot claim the Windows CCID interface.
 */
export async function isLocalAgentAvailable() {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('http://127.0.0.1:7432/health', { signal: ctrl.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Read certificate from the local PC/SC agent instead of WebUSB.
 * Falls back when WebUSB throws a claimInterface error on Windows.
 *
 * @param {string} pin - Token PIN
 * @returns {Promise<object|null>}
 */
export async function readCertFromLocalAgent(pin) {
  const url = `http://127.0.0.1:7432/read-dsc?pin=${encodeURIComponent(pin)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Local agent HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.success && data.cert) return data.cert;
  throw new Error(data.error || 'Local agent could not read the certificate');
}
