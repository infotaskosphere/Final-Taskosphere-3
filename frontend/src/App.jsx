import React, { Suspense } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";
import { AnimatePresence } from "framer-motion";

/* ── Top loading bar ─────────────────────────────────────────────────── */
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

/* ── AnimatePresence wrapper — must be inside BrowserRouter so
      useLocation works. Keyed on pathname so login→dashboard
      exit animation fires before the new route mounts.          ── */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <AppRoutes key={location.pathname} />
    </AnimatePresence>
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
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopLoadingBar />
          <Suspense fallback={null}>
            <AnimatedRoutes />
          </Suspense>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
