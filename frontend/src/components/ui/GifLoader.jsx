import React from "react";
import { useDark } from "@/hooks/useDark";

/**
 * GifLoader — full-page centered loader.gif overlay.
 * Used as the global page/suspense loading screen.
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
          ? "rgba(15, 23, 42, 0.88)"
          : "rgba(255, 255, 255, 0.88)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        pointerEvents: "none",
      }}
    >
      <img
        src="/loader.gif"
        alt="Loading…"
        style={{
          width: 120,
          height: 120,
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/**
 * MiniLoader — inline section loader using loader.gif.
 * Drop-in replacement for any "Loading…" text or skeleton inside page bodies.
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
          width: 56,
          height: 56,
          objectFit: "contain",
        }}
      />
    </div>
  );
}
