// ── ClientPortalDashboard.jsx ─────────────────────────────────────────────
// Enhanced with:
//   • Messages tab (client receives messages from admin — DSC, compliance, etc.)
//   • Unread message badge on tab
//   • Section significance tooltips (Documents, Tasks, Invoices, Compliance)
//   • Mark-as-read on expand
// ─────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// Always resolve to the absolute backend URL — same logic as api.js and ClientPortalLogin.jsx
let _raw = import.meta?.env?.VITE_API_URL || "https://final-taskosphere-backend.onrender.com";
_raw = _raw.replace(/\/+$/, "");
if (!_raw.endsWith("/api")) _raw += "/api";
const API_BASE = _raw;

function portalApi() {
  const token = sessionStorage.getItem("client_portal_token");
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
};

const STATUS_COLOR = {
  completed:    "bg-green-100 text-green-700",
  done:         "bg-green-100 text-green-700",
  pending:      "bg-yellow-100 text-yellow-700",
  "in-progress":"bg-blue-100 text-blue-700",
  overdue:      "bg-red-100 text-red-700",
  filed:        "bg-green-100 text-green-700",
  paid:         "bg-green-100 text-green-700",
  unpaid:       "bg-red-100 text-red-700",
  draft:        "bg-gray-100 text-gray-600",
};

function Badge({ status }) {
  const cls = STATUS_COLOR[status?.toLowerCase()] || "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status || "—"}
    </span>
  );
}

const DRIVE_ICONS = {
  "application/vnd.google-apps.folder":       { icon: "📁", color: "text-yellow-500" },
  "application/vnd.google-apps.document":     { icon: "📄", color: "text-blue-500" },
  "application/vnd.google-apps.spreadsheet":  { icon: "📊", color: "text-green-500" },
  "application/vnd.google-apps.presentation": { icon: "📽️", color: "text-orange-500" },
  "application/vnd.google-apps.form":         { icon: "📝", color: "text-purple-500" },
  "application/pdf":                          { icon: "📑", color: "text-red-500" },
  "image/jpeg":                               { icon: "🖼️", color: "text-pink-500" },
  "image/png":                                { icon: "🖼️", color: "text-pink-500" },
};
const driveIcon = (mime) => DRIVE_ICONS[mime] || { icon: "📎", color: "text-gray-500" };

const fmtSize = (bytes) => {
  if (!bytes) return "";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

// ── Backend-proxied URL builder ───────────────────────────────────────────
// All file access goes through our backend's authenticated Drive proxy so that
// clients never need their own Google account. Direct Drive links return 403
// ("Request access") for any non-owner Google account.
function getProxyDownloadUrl(file) {
  const token = sessionStorage.getItem("client_portal_token");
  return `${API_BASE}/client-portal/drive/download?file_id=${encodeURIComponent(file.id)}&token=${encodeURIComponent(token)}`;
}

// ── Share Link Button ─────────────────────────────────────────────────────
// Copies the backend proxy URL (authenticated download link) to clipboard.
// For folders: copies a deep-link URL back into the portal itself (no Google login needed).
// For files: copies the backend proxy download URL so anyone with the portal token can access it.
function ShareBtn({ file }) {
  const [copied, setCopied] = useState(false);

  const getShareUrl = () => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      // Share a portal deep-link — routes through the portal, no Google login needed
      const base = window.location.origin + window.location.pathname.replace(/\/dash.*/, "/dashboard");
      return `${base}?folder=${file.id}`;
    }
    // Share the backend proxy download URL — works without a Google account
    return getProxyDownloadUrl(file);
  };

  const handleShare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: open the file directly if clipboard fails
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      onClick={handleShare}
      title={copied ? "Link copied!" : "Copy shareable link"}
      className={`flex-shrink-0 p-1.5 rounded-lg transition opacity-0 group-hover:opacity-100 ${
        copied
          ? "text-green-600 bg-green-50"
          : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"
      }`}
    >
      {copied ? (
        // Checkmark icon
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        // Link/share icon
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )}
    </button>
  );
}

