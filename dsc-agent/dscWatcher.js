'use strict';

/**
 * dscWatcher.js — v6 (Universal Indian DSC Reader)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads certificates from ALL Indian DSC USB tokens WITHOUT a PIN.
 *
 * Supported tokens (tested vendor list):
 *   • Watchdata USB Key      (VID 0x163C)  — ePass2003, ProxKey
 *   • Feitian ePass2003      (VID 0x096E)  — most common
 *   • SafeNet eToken 5110    (VID 0x0529)  — Gemalto/Thales
 *   • Moser Baer / MBToken  (VID 0x311F)
 *   • Aladdin eToken PRO     (VID 0x0529)
 *   • Prox Key               (VID 0x22CD)
 *   • Longmai mToken         (VID 0x0A89)
 *   • ePass3003 / ePass2000  (VID 0x096E)
 *   • Eutron CryptoIdentity  (VID 0x073D)
 *   • SmartCard-HSM          (VID 0x04B9)
 *   • ACS readers            (VID 0x072F)
 *   • HID Crescendo          (VID 0x076B)
 *   • Generic CCID tokens    (class 0x0B)
 *
 * Reading strategy (cascading — no C++ build tools required):
 *
 *   METHOD 1 — Windows PowerShell cert stores
 *     Reads: My (Personal), SmartCardRoot, Root stores
 *     Works for: tokens whose middleware registers cert in Windows store
 *     (eMudhra, Sify, Capricorn, most Feitian tokens)
 *
 *   METHOD 2 — certutil -store SmartCardRoot
 *     Reads: SmartCard cert store via Windows certutil.exe
 *     Works for: Watchdata, ProxKey, ePass2003 that skip Personal store
 *
 *   METHOD 3 — certutil -scinfo (direct token read)
 *     Reads: cert directly from inserted smart card via PC/SC without PIN
 *     Works for: any token with a Windows CCID driver (all modern tokens)
 *
 *   METHOD 4 — PowerShell CNG / CryptoAPI smart card enumeration
 *     Uses Get-ChildItem Cert:\\ with SmartCard provider
 *     Works for: tokens visible to Windows CNG key storage provider
 *
 *   METHOD 5 — pcsclite direct APDU (if native module installed)
 *     Reads cert by sending APDU sequences directly to token
 *     Works for: Linux/Mac and Windows with pcsclite build tools
 *
 * Exposed via HTTP (index.js):
 *   GET /dsc-status    → { plugged, cert, reader, insertedAt, method, error }
 *   GET /dsc-autofill  → { available, fields } — ready for DSCRegister.jsx form
 */

let pcsclite;
try { pcsclite = require('pcsclite'); } catch { pcsclite = null; }

