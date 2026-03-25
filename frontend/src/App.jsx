import React, { Suspense } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";

/* ── Top loading bar (thin progress line at top) ─────────────────────── */
function TopLoadingBar() {
  const loading = useLoading();
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: loading ? "75%" : "100%",
        height: 3,
        background: "linear-gradient(90deg, #7F77DD, #1F6FB2)",
        zIndex: 9999,
        opacity: loading ? 1 : 0,
        transition: loading
          ? "width 2.5s cubic-bezier(0.1, 0.4, 0.2, 1)"
          : "opacity 0.4s ease",
        borderRadius: "0 2px 2px 0",
        pointerEvents: "none",
      }}
    />
  );
}

/* ── Query client ────────────────────────────────────────────────────── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* ── App ─────────────────────────────────────────────────────────────── */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopLoadingBar />
          <Suspense fallback={null}>
            <AppRoutes />
          </Suspense>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
