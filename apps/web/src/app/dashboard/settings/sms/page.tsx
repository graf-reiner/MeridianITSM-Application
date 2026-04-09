'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiCellphone, mdiInformationOutline } from '@mdi/js';

export default function SmsSettingsPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
        <Icon path={mdiArrowLeft} size={0.7} /> Back to Settings
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#0891b21a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon path={mdiCellphone} size={1.3} color="#0891b2" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>SMS Notifications</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Send critical alerts via text message</p>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
          <Icon path={mdiInformationOutline} size={0.85} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
              Provider Required
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              SMS notifications require a third-party SMS provider account. MeridianITSM supports the following providers:
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {[
            { name: 'Twilio', desc: 'Most popular. Pay-per-message pricing. Global coverage.', url: 'https://www.twilio.com/sms' },
            { name: 'Vonage (Nexmo)', desc: 'Competitive pricing. Strong international delivery.', url: 'https://www.vonage.com/communications-apis/sms/' },
            { name: 'AWS SNS', desc: 'Best for AWS-hosted deployments. Low cost at scale.', url: 'https://aws.amazon.com/sns/' },
          ].map((provider) => (
            <div key={provider.name} style={{
              padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {provider.name}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                {provider.desc}
              </div>
              <a
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none' }}
              >
                Learn more &rarr;
              </a>
            </div>
          ))}
        </div>

        <div style={{
          padding: '14px 16px', borderRadius: 8, backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe', fontSize: 13, color: '#1e40af', lineHeight: 1.6,
        }}>
          <strong>Setup:</strong> Once you have a provider account, contact your MeridianITSM administrator
          to configure the SMS gateway credentials. SMS will then be available as a notification
          action in your notification rules and workflow automations.
        </div>
      </div>
    </div>
  );
}