function DownloadBtn({ file }) {
  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
  if (isFolder) return null;

  const handleDownload = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Use backend proxy — direct Drive URLs return 403 for non-owner Google accounts
    window.open(getProxyDownloadUrl(file), "_blank", "noopener,noreferrer");
  };

  return (
    <button
      onClick={handleDownload}
      title="Download file"
      className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition opacity-0 group-hover:opacity-100"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
      </svg>
    </button>
  );
}

// ── Section significance descriptions ────────────────────────────────────
const SECTION_SIGNIFICANCE = {
  "Tasks": "Shows all active tasks assigned to you by our team — including pending actions, document submissions, approvals, and follow-ups you need to be aware of.",
  "Documents": "Contains all your important documents tracked by our firm — such as registration certificates, PAN, DSC expiry, licenses, and compliance-related documents with their status and expiry dates.",
  "Invoices": "All fee invoices raised by our firm for professional services rendered. You can view invoice amounts, dates, payment status, and outstanding balances.",
  "Compliance": "Tracks all statutory compliance filings applicable to you — GST returns, ITR, ROC filings, TDS, etc. — with due dates and filing status so you never miss a deadline.",
  "My Drive": "Securely access files and folders shared with you by our team — reports, workings, certificates, correspondence, and other documents stored in your dedicated Drive folder.",
  "Messages": "Direct messages from our team — important alerts such as DSC expiry notices, compliance reminders, invoice communications, and any other updates regarding your account.",
};