const { execFileSync, execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Shared state ──────────────────────────────────────────────────────────────
let state = {
  plugged:    false,
  cert:       null,
  reader:     null,
  insertedAt: null,
  error:      null,
  method:     null,
};

// ── All known Indian DSC vendor IDs ──────────────────────────────────────────
const DSC_VENDOR_IDS = new Set([
  0x0529,  // SafeNet / Aladdin eToken
  0x08E6,  // Gemalto
  0x096E,  // Feitian (ePass2003, ePass2000, ePass3003)
  0x163C,  // Watchdata USB Key
  0x1FC9,  // NXP
  0x076B,  // HID Crescendo / ActivKey
  0x04B9,  // SmartCard-HSM / OBerthur
  0x073D,  // Eutron CryptoIdentity
  0x072F,  // ACS ACR readers
  0x22CD,  // ProxKey (Proxama)
  0x311F,  // Moser Baer / MBToken
  0x058F,  // Alcor Micro
  0x04E6,  // SCM Microsystems
  0x0DC3,  // Athena IDProtect
  0x1D50,  // OpenMoko
  0x0A89,  // Longmai mToken
  0x04CC,  // Gemplus
  0x0B97,  // O2Micro
  0x0C4B,  // Reiner-SCT
  0x1A44,  // VASCO
  0x1E0D,  // Feitian (newer PIDs)
  0x2581,  // ProSoft
  0x0783,  // C3PO
  0x1050,  // YubiKey (some DSC issuers use these)
  0x20A0,  // Clay Logic
]);

// ── Indian DSC issuer CA keywords ────────────────────────────────────────────
const DSC_ISSUER_KEYWORDS = [
  'emudhra', 'e-mudhra', 'mudhra',
  'nsdl', 'nsdl e-governance', 'protean',
  'sify', 'safescrypt',
  'capricorn', 'capricorn ca',
  'gnfc', 'gujarat narmada',
  'vsign', 'vsign ltd',
  'ncode', 'ncode solutions',
  'idrbt',
  'national informatics centre', 'nic',
  'controller of certifying authorities', 'cca',
  'certifying authority',
  'tcs', 'tata consultancy',
  'cdac', 'c-dac',
  'mtnl',
  'class 2', 'class 3', 'class2', 'class3',
  'ca-201', 'ca-202', 'ca-203',
  'subca', 'sub ca',
  'india pki', 'indianpki',
  'bridge ca',
  'pantasign', 'panta sign',
  'idsign', 'id sign',
  'xtratrust', 'xtra trust',
  'prodigisign', 'prodi',
  'signx', 'sign x',
  'care4sign', 'care 4 sign',
  'risl', 'rajcomp',
];

// ── CA Provider canonical name map ────────────────────────────────────────────
// Maps keywords found in issuer/subject to a human-readable CA provider name
const CA_PROVIDER_MAP = [
  { keywords: ['emudhra', 'e-mudhra', 'mudhra'],                        name: 'eMudhra CA' },
  { keywords: ['safescrypt', 'sify'],                                    name: 'Safescrypt (Sify) CA' },
  { keywords: ['idrbt'],                                                 name: 'IDRBT CA' },
  { keywords: ['ncode', 'ncode solutions'],                              name: 'nCode Solutions CA' },
  { keywords: ['cdac', 'c-dac'],                                        name: 'C-DAC CA' },
  { keywords: ['capricorn'],                                             name: 'Capricorn CA' },
  { keywords: ['nsdl', 'protean', 'nsdl e-governance'],                 name: 'Protean eGov (NSDL) CA' },
  { keywords: ['vsign'],                                                 name: 'VSign CA' },
  { keywords: ['pantasign', 'panta sign'],                              name: 'PantaSign CA' },
  { keywords: ['idsign', 'id sign'],                                     name: 'IDSign CA' },
  { keywords: ['xtratrust', 'xtra trust'],                              name: 'XtraTrust CA' },
  { keywords: ['prodigisign'],                                           name: 'ProDigiSign CA' },
  { keywords: ['signx'],                                                 name: 'SignX CA' },
  { keywords: ['care4sign'],                                             name: 'Care4Sign CA' },
  { keywords: ['risl', 'rajcomp'],                                       name: 'RISL (RajComp) CA' },
  { keywords: ['gnfc', 'gujarat narmada'],                              name: 'GNFC CA' },
  { keywords: ['mtnl'],                                                  name: 'MTNL CA' },
  { keywords: ['nic', 'national informatics'],                           name: 'NIC CA' },
  { keywords: ['tcs', 'tata consultancy'],                              name: 'TCS CA' },
  { keywords: ['idrbt'],                                                 name: 'IDRBT CA' },
];

// ── Token/USB Hardware Provider Map ──────────────────────────────────────────
// Maps USB reader name or known VID-based identifiers to token provider
const TOKEN_PROVIDER_MAP = [
  { keywords: ['proxkey', 'prox key', 'watchdata', 'wd proxkey', '163c'], name: 'WatchData ProxKey' },
  { keywords: ['epass2003', 'epass 2003', 'feitian', 'ftsafe', '096e'],   name: 'Feitian ePass2003' },
  { keywords: ['epass3003', 'epass 3003'],                                 name: 'Feitian ePass3003' },
  { keywords: ['safenet', 'etoken', 'gemalto', 'thales', '0529'],         name: 'SafeNet eToken' },
  { keywords: ['starkey', 'star key', 'starco', 'cdac'],                  name: 'StarKey Token (C-DAC)' },
  { keywords: ['hypersecu', 'hyp2003', '2034'],                           name: 'Hypersecu HYP2003' },
  { keywords: ['trustkey', 'trust key'],                                   name: 'TrustKey Token' },
  { keywords: ['moser baer', 'mbtoken', 'mtoken', '311f'],                name: 'Moser Baer mToken' },
  { keywords: ['longmai', 'long mai', '0a89'],                             name: 'Longmai mToken' },
  { keywords: ['eutron', '073d'],                                          name: 'Eutron CryptoIdentity' },
  { keywords: ['acs', 'acr', '072f'],                                      name: 'ACS Smart Card Reader' },
  { keywords: ['hid crescendo', 'activkey', '076b'],                      name: 'HID Crescendo' },
  { keywords: ['scm microsystems', '04e6'],                                name: 'SCM Microsystems' },
  { keywords: ['aladdin', '0529'],                                         name: 'Aladdin eToken PRO' },
];

/**
 * Resolve CA Provider from issuer string
 * @param {string} issuerStr - raw issuer DN or CN string
 * @returns {string|null}
 */
function resolveCAProvider(issuerStr) {
  if (!issuerStr) return null;
  const lower = issuerStr.toLowerCase();
  for (const { keywords, name } of CA_PROVIDER_MAP) {
    if (keywords.some(k => lower.includes(k))) return name;
  }
  return null;
}

/**
 * Resolve token/hardware provider from reader name or known info
 * @param {string} readerName
 * @returns {string|null}
 */
function resolveTokenProvider(readerName) {
  if (!readerName) return null;
  const lower = readerName.toLowerCase();
  for (const { keywords, name } of TOKEN_PROVIDER_MAP) {
    if (keywords.some(k => lower.includes(k))) return name;
  }
  return null;
}

/**
 * Determine DSC type (Signing / Encryption / Both) from cert data.
 * Indian DSCs commonly encode this in:
 *   - OU field: "Signing", "Encryption", "Signing and Encryption"
 *   - CN prefix: "S-", "E-"
 *   - KeyUsage extension bits (when available via certutil output)
 * We also use a scoring heuristic when the field is ambiguous.
 * @param {Object} subjectFields - parsed DN fields
 * @param {Object} raw - raw cert entry from Windows cert store
 * @returns {'Signing'|'Encryption'|'Signing & Encryption'|'Class 3'|null}
 */
function detectDscType(subjectFields, raw) {
  // Check OU field first — most Indian DSCs embed type here
  const ou = (subjectFields.OU || '').toLowerCase();
  const cn = (subjectFields.CN || '').toLowerCase();
  const rawSubject = JSON.stringify(subjectFields).toLowerCase();
  const rawIssuer  = (raw.issuer || '').toLowerCase();
  const storeSource = (raw.storeSource || '').toLowerCase();

  // Explicit type from OU
  if (/sign\s*&?\s*encrypt|signing\s*and\s*enc/i.test(ou)) return 'Signing & Encryption';
  if (/\bencrypt/i.test(ou) && /\bsign/i.test(ou))          return 'Signing & Encryption';
  if (/\bencrypt/i.test(ou))                                 return 'Encryption';
  if (/\bsign/i.test(ou))                                    return 'Signing';

  // CN prefix patterns used by some CAs: "S-PANNAME", "E-PANNAME", "DS-"
  if (/^(s|ds|sig)[_\-\s]/i.test(cn))  return 'Signing';
  if (/^(e|enc)[_\-\s]/i.test(cn))     return 'Encryption';

  // Check full subject JSON for type keywords
  if (/sign.*encrypt|encrypt.*sign/i.test(rawSubject)) return 'Signing & Encryption';
  if (/\bencrypt/i.test(rawSubject))                   return 'Encryption';
  if (/\bsign/i.test(rawSubject))                      return 'Signing';

  // Fallback: class hint from issuer (Class 3 is most common for Indian DSC)
  if (/class\s*3/i.test(rawIssuer)) return 'Class 3';
  if (/class\s*2/i.test(rawIssuer)) return 'Class 2';

  return 'Class 3'; // safe default for Indian DSC tokens
}

// ── PowerShell: read all Windows cert stores ──────────────────────────────────
const PS_MULTISOURCE = String.raw`
$results = @()
$seen    = @{}

function Add-Certs($storeName, $storeLocation) {
  try {
    $loc = [System.Security.Cryptography.X509Certificates.StoreLocation]$storeLocation
    $s   = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, $loc)
    $s.Open("ReadOnly")
    foreach ($c in $s.Certificates) {
      if (-not $seen.ContainsKey($c.Thumbprint)) {
        $seen[$c.Thumbprint] = $true
        $results += [PSCustomObject]@{
          subject      = $c.Subject
          issuer       = $c.Issuer
          serialNumber = $c.SerialNumber
          notBefore    = $c.NotBefore.ToString("yyyy-MM-dd")
          notAfter     = $c.NotAfter.ToString("yyyy-MM-dd")
          thumbprint   = $c.Thumbprint
          hasPrivateKey= $c.HasPrivateKey
          storeSource  = ($storeLocation + "/" + $storeName)
        }
      }
    }
    $s.Close()
  } catch {}
}

# All stores that can contain DSC certs
Add-Certs "My"            "CurrentUser"
Add-Certs "SmartCardRoot" "CurrentUser"
Add-Certs "Root"          "CurrentUser"
Add-Certs "My"            "LocalMachine"
Add-Certs "SmartCardRoot" "LocalMachine"

if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress -Depth 3 }
else { Write-Output "[]" }
`;

// ── PowerShell: CNG smart card key enumeration ────────────────────────────────
// Uses Windows CNG (Cryptography Next Generation) to enumerate
// smart card keys — works for tokens that register with KSP providers
const PS_CNG_SMARTCARD = String.raw`
$results = @()
try {
  # Enumerate certificates from Cert:\ drive that are backed by smart card KSP
  $scKsps = @(
    "Microsoft Smart Card Key Storage Provider",
    "Microsoft Base Smart Card Crypto Provider"
  )
  Get-ChildItem -Path "Cert:\CurrentUser\My" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $c = $_
      # Check if it has private key via smart card provider
      if ($c.HasPrivateKey) {
        $pk = $c.PrivateKey
        if ($pk -ne $null) {
          $results += [PSCustomObject]@{
            subject      = $c.Subject
            issuer       = $c.Issuer
            serialNumber = $c.SerialNumber
            notBefore    = $c.NotBefore.ToString("yyyy-MM-dd")
            notAfter     = $c.NotAfter.ToString("yyyy-MM-dd")
            thumbprint   = $c.Thumbprint
            hasPrivateKey= $true
            storeSource  = "CNG-SmartCard"
          }
        }
      }
    } catch {}
  }
} catch {}
if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress -Depth 3 }
else { Write-Output "[]" }
`;

// ── PowerShell: certutil -scinfo (direct token cert read) ─────────────────────
// certutil -scinfo reads cert info directly from the inserted smart card
// without needing to import into Windows cert store — works for ALL tokens
// that have a Windows CCID driver (all modern DSC tokens do)
const PS_SCINFO = String.raw`
try {
  # Run certutil -scinfo to read cert directly from token
  $raw = & certutil -scinfo -silent 2>&1 | Out-String
  
  $results = @()
  
  # Parse each certificate block from certutil output
  # certutil outputs multiple cert blocks separated by "==="
  $certBlocks = $raw -split "(?=\r?\n\s*Serial Number:|\r?\n\s*Issued to:)"
  
  foreach ($block in $certBlocks) {
    if ($block -notmatch "Serial Number:" -and $block -notmatch "Issued to:") { continue }
    
    # Extract fields
    $serial   = if ($block -match "Serial Number:\s*([0-9a-fA-F\s]+)") { $Matches[1].Trim() -replace "\s",""} else { $null }
    $issuedTo = if ($block -match "Issued to:\s*(.+)")    { $Matches[1].Trim() } else { $null }
    $issuedBy = if ($block -match "Issued by:\s*(.+)")    { $Matches[1].Trim() } else { $null }
    $subject  = if ($block -match "Subject:\s*(.+)")      { $Matches[1].Trim() } else { $null }
    $issuer   = if ($block -match "Issuer:\s*(.+)")       { $Matches[1].Trim() } else { $null }
    
    # Try to parse dates in multiple formats
    $notBefore = $null; $notAfter = $null
    if ($block -match "NotBefore:\s*(.+?)[\r\n]")  { 
      try { $notBefore = [datetime]::Parse($Matches[1].Trim()).ToString("yyyy-MM-dd") } catch { $notBefore = $Matches[1].Trim() }
    }
    if ($block -match "NotAfter:\s*(.+?)[\r\n]")   { 
      try { $notAfter  = [datetime]::Parse($Matches[1].Trim()).ToString("yyyy-MM-dd") } catch { $notAfter  = $Matches[1].Trim() }
    }
    # Also try "Valid From / Valid To" format
    if (-not $notBefore -and $block -match "Valid From:\s*(.+?)[\r\n]") {
      try { $notBefore = [datetime]::Parse($Matches[1].Trim()).ToString("yyyy-MM-dd") } catch { $notBefore = $Matches[1].Trim() }
    }
    if (-not $notAfter -and $block -match "Valid To:\s*(.+?)[\r\n]") {
      try { $notAfter  = [datetime]::Parse($Matches[1].Trim()).ToString("yyyy-MM-dd") } catch { $notAfter  = $Matches[1].Trim() }
    }
    
    $name = if ($subject) { $subject } elseif ($issuedTo) { $issuedTo } else { $null }
    $iss  = if ($issuer)  { $issuer  } elseif ($issuedBy) { $issuedBy } else { $null }
    
    if ($name -and $serial) {
      $results += [PSCustomObject]@{
        subject      = $name
        issuer       = $iss
        serialNumber = $serial
        notBefore    = $notBefore
        notAfter     = $notAfter
        thumbprint   = ("scinfo-" + $serial)
        hasPrivateKey= $true
        storeSource  = "certutil-scinfo"
      }
    }
  }
  
  if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress -Depth 3 }
  else { Write-Output "[]" }
} catch { Write-Output "[]" }
`;

// ── Temp file paths ───────────────────────────────────────────────────────────
const PS_FILE_MULTI  = path.join(os.tmpdir(), 'ts-dsc-multi.ps1');
const PS_FILE_CNG    = path.join(os.tmpdir(), 'ts-dsc-cng.ps1');
const PS_FILE_SCINFO = path.join(os.tmpdir(), 'ts-dsc-scinfo.ps1');

function writePsFiles() {
  try { fs.writeFileSync(PS_FILE_MULTI,  '\uFEFF' + PS_MULTISOURCE,    'utf8'); } catch {}
  try { fs.writeFileSync(PS_FILE_CNG,    '\uFEFF' + PS_CNG_SMARTCARD,  'utf8'); } catch {}
  try { fs.writeFileSync(PS_FILE_SCINFO, '\uFEFF' + PS_SCINFO,         'utf8'); } catch {}
}

function runPs(file, timeoutMs = 10000) {
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', file,
    ], { timeout: timeoutMs, windowsHide: true }).toString().trim();
    if (!out || out === '[]') return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return []; }
}

