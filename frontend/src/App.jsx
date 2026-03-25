import React, { Suspense, useState, useEffect, useRef } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppRoutes from "./AppRoutes.jsx";
import { useLoading } from "./lib/api";

/* ============================================================
   GLOBAL STYLES — injected once
   ============================================================ */
const GLOBAL_STYLES = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes skeletonFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes pageSlideUp {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .page-enter {
    animation: pageSlideUp 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .page-enter-fast {
    animation: pageFadeIn 0.3s ease forwards;
  }

  .skeleton-appear {
    animation: skeletonFadeIn 0.2s ease forwards;
  }
`;

/* ============================================================
   SHIMMER BASE STYLE
   ============================================================ */
const shimmerBg = {
  background:
    "linear-gradient(90deg, #e8eaf0 25%, #f4f6fb 50%, #e8eaf0 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
};

const shimmerBgDark = {
  background:
    "linear-gradient(90deg, #1e2a3a 25%, #243347 50%, #1e2a3a 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
};

/* ============================================================
   SKELETON PRIMITIVES
   ============================================================ */
function SkLine({ w = "100%", h = 12, mb = 8, radius = 6, dark = false }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        marginBottom: mb,
        flexShrink: 0,
        ...(dark ? shimmerBgDark : shimmerBg),
      }}
    />
  );
}

function SkCircle({ size = 40, dark = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        ...(dark ? shimmerBgDark : shimmerBg),
      }}
    />
  );
}

function SkBox({ w = "100%", h = 40, radius = 12, dark = false, style = {} }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        ...(dark ? shimmerBgDark : shimmerBg),
        ...style,
      }}
    />
  );
}

/* ============================================================
   DETECT DARK MODE
   ============================================================ */
function useIsDark() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/* ============================================================
   DETECT WHICH PAGE WE ARE NAVIGATING TO
   — returns a hint so we can shape the skeleton
   ============================================================ */
function getPageHint(pathname) {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/reports") || pathname.startsWith("/staff-activity"))
    return "reports";
  if (pathname.startsWith("/settings")) return "settings";
  return "generic";
}

/* ============================================================
   SKELETON: STAT CARDS ROW
   ============================================================ */
function SkStatCards({ dark }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            background: dark ? "#1e293b" : "#ffffff",
            border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
            borderRadius: 16,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 14,
            }}
          >
            <SkLine w="55%" h={10} mb={0} dark={dark} />
            <SkBox w={32} h={32} radius={10} dark={dark} />
          </div>
          <SkLine w="70%" h={22} mb={6} radius={6} dark={dark} />
          <SkLine w="45%" h={9} mb={0} dark={dark} />
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   SKELETON: CONTENT CARD (generic reusable)
   ============================================================ */
function SkContentCard({ dark, rows = 3, hasAvatar = false, hasHeader = true }) {
  return (
    <div
      style={{
        background: dark ? "#1e293b" : "#ffffff",
        border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {hasHeader && (
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${
              dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"
            }`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <SkBox w={28} h={28} radius={8} dark={dark} />
          <div style={{ flex: 1 }}>
            <SkLine w="38%" h={11} mb={5} dark={dark} />
            <SkLine w="55%" h={9} mb={0} dark={dark} />
          </div>
          <SkBox w={64} h={26} radius={8} dark={dark} />
        </div>
      )}
      <div style={{ padding: "14px 18px" }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: i < rows - 1 ? 12 : 0,
              padding: "10px 12px",
              borderRadius: 12,
              background: dark
                ? "rgba(255,255,255,0.03)"
                : "rgba(0,0,0,0.015)",
              border: `1px solid ${
                dark ? "rgba(255,255,255,0.05)" : "#f1f5f9"
              }`,
            }}
          >
            {hasAvatar && <SkCircle size={34} dark={dark} />}
            <div style={{ flex: 1 }}>
              <SkLine
                w={`${60 + (i % 3) * 12}%`}
                h={11}
                mb={6}
                dark={dark}
              />
              <SkLine w={`${40 + (i % 2) * 15}%`} h={9} mb={0} dark={dark} />
            </div>
            <SkBox w={52} h={22} radius={20} dark={dark} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   SKELETON: CLIENT BOARD CARDS
   ============================================================ */
