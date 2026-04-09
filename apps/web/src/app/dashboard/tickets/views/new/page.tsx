'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiViewDashboard } from '@mdi/js';
import ViewForm from '@/components/ViewForm';
import { useSession } from '@/hooks/useSession';

export default function NewViewPage() {
  const { isAdmin } = useSession();

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/tickets" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiViewDashboard} size={1} color="var(--accent-primary)" />
          Create Ticket View
        </h1>
      </div>
      <ViewForm mode="create" isAdmin={isAdmin} />
    </div>
  );
}
