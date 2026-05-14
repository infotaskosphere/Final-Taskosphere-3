import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// Always resolve to the absolute backend URL — same logic as api.js and ClientPortalLogin.jsx
let _raw = import.meta?.env?.VITE_API_URL || "https://final-taskosphere-backend.onrender.com";
_raw = _raw.replace(/\/+$/, "");
if (!_raw.endsWith("/api")) _raw += "/api";
const API_BASE = _raw;

// Brand palette — kept identical to DashboardLayout.jsx for visual parity
const COLORS = {
  deepBlue:   "#0D3B66",
  mediumBlue: "#1F6FB2",
  lightBlue:  "#E0F2FE",
};

const SIDEBAR_EXPANDED  = 240;
const SIDEBAR_COLLAPSED = 68;
const HEADER_H          = 52;

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

/* ──────────────────────────────────────────────────────────────────────────
 * SHARE MENU — Copy link or share via WhatsApp
 * Works for both files (uses webViewLink) and folders (Drive folder URL).
 * ────────────────────────────────────────────────────────────────────────── */
function ShareMenu({ url, name, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      // Tiny inline toast — avoid pulling another dep
      const t = document.createElement("div");
      t.textContent = "✓ Link copied to clipboard";
      t.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-[9999] animate-fadeIn";
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
    onClose();
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`${name ? name + "\n" : ""}${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-52 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
    >
      <button
        onClick={copyLink}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition text-left"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        Copy link
      </button>
      <button
        onClick={shareWhatsApp}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition text-left border-t border-gray-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
        Share on WhatsApp
      </button>
    </div>
  );
}

// ── Windows Explorer-style Folder Sidebar ─────────────────────────────────
async function fetchFolderChildren(folderId) {
  const api = portalApi();
  const params = {};
  if (folderId) params.folder_id = folderId;
  const res = await api.get("/client-portal/drive/files", { params });
  return res.data.folders || [];
}

function FolderSidebar({ selectedId, onFolderSelect }) {
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
          expanded: true,
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
    const nodeKey = node.id || "root";
    if (!node.loaded) {
      loadNode(nodeKey, node.id);
    } else {
      setTree(prev => ({
        ...prev,
        [nodeKey]: { ...prev[nodeKey], expanded: true },
      }));
    }
    onFolderSelect(node.id, node.name);
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

          <span className="text-sm flex-shrink-0 leading-none">
            {isSelected ? "📂" : "📁"}
          </span>

          <span className={`text-xs font-medium truncate flex-1 ${isSelected ? "text-blue-800" : ""}`}>
            {node.name}
          </span>
        </div>

        {node.expanded && node.children.map(childId => renderNode(childId, depth + 1))}
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
      {renderNode("root")}
    </div>
  );
}

// ── Main DriveTab ──────────────────────────────────────────────────────────
function DriveTab({ user, selectedFolderId, selectedFolderName }) {
  const [driveData, setDriveData] = useState({ files: [], folders: [], breadcrumb: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareOpenId, setShareOpenId] = useState(null);

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

  useEffect(() => { fetchFolder(null); }, [fetchFolder]);

  // Re-fetch whenever the selected folder changes
  useEffect(() => {
    fetchFolder(selectedFolderId ?? null);
  }, [selectedFolderId, fetchFolder]);

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

  const folderShareUrl = (id) => `https://drive.google.com/drive/folders/${id}`;

  const totalItems = (driveData.folders?.length || 0) + (driveData.files?.length || 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
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

      <div className="p-5 overflow-auto">
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
                      <div key={f.id} className="relative group">
                        <button
                          className="flex items-center gap-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100 hover:border-yellow-300 hover:bg-yellow-100 transition text-left w-full"
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
                        </button>

                        {/* Share button overlay (top-right) */}
                        <div className="absolute top-2 right-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareOpenId(shareOpenId === `fld-${f.id}` ? null : `fld-${f.id}`);
                            }}
                            title="Share folder"
                            className="p-1.5 rounded-lg bg-white/80 backdrop-blur text-gray-500 hover:text-blue-600 hover:bg-white transition opacity-0 group-hover:opacity-100 shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                          </button>
                          {shareOpenId === `fld-${f.id}` && (
                            <ShareMenu
                              url={folderShareUrl(f.id)}
                              name={f.name}
                              onClose={() => setShareOpenId(null)}
                            />
                          )}
                        </div>
                      </div>
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
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition group relative"
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

                            {/* Share button + menu */}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareOpenId(shareOpenId === f.id ? null : f.id);
                                }}
                                title="Share via link or WhatsApp"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition opacity-0 group-hover:opacity-100"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                              </button>
                              {shareOpenId === f.id && (
                                <ShareMenu
                                  url={f.webViewLink || ""}
                                  name={f.name}
                                  onClose={() => setShareOpenId(null)}
                                />
                              )}
                            </div>
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
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MAIN PAGE — now uses a Dashboard-style sidebar layout
 * ────────────────────────────────────────────────────────────────────────── */
