'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiDatabase,
  mdiServer,
  mdiDesktopClassic,
  mdiLanConnect,
  mdiCloud,
  mdiCog,
  mdiApplication,
  mdiShieldLock,
  mdiPackageVariant,
  mdiAlertCircleOutline,
  mdiChevronRight,
  mdiClockAlertOutline,
  mdiLinkVariantOff,
  mdiShieldCheckOutline,
  mdiAccountAlertOutline,
  mdiAccountGroupOutline,
  mdiContentDuplicate,
  mdiArrowRight,
  mdiEyeOutline,
  mdiCheckDecagram,
  mdiChartBar,
} from '@mdi/js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ByClass {
  classKey: string;
  className: string;
  count: number;
}

interface ByEnvironment {
  envKey: string;
  envName: string;
  count: number;
}

interface HealthReport {
  totalCIs: number;
  byClass: ByClass[];
  byEnvironment: ByEnvironment[];
  staleCIs: number;
  orphanedCIs: number;
  pendingDuplicates: number;
  missingOwner: number;
  missingSupportGroup: number;
  attestedLast30Days: number;
  attestationCoverage: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClassIcon(classKey: string): string {
  switch (classKey.toLowerCase()) {
    case 'server':          return mdiServer;
    case 'workstation':     return mdiDesktopClassic;
    case 'network_device':
    case 'network':         return mdiLanConnect;
    case 'database':        return mdiDatabase;
    case 'cloud_resource':
    case 'cloud':           return mdiCloud;
    case 'service':         return mdiCog;
    case 'application':     return mdiApplication;
    case 'security_device':
    case 'security':        return mdiShieldLock;
    case 'storage':         return mdiPackageVariant;
    default:                return mdiServer;
  }
}

function getEnvColor(envKey: string): { bg: string; text: string; border: string } {
  switch (envKey.toLowerCase()) {
    case 'prod':
    case 'production':
      return { bg: 'var(--badge-green-bg)', text: '#065f46', border: '#86efac' };
    case 'test':
    case 'testing':
    case 'qa':
      return { bg: 'var(--badge-blue-bg)', text: '#1e40af', border: '#93c5fd' };
    case 'dev':
    case 'development':
      return { bg: 'var(--badge-purple-bg-subtle)', text: '#6b21a8', border: '#c4b5fd' };
    case 'staging':
    case 'uat':
      return { bg: 'var(--badge-yellow-bg)', text: '#92400e', border: '#fcd34d' };
    case 'dr':
    case 'disaster_recovery':
      return { bg: 'var(--badge-red-bg)', text: '#991b1b', border: '#fca5a5' };
    default:
      return { bg: 'var(--bg-tertiary)', text: '#6b7280', border: '#d1d5db' };
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CMDBHealthDashboard() {
  const { data, isLoading, error } = useQuery<HealthReport>({
    queryKey: ['cmdb-health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/reports/health', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load health report: ${res.status}`);
      return res.json() as Promise<HealthReport>;
    },
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <Breadcrumb />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiChartBar} size={1} color="var(--accent-primary)" />
            CMDB Health Dashboard
          </h1>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ height: 16, width: '60%', background: 'var(--bg-tertiary)', borderRadius: 4, marginBottom: 12 }} />
              <div style={{ height: 32, width: '40%', background: 'var(--bg-tertiary)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <Breadcrumb />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon path={mdiChartBar} size={1} color="var(--accent-primary)" />
            CMDB Health Dashboard
          </h1>
        </div>
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Icon path={mdiAlertCircleOutline} size={2} color="#ef4444" />
          <p style={{ marginTop: 12, fontSize: 14 }}>Failed to load CMDB health data. Please try again later.</p>
        </div>
      </div>
    );
  }

  const maxClassCount = Math.max(...data.byClass.map((c) => c.count), 1);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Breadcrumb />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiChartBar} size={1} color="var(--accent-primary)" />
          CMDB Health Dashboard
        </h1>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>

        {/* Total CIs */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon path={mdiDatabase} size={0.85} color="var(--accent-primary)" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Total CIs</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>{data.totalCIs.toLocaleString()}</div>
        </div>

        {/* Stale CIs */}
        <Link href="/dashboard/cmdb?staleness=stale" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,.08)',
            border: data.staleCIs > 0 ? '1px solid #fca5a5' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'box-shadow .15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Icon path={mdiClockAlertOutline} size={0.85} color={data.staleCIs > 0 ? '#ef4444' : 'var(--text-tertiary)'} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Stale CIs</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: data.staleCIs > 0 ? '#ef4444' : 'var(--text-primary)' }}>
              {data.staleCIs}
            </div>
          </div>
        </Link>

        {/* Orphaned CIs */}
        <div style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,.08)',
          border: data.orphanedCIs > 0 ? '1px solid #fcd34d' : '1px solid transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon path={mdiLinkVariantOff} size={0.85} color={data.orphanedCIs > 0 ? '#f59e0b' : 'var(--text-tertiary)'} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Orphaned CIs</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: data.orphanedCIs > 0 ? '#f59e0b' : 'var(--text-primary)' }}>
            {data.orphanedCIs}
          </div>
        </div>

        {/* Attestation Coverage */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon path={mdiShieldCheckOutline} size={0.85} color="var(--accent-primary)" />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Attestation Coverage</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {data.attestationCoverage.toFixed(1)}%
          </div>
          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(data.attestationCoverage, 100)}%`,
              height: '100%',
              borderRadius: 3,
              background: data.attestationCoverage >= 80 ? '#22c55e' : data.attestationCoverage >= 50 ? '#f59e0b' : '#ef4444',
              transition: 'width .4s ease',
            }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {data.attestedLast30Days} attested in last 30 days
          </div>
        </div>
      </div>

      {/* ── Middle Row: By Class + By Environment ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* CI Count by Class */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>CI Count by Class</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.byClass.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No class data available.</div>
            )}
            {data.byClass.map((c) => (
              <div key={c.classKey} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon path={getClassIcon(c.classKey)} size={0.75} color="var(--text-secondary)" />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', width: 120, flexShrink: 0 }}>{c.className}</span>
                <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(c.count / maxClassCount) * 100}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--accent-primary)',
                    opacity: 0.75,
                    minWidth: c.count > 0 ? 4 : 0,
                    transition: 'width .3s ease',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', width: 40, textAlign: 'right', flexShrink: 0 }}>
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CI Count by Environment */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>CI Count by Environment</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.byEnvironment.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No environment data available.</div>
            )}
            {data.byEnvironment.map((e) => {
              const colors = getEnvColor(e.envKey);
              return (
                <div key={e.envKey} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: colors.bg,
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: 500,
                }}>
                  <span>{e.envName}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{e.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Data Quality + Quick Actions ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Data Quality Issues */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Data Quality Issues</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <QualityRow
              icon={mdiAccountAlertOutline}
              label="Missing Owner"
              count={data.missingOwner}
              color={data.missingOwner > 0 ? '#f59e0b' : undefined}
              href="/dashboard/cmdb?filter=missingOwner"
            />
            <QualityRow
              icon={mdiAccountGroupOutline}
              label="Missing Support Group"
              count={data.missingSupportGroup}
              color={data.missingSupportGroup > 0 ? '#f59e0b' : undefined}
              href="/dashboard/cmdb?filter=missingSupportGroup"
            />
            <QualityRow
              icon={mdiContentDuplicate}
              label="Pending Duplicates"
              count={data.pendingDuplicates}
              color={data.pendingDuplicates > 0 ? '#ef4444' : undefined}
              href="/dashboard/cmdb/duplicates"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ActionButton
              icon={mdiClockAlertOutline}
              label="View Stale CIs"
              href="/dashboard/cmdb?staleness=stale"
            />
            <ActionButton
              icon={mdiContentDuplicate}
              label="Review Duplicates"
              href="/dashboard/cmdb/duplicates"
            />
            <ActionButton
              icon={mdiCheckDecagram}
              label="Run Attestation"
              description="Attest individual CIs from the CI detail page"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function Breadcrumb() {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, fontSize: 13, color: 'var(--text-tertiary)' }}>
      <Link href="/dashboard/cmdb" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
        CMDB
      </Link>
      <Icon path={mdiChevronRight} size={0.6} color="var(--text-tertiary)" />
      <span style={{ color: 'var(--text-secondary)' }}>Health Dashboard</span>
    </nav>
  );
}

function QualityRow({ icon, label, count, color, href }: {
  icon: string;
  label: string;
  count: number;
  color?: string;
  href?: string;
}) {
  const content = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      borderRadius: 8,
      background: 'var(--bg-secondary)',
      cursor: href ? 'pointer' : 'default',
      transition: 'background .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon path={icon} size={0.8} color={color || 'var(--text-tertiary)'} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)' }}>{count}</span>
        {href && <Icon path={mdiArrowRight} size={0.65} color="var(--text-tertiary)" />}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none' }}>{content}</Link>;
  }
  return content;
}

function ActionButton({ icon, label, href, description }: {
  icon: string;
  label: string;
  href?: string;
  description?: string;
}) {
  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-secondary)',
    cursor: href ? 'pointer' : 'default',
    textDecoration: 'none',
    transition: 'background .15s',
  };

  const inner = (
    <>
      <Icon path={icon} size={0.8} color="var(--accent-primary)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{description}</div>
        )}
      </div>
      {href && <Icon path={mdiArrowRight} size={0.65} color="var(--text-tertiary)" />}
    </>
  );

  if (href) {
    return <Link href={href} style={buttonStyle}>{inner}</Link>;
  }
  return <div style={buttonStyle}>{inner}</div>;
}