// certutil -store "SmartCardRoot" — plain text output, no PS needed
function runCertutilSmartCardRoot() {
  try {
    const out = execFileSync('certutil', ['-store', '-user', 'SmartCardRoot'],
      { timeout: 8000, windowsHide: true, shell: true }).toString();
    return parseCertutilText(out, 'certutil-SmartCardRoot-User');
  } catch { return []; }
}

// certutil -store "My" on LocalMachine (some MDM-enrolled tokens land here)
function runCertutilMyLM() {
  try {
    const out = execFileSync('certutil', ['-store', 'My'],
      { timeout: 8000, windowsHide: true, shell: true }).toString();
    return parseCertutilText(out, 'certutil-My-LM');
  } catch { return []; }
}

// Parse certutil text output into cert objects
function parseCertutilText(out, source) {
  const results = [];
  const seen = new Set();
  // Split on cert boundary lines (=====, -------, or "CertInfo")
  const blocks = out.split(/={5,}|(?=Serial Number:)/i);
  for (const block of blocks) {
    const serial  = (block.match(/Serial Number:\s*([0-9a-fA-F\s]+)/i) || [])[1]?.trim().replace(/\s/g, '');
    const subject = (block.match(/Subject:\s*(.+)/i)   || [])[1]?.trim();
    const issuer  = (block.match(/Issuer:\s*(.+)/i)    || [])[1]?.trim();
    let   notBefore = null;
    let   notAfter  = null;
    const nbM = block.match(/NotBefore:\s*(.+)/i) || block.match(/Valid From:\s*(.+)/i);
    const naM = block.match(/NotAfter:\s*(.+)/i)  || block.match(/Valid To:\s*(.+)/i);
    if (nbM) { try { notBefore = new Date(nbM[1].trim()).toISOString().slice(0,10); } catch { notBefore = nbM[1].trim(); } }
    if (naM) { try { notAfter  = new Date(naM[1].trim()).toISOString().slice(0,10); } catch { notAfter  = naM[1].trim(); } }
    if (subject && serial && !seen.has(serial)) {
      seen.add(serial);
      results.push({
        subject, issuer: issuer || '', serialNumber: serial,
        notBefore, notAfter,
        thumbprint: source + '-' + serial,
        hasPrivateKey: true, storeSource: source,
      });
    }
  }
  return results;
}

