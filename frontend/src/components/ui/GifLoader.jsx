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
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        background: isDark
          ? "rgba(15, 23, 42, 0.92)"
          : "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        pointerEvents: "none",
      }}
    >
      <img
        src="/loader.gif"
        alt="Loading…"
        style={{
          width: 150,
          height: 150,
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        width: "100%",
      }}
    >
      <img
        src="/loader.gif"
        alt="Loading…"
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/**
 * MiniLoader — inline section loader.
 * Drop-in for small loading states inside a page section.
 */
export function MiniLoader({ height = 200 }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        width: "100%",
      }}
    >
      <img
        src="/loader.gif"
        alt=""
        style={{
          width: 70,
          height: 70,
          objectFit: "contain",
        }}
      />
    </div>
  );
}
