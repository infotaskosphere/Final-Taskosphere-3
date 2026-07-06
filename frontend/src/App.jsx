import React, { Suspense, memo, useCallback } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";
import { AnimatePresence } from "framer-motion";
import GifLoader from "@/components/ui/GifLoader.jsx";
import ReminderPopupManager from "@/components/layout/ReminderPopupManager.jsx";
import { BulkWASenderProvider } from "@/components/BulkWASenderContext";
import BulkWASenderWidget from "@/contexts/BulkWASenderWidget";
import { MinimizedFormsProvider } from "@/contexts/MinimizedFormsContext";
import MinimizedFormsDock from "@/components/layout/MinimizedFormsDock.jsx";

/* ── Bottom loading bar ─────────────────────────────────────────────── */
// memo: re-renders only when loading state changes, not on every route change
const BottomLoadingBar = memo(function BottomLoadingBar() {
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
});

/* ── AnimatePresence wrapper ───────────────────────────────────────── */
// Extracted so it only re-renders on location changes, not provider updates.
// initial={false} skips the entry animation on first render = faster paint.
// mode="wait" ensures the exit animation completes before the next page mounts,
// but we keep it because it prevents layout flicker during transitions.
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {/* Key on pathname only — ignores search/hash so query param changes
          don't trigger full remount (e.g. /tasks?filter=xyz stays mounted) */}
      <AppRoutes key={location.pathname} />
    </AnimatePresence>
  );
}

/* ── Query client ──────────────────────────────────────────────────── */
// Created outside the component so it survives re-renders.
// gcTime 10min: keeps inactive query data in memory longer → instant
//   re-renders when the user returns to a page within that window.
// staleTime 5min: no re-fetch if data was fetched in the last 5 min.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes — no refetch on focus
      gcTime:    10 * 60 * 1000,  // 10 minutes — keep in memory
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,   // avoid spurious refetch on tab switch
    },
  },
});

/* ── App ───────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <MinimizedFormsProvider>
            <BulkWASenderProvider>
              {/* Bottom loading bar — always visible, no layout shift */}
              <BottomLoadingBar />

              {/* Global reminder popup — polls every page, shows on top of any route */}
              <ReminderPopupManager />

              {/* Persistent bulk-WhatsApp sender widget — survives page navigation */}
              <BulkWASenderWidget />

              {/* Dock of minimized forms (Create Task, Add Client, Add User, ...) —
                  rendered outside the route switcher so it survives navigation and
                  lets you resume any in-progress form from any page. */}
              <MinimizedFormsDock />

              <Suspense fallback={<GifLoader />}>
                <AnimatedRoutes />
              </Suspense>

              <Toaster position="top-right" richColors />
            </BulkWASenderProvider>
          </MinimizedFormsProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
