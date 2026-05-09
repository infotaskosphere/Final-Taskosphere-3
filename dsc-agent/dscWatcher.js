'use strict';

/**
 * dscWatcher.js — v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects DSC (Digital Signature Certificate) token insertion and reads the
 * X.509 certificate WITHOUT a PIN.
 *
 * PRIMARY (always works — no C++ build tools needed):
 *   PowerShell reads from the Windows X.509 Personal Certificate Store.
 *   When a DSC USB token is plugged in, the Windows CCID driver automatically
 *   imports its certificate into the Personal store. We poll every 3 s, parse
 *   the Subject string, and expose the result via /dsc-status.
 *
 * SECONDARY (requires Visual Studio Build Tools — pcsclite):
 *   Low-level APDU reading directly from the smart-card. Used as a fallback
 *   only when pcsclite is available and the PS approach finds nothing.
 *
 * The DSCRegister.jsx page polls GET /dsc-status and calls applyCert() to
 * auto-fill: holder_name, serial_number, issue_date, expiry_date,
 *            organization, email, issuer.
 */

let pcsclite;
try { pcsclite = require('pcsclite'); } catch {
  pcsclite = null;
}

const { execFileSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Shared state exposed via /dsc-status ──────────────────────────────────────
let state = {
  plugged:    false,
  cert:       null,
  reader:     null,
  insertedAt: null,
  error:      null,
  method:     null, // 'powershell' | 'pcsclite'
};

// ── PowerShell script: read ALL cert stores including SmartCard ───────────────
// Reads from: Personal (My), SmartCard, and also uses certutil -scinfo
// This covers Watchdata, ePass, ProxKey and other tokens that don't auto-import
// their cert into the Windows Personal store.
const CERT_STORE_PS = `
$results = @()

# ── 1. Read all standard user cert stores (My, SmartCardRoot, SmartCard) ──────
$storeNames = @("My", "SmartCardRoot")
foreach ($storeName in $storeNames) {
  try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
      $storeName,
      [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    )
    $store.Open("ReadOnly")
    foreach ($c in $store.Certificates) {
      $results += [PSCustomObject]@{
        subject      = $c.Subject
        issuer       = $c.Issuer
        serialNumber = $c.SerialNumber
        notBefore    = $c.NotBefore.ToString("yyyy-MM-dd")
        notAfter     = $c.NotAfter.ToString("yyyy-MM-dd")
        thumbprint   = $c.Thumbprint
        hasPrivateKey= $c.HasPrivateKey
        storeSource  = $storeName
      }
    }
    $store.Close()
  } catch {}
}

# ── 2. Also read LocalMachine stores (some tokens register here) ───────────────
$lmStores = @("My", "SmartCardRoot")
foreach ($storeName in $lmStores) {
  try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
      $storeName,
      [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $store.Open("ReadOnly")
    foreach ($c in $store.Certificates) {
      # Only add if not already found (deduplicate by thumbprint)
      if ($results.thumbprint -notcontains $c.Thumbprint) {
        $results += [PSCustomObject]@{
          subject      = $c.Subject
          issuer       = $c.Issuer
          serialNumber = $c.SerialNumber
          notBefore    = $c.NotBefore.ToString("yyyy-MM-dd")
          notAfter     = $c.NotAfter.ToString("yyyy-MM-dd")
          thumbprint   = $c.Thumbprint
          hasPrivateKey= $c.HasPrivateKey
          storeSource  = ("LM-" + $storeName)
        }
      }
    }
    $store.Close()
  } catch {}
}

if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress -Depth 3 } else { Write-Output "[]" }
`;

// ── PowerShell: read cert directly from smart card via certutil -scinfo ────────
// This works for Watchdata, ePass2003 etc. that keep cert only on the token.
const SCINFO_PS = `
try {
  $raw = & certutil -scinfo -silent 2>$null | Out-String
  # Parse Serial, Subject, Issuer, NotBefore, NotAfter from certutil output
  $results = @()
  $blocks = $raw -split "(?=\\nIssuer:)"
  foreach ($block in $blocks) {
    $subject    = if ($block -match "Subject:\\s*(.+)") { $Matches[1].Trim() } else { $null }
    $issuer     = if ($block -match "Issuer:\\s*(.+)")  { $Matches[1].Trim() } else { $null }
    $serial     = if ($block -match "Serial Number:\\s*([0-9a-fA-F]+)") { $Matches[1].Trim() } else { $null }
    $notBefore  = if ($block -match "NotBefore:\\s*(\\S+)") { $Matches[1].Trim() } else { $null }
    $notAfter   = if ($block -match "NotAfter:\\s*(\\S+)")  { $Matches[1].Trim() } else { $null }
    if ($subject -and $issuer) {
      $results += [PSCustomObject]@{
        subject=$subject; issuer=$issuer; serialNumber=$serial
        notBefore=$notBefore; notAfter=$notAfter; thumbprint="scinfo-"+$serial
        hasPrivateKey=$true; storeSource="certutil-scinfo"
      }
    }
  }
  if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress -Depth 3 } else { Write-Output "[]" }
} catch { Write-Output "[]" }
`;

const PS_FILE      = path.join(os.tmpdir(), 'ts-certstore.ps1');
const PS_SCINFO    = path.join(os.tmpdir(), 'ts-scinfo.ps1');

function writePsFile() {
  try { fs.writeFileSync(PS_FILE,   '\ufeff' + CERT_STORE_PS, 'utf8'); } catch {}
  try { fs.writeFileSync(PS_SCINFO, '\ufeff' + SCINFO_PS,     'utf8'); } catch {}
}

function runCertStorePs() {
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_FILE,
    ], { timeout: 10000, windowsHide: true }).toString().trim();
    if (!out || out === '[]') return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