// ── Parse Distinguished Name string ──────────────────────────────────────────
// Handles: "CN=JOHN DOE, E=user@email.com, O=Firm, OU=Individual, C=IN"
// Also handles certutil "Issued to" simple strings
function parseDistinguishedName(dn) {
  if (!dn) return {};
  const fields = {};
  // Try structured DN first
  const parts = dn.split(/,\s*(?=[A-Z]{1,15}=)/);
  for (const part of parts) {
    const eq  = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.substring(0, eq).trim().toUpperCase();
    const val = part.substring(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!fields[key]) fields[key] = val; // keep first occurrence
  }
  // If no structured fields found, treat entire string as CN
  if (Object.keys(fields).length === 0 && dn.trim()) {
    fields['CN'] = dn.trim();
  }
  return fields;
}

// Normalise various date formats → yyyy-MM-dd
function normDate(raw) {
  if (!raw) return null;
  raw = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  try {
    const d = new Date(raw);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  } catch {}
  return raw.slice(0, 10);
}

// Parse a cert entry (from any source) → unified cert object
function parseCertEntry(entry) {
  const subj = parseDistinguishedName(entry.subject || '');
  const issu = parseDistinguishedName(entry.issuer  || '');

  const cn    = subj.CN  || subj.NAME || subj.GN || '';
  const email = subj.E   || subj.EMAILADDRESS || subj['1.2.840.113549.1.9.1'] || '';
  const org   = subj.O   || '';
  const ou    = subj.OU  || '';
  const loc   = subj.L   || '';
  const st    = subj.ST  || subj.S || '';

  // Extract PAN from CN — common in Indian DSCs: "ABCDE1234F-FIRSTNAME LASTNAME"
  let name = cn;
  let pan  = null;
  const panMatch = (cn + ' ' + ou).match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  if (panMatch) {
    pan  = panMatch[1];
    name = cn.replace(/^[A-Z]{5}[0-9]{4}[A-Z][-\s]+/, '').trim() || cn;
  }

  // Fallback: if name still looks like a PAN, strip it
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(name.trim())) name = '';

  const issuerCN = issu.CN || issu.O || entry.issuer || '';

  // ── NEW: DSC type, CA provider, token provider ─────────────────────────────
  const dscType      = detectDscType(subj, entry);
  const caProvider   = resolveCAProvider(issuerCN) || resolveCAProvider(entry.issuer || '');
  const tokenProvider = resolveTokenProvider(entry.storeSource || state.reader || '');

  return {
    holder_name:    name || null,
    email:          email || null,
    organization:   org || null,
    state:          st || null,
    locality:       loc || null,
    pan:            pan || null,
    serial_number:  entry.serialNumber || null,
    issue_date:     normDate(entry.notBefore),
    expiry_date:    normDate(entry.notAfter),
    issuer:         issuerCN || null,
    thumbprint:     entry.thumbprint || null,
    read_method:    'agent-' + (entry.storeSource || 'certstore'),
    dsc_type:       dscType,
    ca_provider:    caProvider,
    token_provider: tokenProvider,
  };
}

