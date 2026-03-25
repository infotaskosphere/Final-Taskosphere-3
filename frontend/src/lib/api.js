import React, { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading, SkeletonPage } from "./api/api"; // ✅ everything comes from here

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopLoadingBar />
          <Suspense fallback={<SkeletonPage cards={5} />}>
            <AppRoutes />
          </Suspense>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
