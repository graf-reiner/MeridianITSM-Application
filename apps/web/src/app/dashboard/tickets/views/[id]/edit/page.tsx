'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiViewDashboard } from '@mdi/js';
import ViewForm from '@/components/ViewForm';

export default function EditViewPage() {
  const params = useParams();
  const viewId = params.id as string;
  const isAdmin = true; // TODO: detect from session

  const { data: view, isLoading } = useQuery({
    queryKey: ['ticket-view', viewId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/views/${viewId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load view');
      return res.json();
    },
  });

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading view...</div>;
  }

  if (!view) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>View not found</div>;
  }

  const initialData = {
    id: view.id,
    name: view.name,
    description: view.description ?? '',
    filters: view.filters ?? {},
    sortBy: view.sortBy ?? 'createdAt',
    sortDir: view.sortDir ?? 'desc',
    displayConfig: view.displayConfig ?? { textColor: '', bgColor: '', columns: [] },
    isDefault: view.isDefault ?? false,
    isGlobal: view.isGlobal ?? false,
    assignments: view.assignments ?? [],
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/tickets" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiViewDashboard} size={1} color="var(--accent-primary)" />
          Edit View: {view.name}
        </h1>
      </div>
      <ViewForm mode="edit" isAdmin={isAdmin} initialData={initialData} />
    </div>
  );
}