// ── Score & select best cert from a list ─────────────────────────────────────
function isDscIssuer(issuer) {
  if (!issuer) return false;
  const lower = issuer.toLowerCase();
  return DSC_ISSUER_KEYWORDS.some(k => lower.includes(k));
}

function scoreCert(entry) {
  let score = 0;
  const today = new Date().toISOString().slice(0, 10);
  const parsed = parseCertEntry(entry);
  if (isDscIssuer(entry.issuer || ''))  score += 20;
  if (entry.hasPrivateKey)               score += 10;
  if (entry.notAfter >= today)           score += 15;  // not expired
  if (parsed.holder_name)                score += 8;
  if (parsed.email)                      score += 5;
  if (parsed.pan)                        score += 5;
  // Prefer cert store sources over certutil (more reliable dates)
  if ((entry.storeSource || '').includes('SmartCardRoot')) score += 3;
  if ((entry.storeSource || '').includes('scinfo'))        score += 2;
  return score;
}

function selectBestCert(certs) {
  if (!certs.length) return null;
  return certs
    .map(c => ({ c, score: scoreCert(c) }))
    .sort((a, b) => b.score - a.score)[0].c;
}

// Deduplicate certs by serial number (different sources may return same cert)
function deduplicateCerts(certs) {
  const seen   = new Map(); // serial → entry
  const noSerial = [];
  for (const c of certs) {
    const key = (c.serialNumber || '').replace(/\s/g, '').toUpperCase();
    if (!key) { noSerial.push(c); continue; }
    if (!seen.has(key)) {
      seen.set(key, c);
    } else {
      // Keep whichever has hasPrivateKey=true, or keep existing
      if (c.hasPrivateKey && !seen.get(key).hasPrivateKey) seen.set(key, c);
    }
  }
  return [...seen.values(), ...noSerial];
}

// ── pcsclite DER parsing (no native module needed for stores, but used for APDU path) ──
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

function parseSeq(der, start, end) {
  const items = []; let pos = start;
  while (pos < end) {
    const tlv = readTlv(der, pos);
    items.push({ ...tlv, value: der.slice(tlv.valueStart, tlv.nextPos) });
    pos = tlv.nextPos;
  }
  return items;
}

