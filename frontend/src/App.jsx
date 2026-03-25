import React, { Suspense, useState, useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";

/* ============================================================
   SHIMMER STYLE
   ============================================================ */
const shimmerStyle = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const skBase = {
  borderRadius: "8px",
  background: "linear-gradient(90deg,#e0e0e0 25%,#f5f5f5 50%,#e0e0e0 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s infinite",
};

/* ============================================================
   TOP LOADING BAR — shows on every API call
   ============================================================ */
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

/* ============================================================
   PAGE SKELETON — shown during Suspense + route change
   ============================================================ */
function PageSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Page title */}
        <div style={{ width: "180px", height: "24px", marginBottom: "8px", ...skBase }} />
        {/* Cards */}
        {[1, 2, 3, 4, 5].map((_, i) => (
          <div key={i} style={{
            background: "#fff",
            border: "0.5px solid #eee",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}>
            <div style={{ width: "50%", height: "16px", ...skBase }} />
            <div style={{ width: "100%", height: "12px", ...skBase }} />
            <div style={{ width: "100%", height: "12px", ...skBase }} />
            <div style={{ width: "70%", height: "12px", ...skBase }} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ============================================================
   ROUTE CHANGE SKELETON — detects navigation and shows shimmer
   ============================================================ */
function RouteChangeHandler({ children }) {
  const location = useLocation();
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setIsChanging(true);
    const timer = setTimeout(() => setIsChanging(false), 600);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  if (isChanging) return <PageSkeleton />;
  return children;
}

/* ============================================================
   QUERY CLIENT
   ============================================================ */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* ============================================================
   APP
   ============================================================ */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopLoadingBar />
          <Suspense fallback={<PageSkeleton />}>
            <RouteChangeHandler>
              <AppRoutes />
            </RouteChangeHandler>
          </Suspense>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
