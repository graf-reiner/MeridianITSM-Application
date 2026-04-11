'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiAlertCircle } from '@mdi/js';
import ApplicationForm, {
  type ApplicationFormValues,
} from '@/components/ApplicationForm';
import Breadcrumb from '@/components/Breadcrumb';

// Matches the shape returned by GET /api/v1/applications/:id (subset we need).
interface ApplicationDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
  description: string | null;
  hostingModel: string | null;
  techStack: string[] | null;
  authMethod: string | null;
  dataClassification: string | null;
  annualCost: number | null;
  rpo: number | null;
  rto: number | null;
  lifecycleStage: string | null;
  strategicRating: number | null;
  supportNotes: string | null;
  specialNotes: string | null;
  osRequirements: string | null;
  vendorContact: string | null;
  licenseInfo: string | null;
}

function toFormValues(app: ApplicationDetail): Partial<ApplicationFormValues> {
  return {
    name: app.name,
    type: app.type,
    status: app.status,
    criticality: app.criticality,
    description: app.description ?? '',
    hostingModel: app.hostingModel ?? '',
    lifecycleStage: app.lifecycleStage ?? '',
    annualCost: app.annualCost != null ? String(app.annualCost) : '',
    rpo: app.rpo != null ? String(app.rpo) : '',
    rto: app.rto != null ? String(app.rto) : '',
    strategicRating:
      app.strategicRating != null ? String(app.strategicRating) : '',
    authMethod: app.authMethod ?? '',
    dataClassification: app.dataClassification ?? '',
    techStack: Array.isArray(app.techStack) ? app.techStack.join(', ') : '',
    vendorContact: app.vendorContact ?? '',
    licenseInfo: app.licenseInfo ?? '',
    supportNotes: app.supportNotes ?? '',
    specialNotes: app.specialNotes ?? '',
    osRequirements: app.osRequirements ?? '',
  };
}

export default function EditApplicationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // Share the cache with the detail page so edits don't double-fetch.
  const { data, isLoading, error } = useQuery<ApplicationDetail>({
    queryKey: ['application', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load application');
      return res.json() as Promise<ApplicationDetail>;
    },
    enabled: !!id,
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Applications', href: '/dashboard/applications' },
          data?.name
            ? {
                label: data.name,
                href: `/dashboard/applications/${id}`,
              }
            : { label: '…' },
          { label: 'Edit' },
        ]}
      />

      {isLoading && (
        <div
          style={{
            padding: '60px 0',
            textAlign: 'center',
            color: 'var(--text-placeholder)',
          }}
        >
          Loading application…
        </div>
      )}

      {error && (
        <div style={{ padding: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--accent-danger)',
            }}
          >
            <Icon path={mdiAlertCircle} size={1} color="currentColor" />
            <span>Application not found or failed to load.</span>
          </div>
        </div>
      )}

      {data && (
        <ApplicationForm
          mode="edit"
          applicationId={id}
          initial={toFormValues(data)}
        />
      )}
    </div>
  );
}
