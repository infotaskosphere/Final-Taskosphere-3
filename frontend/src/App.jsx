import React, { Suspense } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";
import { AnimatePresence } from "framer-motion";
import GifLoader from "@/components/ui/GifLoader.jsx";

/* ── Bottom loading bar ─────────────────────────────────────────────── */
function BottomLoadingBar() {
  const loading = useLoading();
  if (!loading) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "30%",
        height: 3,
        background: "linear-gradient(90deg, #7F77DD, #1F6FB2)",
        zIndex: 9999,
        animation: "loadingBar 1.2s infinite ease-in-out",
        pointerEvents: "none",
      }}
    />
  );
}

/* ── AnimatePresence wrapper ───────────────────────────────────────── */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <AppRoutes key={location.pathname} />
    </AnimatePresence>
  );
}

/* ── Query client ──────────────────────────────────────────────────── */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* ── App ───────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          {/* ✅ Bottom loading bar — always kept */}
          <BottomLoadingBar />

          {/* ✅ GifLoader for lazy page chunk loading */}
          <Suspense fallback={<GifLoader />}>
            <AnimatedRoutes />
          </Suspense>

          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
