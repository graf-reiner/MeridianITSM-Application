'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiSend, mdiCheckCircle, mdiAlertCircle, mdiLoading } from '@mdi/js';

interface AlertChannel {
  id: string;
  name: string;
  channelType: string;
  genericConfig: { botToken?: string; chatId?: string };
  isActive: boolean;
}

export default function TelegramSettingsPage() {
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/v1/settings/alerts', { credentials: 'include' });
      if (res.ok) {
        const all = (await res.json()) as AlertChannel[];
        setChannels(all.filter((c) => c.channelType === 'TELEGRAM'));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchChannels(); }, []);

  const handleSave = async () => {
    if (!name.trim() || !botToken.trim() || !chatId.trim()) {
      setMessage({ type: 'error', text: 'Name, Bot Token, and Chat ID are all required' });
      return;
    }
    setSaving(true); setMessage(null);
    try {
      const url = editId ? `/api/v1/settings/alerts/${editId}` : '/api/v1/settings/alerts';
      const res = await fetch(url, {
        method: editId ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), channelType: 'TELEGRAM', genericConfig: { botToken: botToken.trim(), chatId: chatId.trim() }, isActive: true }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed'); }
      setMessage({ type: 'success', text: editId ? 'Updated' : 'Channel created' });
      setName(''); setBotToken(''); setChatId(''); setEditId(null); void fetchChannels();
    } catch (err) { setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed' }); }
    finally { setSaving(false); }
  };

  const handleTest = async (id: string) => {
    setTesting(true); setMessage(null);
    try {
      const res = await fetch(`/api/v1/settings/alerts/${id}/test`, { method: 'POST', credentials: 'include' });
      setMessage(res.ok ? { type: 'success', text: 'Test message sent to Telegram!' } : { type: 'error', text: 'Test failed' });
    } catch { setMessage({ type: 'error', text: 'Test failed' }); }
    finally { setTesting(false); }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/v1/settings/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
    void fetchChannels();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Link href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
        <Icon path={mdiArrowLeft} size={0.7} /> Back to Settings
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#0088cc1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon path={mdiSend} size={1.3} color="#0088cc" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Telegram</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Send notifications via Telegram Bot API</p>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
          backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: message.type === 'success' ? '#166534' : '#991b1b',
        }}>
          <Icon path={message.type === 'success' ? mdiCheckCircle : mdiAlertCircle} size={0.65} color="currentColor" />
          {message.text}
        </div>
      )}

      {!loading && channels.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Active Channels</h2>
          {channels.map((ch) => (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid var(--border-primary)', borderRadius: 8, marginBottom: 8 }}>
              <Icon path={mdiSend} size={0.8} color="#0088cc" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{ch.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chat: {ch.genericConfig.chatId}</div>
              </div>
              <button onClick={() => handleTest(ch.id)} disabled={testing} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon path={testing ? mdiLoading : mdiSend} size={0.5} color="currentColor" spin={testing} /> Test
              </button>
              <button onClick={() => { setEditId(ch.id); setName(ch.name); setBotToken(ch.genericConfig.botToken ?? ''); setChatId(ch.genericConfig.chatId ?? ''); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Edit</button>
              <button onClick={() => void handleDelete(ch.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'transparent', color: 'var(--accent-danger)', fontSize: 12, cursor: 'pointer' }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{editId ? 'Edit Channel' : 'Add Telegram Channel'}</h2>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Channel Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., IT Alerts Group" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Bot Token</label>
          <input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" style={inputStyle} />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Create a bot via @BotFather in Telegram and copy the token.
          </p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Chat ID</label>
          <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" style={inputStyle} />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Add the bot to your group, then get the chat ID via the Bot API. Group IDs start with a negative number.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : editId ? 'Update' : 'Add Channel'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setName(''); setBotToken(''); setChatId(''); }} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-primary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}