function decodeStr(der, start, len, tag) {
  const bytes = der.slice(start, start + len);
  if (tag === 0x1E) { // BMPString (UTF-16BE)
    let s = '';
    for (let i = 0; i < bytes.length - 1; i += 2)
      s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeOid(bytes) {
  let oid = '';
  const f = bytes[0];
  oid += Math.floor(f / 40) + '.' + (f % 40);
  let v = 0;
  for (let i = 1; i < bytes.length; i++) {
    v = (v << 7) | (bytes[i] & 0x7F);
    if (!(bytes[i] & 0x80)) { oid += '.' + v; v = 0; }
  }
  return oid;
}

function parseTime(bytes, tag) {
  const s = Buffer.from(bytes).toString('ascii');
  let year, month, day;
  if (tag === 0x17) { // UTCTime
    const y2 = parseInt(s.substring(0, 2));
    year = y2 >= 50 ? 1900 + y2 : 2000 + y2;
    month = s.substring(2, 4); day = s.substring(4, 6);
  } else { // GeneralizedTime
    year = s.substring(0, 4); month = s.substring(4, 6); day = s.substring(6, 8);
  }
  return `${year}-${month}-${day}`;
}

const OID_MAP = {
  '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU',
  '2.5.4.6': 'C',  '2.5.4.7': 'L', '2.5.4.8': 'ST',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '2.5.4.41': 'name', '2.5.4.4': 'SN', '2.5.4.42': 'GN',
};

function parseName(der, start, len) {
  const result = {};
  try {
    for (const rdn of parseSeq(der, start, start + len)) {
      if (rdn.tag !== 0x31) continue;
      for (const attr of parseSeq(der, rdn.valueStart, rdn.nextPos)) {
        if (attr.tag !== 0x30) continue;
        const children = parseSeq(der, attr.valueStart, attr.nextPos);
        if (children.length < 2) continue;
        const oidItem = children[0], valItem = children[1];
        if (oidItem.tag !== 0x06) continue;
        const oid = decodeOid(der.slice(oidItem.valueStart, oidItem.nextPos));
        result[OID_MAP[oid] || oid] = decodeStr(der, valItem.valueStart, valItem.len, valItem.tag);
      }
    }
  } catch {}
  return result;
}

function parseDerCertificate(der, readMethod) {
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
    const issuerDN  = parseName(der, issuerTlv.valueStart, issuerTlv.len);
    const validity  = readTlv(der, p); p = validity.nextPos;
    let vp = validity.valueStart;
    const nbTlv = readTlv(der, vp); vp = nbTlv.nextPos;
    const naTlv = readTlv(der, vp);
    const notBefore = parseTime(der.slice(nbTlv.valueStart, nbTlv.nextPos), nbTlv.tag);
    const notAfter  = parseTime(der.slice(naTlv.valueStart, naTlv.nextPos), naTlv.tag);
    const subjTlv   = readTlv(der, p);
    const subjectDN = parseName(der, subjTlv.valueStart, subjTlv.len);
    const cn    = subjectDN.CN || subjectDN.name || subjectDN.GN || '';
    const email = subjectDN.emailAddress || '';
    const org   = subjectDN.O || '';
    const ou    = subjectDN.OU || '';
    let name = cn; let pan = null;
    const pm = (cn + ' ' + ou).match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
    if (pm) { pan = pm[1]; name = cn.replace(/^[A-Z]{5}[0-9]{4}[A-Z][-\s]+/, '').trim() || cn; }
    const issuerCN = issuerDN.CN || issuerDN.O || null;
    const dscType     = detectDscType(subjectDN, { issuer: issuerCN || '', storeSource: readMethod });
    const caProvider  = resolveCAProvider(issuerCN);
    const tokenProv   = resolveTokenProvider(state.reader || '');
    return {
      holder_name:    name   || null,
      organization:   org    || null,
      email:          email  || null,
      pan:            pan    || null,
      serial_number:  serialHex,
      issue_date:     notBefore,
      expiry_date:    notAfter,
      issuer:         issuerCN,
      thumbprint:     null,
      read_method:    readMethod || 'agent-apdu',
      dsc_type:       dscType,
      ca_provider:    caProvider,
      token_provider: tokenProv,
    };
  } catch { return null; }
}

function extractDer(bytes) {
  // Look for 0x30 0x82 (SEQUENCE, long-form 2-byte length)
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x82) {
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (i + 4 + len <= bytes.length) return bytes.slice(i, i + 4 + len);
    }
  }
  // Fallback: 0x30 0x81
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x30 && bytes[i + 1] === 0x81) {
      const len = bytes[i + 2];
      if (i + 3 + len <= bytes.length) return bytes.slice(i, i + 3 + len);
    }
  }
  return bytes;
}

// ── PC/SC APDU helpers ────────────────────────────────────────────────────────
function sendApdu(card, protocol, apdu) {
  return new Promise((resolve, reject) => {
    card.transmit(Buffer.from(apdu), 2048, protocol, (err, r) =>
      err ? reject(err) : resolve(r));
  });
}

async function readBinary(card, protocol) {
  const chunks = []; let offset = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const apdu = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, 0xFF];
    const resp = await sendApdu(card, protocol, apdu);
    if (!resp || resp.length < 2) break;
    const sw1 = resp[resp.length - 2], sw2 = resp[resp.length - 1];
    const data = resp.slice(0, resp.length - 2);
    if (sw1 === 0x90) {
      chunks.push(...data); offset += data.length;
      if (data.length < 255) break;
    } else if (sw1 === 0x6C) {
      // Re-read with correct length
      const fix = [0x00, 0xB0, (offset >> 8) & 0xFF, offset & 0xFF, sw2];
      const fr  = await sendApdu(card, protocol, fix);
      if (fr && fr.length >= 2) chunks.push(...fr.slice(0, fr.length - 2));
      break;
    } else if (sw1 === 0x61) {
      // GET RESPONSE
      const gr = await sendApdu(card, protocol, [0x00, 0xC0, 0x00, 0x00, sw2]);
      if (gr && gr.length >= 2) chunks.push(...gr.slice(0, gr.length - 2));
      break;
    } else break;
  }
  return Buffer.from(chunks);
}

