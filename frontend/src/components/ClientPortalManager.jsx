import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import DriveFolderVisibility from "@/components/DriveFolderVisibility";

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * FastAPI / Pydantic v2 returns `detail` as either:
 *   - a plain string  (HTTP exceptions)
 *   - an array of objects  [{type, loc, msg, input, ctx}, …]  (validation errors)
 * React cannot render objects as children, so we always convert to a string.
 */
function extractErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map(d => {
        const field = Array.isArray(d.loc) ? d.loc.filter(p => p !== "body").join(" → ") : "";
        const msg = d.msg || JSON.stringify(d);
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" | ");
  }
  return JSON.stringify(detail);
}

const initForm = (clientId = "", folderId = "", folderName = "") => ({
  client_id: clientId,
  portal_username: "",
  portal_password: "",
  display_name: "",
  email: "",
  can_view_tasks: true,
  can_view_documents: true,
  can_view_invoices: true,
  can_view_compliance: false,
  google_drive_folder_id: folderId,
  google_drive_folder_name: folderName,
});

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-indigo-500" : "bg-gray-200"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ── Share Link Panel ───────────────────────────────────────────────────────
function ShareLinkPanel({ portalUser }) {
  const [copied, setCopied] = useState(null);
  const origin = window.location.origin;
  const portalUrl = `${origin}/client-portal`;

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const fullMessage = `Hi ${portalUser.display_name || portalUser.portal_username},\n\nYou can access your documents and updates on our Client Portal:\n\n🔗 Portal Link: ${portalUrl}\n👤 Username: ${portalUser.portal_username}\n\nPlease use the password we shared with you to log in.`;

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
      <p className="font-semibold text-indigo-800 text-sm flex items-center gap-2">
        🔗 Share Portal Access
      </p>

      {/* Portal URL */}
      <div>
        <p className="text-xs text-indigo-600 mb-1 font-medium">Portal Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-indigo-700 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-mono truncate">
            {portalUrl}
          </code>
          <button
            onClick={() => copyText(portalUrl, "url")}
            className="flex-shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            {copied === "url" ? "✓ Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Username */}
      <div>
        <p className="text-xs text-indigo-600 mb-1 font-medium">Client Username</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-indigo-700 bg-white border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-mono">
            {portalUser.portal_username}
          </code>
          <button
            onClick={() => copyText(portalUser.portal_username, "user")}
            className="flex-shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            {copied === "user" ? "✓ Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Copy complete message */}
      <button
        onClick={() => copyText(fullMessage, "msg")}
        className="w-full text-xs bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-lg transition font-medium flex items-center justify-center gap-2"
      >
        {copied === "msg" ? "✓ Message Copied!" : "📋 Copy Complete Share Message"}
      </button>

      <p className="text-xs text-indigo-500">
        Share the link + username with your client. They'll need the password you set.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ClientPortalManager({ clientId, clientName, onClose }) {
  const { user } = useAuth();
  const [portalUsers, setPortalUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initForm(clientId));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [driveVisUser, setDriveVisUser] = useState(null);
  const [shareUser, setShareUser] = useState(null);

  // ── Create Drive Folder state ─────────────────────────────────────────
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderResult, setCreateFolderResult] = useState(null);

  // Ref to scroll the credentials form into view after auto-open
  const credFormRef = useRef(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get("/client-portal/users", { params: { client_id: clientId } });
      setPortalUsers(res.data);
      return res.data;
    } catch {
      return [];
    }
  }, [clientId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Pydantic v2 rejects empty string "" for Optional[EmailStr] — send null instead.
  const sanitizePayload = (data) => ({
    ...data,
    email: data.email?.trim() || null,
    display_name: data.display_name?.trim() || null,
    google_drive_folder_id: data.google_drive_folder_id?.trim() || null,
    google_drive_folder_name: data.google_drive_folder_name?.trim() || null,
  });

  const save = async () => {
    setError(""); setSuccess("");
    setLoading(true);
    try {
      if (editingId) {
        const payload = sanitizePayload({ ...form });
        if (!payload.portal_password) delete payload.portal_password;
        await api.put(`/client-portal/users/${editingId}`, payload);
        setSuccess("Portal user updated!");
      } else {
        await api.post("/client-portal/users", sanitizePayload(form));
        setSuccess("Portal credentials created! Auto-creating Drive folder…");
        // Auto-create Drive folder using saved template
        try {
          const tmpl = await api.get("/client-portal/folder-template");
          const subfolders = tmpl.data?.subfolders || [];
          const parentId   = tmpl.data?.parent_folder_id || null;
          if (subfolders.length > 0 && !form.google_drive_folder_id) {
            const folderRes = await api.post("/client-portal/drive/create-folders", {
              client_name: form.display_name || clientName,
              client_id: clientId,
              parent_folder_id: parentId || null,
              subfolders,
            });
            setSuccess(`Portal created! Drive folder ready: "${folderRes.data.folder_name}"`);
            setForm(f => ({
              ...f,
              google_drive_folder_id: folderRes.data.folder_id,
              google_drive_folder_name: folderRes.data.folder_name,
            }));
          } else {
            setSuccess("Portal credentials created!");
          }
        } catch {
          setSuccess("Portal credentials created!");
        }
      }
      await loadUsers();
      setShowForm(false);
      setEditingId(null);
      setForm(initForm(clientId));
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save. Please check all fields and try again."));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setShareUser(null);
    setForm({
      client_id: u.client_id,
      portal_username: u.portal_username,
      portal_password: "",
      display_name: u.display_name || "",
      email: u.email || "",
      can_view_tasks: u.can_view_tasks,
      can_view_documents: u.can_view_documents,
      can_view_invoices: u.can_view_invoices,
      can_view_compliance: u.can_view_compliance,
      google_drive_folder_id: u.google_drive_folder_id || "",
      google_drive_folder_name: u.google_drive_folder_name || "",
    });
    setShowForm(true);
  };

  const toggleActive = async (u) => {
    await api.put(`/client-portal/users/${u.id}`, { is_active: !u.is_active });
    loadUsers();
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Delete this portal user?")) return;
    await api.delete(`/client-portal/users/${id}`);
    loadUsers();
  };

  const createDriveFolder = async () => {
    setCreatingFolder(true);
    setCreateFolderResult(null);
    try {
      const res = await api.post("/client-portal/drive/create-folders", {
        client_name: clientName,
        client_id: clientId,
        parent_folder_id: createFolderParentId.trim() || null,
      });

      setCreateFolderResult(res.data);

      // Always pre-fill the credentials form with the new folder details
      setForm(f => ({
        ...f,
        google_drive_folder_id: res.data.folder_id,
        google_drive_folder_name: res.data.folder_name || clientName,
      }));

      const latestUsers = await loadUsers();

      // If no portal user exists yet (folder wasn't auto-linked to anyone),
      // automatically open the credentials form so the admin can fill in
      // username + password — the Drive folder ID is already pre-filled.
      if (!res.data.auto_linked_portal && latestUsers.length === 0) {
        setShowForm(true);
        setEditingId(null);
        // Scroll to the credentials form after a short delay so it's rendered
        setTimeout(() => {
          credFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    } catch (err) {
      setCreateFolderResult({ error: extractErrorMessage(err, "Failed to create folder.") });
    } finally {
      setCreatingFolder(false);
    }
  };

  if (user?.role !== "admin" && user?.role !== "manager") return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Client Portal Access</h2>
            <p className="text-sm text-gray-500">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{success}</div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}

          {/* Existing users */}
          {portalUsers.length > 0 && !showForm && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Portal Users</p>
              {portalUsers.map(u => (
                <div key={u.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* User row */}
                  <div className="flex items-center justify-between p-3 bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{u.display_name || u.portal_username}</p>
                      <p className="text-xs text-gray-400">@{u.portal_username}{u.email ? ` · ${u.email}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                      <button
                        onClick={() => setShareUser(shareUser?.id === u.id ? null : u)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border transition ${
                          shareUser?.id === u.id
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        }`}
                      >
                        🔗 Share Link
                      </button>
                      <button onClick={() => startEdit(u)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => toggleActive(u)} className="text-xs text-yellow-600 hover:underline">
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                      {u.google_drive_folder_id && (
                        <button
                          onClick={() => setDriveVisUser(u)}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                          title="Manage which Drive files this client can see"
                        >
                          ☁️ Drive Files
                        </button>
                      )}
                      <button onClick={() => deleteUser(u.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  </div>

                  {/* Inline share panel */}
                  {shareUser?.id === u.id && (
                    <div className="p-3 border-t border-gray-100">
                      <ShareLinkPanel portalUser={u} />
                    </div>
                  )}

                  {/* Drive folder info if linked */}
                  {u.google_drive_folder_id && shareUser?.id !== u.id && (
                    <div className="px-3 py-2 border-t border-gray-100 bg-blue-50 flex items-center gap-2">
                      <span className="text-sm">📁</span>
                      <span className="text-xs text-blue-700 font-medium">
                        Drive folder linked: {u.google_drive_folder_name || "My Documents"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Create Drive Folder Panel ────────────────────────────────── */}
          <div className="border border-blue-200 rounded-xl overflow-hidden">
            <button
              onClick={() => { setShowCreateFolder(v => !v); setCreateFolderResult(null); }}
              className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                📁 Create Client Drive Folder
              </span>
              <span className="text-blue-400 text-xs">{showCreateFolder ? "▲ Hide" : "▼ Expand"}</span>
            </button>

            {showCreateFolder && (
              <div className="p-4 space-y-3 bg-white">
                <p className="text-xs text-gray-500">
                  Creates a folder named <strong>"{clientName}"</strong> in Google Drive with predefined sub-folders:
                  Documents, Invoices, Compliance, Correspondence, Reports, Bank Statements.
                  If a portal user exists for this client, the folder will be auto-linked.
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Parent Folder ID <span className="font-normal text-gray-400">(optional – leave blank for Drive root)</span>
                  </label>
                  <input
                    value={createFolderParentId}
                    onChange={e => setCreateFolderParentId(e.target.value)}
                    placeholder="Paste parent folder ID from Drive URL…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <button
                  onClick={createDriveFolder}
                  disabled={creatingFolder}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {creatingFolder ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating…</>
                  ) : "📁 Create Folder Structure"}
                </button>

                {createFolderResult && !createFolderResult.error && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-semibold text-green-800">✅ Folder structure ready!</p>
                    <div className="text-xs text-green-700 space-y-1">
                      <p>📁 <strong>{createFolderResult.folder_name}</strong>
                        {createFolderResult.folder_link && (
                          <a href={createFolderResult.folder_link} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-600 underline">Open in Drive ↗</a>
                        )}
                      </p>
                      {createFolderResult.sub_folders_created?.length > 0 && (
                        <p>Created sub-folders: {createFolderResult.sub_folders_created.join(", ")}</p>
                      )}
                      {createFolderResult.sub_folders_existing?.length > 0 && (
                        <p className="text-green-600">Already existed: {createFolderResult.sub_folders_existing.join(", ")}</p>
                      )}
                      {createFolderResult.auto_linked_portal ? (
                        <p className="font-semibold text-green-700">✓ Folder auto-linked to this client's existing portal account</p>
                      ) : (
                        <p className="font-semibold text-indigo-700">
                          ↓ Folder ID pre-filled below — just add a username &amp; password to complete portal setup
                        </p>
                      )}
                      <p className="text-gray-500 font-mono text-[10px] select-all">Folder ID: {createFolderResult.folder_id}</p>
                    </div>
                  </div>
                )}

                {/* Visual "next step" nudge when folder was created but no portal user exists yet */}
                {createFolderResult && !createFolderResult.error && !createFolderResult.auto_linked_portal && portalUsers.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium mt-1">
                    <span className="text-lg leading-none">↓</span>
                    <span>Credentials form opened below with the Drive folder pre-filled — add username &amp; password to finish.</span>
                  </div>
                )}

                {createFolderResult?.error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                    ⚠️ {createFolderResult.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toggle form / credentials form */}
          <div ref={credFormRef}>
            {!showForm ? (
              <button
                onClick={() => {
                  setShowForm(true);
                  setEditingId(null);
                  setShareUser(null);
                  // Keep any folder ID already pre-filled from folder creation; reset everything else
                  setForm(f => initForm(clientId, f.google_drive_folder_id, f.google_drive_folder_name));
                }}
                className="w-full border-2 border-dashed border-indigo-200 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl py-3 text-sm font-medium transition"
              >
                + Create Portal Credentials
              </button>
            ) : (
              <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                <p className="font-semibold text-gray-800 text-sm">
                  {editingId ? "Edit Portal User" : "New Portal User"}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Username *</label>
                    <input
                      value={form.portal_username}
                      onChange={e => setField("portal_username", e.target.value)}
                      disabled={!!editingId}
                      placeholder="clientname"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">
                      Password {editingId ? "(leave blank to keep)" : "*"}
                    </label>
                    <input
                      type="password"
                      value={form.portal_password}
                      onChange={e => setField("portal_password", e.target.value)}
                      placeholder={editingId ? "New password (optional)" : "Min 6 chars"}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Display Name</label>
                    <input
                      value={form.display_name}
                      onChange={e => setField("display_name", e.target.value)}
                      placeholder="Company / Person name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setField("email", e.target.value)}
                      placeholder="client@example.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                {/* Google Drive */}
                <div className={`border rounded-xl p-4 space-y-3 ${form.google_drive_folder_id ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-100"}`}>
                  <p className={`text-xs font-semibold flex items-center gap-1.5 ${form.google_drive_folder_id ? "text-green-800" : "text-blue-800"}`}>
                    {form.google_drive_folder_id ? "✅ Google Drive Folder (pre-filled)" : "☁️ Google Drive Folder"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        Folder ID <span className="font-normal text-gray-400">(from Drive URL)</span>
                      </label>
                      <input
                        value={form.google_drive_folder_id}
                        onChange={e => setField("google_drive_folder_id", e.target.value)}
                        placeholder="1BxiMVs0XRA5nFMdKv…"
                        className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
                          form.google_drive_folder_id
                            ? "border-green-300 bg-white focus:ring-green-400"
                            : "border-gray-300 focus:ring-indigo-400"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">
                        Folder Label <span className="font-normal text-gray-400">(shown to client)</span>
                      </label>
                      <input
                        value={form.google_drive_folder_name}
                        onChange={e => setField("google_drive_folder_name", e.target.value)}
                        placeholder="My Documents"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                  </div>
                  {form.google_drive_folder_id ? (
                    <p className="text-xs text-green-700">
                      Folder ID was automatically filled from the Drive folder you just created. You can edit it if needed.
                    </p>
                  ) : (
                    <p className="text-xs text-blue-600">
                      Open the folder in Google Drive → copy the ID from the URL. Share the folder with your service account email first.
                      The client will only see <strong>their assigned folder</strong> and cannot access other clients' files.
                    </p>
                  )}
                </div>

                {/* Permissions */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data Access</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Toggle checked={form.can_view_tasks}      onChange={v => setField("can_view_tasks", v)}      label="Tasks" />
                    <Toggle checked={form.can_view_documents}  onChange={v => setField("can_view_documents", v)}  label="Documents" />
                    <Toggle checked={form.can_view_invoices}   onChange={v => setField("can_view_invoices", v)}   label="Invoices" />
                    <Toggle checked={form.can_view_compliance} onChange={v => setField("can_view_compliance", v)} label="Compliance" />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={save}
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-lg transition"
                  >
                    {loading ? "Saving…" : editingId ? "Update" : "Create"}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); setEditingId(null); setForm(initForm(clientId)); }}
                    className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Portal URL hint (when no users yet or form collapsed) */}
          {!showForm && portalUsers.length === 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm">
              <p className="font-medium text-indigo-800 mb-1">📌 Portal URL for clients</p>
              <code className="text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded text-xs">
                {window.location.origin}/client-portal
              </code>
              <p className="text-indigo-600 text-xs mt-1">
                Create portal credentials above, then use the "Share Link" button to share access with your client.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Drive Visibility Modal */}
      {driveVisUser && (
        <DriveFolderVisibility
          portalUserId={driveVisUser.id}
          portalUsername={driveVisUser.portal_username}
          onClose={() => setDriveVisUser(null)}
        />
      )}
    </div>
  );
}