function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="ml-1 w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center hover:bg-blue-100 hover:text-blue-600 transition"
        title="What is this?"
      >i</button>
      {show && (
        <div className="absolute z-50 left-5 top-0 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-xl leading-relaxed pointer-events-none">
          {text}
          <div className="absolute left-[-5px] top-3 w-2.5 h-2.5 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children, count }) {
  const significance = SECTION_SIGNIFICANCE[title];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {count !== undefined && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
          {significance && <InfoTooltip text={significance} />}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Empty({ message }) {
  return <div className="text-center py-8 text-gray-400 text-sm">{message}</div>;
}

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="flex items-center gap-1 text-sm mb-4 flex-wrap">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.id}>
          {i > 0 && <span className="text-gray-300 mx-1">/</span>}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate(i)}
              className="text-blue-600 hover:underline font-medium truncate max-w-[180px]"
            >
              {c.name}
            </button>
          ) : (
            <span className="text-gray-700 font-semibold truncate max-w-[220px]">{c.name}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function DriveTab({ user }) {
  const [driveData, setDriveData] = useState({ files: [], folders: [], breadcrumb: [] });
  // Local breadcrumb stack: array of { id, name } representing current navigation path
  const [crumbStack, setCrumbStack] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // fetchFolder: folderId = null means root.
  // parentFolderId = the folder we navigated FROM (needed by backend security check).
  // newCrumbStack = the breadcrumb stack to save after this fetch succeeds.
  const fetchFolder = useCallback(async (folderId, newCrumbStack) => {
    setLoading(true);
    setError("");
    const api = portalApi();
    try {
      const params = {};
      if (folderId) {
        params.folder_id = folderId;
        // Send the parent (second-to-last in the stack) for security validation
        if (newCrumbStack && newCrumbStack.length >= 2) {
          params.parent_folder_id = newCrumbStack[newCrumbStack.length - 2].id;
        }
        // Send existing breadcrumb so backend can rebuild it
        const existingCrumbs = newCrumbStack ? newCrumbStack.slice(0, -1) : [];
        if (existingCrumbs.length > 0) {
          params.breadcrumb_json = JSON.stringify(existingCrumbs);
        }
      }
      const res = await api.get("/client-portal/drive/files", { params });
      setDriveData(res.data);
      // Use the breadcrumb returned by backend (authoritative), or fall back to local stack
      if (res.data.breadcrumb && res.data.breadcrumb.length > 0) {
        setCrumbStack(res.data.breadcrumb);
      } else if (newCrumbStack) {
        setCrumbStack(newCrumbStack);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load Drive files.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: root folder
  useEffect(() => { fetchFolder(null, []); }, [fetchFolder]);

  // Navigate INTO a subfolder
  const navigateToFolder = (folder) => {
    const newStack = [...crumbStack, { id: folder.id, name: folder.name }];
    fetchFolder(folder.id, newStack);
  };

  // Navigate via breadcrumb — crumbIndex is the index in crumbStack to go back to
  const navigateToBreadcrumb = (crumbIndex) => {
    if (crumbIndex === 0) {
      // Go to root
      setCrumbStack([]);
      fetchFolder(null, []);
    } else {
      const newStack = crumbStack.slice(0, crumbIndex + 1);
      const targetId = newStack[newStack.length - 1].id;
      fetchFolder(targetId, newStack);
    }
  };

  const totalItems = (driveData.folders?.length || 0) + (driveData.files?.length || 0);

  return (
    <Section title="My Documents" icon="☁️" count={totalItems}>
      {driveData.message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-xl px-4 py-3 mb-4">
          ℹ️ {driveData.message}
        </div>
      )}
      {(error || driveData.error) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          ⚠️ {error || driveData.error}
        </div>
      )}

      {/* Breadcrumb navigation */}
      {crumbStack.length > 0 && (
        <Breadcrumb crumbs={crumbStack} onNavigate={navigateToBreadcrumb} />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {driveData.folders?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Folders</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {driveData.folders.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100 hover:border-yellow-300 hover:bg-yellow-100 transition text-left group w-full relative"
                  >
                    {/* Clickable area to enter folder */}
                    <button
                      onClick={() => navigateToFolder(f)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="text-2xl flex-shrink-0">📁</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-yellow-800">
                          {f.name}
                        </p>
                        {f.modifiedTime && (
                          <p className="text-xs text-gray-400">{fmtDate(f.modifiedTime)}</p>
                        )}
                      </div>
                      <span className="text-gray-300 group-hover:text-yellow-500 text-xs flex-shrink-0 mr-1">→</span>
                    </button>

                    {/* Share button for folder */}
                    <ShareBtn file={f} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {driveData.files?.length > 0 && (
            <div>
              {driveData.folders?.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Files</p>
              )}
              <div className="space-y-2">
                {driveData.files.map((f) => {
                  const meta = driveIcon(f.mimeType);
                  return (
                    <div
                      key={f.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition group"
                    >
                      <span className={`text-2xl flex-shrink-0 ${meta.color}`}>{meta.icon}</span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">
                          {f.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {f.modifiedTime ? fmtDate(f.modifiedTime) : ""}
                          {f.size ? ` · ${fmtSize(f.size)}` : ""}
                        </p>
                      </div>

                      {/* Action buttons — visible on hover */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Share link */}
                        <ShareBtn file={f} />

                        {/* Download */}
                        <DownloadBtn file={f} />

                        {/* Open / View file via backend proxy */}
                        <a
                          href={getProxyDownloadUrl(f)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Open / View file"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition opacity-0 group-hover:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!driveData.files?.length && !driveData.folders?.length && !driveData.message && !driveData.error && !error && (
            <Empty message="No files found in this folder." />
          )}
        </>
      )}
    </Section>
  );
}

// ── Messages Tab (Client side) ────────────────────────────────────────────
const MSG_TYPE_META = {
  dsc_expiry:       { label: "DSC Expiry Alert",      icon: "🔐", bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700" },
  compliance_due:   { label: "Compliance Due",         icon: "📋", bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
  invoice_reminder: { label: "Invoice Reminder",       icon: "🧾", bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
  general:          { label: "Message",                icon: "💬", bg: "bg-gray-50",   border: "border-gray-200",   badge: "bg-gray-100 text-gray-600" },
  custom:           { label: "Notice",                 icon: "📢", bg: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
};

function MessagesTab({ onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await portalApi().get("/client-portal/my-messages");
      const msgs = Array.isArray(res.data) ? res.data : [];
      setMessages(msgs);
      onUnreadChange && onUnreadChange(msgs.filter(m => !m.is_read).length);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (msg) => {
    setExpandedId(prev => (prev === msg.id ? null : msg.id));
    if (!msg.is_read) {
      try {
        await portalApi().put(`/client-portal/my-messages/${msg.id}/read`);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
        onUnreadChange && onUnreadChange(messages.filter(m => !m.is_read && m.id !== msg.id).length);
      } catch { /* silent */ }
    }
  };

  const unreadCount = messages.filter(m => !m.is_read).length;

  return (
    <Section title="Messages" icon="💬" count={messages.length}>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-gray-500 text-sm font-medium">No messages yet</p>
          <p className="text-gray-400 text-xs mt-1">Your firm will send important updates here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse inline-block" />
              {unreadCount} unread message{unreadCount > 1 ? "s" : ""}
            </div>
          )}
          {messages.map((msg) => {
            const typeKey = msg.message_type || "general";
            const meta = MSG_TYPE_META[typeKey] || MSG_TYPE_META.general;
            const isExpanded = expandedId === msg.id;
            return (
              <div
                key={msg.id}
                className={`rounded-xl border transition-all cursor-pointer ${meta.bg} ${meta.border} ${!msg.is_read ? "shadow-sm" : ""}`}
                onClick={() => handleExpand(msg)}
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="text-xl flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.label}
                      </span>
                      {!msg.is_read && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">NEW</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {msg.created_at ? new Date(msg.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                      </span>
                    </div>
                    <p className={`text-sm font-semibold text-gray-800 ${!msg.is_read ? "font-bold" : ""}`}>
                      {msg.subject || "(no subject)"}
                    </p>
                    <p className={`text-xs text-gray-500 mt-0.5 ${isExpanded ? "" : "line-clamp-2"}`}>
                      {msg.body}
                    </p>
                    {!isExpanded && msg.body && msg.body.length > 120 && (
                      <p className="text-xs text-blue-500 mt-1 font-medium">Tap to read more ↓</p>
                    )}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-200/60">
                        <p className="text-xs text-gray-400">
                          From: <span className="font-medium text-gray-600">{msg.from_user_name || "Team"}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}


export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("drive");
  const [data, setData] = useState({ tasks: [], documents: [], invoices: [], compliance: [] });
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("client_portal_user");
    if (!stored || stored === "undefined" || stored === "null") {
      sessionStorage.removeItem("client_portal_user");
      sessionStorage.removeItem("client_portal_token");
      navigate("/client-portal");
      return;
    }
    let u;
    try { u = JSON.parse(stored); } catch {
      sessionStorage.removeItem("client_portal_user");
      sessionStorage.removeItem("client_portal_token");
      navigate("/client-portal");
      return;
    }
    if (!u) { navigate("/client-portal"); return; }
    setUser(u);
    if (u.can_view_tasks) setActiveTab("tasks");
    else if (u.can_view_documents) setActiveTab("documents");
    else if (u.can_view_invoices) setActiveTab("invoices");
    else setActiveTab("drive");
  }, [navigate]);

  const fetchTab = useCallback(async (tab) => {
    if (!user) return;
    setLoading(true);
    setError("");
    const api = portalApi();
    try {
      if (tab === "tasks" && user.can_view_tasks) {
        const res = await api.get("/client-portal/tasks");
        const tasks = Array.isArray(res.data) ? res.data : [];
        setData(d => ({ ...d, tasks }));
      } else if (tab === "documents" && user.can_view_documents) {
        const res = await api.get("/client-portal/documents");
        const documents = Array.isArray(res.data) ? res.data : [];
        setData(d => ({ ...d, documents }));
      } else if (tab === "invoices" && user.can_view_invoices) {
        const res = await api.get("/client-portal/invoices");
        const invoices = Array.isArray(res.data) ? res.data : [];
        setData(d => ({ ...d, invoices }));
      } else if (tab === "compliance" && user.can_view_compliance) {
        const res = await api.get("/client-portal/compliance");
        const compliance = Array.isArray(res.data) ? res.data : [];
        setData(d => ({ ...d, compliance }));
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab !== "drive") fetchTab(activeTab);
  }, [activeTab, fetchTab]);

  const logout = () => {
    sessionStorage.removeItem("client_portal_token");
    sessionStorage.removeItem("client_portal_user");
    navigate("/client-portal");
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
  };

  if (!user) return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading portal…</p>
      </div>
    </div>
  );

  const tabs = [
    user.can_view_tasks      && { id: "tasks",      label: "Tasks",      icon: "✅" },
    user.can_view_documents  && { id: "documents",  label: "Documents",  icon: "📂" },
    user.can_view_invoices   && { id: "invoices",   label: "Invoices",   icon: "🧾" },
    user.can_view_compliance && { id: "compliance", label: "Compliance", icon: "📋" },
    user.google_drive_folder_id && { id: "drive",  label: "My Drive",   icon: "☁️" },
    { id: "messages", label: "Messages", icon: "💬", badge: unreadMessages },
  ].filter(Boolean);
  if (!tabs.find(t => t.id === "drive")) tabs.push({ id: "drive", label: "My Drive", icon: "☁️" });

  return (
    // ── FULL-WIDTH layout: removed max-w-5xl constraint ──
    <div className="min-h-screen bg-[#f0f4f8]">

      {/* ── Header ── */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="w-full px-6 sm:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{user.display_name}</p>
              <p className="text-xs text-gray-400">Client Portal</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Full-width content area ── */}
      <div className="w-full px-6 sm:px-10 py-6 space-y-5">

        {/* ── Hero banner ── */}
        <div
          className="rounded-2xl p-6 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1a56a0 55%, #2563eb 100%)" }}
        >
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">Client Portal</p>
              <h1 className="text-xl font-bold">{greeting()}, {user.display_name} 👋</h1>
              <p className="text-blue-200 text-sm mt-1">
                Here's an overview of your account information and documents.
              </p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2 text-right backdrop-blur-sm">
              <p className="text-blue-200 text-xs">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <p className="text-white font-semibold text-sm mt-0.5">
                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST
              </p>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
                activeTab === t.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              <span>{t.icon}</span> {t.label}
              {t.badge > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {activeTab === "drive" ? (
          <DriveTab user={user} />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "tasks" && (
              <Section title="Tasks" icon="✅" count={(data.tasks || []).length}>
                {(data.tasks || []).length === 0 ? (
                  <Empty message="No tasks found for your account." />
                ) : (
                  <div className="space-y-3">
                    {(data.tasks || []).map((t, i) => (
                      <div key={i} className="flex items-start justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 transition">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{t.title}</p>
                          {t.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                          )}
                          {t.due_date && (
                            <p className="text-xs text-gray-400 mt-1">Due: {fmtDate(t.due_date)}</p>
                          )}
                        </div>
                        <div className="ml-4 flex flex-col items-end gap-1.5">
                          <Badge status={t.status} />
                          {t.priority && (
                            <span className="text-xs text-gray-400 capitalize">{t.priority}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {activeTab === "documents" && (
              <Section title="Documents" icon="📂" count={(data.documents || []).length}>
                {(data.documents || []).length === 0 ? (
                  <Empty message="No documents found." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                          <th className="pb-2 font-medium">Name</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Expiry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(data.documents || []).map((d, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-3 font-medium text-gray-800">{d.name}</td>
                            <td className="py-3 text-gray-500">{d.doc_type || "—"}</td>
                            <td className="py-3"><Badge status={d.status} /></td>
                            <td className="py-3 text-gray-500">{fmtDate(d.expiry_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            )}

            {activeTab === "invoices" && (
              <Section title="Invoices" icon="🧾" count={(data.invoices || []).length}>
                {(data.invoices || []).length === 0 ? (
                  <Empty message="No invoices found." />
                ) : (
                  <div className="space-y-3">
                    {(data.invoices || []).map((inv, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-100 transition">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{inv.invoice_number}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Date: {fmtDate(inv.invoice_date)}
                            {inv.due_date && ` · Due: ${fmtDate(inv.due_date)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">
                            ₹{Number(inv.total_amount || 0).toLocaleString("en-IN")}
                          </p>
                          <Badge status={inv.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {activeTab === "compliance" && (
              <Section title="Compliance" icon="📋" count={(data.compliance || []).length}>
                {(data.compliance || []).length === 0 ? (
                  <Empty message="No compliance records found." />
                ) : (
                  <div className="space-y-3">
                    {(data.compliance || []).map((c, i) => (
                      <div key={i} className="flex items-start justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{c.compliance_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Due: {fmtDate(c.due_date)}</p>
                          {c.filing_date && (
                            <p className="text-xs text-gray-400">Filed: {fmtDate(c.filing_date)}</p>
                          )}
                          {c.remarks && (
                            <p className="text-xs text-gray-400 italic mt-1">{c.remarks}</p>
                          )}
                        </div>
                        <Badge status={c.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {activeTab === "messages" && (
              <MessagesTab onUnreadChange={setUnreadMessages} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
