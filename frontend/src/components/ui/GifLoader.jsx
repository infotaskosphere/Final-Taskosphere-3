import React from "react";
import { useDark } from "@/hooks/useDark";

/**
 * GifLoader — FULL-SCREEN loader.
 * Used ONLY for auth loading (before DashboardLayout mounts).
 * Do NOT use this as a Suspense fallback inside DashboardLayout —
 * use ContentLoader instead so the sidebar stays visible.
 */
export default function GifLoader() {
  const isDark = useDark();

  return (
    <div className={`taskosphere-loader taskosphere-loader--fullscreen ${isDark ? "is-dark" : ""}`}>
      <div className="taskosphere-loader__orb" aria-hidden="true" />
      <img className="taskosphere-loader__gif" src="/loader.gif" alt="Loading…" />
      <span className="taskosphere-loader__label">Preparing your workspace</span>
    </div>
  );
}

/**
 * ContentLoader — in-layout page loader.
 * Used as the <Suspense> fallback INSIDE DashboardLayout so the
 * sidebar and header stay visible while a lazy page is loading.
 * Renders inline (no overlay, no backdrop) — just centered in content area.
 */
export function ContentLoader() {
  return (
    <div className="taskosphere-loader taskosphere-loader--content">
      <div className="taskosphere-loader__orb" aria-hidden="true" />
      <img className="taskosphere-loader__gif" src="/loader.gif" alt="Loading…" />
      <span className="taskosphere-loader__label">Loading page</span>
    </div>
  );
}

/**
 * MiniLoader — inline section loader.
 * Drop-in for small loading states inside a page section.
 */
export function MiniLoader({ height = 200 }) {
  return (
    <div className="taskosphere-loader taskosphere-loader--mini" style={{ height }}>
      <div className="taskosphere-loader__orb" aria-hidden="true" />
      <img className="taskosphere-loader__gif" src="/loader.gif" alt="" />
    </div>
  );
}
