import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta?.env?.VITE_API_URL || "/api";

function portalApi() {
  const token = sessionStorage.getItem("client_portal_token");
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── helpers ────────────────────────────────────────────────────────────────
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

// ── Drive icon helper ──────────────────────────────────────────────────────
const DRIVE_ICONS = {
  "application/vnd.google-apps.folder":       { icon: "📁", color: "text-yellow-500" },
  "application/vnd.google-apps.document":     { icon: "📄", color: "text-blue-500" },
  "application/vnd.google-apps.spreadsheet":  { icon: "📊", color: "text-green-500" },
  "application/vnd.google-apps.presentation": { icon: "📽️", color: "text-orange-500" },
  "application/vnd.google-apps.form":         { icon: "📝", color: "text-purple-500" },
  "application/pdf":                           { icon: "📑", color: "text-red-500" },
  "image/jpeg":                                { icon: "🖼️", color: "text-pink-500" },
  "image/png":                                 { icon: "🖼️", color: "text-pink-500" },
};
const driveIcon = (mime) => DRIVE_ICONS[mime] || { icon: "📎", color: "text-gray-500" };
const fmtSize = (bytes) => {
  if (!bytes) return "";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, icon, children, count }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {count !== undefined && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Empty({ message }) {
  return <div className="text-center py-8 text-gray-400 text-sm">{message}</div>;
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────
function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <nav className="flex items-center gap-1 text-sm mb-4 flex-wrap">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.id}>
          {i > 0 && <span className="text-gray-300 mx-1">/</span>}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate(c.id)}
              className="text-indigo-600 hover:underline font-medium truncate max-w-[180px]"
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

// ═══════════════════════════════════════════════════════════════════════════
// Google Drive Tab (full component with folder navigation)
// ═══════════════════════════════════════════════════════════════════════════
function DriveTab({ user }) {
  const [driveData, setDriveData] = useState({ files: [], folders: [], breadcrumb: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = root

  const fetchFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError("");
    const api = portalApi();
    try {
      const params = folderId ? { folder_id: folderId } : {};
      const res = await api.get("/client-portal/drive/files", { params });
      setDriveData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load Drive files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolder(currentFolderId);
  }, []); // Only on mount; navigation is triggered manually

  const navigateToFolder = (folderId) => {
    setCurrentFolderId(folderId);
    fetchFolder(folderId);
  };

  const navigateToBreadcrumb = (folderId) => {
    // If navigating to root (first crumb), pass null
    const isRoot = driveData.breadcrumb.length > 0 && driveData.breadcrumb[0].id === folderId;
    const targetId = isRoot && driveData.breadcrumb.length === 1 ? null : folderId;
    setCurrentFolderId(targetId);
    fetchFolder(targetId);
  };

  const totalItems = (driveData.folders?.length || 0) + (driveData.files?.length || 0);

  return (
    <Section title="My Documents" icon="☁️" count={totalItems}>
      {/* Info / error banners */}
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
      {driveData.breadcrumb?.length > 0 && (
        <Breadcrumb crumbs={driveData.breadcrumb} onNavigate={navigateToBreadcrumb} />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Folders */}
          {driveData.folders?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Folders</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {driveData.folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => navigateToFolder(f.id)}
                    className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100 hover:border-yellow-300 hover:bg-yellow-100 transition text-left group w-full"
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
                    <span className="text-gray-300 group-hover:text-yellow-500 text-xs flex-shrink-0">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {driveData.files?.length > 0 && (
            <div>
              {driveData.folders?.length > 0 && (
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Files</p>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                {driveData.files.map((f) => {
                  const meta = driveIcon(f.mimeType);
                  return (
                    <a
                      key={f.id}
                      href={f.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50 transition group"
                    >
                      <span className={`text-2xl flex-shrink-0 ${meta.color}`}>{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-indigo-700">
                          {f.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {f.modifiedTime ? fmtDate(f.modifiedTime) : ""}
                          {f.size ? ` · ${fmtSize(f.size)}` : ""}
                        </p>
                      </div>
                      <span className="text-gray-300 group-hover:text-indigo-400 text-xs flex-shrink-0">↗</span>
                    </a>
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

// ═══════════════════════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════════════════════
export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("drive");
  const [data, setData] = useState({ tasks: [], documents: [], invoices: [], compliance: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auth check
  useEffect(() => {
    const stored = sessionStorage.getItem("client_portal_user");
    if (!stored) { navigate("/client-portal"); return; }
    const u = JSON.parse(stored);
    setUser(u);
    // Set default tab based on permissions
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
        setData(d => ({ ...d, tasks: res.data }));
      } else if (tab === "documents" && user.can_view_documents) {
        const res = await api.get("/client-portal/documents");
        setData(d => ({ ...d, documents: res.data }));
      } else if (tab === "invoices" && user.can_view_invoices) {
        const res = await api.get("/client-portal/invoices");
        setData(d => ({ ...d, invoices: res.data }));
      } else if (tab === "compliance" && user.can_view_compliance) {
        const res = await api.get("/client-portal/compliance");
        setData(d => ({ ...d, compliance: res.data }));
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

  if (!user) return null;

  const tabs = [
    user.can_view_tasks      && { id: "tasks",      label: "Tasks",      icon: "✅" },
    user.can_view_documents  && { id: "documents",  label: "Documents",  icon: "📂" },
    user.can_view_invoices   && { id: "invoices",   label: "Invoices",   icon: "🧾" },
    user.can_view_compliance && { id: "compliance", label: "Compliance", icon: "📋" },
    user.google_drive_folder_id && { id: "drive", label: "My Drive", icon: "☁️" },
  ].filter(Boolean);

  // If no drive folder, still show drive tab for message
  if (!tabs.find(t => t.id === "drive")) {
    tabs.push({ id: "drive", label: "My Drive", icon: "☁️" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">🏢</span>
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl p-6 text-white">
          <h1 className="text-xl font-bold">Welcome back, {user.display_name} 👋</h1>
          <p className="text-indigo-200 text-sm mt-1">
            Here's an overview of your account information and documents.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
                activeTab === t.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Content */}
        {activeTab === "drive" ? (
          <DriveTab user={user} />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* TASKS */}
            {activeTab === "tasks" && (
              <Section title="Tasks" icon="✅" count={data.tasks.length}>
                {data.tasks.length === 0 ? (
                  <Empty message="No tasks found for your account." />
                ) : (
                  <div className="space-y-3">
                    {data.tasks.map((t, i) => (
                      <div key={i} className="flex items-start justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 transition">
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

            {/* DOCUMENTS */}
            {activeTab === "documents" && (
              <Section title="Documents" icon="📂" count={data.documents.length}>
                {data.documents.length === 0 ? (
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
                        {data.documents.map((d, i) => (
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

            {/* INVOICES */}
            {activeTab === "invoices" && (
              <Section title="Invoices" icon="🧾" count={data.invoices.length}>
                {data.invoices.length === 0 ? (
                  <Empty message="No invoices found." />
                ) : (
                  <div className="space-y-3">
                    {data.invoices.map((inv, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
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

            {/* COMPLIANCE */}
            {activeTab === "compliance" && (
              <Section title="Compliance" icon="📋" count={data.compliance.length}>
                {data.compliance.length === 0 ? (
                  <Empty message="No compliance records found." />
                ) : (
                  <div className="space-y-3">
                    {data.compliance.map((c, i) => (
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
          </>
        )}
      </div>
    </div>
  );
}
