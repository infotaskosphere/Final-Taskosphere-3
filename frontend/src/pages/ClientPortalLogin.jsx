import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

// Ensure baseURL always ends with /api regardless of how VITE_API_URL is set in Render
const _raw = import.meta?.env?.VITE_API_URL || "/api";
const _base = _raw.replace(/\/+$/, "");
const API_BASE = _base.endsWith("/api") ? _base : _base + "/api";
const API = axios.create({ baseURL: API_BASE });

const BACKEND_URL = "https://final-taskosphere-backend.onrender.com";

export default function ClientPortalLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverWaking, setServerWaking] = useState(false);

  // Retry login up to 3 times with increasing delay — handles Render cold starts
  const loginWithRetry = async (retries = 3, retryDelay = 3000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await API.post("/client-portal/login", form);
      } catch (err) {
        // If it's a 401 / 403 (auth error) — no point retrying
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          throw err;
        }
        // Last attempt — throw so the caller handles the error
        if (i === retries - 1) throw err;
        // Wait before retrying (network error or 503 cold start)
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setServerWaking(false);

    // Ping the backend to help wake it up from Render's free-tier sleep
    fetch(`${BACKEND_URL}/health`).catch(() => {});

    // Show "server is waking up" hint after 3 seconds so users don't panic
    const wakingTimer = setTimeout(() => setServerWaking(true), 3000);

    try {
      const res = await loginWithRetry();

      clearTimeout(wakingTimer);
      setServerWaking(false);

      const data = res?.data;
      const access_token = data?.access_token;
      const user = data?.user;

      if (!access_token) {
        setError("Could not connect to the server. Please wait a moment and try again.");
        return;
      }

      sessionStorage.setItem("client_portal_token", access_token);
      sessionStorage.setItem(
        "client_portal_user",
        user && typeof user === "object" ? JSON.stringify(user) : "null"
      );
      navigate("/client-portal/dashboard");
    } catch (err) {
      clearTimeout(wakingTimer);
      setServerWaking(false);

      const detail = err?.response?.data?.detail;
      let msg = "Invalid credentials. Please try again.";
      if (typeof detail === "string") msg = detail;
      else if (Array.isArray(detail)) msg = detail.map((d) => d.msg || JSON.stringify(d)).join(" | ");
      else if (detail) msg = JSON.stringify(detail);
      else if (!err?.response) msg = "Server is starting up — please wait ~30 seconds and try again.";
      else if (err?.response?.status === 503) msg = "Server is temporarily unavailable. Please wait ~30 seconds and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                required
                autoFocus
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Enter your password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>

            {serverWaking && !error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Server is waking up — this may take up to 30 seconds on first sign-in…</span>
              </div>
            )}

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
