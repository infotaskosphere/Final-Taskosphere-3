import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Users, FileText, MessageSquare, Settings, ExternalLink, ChevronRight, Link2, ArrowLeft, SlidersHorizontal, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDark } from '@/hooks/useDark.jsx';
import { useDocumentUploads } from '@/contexts/DocumentUploadContext.jsx';

const COLORS = {
  deepBlue:     '#0D3B66',
  mediumBlue:   '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen:   '#5CCB5F',
};

const GRADIENT = `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`;

const NAV_ITEMS = [
  { path: '/client-portal-manager',                icon: Building2,          label: 'Overview'            },
  { path: '/client-portal-manager/clients',        icon: Users,              label: 'Clients'             },
  { path: '/client-portal-manager/documents',      icon: FileText,           label: 'Documents'           },
  { path: '/client-portal-manager/smart-connect',  icon: Link2,              label: 'Smart Connect'       },
  { path: '/client-portal-manager/messages',       icon: MessageSquare,      label: 'Messages'            },
  { path: '/client-portal-manager/settings',       icon: Settings,           label: 'Client Portal Setting' },
  { path: '/client-portal-manager/advanced-settings', icon: SlidersHorizontal, label: 'Advanced Settings' },
];

const springSnap = { type: 'spring', stiffness: 500, damping: 28 };

/**
 * ClientPortalHeader
 * A branded header strip that appears at the top of all Client Portal Manager pages.
 * Provides sub-navigation, breadcrumb context, and a quick-link to the live portal.
 */
const ClientPortalHeader = ({ title, subtitle, actions }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { isDark } = useDark();
  const { items: uploadItems } = useDocumentUploads();
  const activeUploadCount = uploadItems.filter((i) => i.status === 'queued' || i.status === 'uploading').length;

  return (
    <div className="mb-6 -mx-0">
      {/* ── Banner ──────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden mb-4"
        style={{ background: GRADIENT }}
      >
        {/* decorative circles */}
        <div
          className="absolute -right-10 -top-10 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
        />
        <div
          className="absolute right-24 bottom-0 w-28 h-28 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
        />

        <div className="relative px-6 py-5 flex items-center justify-between gap-4">
          {/* Left: back + icon + text */}
          <div className="flex items-center gap-4 min-w-0">
            <motion.button
              type="button"
              onClick={() => navigate(-1)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springSnap}
              title="Back"
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center flex-shrink-0 shadow-sm border border-white/20 hover:border-white/40 transition-all"
            >
              <ArrowLeft className="h-4 w-4 text-white" />
            </motion.button>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              {/* breadcrumb */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Admin</span>
                <ChevronRight className="h-3 w-3 text-white/30" />
                <span className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Client Portal</span>
              </div>
              <h1 className="text-xl font-bold text-white leading-snug tracking-tight truncate">
                {title || 'Client Portal Manager'}
              </h1>
              {subtitle && (
                <p className="text-white/55 text-sm mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Right: actions + live portal link */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {actions}
            <motion.a
              href="/client-portal"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={springSnap}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-all border border-white/20 hover:border-white/40 shadow-sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Live Portal</span>
            </motion.a>
          </div>
        </div>

        {/* ── Sub-nav inside banner ── */}
        <div
          className="flex items-center gap-1 px-6 pb-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {NAV_ITEMS.map((item) => {
            const Icon     = item.icon;
            const isActive = location.pathname === item.path ||
              (item.path !== '/client-portal-manager' &&
               location.pathname.startsWith(item.path));
            const showUploadBadge = item.path === '/client-portal-manager/documents' && activeUploadCount > 0;

            return (
              <motion.button
                key={item.path}
                onClick={() => navigate(item.path)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={springSnap}
                className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-white text-slate-800 shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/15'
                }`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {item.label}
                {showUploadBadge && (
                  <span
                    title={`${activeUploadCount} file(s) uploading in the background`}
                    className={`ml-0.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-blue-100 text-blue-700' : 'bg-white/20 text-white'
                    }`}
                  >
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> {activeUploadCount}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ClientPortalHeader;
