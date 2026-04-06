import React from "react";
import { useDark } from "@/hooks/useDark";

/**
 * GifLoader — full-page centered logo pulse.
 * No text. Logo at 200% (144 px). Dark-mode aware.
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
          ? "rgba(15, 23, 42, 0.80)"
          : "rgba(255, 255, 255, 0.80)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        pointerEvents: "none",
      }}
    >
      <img
        src="/logo.png"
        alt="Taskosphere"
        style={{
          width: 144,
          height: 144,
          objectFit: "contain",
          pointerEvents: "none",
          animation: "ts-pulse 1.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes ts-pulse {
          0%,100% { transform: scale(1);    opacity: 1;   }
          50%      { transform: scale(0.82); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

/**
 * MiniLoader — inline skeleton for page sections (no text, just logo pulse).
 * Use inside page bodies instead of "Loading…" text.
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
        src="/logo.png"
        alt=""
        style={{
          width: 48,
          height: 48,
          objectFit: "contain",
          animation: "ts-pulse 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}
