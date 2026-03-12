/**
 * BiometricMachine.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only page for managing the eSSL / ZKTeco biometric attendance machine.
 *
 * Features:
 *  • Live connection status with auto-refresh
 *  • Device config (IP, port, sync intervals, enable/disable)
 *  • Manual sync triggers (attendance pull, user push, cleanup)
 *  • Live device user list
 *  • Raw attendance log viewer
 *  • Assign / remove machine_employee_id per user
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import {
  Wifi, WifiOff, RefreshCw, Users, Clock, Settings, Trash2,
  CheckCircle2, AlertTriangle, Activity, Server, UserCheck,
  Download, Upload, Shield, Fingerprint, LogIn, LogOut, Zap,
} from 'lucide-react';

// ── Brand colours (matches Attendance.jsx) ────────────────────────────────
const C = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  amber:        '#F59E0B',
  red:          '#EF4444',
  purple:       '#8B5CF6',
  slate50:      '#F8FAFC',
};

const itemV = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const containerV = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDt = (iso) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy, hh:mm a'); } catch { return iso; }
};

const PUNCH_LABEL = { 0: 'Punch In', 1: 'Punch Out', 4: 'OT In', 5: 'OT Out' };

// ══════════════════════════════════════════════════════════════════════════════
// STAT CARD
// ══════════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, color = C.deepBlue, sub }) {
  return (
    <motion.div variants={itemV}>
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ backgroundColor: `${color}18` }}>
            <Icon className="w-6 h-6" style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className="text-2xl font-black tracking-tight" style={{ color }}>{value}</p>
            {sub && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{sub}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function BiometricMachine() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── State ──────────────────────────────────────────────────────────────
  const [status,        setStatus]        = useState(null);
  const [config,        setConfig]        = useState(null);
  const [deviceUsers,   setDeviceUsers]   = useState([]);
  const [deviceLogs,    setDeviceLogs]    = useState([]);
  const [allUsers,      setAllUsers]      = useState([]);
  const [syncResult,    setSyncResult]    = useState(null);
  const [loading,       setLoading]       = useState({});  // keyed by action name
  const [tab,           setTab]           = useState('status');

  // Config form state
  const [cfgForm, setCfgForm] = useState({
    ip: '', port: '4370', password: '', enabled: false,
    sync_interval: '300', user_sync_interval: '600',
  });

  // machine_employee_id assignment form
  const [midForm,    setMidForm]    = useState({});  // { [userId]: inputValue }
  const [midLoading, setMidLoading] = useState({});

  // ── Helpers ────────────────────────────────────────────────────────────
  const setL = (key, val) => setLoading(p => ({ ...p, [key]: val }));

  const showResult = (res) => {
    setSyncResult(res);
    const { pushed = 0, skipped = 0, errors = 0, users_added = 0, users_removed = 0, message } = res;
    if (errors > 0) toast.error(`${errors} errors — ${message}`);
    else toast.success(message || 'Done');
  };

  // ── Fetch functions ────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const r = await api.get('/machine/status');
      setStatus(r.data);
    } catch { /* silently skip — device might be unreachable */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const r = await api.get('/machine/config');
      setConfig(r.data);
      setCfgForm({
        ip:                 r.data.ip            || '192.168.1.201',
        port:               String(r.data.port   || 4370),
        password:           '',
        enabled:            !!r.data.enabled,
        sync_interval:      String(r.data.sync_interval      || 300),
        user_sync_interval: String(r.data.user_sync_interval || 600),
      });
    } catch (e) {
      toast.error('Could not load machine config');
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
      const r = await api.get('/users');
      setAllUsers(Array.isArray(r.data) ? r.data : []);
    } catch {}
  }, []);

  const fetchDeviceUsers = useCallback(async () => {
    setL('deviceUsers', true);
    try {
      const r = await api.get('/machine/users');
      setDeviceUsers(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot connect to device');
    } finally {
      setL('deviceUsers', false);
    }
  }, []);

  const fetchDeviceLogs = useCallback(async () => {
    setL('deviceLogs', true);
    try {
      const r = await api.get('/machine/logs');
      setDeviceLogs(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot connect to device');
    } finally {
      setL('deviceLogs', false);
    }
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    fetchStatus();
    fetchConfig();
    fetchAllUsers();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, fetchStatus, fetchConfig, fetchAllUsers]);

  // ── Sync actions ───────────────────────────────────────────────────────
  const syncAttendance = async () => {
    setL('att', true);
    try {
      const r = await api.post('/machine/sync/attendance');
      showResult(r.data);
      fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sync failed');
    } finally {
      setL('att', false);
    }
  };

  const syncUsers = async () => {
    setL('usr', true);
    try {
      const r = await api.post('/machine/sync/users');
      showResult(r.data);
      fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'User sync failed');
    } finally {
      setL('usr', false);
    }
  };

  const syncCleanup = async () => {
    if (!window.confirm('Remove all deactivated users from the physical device?')) return;
    setL('cleanup', true);
    try {
      const r = await api.post('/machine/sync/cleanup');
      showResult(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cleanup failed');
    } finally {
      setL('cleanup', false);
    }
  };

  const clearDeviceLogs = async () => {
    if (!window.confirm('⚠️ This will permanently delete ALL punch logs stored on the device. Continue?')) return;
    setL('clearLogs', true);
    try {
      await api.delete('/machine/logs');
      toast.success('Device logs cleared');
      setDeviceLogs([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to clear logs');
    } finally {
      setL('clearLogs', false);
    }
  };

  // ── Config save ────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setL('cfg', true);
    try {
      const payload = {
        ip:                 cfgForm.ip.trim(),
        port:               parseInt(cfgForm.port, 10) || 4370,
        enabled:            cfgForm.enabled,
        sync_interval:      parseInt(cfgForm.sync_interval, 10) || 300,
        user_sync_interval: parseInt(cfgForm.user_sync_interval, 10) || 600,
      };
      if (cfgForm.password.trim()) payload.password = cfgForm.password.trim();

      await api.put('/machine/config', payload);
      toast.success('Machine config saved — sync engine reloaded');
      fetchConfig();
      fetchStatus();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save config');
    } finally {
      setL('cfg', false);
    }
  };

  // ── machine_employee_id management ─────────────────────────────────────
  const setMachineId = async (userId) => {
    const val = (midForm[userId] || '').trim();
    if (!val || !/^\d+$/.test(val) || parseInt(val) <= 0) {
      toast.error('Enter a positive integer (e.g. 1, 42)');
      return;
    }
    setMidLoading(p => ({ ...p, [userId]: true }));
    try {
      await api.put(`/users/${userId}/machine-id`, { machine_employee_id: val });
      toast.success(`Machine ID ${val} assigned — will sync within next cycle`);
      fetchAllUsers();
      setMidForm(p => ({ ...p, [userId]: '' }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to assign machine ID');
    } finally {
      setMidLoading(p => ({ ...p, [userId]: false }));
    }
  };

  const removeMachineId = async (userId, name) => {
    if (!window.confirm(`Unlink ${name} from the biometric device? This also removes them from the physical machine.`)) return;
    setMidLoading(p => ({ ...p, [userId]: true }));
    try {
      const r = await api.delete(`/users/${userId}/machine-id`);
      toast.success(r.data.removed_from_device
        ? 'User unlinked and removed from device'
        : 'User unlinked (device unreachable — remove manually)');
      fetchAllUsers();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to unlink');
    } finally {
      setMidLoading(p => ({ ...p, [userId]: false }));
    }
  };

  // ── Guard ─────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-sm shadow-md border-red-100">
          <Shield className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h2 className="text-xl font-bold text-slate-700">Admin Only</h2>
          <p className="text-slate-500 text-sm mt-1">Biometric machine management requires admin access.</p>
        </Card>
      </div>
    );
  }

  const online = status?.connected;

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <motion.div
      className="min-h-screen p-5 md:p-8 lg:p-10"
      style={{ background: `linear-gradient(135deg, ${C.slate50} 0%, #FFFFFF 100%)`, fontFamily: "'DM Sans','Inter',system-ui,sans-serif" }}
      variants={containerV}
      initial="hidden"
      animate="visible"
    >
      {/* ═══ HEADER ═══ */}
      <motion.div variants={itemV} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
               style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
            <Fingerprint className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: C.deepBlue }}>
              Biometric Machine
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-0.5">
              eSSL / ZKTeco · Serial: CGKK212461298
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live status pill */}
          <motion.div
            className="flex items-center gap-2 px-4 py-2 rounded-full border-2 font-bold text-sm"
            style={{
              borderColor:     online ? C.emeraldGreen : C.red,
              backgroundColor: online ? `${C.emeraldGreen}12` : `${C.red}10`,
              color:           online ? C.emeraldGreen : C.red,
            }}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {online ? 'Online' : (status ? 'Offline' : 'Checking…')}
          </motion.div>

          <Button variant="outline" size="sm" className="rounded-xl border-2" onClick={() => { fetchStatus(); fetchConfig(); }}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* ═══ STAT CARDS ═══ */}
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Server}     label="Status"           value={online ? 'Online' : 'Offline'} color={online ? C.emeraldGreen : C.red} sub={`${status?.device_ip || '—'}:${status?.device_port || '—'}`} />
        <StatCard icon={Users}      label="Device Users"     value={status?.total_device_users ?? '—'} color={C.deepBlue}   sub="registered on machine" />
        <StatCard icon={AlertTriangle} label="Unsynced"      value={status?.total_unsynced_users ?? '—'} color={C.amber}    sub="pending push to device" />
        <StatCard icon={Activity}   label="Last Att. Sync"   value={status?.last_attendance_sync ? '✓' : '—'} color={C.purple} sub={fmtDt(status?.last_attendance_sync)} />
      </motion.div>

      {/* ═══ TABS ═══ */}
      <motion.div variants={itemV}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 bg-white border shadow-sm rounded-2xl p-1 flex-wrap h-auto gap-1">
            {[
              { val: 'status',  label: 'Status & Sync',   icon: Activity  },
              { val: 'config',  label: 'Configuration',   icon: Settings  },
              { val: 'users',   label: 'Device Users',    icon: Users     },
              { val: 'logs',    label: 'Device Logs',     icon: Clock     },
              { val: 'assign',  label: 'Assign IDs',      icon: UserCheck },
            ].map(t => (
              <TabsTrigger key={t.val} value={t.val} className="rounded-xl font-bold flex items-center gap-1.5 px-4 py-2">
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ─── STATUS & SYNC ─── */}
          <TabsContent value="status">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sync actions */}
              <Card className="border-0 shadow-md">
                <CardHeader className="border-b pb-4">
                  <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                    <Zap className="w-5 h-5" /> Manual Sync Controls
                  </CardTitle>
                  <CardDescription>Trigger sync cycles immediately without waiting for the automatic interval.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {[
                    {
                      key: 'att', icon: Download, label: 'Pull Attendance Logs',
                      desc: 'Fetch punch records from device → save to Taskosphere attendance',
                      color: C.deepBlue, action: syncAttendance,
                    },
                    {
                      key: 'usr', icon: Upload, label: 'Push Users to Device',
                      desc: 'Register all unsynced Taskosphere users on the physical machine',
                      color: C.emeraldGreen, action: syncUsers,
                    },
                    {
                      key: 'cleanup', icon: Trash2, label: 'Remove Deactivated Users',
                      desc: 'Delete users from device who are no longer active in Taskosphere',
                      color: C.amber, action: syncCleanup,
                    },
                  ].map(({ key, icon: Icon, label, desc, color, action }) => (
                    <div key={key} className="flex items-center justify-between p-4 rounded-xl border-2"
                         style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                             style={{ backgroundColor: `${color}20` }}>
                          <Icon className="w-5 h-5" style={{ color }} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{label}</p>
                          <p className="text-xs text-slate-500">{desc}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={loading[key]}
                        onClick={action}
                        className="ml-4 rounded-xl font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {loading[key] ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Run'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Sync result + device info */}
              <div className="space-y-6">
                <Card className="border-0 shadow-md">
                  <CardHeader className="border-b pb-4">
                    <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                      <Server className="w-5 h-5" /> Device Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-3 text-sm">
                    {[
                      ['IP Address',        status?.device_ip || config?.ip || '—'],
                      ['Port',              status?.device_port || config?.port || '—'],
                      ['Sync Enabled',      status?.enabled ? '✓ Yes' : '✗ No'],
                      ['Last Att. Sync',    fmtDt(status?.last_attendance_sync)],
                      ['Last User Sync',    fmtDt(status?.last_user_sync)],
                      ['Users on Device',   status?.total_device_users ?? '—'],
                      ['Unsynced Users',    status?.total_unsynced_users ?? '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                        <span className="text-slate-500 font-medium">{k}</span>
                        <span className="font-bold text-slate-800">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <AnimatePresence>
                  {syncResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      <Card className="border-2 shadow-md" style={{ borderColor: syncResult.errors > 0 ? C.red : C.emeraldGreen }}>
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-3">
                            {syncResult.errors > 0
                              ? <AlertTriangle className="w-5 h-5" style={{ color: C.red }} />
                              : <CheckCircle2 className="w-5 h-5" style={{ color: C.emeraldGreen }} />}
                            <span className="font-bold text-slate-800">Last Sync Result</span>
                            <button className="ml-auto text-slate-400 hover:text-slate-600 text-lg leading-none"
                                    onClick={() => setSyncResult(null)}>×</button>
                          </div>
                          <p className="text-sm font-medium text-slate-700 mb-3">{syncResult.message}</p>
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            {[
                              ['Pushed', syncResult.pushed, C.emeraldGreen],
                              ['Skipped', syncResult.skipped, C.amber],
                              ['Errors', syncResult.errors, C.red],
                            ].map(([lbl, val, clr]) => (
                              <div key={lbl} className="p-2 rounded-lg" style={{ backgroundColor: `${clr}12` }}>
                                <p className="text-lg font-black" style={{ color: clr }}>{val}</p>
                                <p className="text-slate-500">{lbl}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </TabsContent>

          {/* ─── CONFIG ─── */}
          <TabsContent value="config">
            <Card className="border-0 shadow-md max-w-2xl">
              <CardHeader className="border-b pb-4">
                <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                  <Settings className="w-5 h-5" /> Machine Configuration
                </CardTitle>
                <CardDescription>Changes take effect immediately — the sync engine reloads automatically.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Enable / disable toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border-2"
                     style={{ borderColor: cfgForm.enabled ? `${C.emeraldGreen}40` : C.slate50 }}>
                  <div>
                    <p className="font-bold text-slate-800">Enable Biometric Sync</p>
                    <p className="text-xs text-slate-500 mt-0.5">Master switch — turns on/off all automatic sync cycles</p>
                  </div>
                  <Switch
                    checked={cfgForm.enabled}
                    onCheckedChange={v => setCfgForm(p => ({ ...p, enabled: v }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Device IP Address</Label>
                    <Input
                      value={cfgForm.ip}
                      onChange={e => setCfgForm(p => ({ ...p, ip: e.target.value }))}
                      placeholder="192.168.1.201"
                      className="rounded-xl font-mono"
                    />
                    <p className="text-[11px] text-slate-400">Must be reachable on your LAN</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">TCP Port</Label>
                    <Input
                      type="number"
                      value={cfgForm.port}
                      onChange={e => setCfgForm(p => ({ ...p, port: e.target.value }))}
                      placeholder="4370"
                      className="rounded-xl font-mono"
                    />
                    <p className="text-[11px] text-slate-400">Default: 4370 (ZKTeco standard)</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Device Password</Label>
                    <Input
                      type="password"
                      value={cfgForm.password}
                      onChange={e => setCfgForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Leave blank to keep current"
                      className="rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400">Usually blank unless you set one on the machine</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Attendance Sync Interval (sec)</Label>
                    <Input
                      type="number"
                      value={cfgForm.sync_interval}
                      onChange={e => setCfgForm(p => ({ ...p, sync_interval: e.target.value }))}
                      placeholder="300"
                      className="rounded-xl font-mono"
                    />
                    <p className="text-[11px] text-slate-400">How often to pull punch logs (300 = 5 min)</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">User Sync Interval (sec)</Label>
                    <Input
                      type="number"
                      value={cfgForm.user_sync_interval}
                      onChange={e => setCfgForm(p => ({ ...p, user_sync_interval: e.target.value }))}
                      placeholder="600"
                      className="rounded-xl font-mono"
                    />
                    <p className="text-[11px] text-slate-400">How often to push new users to device (600 = 10 min)</p>
                  </div>
                </div>

                <Button
                  onClick={saveConfig}
                  disabled={loading.cfg}
                  className="w-full h-12 rounded-xl font-bold text-white text-base shadow-lg"
                  style={{ backgroundColor: C.deepBlue }}
                >
                  {loading.cfg ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                  {loading.cfg ? 'Saving…' : 'Save Configuration'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── DEVICE USERS ─── */}
          <TabsContent value="users">
            <Card className="border-0 shadow-md">
              <CardHeader className="border-b pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                    <Users className="w-5 h-5" /> Users on Device
                  </CardTitle>
                  <CardDescription>Live read from the physical biometric machine.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl border-2"
                        onClick={fetchDeviceUsers} disabled={loading.deviceUsers}>
                  {loading.deviceUsers
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <><RefreshCw className="w-4 h-4 mr-1.5" />Load</>}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {deviceUsers.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Click "Load" to fetch users from the device</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">UID</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Name on Device</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Privilege</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs tracking-wider">Linked To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deviceUsers.map((du, i) => {
                          const linked = allUsers.find(u => String(u.machine_employee_id) === String(du.uid));
                          return (
                            <tr key={du.uid} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                              <td className="px-5 py-3 font-mono font-bold text-slate-700">{du.uid}</td>
                              <td className="px-5 py-3 font-medium text-slate-800">{du.name || '—'}</td>
                              <td className="px-5 py-3">
                                <Badge className={du.privilege === 0 ? 'bg-slate-100 text-slate-600' : 'bg-purple-100 text-purple-700'}>
                                  {du.privilege === 0 ? 'User' : du.privilege === 14 ? 'Admin' : `Priv ${du.privilege}`}
                                </Badge>
                              </td>
                              <td className="px-5 py-3">
                                {linked
                                  ? <span className="text-emerald-700 font-bold text-xs">{linked.full_name}</span>
                                  : <span className="text-red-400 text-xs font-medium">Not linked</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── DEVICE LOGS ─── */}
          <TabsContent value="logs">
            <Card className="border-0 shadow-md">
              <CardHeader className="border-b pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                    <Clock className="w-5 h-5" /> Raw Attendance Logs on Device
                  </CardTitle>
                  <CardDescription>Unsynced punch records stored in device memory.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl border-2"
                          onClick={fetchDeviceLogs} disabled={loading.deviceLogs}>
                    {loading.deviceLogs
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <><RefreshCw className="w-4 h-4 mr-1.5" />Load</>}
                  </Button>
                  {deviceLogs.length > 0 && (
                    <Button variant="outline" size="sm"
                            className="rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50"
                            onClick={clearDeviceLogs} disabled={loading.clearLogs}>
                      <Trash2 className="w-4 h-4 mr-1.5" />
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {deviceLogs.length === 0 ? (
                  <div className="py-16 text-center text-slate-400">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Click "Load" to read raw logs from device</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50 border-b">
                        <tr>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs">Machine UID</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs">Timestamp (IST)</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs">Punch Type</th>
                          <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase text-xs">Linked User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deviceLogs.map((log, i) => {
                          const linked = allUsers.find(u => String(u.machine_employee_id) === String(log.user_id));
                          const isIn   = log.punch_type === 0 || log.punch_type === 4;
                          return (
                            <tr key={i} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/50'}`}>
                              <td className="px-5 py-3 font-mono font-bold">{log.user_id}</td>
                              <td className="px-5 py-3 font-mono text-slate-700">
                                {fmtDt(typeof log.timestamp === 'string' ? log.timestamp : new Date(log.timestamp).toISOString())}
                              </td>
                              <td className="px-5 py-3">
                                <Badge className={`font-bold text-xs flex items-center gap-1 w-fit ${isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                                  {PUNCH_LABEL[log.punch_type] || `Type ${log.punch_type}`}
                                </Badge>
                              </td>
                              <td className="px-5 py-3 text-xs">
                                {linked
                                  ? <span className="text-emerald-700 font-bold">{linked.full_name}</span>
                                  : <span className="text-red-400">Unmapped UID</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ASSIGN MACHINE IDs ─── */}
          <TabsContent value="assign">
            <Card className="border-0 shadow-md">
              <CardHeader className="border-b pb-4">
                <CardTitle style={{ color: C.deepBlue }} className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5" /> Assign Machine Employee IDs
                </CardTitle>
                <CardDescription>
                  Each employee needs a unique numeric ID that matches their UID on the biometric device.
                  Once assigned, they will be automatically pushed to the machine within the next sync cycle.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {allUsers.filter(u => u.role !== 'admin' || u.machine_employee_id).map(u => {
                    const hasMid = !!u.machine_employee_id;
                    return (
                      <motion.div
                        key={u.id}
                        variants={itemV}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border-2 transition-colors"
                        style={{ borderColor: hasMid ? `${C.emeraldGreen}35` : '#E2E8F0', backgroundColor: hasMid ? `${C.emeraldGreen}05` : 'white' }}
                      >
                        {/* Avatar + name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden bg-slate-200">
                            {u.profile_picture
                              ? <img src={u.profile_picture} alt={u.full_name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
                                     style={{ background: `linear-gradient(135deg, ${C.deepBlue}, ${C.mediumBlue})` }}>
                                  {u.full_name?.charAt(0)}
                                </div>}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 truncate">{u.full_name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge className="text-[10px] capitalize bg-slate-100 text-slate-600">{u.role}</Badge>
                              {hasMid && (
                                <>
                                  <Badge className="text-[10px] font-mono" style={{ backgroundColor: `${C.emeraldGreen}20`, color: C.emeraldGreen }}>
                                    ID: {u.machine_employee_id}
                                  </Badge>
                                  {u.machine_synced
                                    ? <Badge className="text-[10px] bg-blue-100 text-blue-700">✓ Synced</Badge>
                                    : <Badge className="text-[10px] bg-amber-100 text-amber-700">⏳ Pending sync</Badge>}
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Input / remove */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {hasMid ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs"
                              disabled={midLoading[u.id]}
                              onClick={() => removeMachineId(u.id, u.full_name)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Unlink
                            </Button>
                          ) : (
                            <>
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g. 42"
                                value={midForm[u.id] || ''}
                                onChange={e => setMidForm(p => ({ ...p, [u.id]: e.target.value }))}
                                className="w-24 rounded-xl font-mono text-center text-sm h-9"
                                onKeyDown={e => e.key === 'Enter' && setMachineId(u.id)}
                              />
                              <Button
                                size="sm"
                                className="rounded-xl font-bold text-white h-9"
                                style={{ backgroundColor: C.deepBlue }}
                                disabled={midLoading[u.id] || !midForm[u.id]}
                                onClick={() => setMachineId(u.id)}
                              >
                                {midLoading[u.id] ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Assign'}
                              </Button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {allUsers.filter(u => u.role !== 'admin' || u.machine_employee_id).length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>No staff users found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