// Secondary: try certutil -scinfo (reads cert directly from token, no store import needed)
function runScinfoPs() {
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS_SCINFO,
    ], { timeout: 12000, windowsHide: true }).toString().trim();
    if (!out || out === '[]') return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

// Also try reading directly from Watchdata/ePass2003/ProxKey via certutil -store "SmartCard"
function runSmartCardStore() {
  try {
    const out = execFileSync('certutil', ['-store', '-user', 'SmartCardRoot'],
      { timeout: 6000, windowsHide: true, shell: true }).toString();
    // Parse the text output
    const results = [];
    const blocks = out.split(/(?=Serial Number:)/);
    for (const block of blocks) {
      const serial    = (block.match(/Serial Number:\s*([0-9a-fA-F]+)/) || [])[1];
      const subject   = (block.match(/Subject:\s*(.+)/)  || [])[1]?.trim();
      const issuer    = (block.match(/Issuer:\s*(.+)/)   || [])[1]?.trim();
      const notBefore = (block.match(/NotBefore:\s*(\S+)/) || [])[1];
      const notAfter  = (block.match(/NotAfter:\s*(\S+)/)  || [])[1];
      if (subject && serial) results.push({
        subject, issuer: issuer || '', serialNumber: serial,
        notBefore: notBefore || '', notAfter: notAfter || '',
        thumbprint: 'scard-' + serial, hasPrivateKey: true, storeSource: 'certutil-SmartCardRoot',
      });
    }
    return results;
  } catch { return []; }
}

