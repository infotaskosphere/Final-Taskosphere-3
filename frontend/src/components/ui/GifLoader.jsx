import React from "react";

/**
 * GifLoader — centered full-page loading overlay using the branded GIF.
 * Drop-in replacement for any "Loading..." text or spinner.
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
        background: "rgba(255, 255, 255, 0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <img
        src="/loader.gif"
        alt="Loading…"
        style={{
          width: 120,
          height: "auto",
          objectFit: "contain",
        }}
      />
    </div>
  );
}
