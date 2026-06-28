'use strict';

/**
 * service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Windows Service wrapper for Taskosphere Agent.
 *
 * Uses node-windows to register the agent as a Windows service.
 * The service automatically starts with Windows and restarts the agent
 * if it crashes.
 *
 * Usage:
 *   node service.js install   — Install the service
 *   node service.js remove    — Remove the service
 *   node service.js start     — Start the service
 *   node service.js stop      — Stop the service
 *   node service.js status    — Check service status
 */

const path = require('path');
const fs   = require('fs');

// ── Check if node-windows is available ───────────────────────────────────────

let Service, ServiceEvent;
try {
  const nw = require('node-windows');
  Service      = nw.Service;
  ServiceEvent = nw.ServiceEvent;
} catch (e) {
  console.log('node-windows not installed. Run: npm install node-windows');
  console.log('Falling back to PowerShell service management...');

  // Fallback: Use PowerShell to create a scheduled task instead
  handlePowerShellFallback();
  process.exit(0);
}

// ── Service configuration ────────────────────────────────────────────────────

const svc = new Service({
  name: 'Taskosphere Agent',
  description: 'Taskosphere Enterprise Desktop Agent — monitors activity, DSC tokens, USB devices, and syncs with the Taskosphere backend.',
  script: path.join(__dirname, 'agent.js'),
  nodeOptions: ['--harmony', '--max_old_space_size=256'],
  workingDirectory: __dirname,
  allowServiceLogon: true,
  scheduled: true,
  restartOnFailure: true,
  maxRetries: 10,
  maxRestarts: 10,
  wait: 2,   // seconds between restarts
  grow: 0.25, // grow wait time by 25% each retry
});

// ── Event handlers ───────────────────────────────────────────────────────────

svc.on('install', () => {
  console.log('[service] Taskosphere Agent service installed successfully');
  console.log('[service] Starting service...');
  svc.start();
});

svc.on('uninstall', () => {
  console.log('[service] Taskosphere Agent service uninstalled');
});

svc.on('start', () => {
  console.log('[service] Taskosphere Agent service started');
});

svc.on('stop', () => {
  console.log('[service] Taskosphere Agent service stopped');
});

svc.on('error', (err) => {
  console.error('[service] Error:', err);
});

svc.on(ServiceEvent.ERROR, (err) => {
  console.error('[service] Service error:', err);
});

svc.on(ServiceEvent.ALREADY_INSTALLED, () => {
  console.log('[service] Service already installed');
});

// ── CLI ──────────────────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'install':
    if (svc.exists) {
      console.log('[service] Service already exists. Removing first...');
      svc.on('uninstall', () => svc.install());
      svc.uninstall();
    } else {
      svc.install();
    }
    break;

  case 'remove':
  case 'uninstall':
    svc.stop();
    setTimeout(() => svc.uninstall(), 2000);
    break;

  case 'start':
    svc.start();
    break;

  case 'stop':
    svc.stop();
    break;

  case 'restart':
    svc.restart();
    break;

  case 'status':
    console.log('[service] Running:', svc.exists ? 'installed' : 'not installed');
    break;

  default:
    console.log('Usage: node service.js [install|remove|start|stop|restart|status]');
    break;
}

// ── PowerShell Fallback (when node-windows unavailable) ──────────────────────

function handlePowerShellFallback() {
  const { execSync } = require('child_process');
  const command = process.argv[2];

  const taskName = 'TaskosphereAgent';
  const agentScript = path.join(__dirname, 'agent.js');
  const nodeExe = process.execPath;

  switch (command) {
    case 'install': {
      // Create a scheduled task that runs at logon
      const ps = `
$action = New-ScheduledTaskAction -Execute '${nodeExe}' -Argument '"${agentScript}"' -WorkingDirectory '${__dirname}'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit 0
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Limited
Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Taskosphere Enterprise Desktop Agent' -Force
Write-Output 'Service installed as scheduled task: ${taskName}'
`;
      try {
        execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, {
          windowsHide: true,
        });
        console.log('[service] Task scheduled: starts at logon, restarts on failure');
      } catch (e) {
        console.error('[service] Failed to create scheduled task:', e.message);
        console.log('[service] Run as Administrator for best results');
      }
      break;
    }

    case 'remove': {
      const ps = `Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false`;
      try {
        execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true });
        console.log('[service] Scheduled task removed');
      } catch (e) {
        console.error('[service] Failed to remove:', e.message);
      }
      break;
    }

    case 'start': {
      const ps = `Start-ScheduledTask -TaskName '${taskName}'`;
      try {
        execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true });
        console.log('[service] Task started');
      } catch (e) {
        console.error('[service] Failed to start:', e.message);
      }
      break;
    }

    case 'stop': {
      const ps = `Stop-ScheduledTask -TaskName '${taskName}'`;
      try {
        execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true });
        console.log('[service] Task stopped');
      } catch (e) {
        console.error('[service] Failed to stop:', e.message);
      }
      break;
    }

    case 'status': {
      const ps = `Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue | Select-Object TaskName, State | Format-Table -AutoSize`;
      try {
        const out = execSync(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true }).toString();
        console.log(out || 'Task not found');
      } catch {
        console.log('[service] Task not found');
      }
      break;
    }

    default:
      console.log('Usage: node service.js [install|remove|start|stop|status]');
      console.log('Note: Run as Administrator for service management');
      break;
  }
}