// ── Parse Windows Subject / Issuer string ─────────────────────────────────────
// e.g. "E=user@email.com, CN=JOHN DOE, OU=Individual, O=Company Ltd., L=Mumbai, ST=Maharashtra, C=IN"
function parseDistinguishedName(dn) {
  if (!dn) return {};
  const fields = {};
  // Split on ", KEY=" boundaries (handles commas inside values imperfectly but works for DSC)
  const parts = dn.split(/,\s*(?=[A-Z]{1,10}=)/);
  for (const part of parts) {
    const eq  = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.substring(0, eq).trim().toUpperCase();
    const val = part.substring(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    fields[key] = val;
  }
  return fields;
}

// Indian DSC issuer keywords
const DSC_ISSUER_KEYWORDS = [
  'emudhra', 'mudhra', 'nsdl', 'sify', 'capricorn', 'gnfc', 'safescrypt',
  'vsign', 'ncode', 'idrbt', 'national informatics', 'controller of certifying',
  'cca india', 'certifying authority', 'class 2', 'class 3', 'ca-201', 'ca-202',
];

function isDscIssuer(issuer) {
  if (!issuer) return false;
  const lower = issuer.toLowerCase();
  return DSC_ISSUER_KEYWORDS.some(k => lower.includes(k));
}

// Normalise a date string to yyyy-MM-dd regardless of source format
// certutil outputs: "5/9/2026 6:30 AM" or "09/05/2026"
// PowerShell store outputs: "2026-05-09" already
function normDate(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  // Already yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // M/D/YYYY H:MM AM/PM  or  DD/MM/YYYY
  try {
    const d = new Date(raw);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  } catch {}
  return raw.slice(0, 10); // best effort
}

function parseCertEntry(entry) {
  const subj = parseDistinguishedName(entry.subject || '');
  const issu = parseDistinguishedName(entry.issuer  || '');

  const cn    = subj.CN  || subj.NAME || '';
  const email = subj.E   || subj.EMAILADDRESS || subj['1.2.840.113549.1.9.1'] || '';
  const org   = subj.O   || '';
  const ou    = subj.OU  || '';
  const state_field = subj.ST || subj.S || '';

  // Some Indian DSCs embed PAN in CN: "ABCDE1234F-FIRSTNAME LASTNAME"
  let name = cn;
  let pan  = null;
  const panMatch = (cn + ' ' + ou).match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  if (panMatch) {
    pan  = panMatch[1];
    name = cn.replace(/^[A-Z]{5}[0-9]{4}[A-Z][-\s]+/, '').trim() || cn;
  }

  const issuerCN = issu.CN || issu.O || entry.issuer || '';

  return {
    holder_name:   name   || null,
    email:         email  || null,
    organization:  org    || null,
    state:         state_field || null,
    pan:           pan    || null,
    serial_number: entry.serialNumber || null,
    issue_date:    normDate(entry.notBefore) || null,
    expiry_date:   normDate(entry.notAfter)  || null,
    issuer:        issuerCN           || null,
    thumbprint:    entry.thumbprint   || null,
    read_method:   'agent-ps-certstore',
  };
}

// Pick the best DSC cert from multiple certs in the store
function selectBestCert(certs) {
  if (!certs.length) return null;

  const today = new Date().toISOString().slice(0, 10);

  // Score each cert — higher = better
  const scored = certs.map(c => {
    let score = 0;
    if (isDscIssuer(c.issuer || ''))  score += 10;
    if (c.hasPrivateKey)               score += 5;
    if (c.notAfter >= today)           score += 8;  // not expired
    if ((c.subject || '').match(/\bE=/i)) score += 3; // has email
    return { c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].c;
}

// ── PowerShell polling watcher ────────────────────────────────────────────────
let prevThumbprints = new Set();
let psWatchInterval = null;

function pollCertStore() {
  // ── Step 1: Read all Windows cert stores (My + SmartCardRoot, User + LocalMachine)
  let certs = runCertStorePs();

  // ── Step 2: If no cert found yet, try certutil SmartCardRoot directly ─────
  // This catches Watchdata, ePass2003, ProxKey etc. that don't auto-register
  // their cert into Windows Personal store — cert lives only on the token.
  if (certs.length === 0 || !certs.some(c => c.hasPrivateKey)) {
    const scardCerts = runSmartCardStore();
    if (scardCerts.length > 0) {
      console.log('[dsc] Found', scardCerts.length, 'cert(s) via certutil SmartCardRoot');
      certs = [...certs, ...scardCerts];
    }
  }

  // ── Step 3: Last resort — certutil -scinfo (reads directly from token) ────
  if (certs.length === 0) {
    const scinfoCerts = runScinfoPs();
    if (scinfoCerts.length > 0) {
      console.log('[dsc] Found', scinfoCerts.length, 'cert(s) via certutil -scinfo');
      certs = scinfoCerts;
    }
  }

  const currThumbs = new Set(certs.map(c => c.thumbprint));

  // Detect newly appeared certs (token plugged in)
  const newCerts = certs.filter(c => !prevThumbprints.has(c.thumbprint));
  if (newCerts.length > 0 && state.cert === null) {
    const best   = selectBestCert(newCerts);
    const parsed = parseCertEntry(best);
    if (parsed.holder_name) {
      state.plugged    = true;
      state.cert       = parsed;
      state.insertedAt = new Date().toISOString();
      state.error      = null;
      state.method     = 'powershell';
      state.reader     = best.storeSource || 'Windows Certificate Store';
      console.log('[dsc] Token detected —', parsed.holder_name, '|', parsed.expiry_date, '| source:', state.reader);
    }
  }

  // Detect removed certs (token unplugged)
  const removed = [...prevThumbprints].filter(t => !currThumbs.has(t));
  if (removed.length > 0 && state.cert && removed.includes(state.cert.thumbprint)) {
    console.log('[dsc] Token removed');
    state.plugged = false;
    state.cert    = null;
    state.method  = null;
    state.reader  = null;
  }

  // Also: if no cert yet but certs exist, try to pick the best one
  if (!state.cert && certs.length > 0) {
    const best   = selectBestCert(certs);
    const parsed = parseCertEntry(best);
    if (parsed.holder_name) {
      state.plugged    = true;
      state.cert       = parsed;
      state.insertedAt = new Date().toISOString();
      state.error      = null;
      state.method     = 'powershell';
      state.reader     = best.storeSource || 'Windows Certificate Store';
      console.log('[dsc] Cert found —', parsed.holder_name, '|', parsed.expiry_date, '| source:', state.reader);
    }
  }

  prevThumbprints = currThumbs;
}

function startPsWatcher() {
  writePsFile();
  pollCertStore(); // immediate check on startup
  psWatchInterval = setInterval(pollCertStore, 3000);
  console.log('[dsc] PowerShell cert-store watcher started (polls every 3 s)');
}

// ── pcsclite APDU watcher (secondary) ────────────────────────────────────────
// Full APDU parsing code — only runs if pcsclite native module is installed.

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
    const subjectTlv   = readTlv(der, p);
    const subject      = parseName(der, subjectTlv.valueStart, subjectTlv.len);
    const cn = subject.CN || subject.name || subject.GN || null;
    let name = cn;
    const panMatch = cn ? cn.match(/^([A-Z]{5}[0-9]{4}[A-Z])[-\s]+(.+)/) : null;
    if (panMatch) name = panMatch[2].trim();
    return {
      holder_name:   name,
      organization:  subject.O  || null,
      email:         subject['emailAddress'] || null,
      serial_number: serialHex,
      issue_date:    notBefore,
      expiry_date:   notAfter,
      issuer:        issuer.CN  || issuer.O || null,
      read_method:   'agent-pcsclite-no-pin',
    };
  } catch { return null; }
}

function sendApdu(card, protocol, apdu) {
  return new Promise((resolve, reject) => {
    card.transmit(Buffer.from(apdu), 1024, protocol, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

async function readBinaryPcsc(card, protocol) {
  const chunks = [];
  let offset = 0;
  while (true) {
    const apdu = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, 0xFF];
    const resp = await sendApdu(card, protocol, apdu);
    if (!resp || resp.length < 2) break;
    const sw1 = resp[resp.length - 2], sw2 = resp[resp.length - 1];
    const data = resp.slice(0, resp.length - 2);
    if (sw1 === 0x90) {
      chunks.push(...data); offset += data.length;
      if (data.length < 255) break;
    } else if (sw1 === 0x6C) {
      const fix = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, sw2];
      const fr  = await sendApdu(card, protocol, fix);
      if (fr && fr.length >= 2) chunks.push(...fr.slice(0, fr.length - 2));
      break;
    } else break;
  }
  return Buffer.from(chunks);
}

const CERT_SELECT_APDUS = [
  [[0x00,0xA4,0x04,0x00,0x0C,0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],[0x00,0xA4,0x02,0x0C,0x02,0x10,0x05]],
  [[0x00,0xA4,0x04,0x00,0x0C,0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],[0x00,0xA4,0x02,0x0C,0x02,0x10,0x01]],
  [[0x00,0xA4,0x04,0x00,0x08,0xA0,0x00,0x00,0x00,0x63,0x50,0x4B,0x43],[0x00,0xA4,0x02,0x00,0x02,0x00,0x01]],
  [[0x00,0xA4,0x00,0x00,0x02,0x3F,0x00],[0x00,0xA4,0x02,0x04,0x02,0x10,0x05]],
  [[0x00,0xA4,0x04,0x00,0x09,0xA0,0x00,0x00,0x00,0x18,0x0A,0x00,0x00,0x01],[0x00,0xA4,0x02,0x0C,0x02,0x10,0x05]],
];

function extractDerFromBlob(bytes) {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x82) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (i + 4 + len <= bytes.length) return bytes.slice(i, i + 4 + len);
    }
  }
  return bytes;
}