export default function ClientPortalDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("drive");
  const [data, setData] = useState({ tasks: [], documents: [], invoices: [], compliance: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sidebar state — mirrors DashboardLayout
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("clientPortalSidebarCollapsed") === "true";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024
  );

  // Folder navigation state — shared between sidebar tree and DriveTab
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedFolderName, setSelectedFolderName] = useState("My Documents");

  const handleFolderSelect = (folderId, folderName) => {
    setSelectedFolderId(folderId);
    setSelectedFolderName(folderName || "My Documents");
    if (!isDesktop) setSidebarOpen(false);
  };

  useEffect(() => {
    localStorage.setItem("clientPortalSidebarCollapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        setData(d => ({ ...d, tasks: Array.isArray(res.data) ? res.data : [] }));
      } else if (tab === "documents" && user.can_view_documents) {
        const res = await api.get("/client-portal/documents");
        setData(d => ({ ...d, documents: Array.isArray(res.data) ? res.data : [] }));
      } else if (tab === "invoices" && user.can_view_invoices) {
        const res = await api.get("/client-portal/invoices");
        setData(d => ({ ...d, invoices: Array.isArray(res.data) ? res.data : [] }));
      } else if (tab === "compliance" && user.can_view_compliance) {
        const res = await api.get("/client-portal/compliance");
        setData(d => ({ ...d, compliance: Array.isArray(res.data) ? res.data : [] }));
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

  // Build nav items based on permissions
  const NavIcons = {
    tasks: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    invoices: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    compliance: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    drive: (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  };

  const navItems = [
    user.can_view_tasks      && { id: "tasks",      label: "Tasks",       icon: NavIcons.tasks },
    user.can_view_invoices   && { id: "invoices",   label: "Invoices",    icon: NavIcons.invoices },
    user.can_view_compliance && { id: "compliance", label: "Compliance",  icon: NavIcons.compliance },
    { id: "drive", label: "My Documents", icon: NavIcons.drive },
  ].filter(Boolean);

  const sidebarPx = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const offsetPx  = isDesktop ? sidebarPx : 0;

  const activeLabel = navItems.find(n => n.id === activeTab)?.label || "Client Portal";

  return (
    <div className="min-h-screen relative bg-[#F4F6FA]" style={{ overflowX: "hidden" }}>

      {/* Mobile overlay */}
      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (matches DashboardLayout styling) ── */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out ${
          isDesktop ? "translate-x-0" : sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          width: sidebarPx,
          background: "#ffffff",
          borderRight: "1px solid #e2e8f0",
          boxShadow: "10px 0 30px rgba(0,0,0,0.03)",
        }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center flex-shrink-0 border-b border-slate-100">
          <div className={`flex items-center justify-center ${collapsed ? "w-12" : "w-full px-5"}`}>
            <div style={{ background: "#ffffff", borderRadius: 8, padding: "2px 6px" }}>
              <img
                src="/logo.png"
                alt="TaskOsphere"
                className="object-contain block"
                style={{
                  maxHeight: collapsed ? "36px" : "44px",
                  width: "auto",
                  mixBlendMode: "multiply",
                }}
              />
            </div>
          </div>
        </div>

        {/* Client info card */}
        {!collapsed && (
          <div className="px-3 py-2.5 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})` }}
              >
                {user.display_name?.[0]?.toUpperCase() || "C"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{user.display_name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Portal</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4">
          <div className={`mt-2 mb-2 ${collapsed ? "px-2" : "px-3"}`}>
            <div className={`space-y-0.5 ${collapsed ? "px-2" : ""}`}>
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        setActiveTab(item.id);
                        if (!isDesktop) setSidebarOpen(false);
                      }}
                      title={collapsed ? item.label : undefined}
                      className={`relative flex items-center gap-3 min-w-0 w-full
                        ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"}
                        rounded-xl transition-all duration-200 group
                        ${isActive ? "text-white" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/80"}`}
                      style={isActive ? {
                        background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
                        boxShadow: "0 4px 14px rgba(13,59,102,0.28)",
                      } : {}}
                    >
                      {isActive && !collapsed && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                          style={{ background: "rgba(255,255,255,0.6)" }}
                        />
                      )}
                      <span className={`flex-shrink-0 ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span className="font-medium text-sm whitespace-nowrap tracking-tight truncate">
                          {item.label}
                        </span>
                      )}
                      {isActive && collapsed && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70" />
                      )}
                    </button>

                    {/* Inline folder tree — shown under My Documents when active and not collapsed */}
                    {item.id === "drive" && isActive && !collapsed && (
                      <div className="mt-1 ml-2 border-l-2 border-blue-100 pl-2">
                        <FolderSidebar
                          selectedId={selectedFolderId}
                          onFolderSelect={handleFolderSelect}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Collapse / Sign Out */}
        <div className="p-3 border-t border-slate-100 hidden lg:block space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-start gap-3"} h-10 rounded-xl text-slate-500 hover:bg-slate-100 transition-all px-3`}
          >
            {collapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Collapse Sidebar</span>
              </>
            )}
          </button>
          <button
            onClick={logout}
            className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-start gap-3"} h-10 rounded-xl text-red-500 hover:bg-red-50 transition-all px-3`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Header ── */}
      <header
        className="fixed top-0 right-0 z-30 flex items-center transition-all duration-300 ease-in-out backdrop-blur-md"
        style={{
          left: offsetPx,
          height: HEADER_H,
          background: "rgba(255,255,255,0.85)",
          borderBottom: "1px solid #e2e8f0",
          maxWidth: `calc(100vw - ${offsetPx}px)`,
        }}
      >
        <div className="flex-1 flex items-center justify-between px-3 sm:px-5 min-w-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => setSidebarOpen(prev => !prev)}
              className="lg:hidden flex-shrink-0 p-2 rounded-lg hover:bg-slate-100 text-slate-500 active:scale-95 transition-all"
              aria-label="Toggle sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm sm:text-base font-bold text-slate-800 truncate min-w-0">
              {activeLabel}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition lg:hidden"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        className="transition-all duration-300 ease-in-out"
        style={{
          marginLeft: offsetPx,
          paddingTop: HEADER_H,
          minHeight: "100vh",
        }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">

          {/* Hero banner */}
          <div
            className="rounded-2xl p-6 text-white relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, #1a56a0 55%, #2563eb 100%)` }}
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {activeTab === "drive" ? (
            <DriveTab user={user} selectedFolderId={selectedFolderId} selectedFolderName={selectedFolderName} />
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
      </main>
    </div>
  );
}
