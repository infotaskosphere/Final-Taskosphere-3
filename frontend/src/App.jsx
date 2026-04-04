import React, { Suspense } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { AnimatePresence } from "framer-motion";
import GifLoader from "@/components/ui/GifLoader.jsx";
import { useLoading } from "./lib/api";

/* ── GIF-based global loader (shows on any API call) ────────────────── */
function GlobalLoader() {
  const loading = useLoading();
  if (!loading) return null;
  return <GifLoader />;
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
          <GlobalLoader />

          <Suspense fallback={<GifLoader />}>
            <AnimatedRoutes />
          </Suspense>

          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
