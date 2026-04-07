'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiRobotOutline, mdiCheck, mdiAlertCircle, mdiDelete } from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AiSettings {
  apiKeyConfigured: boolean;
  apiKeyMasked: string | null;
  model: string;
}

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Fast and cost-effective' },
  { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable, higher cost' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Previous generation' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Fastest, lowest cost' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AiSettingsPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current settings
  useEffect(() => {
    fetch('/api/v1/settings/ai', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: AiSettings) => {
        setSettings(data);
        setModel(data.model);
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to save');
      }

      const updated = await res.json() as AiSettings;
      setSettings(updated);
      setApiKey('');
      setSuccess('API key saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ removeKey: true }),
      });

      if (!res.ok) throw new Error('Failed to remove key');

      const updated = await res.json() as AiSettings;
      setSettings(updated);
      setSuccess('API key removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (newModel: string) => {
    setModel(newModel);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/settings/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ model: newModel }),
      });

      if (!res.ok) throw new Error('Failed to update model');

      const updated = await res.json() as AiSettings;
      setSettings(updated);
      setSuccess('Model updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  // Auto-clear success after 3s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link
          href="/dashboard/settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          <Icon path={mdiArrowLeft} size={0.85} color="currentColor" />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            AI Assistant
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Configure your OpenAI API key to enable the AI Assistant chatbot.
          </p>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 8,
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            color: 'var(--accent-danger)',
            fontSize: 13,
          }}
        >
          <Icon path={mdiAlertCircle} size={0.7} color="currentColor" />
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 8,
            backgroundColor: 'rgba(5, 150, 105, 0.1)',
            color: 'var(--accent-success)',
            fontSize: 13,
          }}
        >
          <Icon path={mdiCheck} size={0.7} color="currentColor" />
          {success}
        </div>
      )}

      {/* API Key Section */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon path={mdiRobotOutline} size={0.9} color="var(--accent-brand)" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            OpenAI API Key
          </h2>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          The AI Assistant uses your OpenAI account. Each tenant manages their own API key.
          Your key is encrypted at rest and never exposed to the browser.
          Get your API key from{' '}
          <span style={{ color: 'var(--accent-brand)' }}>platform.openai.com/api-keys</span>.
        </p>

        {/* Current key status */}
        {settings?.apiKeyConfigured && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              marginBottom: 16,
              borderRadius: 8,
              backgroundColor: 'var(--bg-tertiary)',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-success)',
                }}
              />
              <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {settings.apiKeyMasked}
              </span>
            </div>
            <button
              onClick={handleRemoveKey}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-secondary)',
                backgroundColor: 'transparent',
                color: 'var(--accent-danger)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiDelete} size={0.55} color="currentColor" />
              Remove
            </button>
          </div>
        )}

        {/* Input for new/replacement key */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.apiKeyConfigured ? 'Replace with new key...' : 'sk-...'}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSaveKey}
            disabled={saving || !apiKey.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: 'var(--accent-brand)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: saving || !apiKey.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !apiKey.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </div>

      {/* Model Selection */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          Model
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          Select the OpenAI model used by the AI Assistant. More capable models cost more per query.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODELS.map((m) => (
            <label
              key={m.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 8,
                border: `1px solid ${model === m.value ? 'var(--accent-brand)' : 'var(--border-secondary)'}`,
                backgroundColor: model === m.value ? 'rgba(2, 132, 199, 0.06)' : 'var(--bg-secondary)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <input
                type="radio"
                name="model"
                value={m.value}
                checked={model === m.value}
                onChange={() => handleModelChange(m.value)}
                style={{ accentColor: 'var(--accent-brand)' }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
