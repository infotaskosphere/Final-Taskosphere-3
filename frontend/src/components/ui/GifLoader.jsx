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
 * Logo stays centered within the main content area only.
 */
export function ContentLoader() {
  const isDark = useDark();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        background: isDark
          ? "rgba(15, 23, 42, 0.85)"
          : "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        pointerEvents: "none",
        borderRadius: "inherit",
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
