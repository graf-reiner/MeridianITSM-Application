'use client';

import ThemeProvider from '@/components/ThemeProvider';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-secondary)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Simple header */}
        <header style={{
          backgroundColor: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-primary)',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-primary)' }}>MeridianITSM</span>
        </header>
        <main style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
