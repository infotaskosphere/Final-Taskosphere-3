import React from "react";

/**
 * GifLoader — centered full-page loading overlay using the branded GIF.
 * No backdrop blur so the sidebar remains visible underneath.
 */
export default function GifLoader() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        background: "rgba(255, 255, 255, 0.5)",
        pointerEvents: "none",
      }}
    >
      <img
        src="/loader.gif"
        alt="Loading…"
        style={{
          width: 150,
          height: "auto",
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
