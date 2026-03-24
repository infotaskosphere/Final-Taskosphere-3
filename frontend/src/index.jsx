import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// ✅ FIXED: Using .jsx extension for Vite build compatibility
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext";

/**
 * Taskosphere - Main Entry Point
 * Note: Polyfills removed for Vite optimization.
 */

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Critical: Root element 'root' not found in index.html");
} else {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
}
