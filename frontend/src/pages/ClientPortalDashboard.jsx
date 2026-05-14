import React, { useState, useEffect, useCallback, useRef } from "react";
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

const EXPORT_MIME = {
  "application/vnd.google-apps.document":     "application/pdf",
  "application/vnd.google-apps.spreadsheet":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.form":         "application/pdf",
};

function Section({ title, icon, children, count }) {
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
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Empty({ message }) {
  return <div className="text-center py-8 text-gray-400 text-sm">{message}</div>;
}

// ── Windows Explorer-style Folder Sidebar ─────────────────────────────────
// Each tree node: { id, name, children: [ids], expanded, loading, loaded }
// nodeKey: "root" for root level, or folder's Google Drive id

async function fetchFolderChildren(folderId) {
  const api = portalApi();
  const params = {};
  if (folderId) params.folder_id = folderId;
  const res = await api.get("/client-portal/drive/files", { params });
  return res.data.folders || [];
}

function FolderSidebar({ selectedId, onFolderSelect, sidebarOpen, setSidebarOpen }) {
  const [tree, setTree] = useState({
    root: {
      id: null,
      name: "My Documents",
      children: [],
      expanded: true,
      loading: true,
      loaded: false,
    },
  });

  const loadNode = useCallback(async (nodeKey, folderId) => {
    setTree(prev => ({
      ...prev,
      [nodeKey]: { ...prev[nodeKey], loading: true },
    }));
    try {
      const folders = await fetchFolderChildren(folderId);
      setTree(prev => {
        const next = { ...prev };
        next[nodeKey] = {
          ...next[nodeKey],
          loading: false,
          loaded: true,
          children: folders.map(f => f.id),
        };
        folders.forEach(f => {
          if (!next[f.id]) {
            next[f.id] = {
              id: f.id,
              name: f.name,
              children: [],
              expanded: false,
              loading: false,
              loaded: false,
            };
          }
        });
        return next;
      });
    } catch {
      setTree(prev => ({
        ...prev,
        [nodeKey]: { ...prev[nodeKey], loading: false, loaded: true },
      }));
    }
  }, []);

  useEffect(() => {
    loadNode("root", null);
  }, [loadNode]);

  const handleToggle = (e, nodeKey, node) => {
    e.stopPropagation();
    if (!node.loaded) {
      loadNode(nodeKey, node.id);
    } else {
      setTree(prev => ({
        ...prev,
        [nodeKey]: { ...prev[nodeKey], expanded: !prev[nodeKey].expanded },
      }));
    }
  };

  const handleSelect = (node) => {
    // Expand if not expanded
    if (!node.expanded && !node.loaded) {
      loadNode(node.id || "root", node.id);
    }
    onFolderSelect(node.id, node.name);
    // On mobile: close sidebar after selecting
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  function renderNode(nodeKey, depth = 0) {
    const node = tree[nodeKey];
    if (!node) return null;
    const isSelected = selectedId === node.id;
    const hasChildren = !node.loaded || node.children.length > 0;

    return (
      <div key={nodeKey}>
        <div
          className={`flex items-center gap-1 rounded-lg cursor-pointer select-none transition-colors duration-100 ${
            isSelected
              ? "bg-blue-100 text-blue-800"
              : "hover:bg-gray-100 text-gray-700"
          }`}
          style={{ paddingLeft: `${6 + depth * 14}px`, paddingRight: "6px", paddingTop: "5px", paddingBottom: "5px" }}
          onClick={() => handleSelect(node)}
        >
          {/* Expand / collapse chevron */}
          <button
            className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded hover:bg-gray-200"
            onClick={(e) => handleToggle(e, nodeKey, node)}
            tabIndex={-1}
          >
            {node.loading ? (
              <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
            ) : hasChildren ? (
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${node.expanded ? "rotate-90" : ""}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <span className="w-3 h-3 inline-block" />
            )}
          </button>

          {/* Folder icon */}
          <span className="text-sm flex-shrink-0 leading-none">
            {isSelected ? "📂" : "📁"}
          </span>

          {/* Folder name */}
          <span className={`text-xs font-medium truncate flex-1 ${isSelected ? "text-blue-800" : ""}`}>
            {node.name}
          </span>
        </div>

        {/* Children — only render if expanded */}
        {node.expanded && node.children.map(childId => renderNode(childId, depth + 1))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden h-full">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Folders</p>
        </div>
        {/* Close button (mobile) */}
        <button
          className="md:hidden p-1 rounded hover:bg-gray-200 text-gray-500"
          onClick={() => setSidebarOpen(false)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tree area */}
      <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
        {renderNode("root")}
      </div>
    </div>
  );
}

// ── Main DriveTab ──────────────────────────────────────────────────────────
function DriveTab({ user }) {
  const [driveData, setDriveData] = useState({ files: [], folders: [], breadcrumb: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState(null);      // currently selected in sidebar
  const [selectedFolderName, setSelectedFolderName] = useState("My Documents"); // display name
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError("");
    const api = portalApi();
    try {
      const params = {};
      if (folderId) params.folder_id = folderId;
      const res = await api.get("/client-portal/drive/files", { params });
      setDriveData(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load Drive files.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load root on mount
  useEffect(() => { fetchFolder(null); }, [fetchFolder]);

  const handleFolderSelect = (folderId, folderName) => {
    setSelectedFolderId(folderId);
    setSelectedFolderName(folderName || "My Documents");
    fetchFolder(folderId);
  };

  const navigateToSubFolder = (folderId, folderName) => {
    setSelectedFolderId(folderId);
    setSelectedFolderName(folderName);
    fetchFolder(folderId);
  };

  // Proxy download via backend — avoids 403 on private Drive files
  const handleDownload = async (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    const token = sessionStorage.getItem("client_portal_token");
    try {
      const res = await fetch(
        `${API_BASE}/client-portal/drive/download?file_id=${file.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "download";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch {
      alert("Download failed. Please try again.");
    }
  };

  const totalItems = (driveData.folders?.length || 0) + (driveData.files?.length || 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
          title={sidebarOpen ? "Hide folders" : "Show folders"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">📂</span>
          <h2 className="font-semibold text-gray-800 truncate">{selectedFolderName}</h2>
          {totalItems > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
              {totalItems}
            </span>
          )}
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex" style={{ minHeight: "400px" }}>
        {/* ── Folder Sidebar ── */}
        {sidebarOpen && (
          <div
            className="border-r border-gray-100 flex-shrink-0"
            style={{ width: "220px" }}
          >
            <FolderSidebar
              selectedId={selectedFolderId}
              onFolderSelect={handleFolderSelect}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
            />
          </div>
        )}

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0 p-5 overflow-auto">
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

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Sub-folders grid */}
              {driveData.folders?.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Folders</p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {driveData.folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => navigateToSubFolder(f.id, f.name)}
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

              {/* Files list */}
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
                            <button
                              onClick={(e) => handleDownload(e, f)}
                              title="Download file"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition opacity-0 group-hover:opacity-100"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                              </svg>
                            </button>

                            <a
                              href={f.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Open in Google Drive"
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
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <p className="text-sm">This folder is empty</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("drive");
  const [data, setData] = useState({ tasks: [], documents: [], invoices: [], compliance: [] });
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
    user.can_view_invoices   && { id: "invoices",   label: "Invoices",   icon: "🧾" },
    user.can_view_compliance && { id: "compliance", label: "Compliance", icon: "📋" },
    { id: "drive", label: "My Documents", icon: "📁" },
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#f0f4f8]">

      {/* ── Header ── */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

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
          </>
        )}
      </div>
    </div>
  );
}
