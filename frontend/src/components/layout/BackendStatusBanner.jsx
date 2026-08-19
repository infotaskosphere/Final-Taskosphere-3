import React from "react";
import { useBackendUnreachable } from "@/lib/api";

/**
 * BackendStatusBanner
 * ────────────────────────────────────────────────────────────────────────
 * Shows a fixed top banner when several consecutive API requests fail at
 * the network level (no HTTP response at all — DNS resolution failure,
 * connection refused, CORS block, or timeout). This is what happens when
 * VITE_API_URL points at a backend host that is down, renamed, or deleted
 * (e.g. net::ERR_NAME_NOT_RESOLVED in the browser console).
 *
 * It automatically hides itself again the moment any request succeeds —
 * no user action required, and it never blocks the UI underneath it.
 */
export default function BackendStatusBanner() {
  const unreachable = useBackendUnreachable();

  if (!unreachable) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        background: "#B91C1C",
        color: "#fff",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "center",
        padding: "8px 16px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
      }}
    >
      Can't reach the Taskosphere server right now. It may be starting up or
      temporarily unavailable — this will clear automatically once it's back.
    </div>
  );
}