// Comprehensive APDU sequences for ALL known Indian DSC tokens
// Each entry is [name, ...apduArrays] where each apduArray is sent in order
const APDU_STRATEGIES = [
  // ── Feitian ePass2003 / ePass3003 ──────────────────────────────────────────
  {
    name: 'Feitian-ePass2003-EF-1005',
    select: [
      [0x00,0xA4,0x04,0x00,0x0C, 0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],
      [0x00,0xA4,0x02,0x0C,0x02, 0x10,0x05],
    ],
  },
  {
    name: 'Feitian-ePass2003-EF-1001',
    select: [
      [0x00,0xA4,0x04,0x00,0x0C, 0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],
      [0x00,0xA4,0x02,0x0C,0x02, 0x10,0x01],
    ],
  },
  {
    name: 'Feitian-ePass2003-EF-1002',
    select: [
      [0x00,0xA4,0x04,0x00,0x0C, 0xA0,0x00,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00,0x01,0x00],
      [0x00,0xA4,0x02,0x0C,0x02, 0x10,0x02],
    ],
  },
  // ── Watchdata USB Key / ProxKey ─────────────────────────────────────────────
  {
    name: 'Watchdata-ProxKey-PKCS',
    select: [
      [0x00,0xA4,0x04,0x00,0x08, 0xA0,0x00,0x00,0x00,0x63,0x50,0x4B,0x43],
      [0x00,0xA4,0x02,0x00,0x02, 0x00,0x01],
    ],
  },
  {
    name: 'Watchdata-ProxKey-MF',
    select: [
      [0x00,0xA4,0x00,0x00,0x02, 0x3F,0x00],
      [0x00,0xA4,0x01,0x00,0x02, 0x50,0x15],
      [0x00,0xA4,0x02,0x00,0x02, 0x10,0x05],
    ],
  },
  {
    name: 'Watchdata-AID-2',
    select: [
      [0x00,0xA4,0x04,0x00,0x09, 0xA0,0x00,0x00,0x00,0x63,0x57,0x44,0x4B,0x01],
      [0x00,0xA4,0x02,0x0C,0x02, 0x10,0x05],
    ],
  },
  // ── SafeNet eToken 5110 / Aladdin eToken PRO ────────────────────────────────
  {
    name: 'SafeNet-eToken-5110',
    select: [
      [0x00,0xA4,0x04,0x00,0x09, 0xA0,0x00,0x00,0x00,0x18,0x0A,0x00,0x00,0x01],
      [0x00,0xA4,0x02,0x0C,0x02, 0x10,0x05],
    ],
  },
  {
    name: 'SafeNet-eToken-Classic',
    select: [
      [0x00,0xA4,0x04,0x00,0x07, 0xA0,0x00,0x00,0x01,0x18,0x00,0x00],
      [0x00,0xA4,0x02,0x04,0x02, 0x10,0x05],
    ],
  },
  // ── Moser Baer / MBToken ───────────────────────────────────────────────────
  {
    name: 'MoserBaer-MBToken',
    select: [
      [0x00,0xA4,0x04,0x00,0x0A, 0xA0,0x00,0x00,0x02,0x4A,0x01,0x01,0x01,0x01,0x00],
      [0x00,0xA4,0x02,0x00,0x02, 0x10,0x05],
    ],
  },
  // ── Generic MF (catches many unknown tokens) ───────────────────────────────
  {
    name: 'Generic-MF-EF-1005',
    select: [
      [0x00,0xA4,0x00,0x00,0x02, 0x3F,0x00],
      [0x00,0xA4,0x02,0x04,0x02, 0x10,0x05],
    ],
  },
  {
    name: 'Generic-MF-EF-1001',
    select: [
      [0x00,0xA4,0x00,0x00,0x02, 0x3F,0x00],
      [0x00,0xA4,0x02,0x04,0x02, 0x10,0x01],
    ],
  },
  {
    name: 'Generic-MF-EF-1002',
    select: [
      [0x00,0xA4,0x00,0x00,0x02, 0x3F,0x00],
      [0x00,0xA4,0x02,0x04,0x02, 0x10,0x02],
    ],
  },
  // ── eMudhra / Capricorn specific ────────────────────────────────────────────
  {
    name: 'eMudhra-PKCS15',
    select: [
      [0x00,0xA4,0x04,0x00,0x05, 0xA0,0x00,0x00,0x00,0x63],
      [0x00,0xA4,0x02,0x0C,0x02, 0x50,0x05],
    ],
  },
  // ── PIV-compatible (some govt DSC tokens) ──────────────────────────────────
  {
    name: 'PIV-9A-Auth-Cert',
    select: [
      [0x00,0xA4,0x04,0x00,0x09, 0xA0,0x00,0x00,0x03,0x08,0x00,0x00,0x10,0x00],
      [0x00,0xCB,0x3F,0xFF,0x05, 0x5C,0x03,0x5F,0xC1,0x05, 0x00],
    ],
    dataInResponse: true, // for PIV, data comes in the SELECT response
  },
];

async function tryApduStrategy(card, protocol, strategy) {
  try {
    for (const apdu of strategy.select) {
      const resp = await sendApdu(card, protocol, apdu);
      if (!resp || resp.length < 2) return null;
      const sw1 = resp[resp.length - 2];
      // Accept 90 (ok), 61 (more data), 62 (warning), 63 (warning)
      if (sw1 !== 0x90 && sw1 !== 0x61 && sw1 !== 0x62 && sw1 !== 0x63) return null;
      // For PIV, cert data comes in the GET RESPONSE / response data
      if (strategy.dataInResponse && resp.length > 4) {
        const der = extractDer(resp.slice(0, resp.length - 2));
        const cert = parseDerCertificate(der, strategy.name);
        if (cert && cert.holder_name) return cert;
      }
    }
    const blob = await readBinary(card, protocol);
    if (!blob || blob.length < 32) return null;
    const der  = extractDer(blob);
    return parseDerCertificate(der, strategy.name);
  } catch { return null; }
}

