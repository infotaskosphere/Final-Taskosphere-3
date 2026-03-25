import React, { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./api/api"; // ✅ ADD THIS

// ✅ ADD THIS — YouTube-style top loading bar
function TopLoadingBar() {
  const loading = useLoading();
  return (
    <div style={{
      position: "fixed", top: 0, left: 0,
      width: loading ? "80%" : "100%",
      height: "3px",
      background: "#7F77DD",
      zIndex: 9999,
      opacity: loading ? 1 : 0,
      transition: loading ? "width 2s ease" : "opacity 0.3s ease",
      borderRadius: "0 2px 2px 0",
    }} />
  );
}

// ✅ ADD THIS — replaces the plain "Loading..." text in Suspense
function PageSkeleton() {
  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
      {[180, 260, 220, 240, 200].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? "24px" : "64px",
          width: i === 0 ? `${w}px` : "100%",
          borderRadius: "10px",
          background: "linear-gradient(90deg,#e0e0e0 25%,#f5f5f5 50%,#e0e0e0 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.4s infinite",
        }} />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopLoadingBar /> {/* ✅ ADD THIS — covers all pages, zero page edits */}
          <Suspense fallback={<PageSkeleton />}> {/* ✅ CHANGE fallback only */}
            <AppRoutes />
          </Suspense>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
