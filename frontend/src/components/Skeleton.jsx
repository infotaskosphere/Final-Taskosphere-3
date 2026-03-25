const shimmerCSS = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const skeletonStyle = {
  borderRadius: "8px",
  background: "linear-gradient(90deg,#e0e0e0 25%,#f5f5f5 50%,#e0e0e0 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s infinite",
};

export function SkeletonLine({ width = "100%", height = "14px", style = {} }) {
  return (
    <>
      <style>{shimmerCSS}</style>
      <div style={{ width, height, ...skeletonStyle, ...style }} />
    </>
  );
}

export function SkeletonCard({ rows = 3, style = {} }) {
  return (
    <>
      <style>{shimmerCSS}</style>
      <div style={{
        background: "#fff",
        border: "0.5px solid #eee",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        ...style
      }}>
        <div style={{ width: "50%", height: "16px", ...skeletonStyle }} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{
            width: i === rows - 1 ? "70%" : "100%",
            height: "12px",
            ...skeletonStyle
          }} />
        ))}
      </div>
    </>
  );
}

export function SkeletonPage({ cards = 4 }) {
  return (
    <>
      <style>{shimmerCSS}</style>
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ width: "180px", height: "24px", marginBottom: "8px", ...skeletonStyle }} />
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} rows={3} />
        ))}
      </div>
    </>
  );
}
```

---

**Where to place them:**
```
frontend/
└── src/
    ├── api/
    │   └── api.js          ✅ already done
    ├── hooks/
    │   └── useLoading.js   ✅ create this (new folder)
    ├── components/
    │   └── Skeleton.jsx    ✅ create this (add to existing folder)
    ├── pages/
    │   └── ...             ✅ no changes
    └── App.jsx             ✅ already done
