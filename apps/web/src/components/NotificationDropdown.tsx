'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@mdi/react';
import {
  mdiBell,
  mdiTicketOutline,
  mdiAccountArrowRight,
  mdiCommentTextOutline,
  mdiCheckCircleOutline,
  mdiAlertOutline,
  mdiSwapHorizontal,
  mdiInformationOutline,
  mdiCheckAll,
} from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceId: string | null;
  resource: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  unreadCount: number;
}

// ─── Icon Map ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  TICKET_CREATED: mdiTicketOutline,
  TICKET_ASSIGNED: mdiAccountArrowRight,
  TICKET_COMMENTED: mdiCommentTextOutline,
  TICKET_UPDATED: mdiTicketOutline,
  TICKET_RESOLVED: mdiCheckCircleOutline,
  SLA_WARNING: mdiAlertOutline,
  SLA_BREACH: mdiAlertOutline,
  CHANGE_APPROVAL: mdiSwapHorizontal,
  CHANGE_UPDATED: mdiSwapHorizontal,
  SYSTEM: mdiInformationOutline,
};

function getIcon(type: string) {
  return TYPE_ICONS[type] ?? mdiInformationOutline;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getResourceLink(n: Notification): string | null {
  if (!n.resourceId || !n.resource) return null;
  if (n.resource === 'ticket') return `/dashboard/tickets/${n.resourceId}`;
  if (n.resource === 'change') return `/dashboard/changes/${n.resourceId}`;
  if (n.resource === 'approval') return `/dashboard/approvals`;
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Fetch unread count on mount and periodically
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/unread-count', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { count: number };
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/notifications?pageSize=15', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as NotificationsResponse;
        setNotifications(data.data);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/v1/notifications/read-all', { method: 'PATCH', credentials: 'include' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Non-critical
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Non-critical
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleToggle}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          color: 'var(--text-secondary)',
          borderRadius: 6,
          marginRight: 8,
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Icon path={mdiBell} size={0.9} color="currentColor" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              backgroundColor: 'var(--accent-danger)',
              color: '#fff',
              borderRadius: '50%',
              width: 16,
              height: 16,
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 6,
            width: 360,
            maxHeight: 480,
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            boxShadow: '0 10px 15px -3px var(--shadow-lg)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--accent-primary)',
                  fontWeight: 500,
                }}
              >
                <Icon path={mdiCheckAll} size={0.6} color="currentColor" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Loading...
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No notifications yet
              </div>
            )}

            {!loading &&
              notifications.map((n) => {
                const link = getResourceLink(n);
                const Wrapper = link ? 'a' : 'div';
                return (
                  <Wrapper
                    key={n.id}
                    {...(link ? { href: link, onClick: () => { setOpen(false); void handleMarkRead(n.id); } } : {})}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      backgroundColor: n.isRead ? 'transparent' : 'var(--bg-secondary)',
                      textDecoration: 'none',
                      cursor: link ? 'pointer' : 'default',
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    >
                      <Icon path={getIcon(n.type)} size={0.65} color="var(--text-muted)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: n.isRead ? 400 : 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            lineHeight: 1.3,
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                    {!n.isRead && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-primary)',
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </Wrapper>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
