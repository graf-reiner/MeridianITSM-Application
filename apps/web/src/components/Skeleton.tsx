'use client';

const pulseKeyframes = `
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
`;

const baseStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-tertiary)',
  borderRadius: 6,
  animation: 'skeleton-pulse 1.5s ease-in-out infinite',
};

/** Single animated line placeholder */
export function SkeletonLine({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ ...baseStyle, width, height }} />
    </>
  );
}

/** Card-shaped placeholder */
export function SkeletonCard({ height = 100 }: { height?: number }) {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div
        style={{
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ ...baseStyle, width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ ...baseStyle, width: '40%', height: 12, marginBottom: 8 }} />
          <div style={{ ...baseStyle, width: '60%', height: 20 }} />
        </div>
      </div>
    </>
  );
}

/** Table placeholder with header and rows */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: '12px 14px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div key={`h${i}`} style={{ ...baseStyle, height: 10, width: `${50 + Math.random() * 30}%` }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r${r}`}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 12,
              padding: '12px 14px',
              borderBottom: r < rows - 1 ? '1px solid var(--bg-tertiary)' : 'none',
            }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <div key={`r${r}c${c}`} style={{ ...baseStyle, height: 12, width: `${40 + Math.random() * 40}%` }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Stat cards row placeholder */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(220px, 1fr))`, gap: 16 }}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </>
  );
}