function SkClientCard({ dark }) {
  return (
    <div
      style={{
        background: dark ? "#1e293b" : "#ffffff",
        border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* left colour strip */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: "16px 0 0 16px",
          background: dark ? "#334155" : "#e2e8f0",
        }}
      />
      {/* header section */}
      <div
        style={{
          padding: "14px 14px 12px 18px",
          borderBottom: `1px solid ${
            dark ? "rgba(255,255,255,0.05)" : "#f8fafc"
          }`,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <SkBox w={40} h={40} radius={10} dark={dark} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <SkBox w={28} h={14} radius={20} dark={dark} />
              <SkBox w={46} h={14} radius={20} dark={dark} />
            </div>
            <SkLine w="80%" h={11} mb={4} dark={dark} />
            <SkLine w="55%" h={10} mb={0} dark={dark} />
          </div>
        </div>
      </div>
      {/* body */}
      <div
        style={{
          padding: "10px 14px 10px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <SkLine w="75%" h={10} mb={0} dark={dark} />
        <SkLine w="90%" h={10} mb={0} dark={dark} />
        <div style={{ display: "flex", gap: 6 }}>
          <SkBox w={48} h={18} radius={20} dark={dark} />
          <SkBox w={40} h={18} radius={20} dark={dark} />
          <SkBox w={36} h={18} radius={20} dark={dark} />
        </div>
        <SkLine w="60%" h={10} mb={0} dark={dark} />
      </div>
      {/* footer actions */}
      <div
        style={{
          height: 38,
          display: "flex",
          borderTop: `1px solid ${
            dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"
          }`,
        }}
      >
        {[1, 2, 3].map((b, i) => (
          <div
            key={b}
            style={{
              flex: 1,
              borderRight:
                i < 2
                  ? `1px solid ${dark ? "rgba(255,255,255,0.06)" : "#f1f5f9"}`
                  : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SkBox w={36} h={12} radius={4} dark={dark} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   PAGE SKELETON — shaped by route hint
   ============================================================ */
function PageSkeleton({ hint = "generic", dark = false }) {
  const bg = dark ? "#0f172a" : "#F4F6FA";

  /* ── shared header bar (page title area) ── */
  const PageHeader = () => (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 20,
        padding: "22px 28px",
        background: dark
          ? "linear-gradient(135deg, #0D3B66, #1F6FB2)"
          : "linear-gradient(135deg, #0D3B66, #1F6FB2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: "rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: 14,
              width: "22%",
              borderRadius: 6,
              background: "rgba(255,255,255,0.25)",
              marginBottom: 8,
            }}
          />
          <div
            style={{
              height: 22,
              width: "35%",
              borderRadius: 6,
              background: "rgba(255,255,255,0.35)",
            }}
          />
        </div>
        <div
          style={{
            height: 36,
            width: 120,
            borderRadius: 12,
            background: "rgba(255,255,255,0.18)",
          }}
        />
      </div>
    </div>
  );

  /* ── DASHBOARD skeleton ── */
  if (hint === "dashboard") {
    return (
      <div
        className="skeleton-appear"
        style={{ padding: "0 0 40px", background: bg }}
      >
        {/* welcome banner */}
        <div
          style={{
            borderRadius: 16,
            padding: "22px 28px",
            marginBottom: 16,
            background: "linear-gradient(135deg, #0D3B66 0%, #1F6FB2 100%)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                height: 10,
                width: 180,
                borderRadius: 5,
                background: "rgba(255,255,255,0.2)",
                marginBottom: 10,
              }}
            />
            <div
              style={{
                height: 24,
                width: 300,
                borderRadius: 7,
                background: "rgba(255,255,255,0.3)",
                marginBottom: 8,
              }}
            />
            <div
              style={{
                height: 12,
                width: 220,
                borderRadius: 5,
                background: "rgba(255,255,255,0.15)",
              }}
            />
          </div>
          <div
            style={{
              height: 60,
              width: 200,
              borderRadius: 14,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          />
        </div>
        {/* stat cards */}
        <SkStatCards dark={dark} />
        {/* 3-col row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <SkContentCard dark={dark} rows={4} hasAvatar={false} />
          <SkContentCard dark={dark} rows={4} hasAvatar={false} />
          <SkContentCard dark={dark} rows={3} hasAvatar={false} />
        </div>
        {/* 2-col task strips */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <SkContentCard dark={dark} rows={3} hasAvatar={true} />
          <SkContentCard dark={dark} rows={3} hasAvatar={true} />
        </div>
        {/* 3-col bottom */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <SkContentCard dark={dark} rows={4} hasAvatar={true} />
          <SkContentCard dark={dark} rows={4} hasAvatar={false} />
          <SkContentCard dark={dark} rows={3} hasAvatar={false} />
        </div>
      </div>
    );
  }

  /* ── CLIENTS skeleton ── */
  if (hint === "clients") {
    return (
      <div
        className="skeleton-appear"
        style={{ padding: "0 0 40px", background: bg }}
      >
        <PageHeader />
        {/* stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: dark ? "#1e293b" : "#fff",
                border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
                borderRadius: 16,
                padding: "18px 20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <SkBox w={36} h={36} radius={10} dark={dark} />
              </div>
              <SkLine w="50%" h={9} mb={6} dark={dark} />
              <SkLine w="65%" h={26} mb={0} radius={6} dark={dark} />
            </div>
          ))}
        </div>
        {/* filter bar */}
        <div
          style={{
            background: dark ? "#1e293b" : "#fff",
            border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
            borderRadius: 16,
            padding: "14px 18px",
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <SkBox w="40%" h={36} radius={12} dark={dark} />
          <SkBox w={80} h={36} radius={12} dark={dark} />
          <SkBox w={100} h={36} radius={12} dark={dark} />
          <SkBox w={90} h={36} radius={12} dark={dark} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <SkBox w={36} h={36} radius={10} dark={dark} />
            <SkBox w={76} h={36} radius={12} dark={dark} />
          </div>
        </div>
        {/* client board grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))",
            gap: 10,
          }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <SkClientCard key={i} dark={dark} />
          ))}
        </div>
      </div>
    );
  }

  /* ── TASKS skeleton ── */
  if (hint === "tasks") {
    return (
      <div
        className="skeleton-appear"
        style={{ padding: "0 0 40px", background: bg }}
      >
        <PageHeader />
        {/* filter + action row */}
        <div
          style={{
            background: dark ? "#1e293b" : "#fff",
            border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
            borderRadius: 16,
            padding: "14px 18px",
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <SkBox w="35%" h={36} radius={12} dark={dark} />
          <SkBox w={90} h={36} radius={12} dark={dark} />
          <SkBox w={100} h={36} radius={12} dark={dark} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <SkBox w={100} h={36} radius={12} dark={dark} />
          </div>
        </div>
        {/* task list */}
        <SkContentCard dark={dark} rows={6} hasAvatar={true} />
      </div>
    );
  }

  /* ── SETTINGS skeleton ── */
  if (hint === "settings") {
    return (
      <div
        className="skeleton-appear"
        style={{ padding: "0 0 40px", background: bg }}
      >
        <PageHeader />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: 16,
          }}
        >
          {/* sidebar nav */}
          <div
            style={{
              background: dark ? "#1e293b" : "#fff",
              border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "#e2e8f0"}`,
              borderRadius: 16,
              padding: 16,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background:
                    i === 0
                      ? dark
                        ? "rgba(31,111,178,0.25)"
                        : "rgba(13,59,102,0.06)"
                      : "transparent",
                }}
              >
                <SkBox w={18} h={18} radius={5} dark={dark} />
                <SkLine
                  w={`${50 + i * 6}%`}
                  h={10}
                  mb={0}
                  dark={dark}
                />
              </div>
            ))}
          </div>
          {/* main panel */}
          <div>
            <SkContentCard dark={dark} rows={4} hasAvatar={false} />
            <div style={{ marginTop: 14 }}>
              <SkContentCard dark={dark} rows={3} hasAvatar={false} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── GENERIC / REPORTS skeleton ── */
  return (
    <div
      className="skeleton-appear"
      style={{ padding: "0 0 40px", background: bg }}
    >
      <PageHeader />
      <SkStatCards dark={dark} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <SkContentCard dark={dark} rows={5} hasAvatar={true} />
        <SkContentCard dark={dark} rows={5} hasAvatar={false} />
      </div>
      <SkContentCard dark={dark} rows={4} hasAvatar={true} />
    </div>
  );
}

/* ============================================================
   TOP LOADING BAR — shows on every API call
   ============================================================ */
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
      }}
    />
  );
}

/* ============================================================
   ROUTE CHANGE HANDLER
   — shows a shaped skeleton while navigating, then fades in
     the real content with a smooth slide-up.
   ============================================================ */
function RouteChangeHandler({ children }) {
  const location = useLocation();
  const isDark = useIsDark();

  // track whether we should show skeleton
  const [phase, setPhase] = useState("ready"); // "ready" | "skeleton" | "entering"
  const prevPath = useRef(location.pathname);
  const timerRef = useRef(null);

  useEffect(() => {
    // same path (query/hash change only) — don't flash skeleton
    if (location.pathname === prevPath.current) return;
    prevPath.current = location.pathname;

    // clear any ongoing timers
    if (timerRef.current) clearTimeout(timerRef.current);

    // show skeleton immediately
    setPhase("skeleton");

    // after a short beat, switch to entering (real content with animation)
    timerRef.current = setTimeout(() => {
      setPhase("entering");
      // remove entering class after animation completes
      timerRef.current = setTimeout(() => setPhase("ready"), 500);
    }, 380);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [location.pathname]);

  if (phase === "skeleton") {
    return (
      <PageSkeleton
        hint={getPageHint(location.pathname)}
        dark={isDark}
      />
    );
  }

  return (
    <div className={phase === "entering" ? "page-enter" : undefined}>
      {children}
    </div>
  );
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
          {/* inject global keyframes once */}
          <style>{GLOBAL_STYLES}</style>

          <TopLoadingBar />

          <Suspense
            fallback={
              <PageSkeletonFallback />
            }
          >
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

/* Suspense fallback — used only on first load / lazy chunk load */
function PageSkeletonFallback() {
  const isDark = useIsDark();
  const path =
    typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ padding: "28px 28px 0" }}>
        <PageSkeleton hint={getPageHint(path)} dark={isDark} />
      </div>
    </>
  );
}

export default App;