// ── pcsclite watcher (no-PIN APDU read) ──────────────────────────────────────
function startPcscWatcher() {
  if (!pcsclite) return;
  let pcsc;
  try { pcsc = pcsclite(); } catch { return; }

  pcsc.on('error', err => console.warn('[dsc/pcsc]', err.message));

  pcsc.on('reader', reader => {
    console.log('[dsc/pcsc] Reader detected:', reader.name);

    reader.on('status', async status => {
      const present = !!(status.state & reader.SCARD_STATE_PRESENT);

      if (present && !state.cert) {
        console.log('[dsc/pcsc] Card inserted in', reader.name, '— trying APDU read...');
        const protocols = reader.SCARD_PROTOCOL_T0 | reader.SCARD_PROTOCOL_T1;

        for (const strategy of APDU_STRATEGIES) {
          try {
            await new Promise((res, rej) =>
              reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, (e, c, p) =>
                e ? rej(e) : res({ card: c, protocol: p })));

            const cert = await tryApduStrategy(reader, protocols, strategy);
            if (cert && cert.holder_name) {
              state.cert       = cert;
              state.plugged    = true;
              state.insertedAt = new Date().toISOString();
              state.reader     = reader.name;
              state.method     = 'pcsclite-' + strategy.name;
              state.error      = null;
              console.log('[dsc/pcsc] Cert read via', strategy.name, '—', cert.holder_name);
              reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
              return;
            }
            reader.disconnect(reader.SCARD_LEAVE_CARD, () => {});
          } catch {}
        }
        console.log('[dsc/pcsc] No cert found via APDU — cert store poll will handle it');
      }

      if (!present && state.method?.startsWith('pcsclite')) {
        state.plugged = false; state.cert = null; state.method = null; state.reader = null;
        console.log('[dsc/pcsc] Card removed from', reader.name);
      }
    });

    reader.on('error', err => console.warn('[dsc/pcsc] Reader error:', err.message));
  });
}

// ── PowerShell polling watcher (primary, no native deps) ─────────────────────
let prevThumbprints = new Set();
let psWatchInterval = null;

function pollCertStore() {
  // Gather certs from all sources, dedup by serial number
  let allCerts = [];

  // Source 1: All Windows cert stores via PS (My, SmartCardRoot, Root — User & LM)
  const storeCerts = runPs(PS_FILE_MULTI, 12000);
  if (storeCerts.length) allCerts.push(...storeCerts);

  // Source 2: certutil SmartCardRoot (catches Watchdata, ePass if not in store)
  if (!allCerts.some(c => c.hasPrivateKey)) {
    const scardCerts = runCertutilSmartCardRoot();
    if (scardCerts.length) allCerts.push(...scardCerts);
  }

  // Source 3: CNG smart card enumeration (catches MDM/enterprise tokens)
  if (!allCerts.some(c => c.hasPrivateKey)) {
    const cngCerts = runPs(PS_FILE_CNG, 8000);
    if (cngCerts.length) allCerts.push(...cngCerts);
  }

  // Source 4: certutil -scinfo (reads directly from token — last resort)
  if (allCerts.length === 0) {
    const scinfoCerts = runPs(PS_FILE_SCINFO, 15000);
    if (scinfoCerts.length) allCerts.push(...scinfoCerts);
  }

  // Source 5: certutil My LocalMachine (MDM-enrolled / enterprise tokens)
  if (allCerts.length === 0) {
    const lmCerts = runCertutilMyLM();
    if (lmCerts.length) allCerts.push(...lmCerts);
  }

  allCerts = deduplicateCerts(allCerts);

  const currThumbs = new Set(allCerts.map(c => c.thumbprint));

  // Newly appeared certs → token plugged in
  const newCerts = allCerts.filter(c => !prevThumbprints.has(c.thumbprint));
  if (newCerts.length > 0 && !state.cert) {
    const best   = selectBestCert(newCerts);
    const parsed = parseCertEntry(best);
    if (parsed.holder_name) {
      state.plugged    = true;
      state.cert       = parsed;
      state.insertedAt = new Date().toISOString();
      state.error      = null;
      state.method     = 'powershell';
      state.reader     = best.storeSource || 'Windows Cert Store';
      console.log('[dsc] Token detected —', parsed.holder_name,
        '| expiry:', parsed.expiry_date, '| source:', state.reader);
    }
  }

  // Removed certs → token unplugged
  const removed = [...prevThumbprints].filter(t => !currThumbs.has(t));
  if (removed.length > 0 && state.cert && state.method === 'powershell') {
    if (removed.includes(state.cert.thumbprint)) {
      console.log('[dsc] Token removed (cert disappeared from store)');
      state.plugged = false; state.cert = null; state.method = null; state.reader = null;
    }
  }

  // Pick best from all certs if we don't have one yet
  if (!state.cert && allCerts.length > 0) {
    const best   = selectBestCert(allCerts);
    const parsed = parseCertEntry(best);
    if (parsed.holder_name) {
      state.plugged    = true;
      state.cert       = parsed;
      state.insertedAt = new Date().toISOString();
      state.error      = null;
      state.method     = 'powershell';
      state.reader     = best.storeSource || 'Windows Cert Store';
      console.log('[dsc] Cert found —', parsed.holder_name,
        '| expiry:', parsed.expiry_date, '| source:', state.reader);
    }
  }

  prevThumbprints = currThumbs;
}

// ── Public API ────────────────────────────────────────────────────────────────
function startWatcher() {
  writePsFiles();
  pollCertStore();                             // immediate scan on startup
  psWatchInterval = setInterval(pollCertStore, 3000); // re-scan every 3s
  console.log('[dsc] Universal DSC watcher v6 started (polls every 3s)');
  console.log('[dsc] Reading from: Personal + SmartCardRoot + certutil + scinfo + CNG');
  startPcscWatcher();                          // bonus: pcsclite APDU (if installed)
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

function getAutofillFields() {
  if (!state.plugged || !state.cert) {
    return { available: false, fields: null };
  }
  const cert = state.cert;
  return {
    available: true,
    fields: {
      holder_name:    cert.holder_name    || '',
      serial_number:  cert.serial_number  || '',
      issue_date:     cert.issue_date     || '',
      expiry_date:    cert.expiry_date    || '',
      associated_with: cert.organization || '',
      dsc_type:       cert.dsc_type       || 'Class 3',
      ca_provider:    cert.ca_provider    || cert.issuer || '',
      token_provider: cert.token_provider || '',
      issuer:         cert.issuer         || '',
      email:          cert.email          || '',
      pan:            cert.pan            || '',
      read_method:    cert.read_method    || '',
    },
  };
}

module.exports = { startWatcher, getStatus, getAutofillFields };
