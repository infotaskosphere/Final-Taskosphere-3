import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API = axios.create({ baseURL: import.meta?.env?.VITE_API_URL || "/api" });

export default function ClientPortalLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await API.post("/client-portal/login", form);

      // Validate the response has the expected shape before storing anything
      const data = res?.data;
      const access_token = data?.access_token;
      const user = data?.user;

      if (!access_token) {
        // This can happen if the backend is restarting — ask user to retry
        setError("Could not connect to the server. Please wait a moment and try again.");
        return;
      }

      sessionStorage.setItem("client_portal_token", access_token);
      // Safely serialise — never write the string "undefined" to sessionStorage
      sessionStorage.setItem(
        "client_portal_user",
        user && typeof user === "object" ? JSON.stringify(user) : "null"
      );
      navigate("/client-portal/dashboard");
    } catch (err) {
      // Pydantic v2 may return detail as an array of objects, not a plain string
      const detail = err?.response?.data?.detail;
      let msg = "Invalid credentials. Please try again.";
      if (typeof detail === "string") msg = detail;
      else if (Array.isArray(detail)) msg = detail.map(d => d.msg || JSON.stringify(d)).join(" | ");
      else if (detail) msg = JSON.stringify(detail);
      else if (!err?.response) msg = "Could not reach the server. Please check your connection and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Client Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to access your documents & updates</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                required
                autoFocus
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Enter your username"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Enter your password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition text-sm shadow-sm"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-6">
            Need access? Contact your account manager.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Powered by Taskosphere
        </p>
      </div>
    </div>
  );
}
