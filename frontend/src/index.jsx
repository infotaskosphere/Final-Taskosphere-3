import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// ✅ FIXED: Explicit .jsx extension for Vite compatibility
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext";

/**
 * Taskosphere Entry Point
 * Note: react-app-polyfill has been removed as Vite supports 
 * modern browser features by default.
 */

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element. Check your index.html.");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
