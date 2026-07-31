import React from 'react';
import { Users, ShieldCheck, Activity, Settings, Database, Fingerprint, ScrollText } from 'lucide-react';
import useDark from '@/hooks/useDark';
import { HubBanner, LinkCard, HUB_COLORS } from '@/components/SectionHub.jsx';

const LINKS = [
  { path: '/users', icon: Users, label: 'Users', description: 'Every user account in the organization.', color: HUB_COLORS.mediumBlue },
  { path: '/permission-matrix', icon: ShieldCheck, label: 'Permission Matrix', description: 'Module → Page → Action access, per user.', color: HUB_COLORS.emeraldGreen },
  { path: '/task-audit', icon: ScrollText, label: 'Audit Logs', description: 'Who changed what, and when.', color: '#F59E0B' },
  { path: '/settings/general', icon: Settings, label: 'Settings', description: 'Organization-wide configuration.', color: HUB_COLORS.deepBlue },
  { path: '/master-data', icon: Database, label: 'Master Data', description: 'Departments, categories and shared lookups.', color: '#7C3AED' },
  { path: '/roles', icon: Fingerprint, label: 'Roles', description: 'Custom role definitions.', color: '#DB2777' },
  { path: '/staff-activity', icon: Activity, label: 'Activity Logs', description: 'Live staff activity feed.', color: HUB_COLORS.lightGreen },
];

export default function AdminDashboard() {
  const isDark = useDark();
  return (
    <div className="p-6 space-y-6">
      <HubBanner
        icon={ShieldCheck}
        eyebrow="Admin"
        title="Admin"
        subtitle="Users, permissions, audit trail and system-wide settings."
        isDark={isDark}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LINKS.map((l) => (
          <LinkCard key={l.path} {...l} isDark={isDark} />
        ))}
      </div>
    </div>
  );
}
