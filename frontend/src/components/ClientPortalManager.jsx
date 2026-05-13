import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import DriveFolderVisibility from "@/components/DriveFolderVisibility";

// ── helpers ────────────────────────────────────────────────────────────────
const initForm = (clientId = "") => ({
  client_id: clientId,
  portal_username: "",
  portal_password: "",
  display_name: "",
  email: "",
  can_view_tasks: true,
  can_view_documents: true,
  can_view_invoices: true,
  can_view_compliance: false,
  google_drive_folder_id: "",
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
  const [driveVisUser, setDriveVisUser] = useState(null); // portal user for drive vis modal

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get("/client-portal/users", { params: { client_id: clientId } });
      setPortalUsers(res.data);
    } catch { /* handled silently */ }
  }, [clientId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setError(""); setSuccess("");
    setLoading(true);
    try {
      if (editingId) {
        const payload = { ...form };
        if (!payload.portal_password) delete payload.portal_password;
        await api.put(`/client-portal/users/${editingId}`, payload);
        setSuccess("Portal user updated!");
      } else {
        await api.post("/client-portal/users", form);
        setSuccess("Portal credentials created!");
      }
      await loadUsers();
      setShowForm(false);
      setEditingId(null);
      setForm(initForm(clientId));
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
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

  if (user?.role !== "admin" && user?.role !== "manager") return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose?.()}>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Existing Portal Users</p>
              {portalUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{u.portal_username}</p>
                    <p className="text-xs text-gray-400">{u.display_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                    <button onClick={() => startEdit(u)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => toggleActive(u)} className="text-xs text-yellow-600 hover:underline">
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                    {u.google_drive_folder_id && (
                      <button
                        onClick={() => setDriveVisUser(u)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                        title="Manage which Drive files this client can see"
                      >
                        ☁️ Drive
                      </button>
                    )}
                    <button onClick={() => deleteUser(u.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Toggle form */}
          {!showForm ? (
            <button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(initForm(clientId)); }}
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
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Google Drive Folder ID
                  <span className="font-normal text-gray-400 ml-1">(from the folder URL)</span>
                </label>
                <input
                  value={form.google_drive_folder_id}
                  onChange={e => setField("google_drive_folder_id", e.target.value)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Share this folder with your service account email in Google Drive, then paste the folder ID here.
                </p>
              </div>

              {/* Permissions */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Data Access</p>
                <div className="grid grid-cols-2 gap-2">
                  <Toggle checked={form.can_view_tasks} onChange={v => setField("can_view_tasks", v)} label="Tasks" />
                  <Toggle checked={form.can_view_documents} onChange={v => setField("can_view_documents", v)} label="Documents" />
                  <Toggle checked={form.can_view_invoices} onChange={v => setField("can_view_invoices", v)} label="Invoices" />
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

          {/* Portal URL hint */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm">
            <p className="font-medium text-indigo-800 mb-1">📌 Portal URL for clients</p>
            <code className="text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded text-xs">
              {window.location.origin}/client-portal
            </code>
            <p className="text-indigo-600 text-xs mt-1">
              Share the above URL along with the username & password with your client.
            </p>
          </div>
        </div>
      </div>

      {/* Drive Visibility Modal – rendered outside the main modal so it stacks on top */}
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