async function tryReadCertNoPIN(reader, protocol) {
  for (const [sel, read] of CERT_SELECT_APDUS) {
    try {
      const { card } = await new Promise((res, rej) =>
        reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, (e, c, p) =>
          e ? rej(e) : res({ card: c, protocol: p })));
      let allOk = true;
      for (const apdu of [sel]) {
        const r = await sendApdu(card, protocol, apdu);
        if (!r || r[r.length - 2] !== 0x90) { allOk = false; break; }
      }
      if (!allOk) { reader.disconnect(reader.SCARD_LEAVE_CARD, () => {}); continue; }
      const blob = await readBinaryPcsc(card, protocol);
      reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
      if (blob.length > 100) {
        const der    = extractDerFromBlob(blob);
        const parsed = parseDerCertificate(der);
        if (parsed && parsed.holder_name) return parsed;
      }
    } catch {}
  }
  return null;
}

function startPcscWatcher() {
  if (!pcsclite) return;
  let pcsc;
  try { pcsc = pcsclite(); } catch { return; }

  pcsc.on('error', err => console.warn('[dsc/pcsc] PC/SC error:', err.message));

  pcsc.on('reader', reader => {
    console.log('[dsc/pcsc] Reader:', reader.name);
    reader.on('status', async status => {
      const cardPresent = !!(status.state & reader.SCARD_STATE_PRESENT);
      if (cardPresent && !state.cert) {
        console.log('[dsc/pcsc] Card inserted — trying no-PIN read...');
        try {
          const protocol = reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1;
          const cert = await tryReadCertNoPIN(reader, protocol);
          if (cert && cert.holder_name && !state.cert) {
            state.cert       = cert;
            state.plugged    = true;
            state.insertedAt = new Date().toISOString();
            state.reader     = reader.name;
            state.error      = null;
            state.method     = 'pcsclite';
            console.log('[dsc/pcsc] Cert read (no PIN):', cert.holder_name);
          }
        } catch (e) {
          state.error = e.message;
          console.warn('[dsc/pcsc] No-PIN read failed:', e.message);
        }
      }
      if (!cardPresent && state.method === 'pcsclite') {
        state.plugged = false; state.cert = null; state.method = null;
        console.log('[dsc/pcsc] Card removed');
      }
    });
    reader.on('error', err => console.warn('[dsc/pcsc] Reader error:', err.message));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
function startWatcher() {
  startPsWatcher();     // Always — PowerShell cert store
  startPcscWatcher();   // Bonus — direct APDU if pcsclite installed
}

function getStatus() {
  return {
    plugged:    state.plugged,
    cert:       state.cert,
    reader:     state.reader,
    insertedAt: state.insertedAt,
    error:      state.error,
    method:     state.method,
  };
}

module.exports = { startWatcher, getStatus };
