'use strict';

/**
 * usbMonitor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects USB device connect/disconnect events on Windows.
 *
 * Tracked device types:
 *   - DSC tokens (smart card readers)
 *   - USB drives / flash drives
 *   - External HDDs
 *   - Phones (MTP/PTP)
 *   - Printers
 *
 * Stores:
 *   - Device type
 *   - Device name
 *   - Vendor ID
 *   - Product ID
 *   - Connection time
 *   - Removal time
 *
 * Uses PowerShell WMI event polling (no native modules required).
 */

const { execSync, spawn } = require('child_process');

// ── State ────────────────────────────────────────────────────────────────────
const knownDevices = new Map();  // deviceId → { type, name, vid, pid, connectedAt }
const events       = [];         // { device_type, device_name, vendor_id, product_id, event, timestamp }
let   isRunning    = false;
let   pollTimer    = null;

// ── Known USB device type signatures ─────────────────────────────────────────
const DEVICE_SIGNATURES = [
  // Smart card readers (DSC tokens)
  { match: /smart\s*card|pcsc|ccid|etr|etoken|epass|dsc|token|feitian|watchdata|safenet|proxkey|scm|acs|hid\s*crescendo/i, type: 'dsc_token' },
  // Printers
  { match: /print|HP\s*DeskJet|HP\s*LaserJet|Canon|Epson|Brother/i, type: 'printer' },
  // Phones
  { match: /mtp|ptp|android|iphone|ipad|samsung|pixel|oneplus|redmi|mi\s*\d/i, type: 'phone' },
  // USB drives / external HDDs
  { match: /usb\s*(mass|storage|drive)|external|wd\s*my|seagate|toshiba|sandisk|kingston|transcend/i, type: 'usb_drive' },
];

function classifyDevice(name) {
  if (!name) return 'unknown';
  for (const sig of DEVICE_SIGNATURES) {
    if (sig.match.test(name)) return sig.type;
  }
  return 'usb_device';
}

// ── PowerShell: enumerate connected USB devices ─────────────────────────────
function enumerateUsbDevices() {
  const ps = String.raw`
$devices = @()
# Win32_USBHub - USB controllers and hubs
Get-CimInstance Win32_USBHub -ErrorAction SilentlyContinue | ForEach-Object {
    $devices += [PSCustomObject]@{
        DeviceId   = $_.DeviceId
        Name       = $_.Name
        Status     = $_.Status
        VendorId   = if ($_.DeviceId -match 'VID_([0-9A-F]{4})') { $Matches[1] } else { $null }
        ProductId  = if ($_.DeviceId -match 'PID_([0-9A-F]{4})') { $Matches[1] } else { $null }
        Serial     = if ($_.DeviceId -match '(\w{8,})$') { $Matches[1] } else { $null }
        Class      = 'USB'
    }
}
# Win32_DiskDrive - External/USB disk drives
Get-CimInstance Win32_DiskDrive | Where-Object { $_.InterfaceType -eq 'USB' } | ForEach-Object {
    $devices += [PSCustomObject]@{
        DeviceId   = $_.DeviceId
        Name       = $_.Model
        Status     = $_.Status
        VendorId   = $null
        ProductId  = $null
        Serial     = $_.SerialNumber
        Class      = 'DiskDrive'
    }
}
# Win32_PnPEntity - Smart card readers
Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'Smart Card|PCSC|CCID|eToken|ePass|DSC' } | ForEach-Object {
    $devices += [PSCustomObject]@{
        DeviceId   = $_.DeviceId
        Name       = $_.Name
        Status     = if ($_.Status -eq 0) { 'OK' } else { $_.Status }
        VendorId   = if ($_.DeviceId -match 'VID_([0-9A-F]{4})') { $Matches[1] } else { $null }
        ProductId  = if ($_.DeviceId -match 'PID_([0-9A-F]{4})') { $Matches[1] } else { $null }
        Serial     = $null
        Class      = 'SmartCard'
    }
}
if ($devices.Count -gt 0) { $devices | ConvertTo-Json -Compress -Depth 3 }
else { Write-Output "[]" }
`;

  try {
    const out = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '')}"`,
      { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 }
    ).toString().trim();

    if (!out || out === '[]') return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// ── Poll and detect changes ──────────────────────────────────────────────────

function pollDevices() {
  const currentDevices = enumerateUsbDevices();
  const currentIds     = new Set(currentDevices.map(d => d.DeviceId));
  const now            = new Date().toISOString();

  // Detect new devices
  for (const dev of currentDevices) {
    if (!knownDevices.has(dev.DeviceId)) {
      const deviceType = classifyDevice(dev.Name);
      const evt = {
        device_type: deviceType,
        device_name: dev.Name || 'Unknown USB Device',
        vendor_id:   dev.VendorId || null,
        product_id:  dev.ProductId || null,
        serial:      dev.Serial || null,
        event:       'connected',
        timestamp:   now,
      };
      events.push(evt);
      knownDevices.set(dev.DeviceId, {
        ...evt,
        connectedAt: now,
      });
      console.log(`[usb] Device connected: ${dev.Name} (${deviceType})`);
    }
  }

  // Detect removed devices
  for (const [id, info] of knownDevices) {
    if (!currentIds.has(id)) {
      const evt = {
        device_type: info.device_type,
        device_name: info.device_name,
        vendor_id:   info.vendor_id,
        product_id:  info.product_id,
        serial:      info.serial,
        event:       'disconnected',
        timestamp:   now,
      };
      events.push(evt);
      knownDevices.delete(id);
      console.log(`[usb] Device disconnected: ${info.device_name}`);
    }
  }
}

// ── Get pending events (to be sent to backend) ───────────────────────────────

function getPendingEvents() {
  const pending = [...events];
  events.length = 0;  // clear after reading
  return pending;
}

function getAllEvents() {
  return [...events];
}

// ── Public API ───────────────────────────────────────────────────────────────

function start(intervalMs = 10000) {
  if (isRunning) return;
  isRunning = true;
  pollDevices();  // immediate scan
  pollTimer = setInterval(pollDevices, intervalMs);
  console.log('[usb] Monitor started (poll every', intervalMs / 1000, 's)');
}

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  isRunning = false;
  console.log('[usb] Monitor stopped');
}

module.exports = { start, stop, getPendingEvents, getAllEvents };
