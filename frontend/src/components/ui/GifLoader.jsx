import React from "react";
import { useDark } from "@/hooks/useDark";

/**
 * GifLoader — centered full-page loading overlay using the app logo.
 * Adapts to light/dark theme automatically.
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
          ? "rgba(15, 23, 42, 0.75)"   /* dark: slate-900 tint */
          : "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <img
          src="/logo.png"
          alt="Taskosphere"
          style={{
            width: 72,
            height: 72,
            objectFit: "contain",
            pointerEvents: "none",
            animation: "ts-pulse 1.4s ease-in-out infinite",
          }}
        />
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: isDark ? "#94a3b8" : "#0D3B66",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          animation: "ts-fade 1.4s ease-in-out infinite",
        }}>
          Loading…
        </span>
      </div>

      <style>{`
        @keyframes ts-pulse {
          0%,100% { transform: scale(1);    opacity: 1;   }
          50%      { transform: scale(0.86); opacity: 0.65; }
        }
        @keyframes ts-fade {
          0%,100% { opacity: 0.7; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
