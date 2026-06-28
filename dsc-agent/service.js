'use strict';

/**
 * service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Windows Service/Scheduled Task management for Taskosphere Agent.
 *
 * Uses PowerShell Scheduled Tasks (works with bundled .exe, no native deps).
 * The task automatically starts with Windows and restarts the agent if it crashes.
 *
 * Usage:
 *   TaskosphereAgent.exe --install-service   — Install auto-start
 *   TaskosphereAgent.exe --uninstall-service — Remove auto-start
 *   TaskosphereAgent.exe --service-status    — Check status
 *
 * Or standalone:
 *   node service.js install
 *   node service.js remove
 *   node service.js start
 *   node service.js stop
 *   node service.js status
 */

const { execSync } = require('child_process');
const path = require('path');
const os   = require('os');

// ── Configuration ────────────────────────────────────────────────────────────

const TASK_NAME = 'TaskosphereAgent';
const TASK_DESC = 'Taskosphere Enterprise Desktop Agent — monitors activity, DSC tokens, USB devices, and syncs with the Taskosphere backend.';

// Determine the executable path
// When bundled with pkg, process.execPath is the .exe itself
// When running with node, we use the full path to agent.js
const exePath = process.execPath;
const isBundled = process.pkg !== undefined;

function getExePath() {
  if (isBundled) {
    return exePath;
  }
  // Running via node — point to agent.js
  return `"${process.execPath}" "${path.join(__dirname, 'agent.js')}"`;
}

function getWorkDir() {
  return __dirname;
}

// ── PowerShell Scheduled Task Commands ───────────────────────────────────────

function installService() {
  const exe = getExePath();
  const workDir = getWorkDir();

  console.log('[service] Installing Taskosphere Agent auto-start...');
  console.log(`[service] Executable: ${exe}`);
  console.log(`[service] Working dir: ${workDir}`);

  const ps = `
$taskName = '${TASK_NAME}'
$exePath = '${exe.replace(/'/g, "''")}'
$workDir = '${workDir.replace(/'/g, "''")}'

# Remove existing task if any
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create action — run the agent executable
$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $workDir

# Trigger — at user logon
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings — restart on failure, no time limit
$settings = New-ScheduledTaskSettingsSet \`
  -AllowStartIfOnBatteries \`
  -DontStopIfGoingOnBatteries \`
  -StartWhenAvailable \`
  -RestartCount 10 \`
  -RestartInterval (New-TimeSpan -Minutes 1) \`
  -ExecutionTimeLimit 0 \`
  -MultipleInstances IgnoreNew

# Principal — run as current user, hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Limited -LogonType Interactive

# Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description '${TASK_DESC}' -Force

# Start immediately
Start-ScheduledTask -TaskName $taskName

Write-Output 'OK'
`;

  try {
    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
      { timeout: 30000, windowsHide: true }
    ).toString().trim();

    if (result.includes('OK')) {
      console.log('[service] ✓ Auto-start installed successfully');
      console.log('[service] Agent will start automatically with Windows');
      return true;
    } else {
      console.log('[service] Result:', result);
      return false;
    }
  } catch (e) {
    console.error('[service] Install failed:', e.message);
    console.log('[service] Try running as Administrator');
    return false;
  }
}

function removeService() {
  console.log('[service] Removing Taskosphere Agent auto-start...');

  const ps = `
Stop-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue
Write-Output 'OK'
`;

  try {
    execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
      { timeout: 15000, windowsHide: true }
    );
    console.log('[service] ✓ Auto-start removed');
    return true;
  } catch (e) {
    console.error('[service] Remove failed:', e.message);
    return false;
  }
}

function startService() {
  console.log('[service] Starting Taskosphere Agent...');

  try {
    execSync(
      `powershell -NoProfile -Command "Start-ScheduledTask -TaskName '${TASK_NAME}'"`,
      { timeout: 10000, windowsHide: true }
    );
    console.log('[service] ✓ Agent started');
    return true;
  } catch (e) {
    console.error('[service] Start failed:', e.message);
    return false;
  }
}

function stopService() {
  console.log('[service] Stopping Taskosphere Agent...');

  try {
    execSync(
      `powershell -NoProfile -Command "Stop-ScheduledTask -TaskName '${TASK_NAME}'"`,
      { timeout: 10000, windowsHide: true }
    );
    // Also kill any running agent process
    try {
      execSync('taskkill /f /im TaskosphereAgent.exe', { stdio: 'ignore' });
    } catch {}
    console.log('[service] ✓ Agent stopped');
    return true;
  } catch (e) {
    console.error('[service] Stop failed:', e.message);
    return false;
  }
}

function statusService() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-ScheduledTask -TaskName '${TASK_NAME}' | Select-Object TaskName, State | Format-Table -AutoSize"`,
      { timeout: 10000, windowsHide: true }
    ).toString().trim();
    console.log(out || 'Task not found');
    return out;
  } catch {
    console.log('[service] Task not installed');
    return null;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd  = (args[0] || '').toLowerCase();

  // Support both --flag and positional syntax
  if (cmd === 'install' || cmd === '--install-service') {
    installService();
  } else if (cmd === 'remove' || cmd === 'uninstall' || cmd === '--uninstall-service') {
    removeService();
  } else if (cmd === 'start') {
    startService();
  } else if (cmd === 'stop') {
    stopService();
  } else if (cmd === 'status' || cmd === '--service-status') {
    statusService();
  } else if (cmd === 'restart') {
    stopService();
    setTimeout(() => startService(), 2000);
  } else {
    console.log('Taskosphere Agent — Service Manager');
    console.log('');
    console.log('Usage:');
    console.log('  TaskosphereAgent.exe --install-service    Install auto-start');
    console.log('  TaskosphereAgent.exe --uninstall-service  Remove auto-start');
    console.log('  TaskosphereAgent.exe --service-status     Check status');
    console.log('');
    console.log('Or:');
    console.log('  node service.js install');
    console.log('  node service.js remove');
    console.log('  node service.js start');
    console.log('  node service.js stop');
    console.log('  node service.js status');
  }
}

main();

module.exports = { installService, removeService, startService, stopService, statusService };
