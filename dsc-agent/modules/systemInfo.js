'use strict';

/**
 * systemInfo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Collects system information on Windows.
 *
 * Returns:
 *   - Machine name, hostname, platform
 *   - OS version
 *   - CPU model
 *   - RAM total
 *   - Disk total/free
 *   - IP address, MAC address
 *   - Agent version
 */

const os   = require('os');
const { execSync } = require('child_process');

function getSystemInfo(agentVersion = '1.0.0') {
  const info = {
    agent_version: agentVersion,
    hostname:       os.hostname(),
    machine_name:   os.hostname(),
    platform:       process.platform,
    arch:           os.arch(),
    os_version:     getOsVersion(),
    cpu:            os.cpus()[0]?.model || 'Unknown',
    cpu_cores:      os.cpus().length,
    ram_total_mb:   Math.round(os.totalmem() / 1024 / 1024),
    ram_free_mb:    Math.round(os.freemem() / 1024 / 1024),
    disk_total_gb:  null,
    disk_free_gb:   null,
    ip_address:     getIpAddress(),
    mac_address:    getMacAddress(),
    node_version:   process.version,
    uptime_seconds: Math.round(os.uptime()),
  };

  // Disk info (Windows only)
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used, Free | ConvertTo-Json -Compress"',
        { timeout: 5000, windowsHide: true }
      ).toString().trim();
      const d = JSON.parse(out);
      info.disk_total_gb = +((d.Used + d.Free) / 1073741824).toFixed(1);
      info.disk_free_gb  = +(d.Free / 1073741824).toFixed(1);
    }
  } catch {}

  return info;
}

function getOsVersion() {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).Caption + \' \' + (Get-CimInstance Win32_OperatingSystem).Version"',
        { timeout: 5000, windowsHide: true }
      ).toString().trim();
      return out;
    }
  } catch {}
  return `${os.type()} ${os.release()}`;
}

function getIpAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function getMacAddress() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        return net.mac;
      }
    }
  }
  return null;
}

module.exports = { getSystemInfo };
