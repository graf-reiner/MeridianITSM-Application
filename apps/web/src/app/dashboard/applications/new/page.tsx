'use client';

import ApplicationForm from '@/components/ApplicationForm';
import Breadcrumb from '@/components/Breadcrumb';

export default function NewApplicationPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Applications', href: '/dashboard/applications' },
          { label: 'New Application' },
        ]}
      />
      <ApplicationForm mode="create" />
    </div>
  );
}
