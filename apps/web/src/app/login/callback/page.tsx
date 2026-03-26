'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginCallbackPage() {
  const searchParams = useSearchParams();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    const token = searchParams.get('token');
    const next = searchParams.get('next') ?? '/dashboard/tickets';

    if (!token) {
      window.location.href = '/login?error=No+token+received';
      return;
    }

    // Set the cookie on THIS origin (port 3000)
    document.cookie = `meridian_session=${token}; path=/; max-age=${15 * 60}; SameSite=Lax`;
    setDone(true);

    // Redirect to the dashboard
    window.location.replace(next);
  }, [searchParams, done]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <p style={{ color: '#64748b', fontSize: 14 }}>Signing in...</p>
    </div>
  );
}
