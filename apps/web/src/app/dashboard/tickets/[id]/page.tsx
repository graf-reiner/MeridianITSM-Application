'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiPaperclip, mdiSend, mdiAccountCircle, mdiClockOutline, mdiCloudUploadOutline, mdiPlus, mdiLinkVariant, mdiMerge, mdiEyeOutline, mdiEyeOffOutline, mdiCheckDecagram, mdiClose } from '@mdi/js';
import CannedResponsePicker from '@/components/CannedResponsePicker';
import RichTextField from '@/components/RichTextField';
import SlaCountdown from '../../../../components/SlaCountdown';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { UnsavedChangesToast } from '@/components/UnsavedChangesToast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assignee: { id: string; firstName: string; lastName: string } | null;
  requester: { id: string; firstName: string; lastName: string; email: string } | null;
  category: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  slaPolicy: { id: string; name: string } | null;
  assignedGroup?: { id: string; name: string } | null;
  source: string;
  attachments: Array<{ id: string }>;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown> | null;
}

interface Comment {
  id: string;
  body: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  author: { firstName: string; lastName: string } | null;
  createdAt: string;
  timeSpentMinutes: number | null;
}

interface Activity {
  id: string;
  action: string;
  actor: { firstName: string; lastName: string } | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
}

interface SlaStatus {
  slaBreachAt: string | null;
  isPaused: boolean;
  elapsedPercentage: number;
  pauseReason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(s: string) {
  switch (s) {
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'RESOLVED': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    case 'CLOSED': return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'CANCELLED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getPriorityStyle(p: string) {
  switch (p) {
    case 'CRITICAL': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'HIGH': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'MEDIUM': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'LOW': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING', 'RESOLVED', 'CANCELLED'],
  PENDING: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: [],
  CANCELLED: [],
};

// ─── Ticket Detail Page ───────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const ticketId = params.id as string;
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'attachments' | 'cis' | 'children' | 'links'>('comments');
  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editAssignee, setEditAssignee] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editQueue, setEditQueue] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSla, setEditSla] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editType, setEditType] = useState('');
  const [sidebarSaving, setSidebarSaving] = useState(false);
  // Modal states for children, links, merge, watchers, approvals
  const [showChildModal, setShowChildModal] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [childSubmitting, setChildSubmitting] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTicketNumber, setLinkTicketNumber] = useState('');
  const [linkType, setLinkType] = useState('RELATED_TO');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTicketNumbers, setMergeTicketNumbers] = useState('');
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [watcherUserId, setWatcherUserId] = useState('');
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const { data: ticket, isLoading, error } = useQuery<TicketDetail>({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load ticket');
      const raw = await res.json();
      const data = raw.ticket ?? raw;
      // Normalize API field names to match interface
      return {
        ...data,
        assignee: data.assignee ?? data.assignedTo ?? null,
        requester: data.requester ?? data.requestedBy ?? null,
        slaPolicy: data.slaPolicy ?? data.sla ?? null,
      } as TicketDetail;
    },
  });

  const { data: slaStatus } = useQuery<SlaStatus>({
    queryKey: ['ticket-sla', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/sla-status`, { credentials: 'include' });
      if (!res.ok) return { slaBreachAt: null, isPaused: false, elapsedPercentage: 0 };
      return res.json() as Promise<SlaStatus>;
    },
    enabled: !!ticket?.slaPolicy,
  });

  const { data: commentsData } = useQuery<{ comments: Comment[] }>({
    queryKey: ['ticket-comments', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/comments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load comments');
      return res.json() as Promise<{ comments: Comment[] }>;
    },
    enabled: activeTab === 'comments',
  });

  const { data: activitiesData } = useQuery<{ activities: Activity[] }>({
    queryKey: ['ticket-activities', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/activities`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load activities');
      return res.json() as Promise<{ activities: Activity[] }>;
    },
    enabled: activeTab === 'activity',
  });

  const { data: attachmentsData, refetch: refetchAttachments } = useQuery<{ attachments: Array<{ id: string; filename: string; fileSize: number; createdAt: string; uploadedBy?: { firstName: string; lastName: string } }> }>({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/attachments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load attachments');
      return res.json();
    },
    enabled: activeTab === 'attachments',
  });

  // ── Dropdown options for editable sidebar fields ──────────────────────────
  const { data: usersData } = useQuery<Array<{ id: string; firstName: string; lastName: string }>>({
    queryKey: ['users-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      const list = json.data ?? json.users ?? (Array.isArray(json) ? json : []);
      return list;
    },
  });

  const { data: queuesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['queues-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: categoriesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['categories-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
  });

  const { data: slaPoliciesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['sla-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/sla', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.policies ?? [];
    },
  });

  const { data: groupsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['groups-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/groups', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.groups ?? [];
    },
  });

  // ── Watchers ──────────────────────────────────────────────────────────────
  const { data: watchersData } = useQuery<Array<{ id: string; user: { id: string; firstName: string; lastName: string; email: string } }>>({
    queryKey: ['ticket-watchers', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/watchers`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Agent Presence (collision detection) ─────────────────────────────────
  const { data: presenceData } = useQuery<{ agents: Array<{ userId: string }> }>({
    queryKey: ['ticket-presence', ticketId],
    queryFn: async () => {
      // Send heartbeat and get presence
      await fetch(`/api/v1/tickets/${ticketId}/presence/heartbeat`, { method: 'POST', credentials: 'include' });
      const res = await fetch(`/api/v1/tickets/${ticketId}/presence`, { credentials: 'include' });
      if (!res.ok) return { agents: [] };
      return res.json();
    },
    refetchInterval: 15000, // Every 15 seconds
  });

  // ── Children tickets ──────────────────────────────────────────────────────
  const { data: childrenData } = useQuery<Array<{ id: string; ticketNumber: number; title: string; status: string; priority: string }>>({
    queryKey: ['ticket-children', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/children`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'children',
  });

  // ── Linked tickets ────────────────────────────────────────────────────────
  const { data: linksData } = useQuery<Array<{ id: string; linkType: string; ticket: { id: string; ticketNumber: number; title: string; status: string; priority: string } }>>({
    queryKey: ['ticket-links', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/links`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'links',
  });

  // ── Similar ticket suggestions ────────────────────────────────────────────
  const { data: similarData } = useQuery<Array<{ id: string; ticketNumber: number; title: string; status: string; priority: string }>>({
    queryKey: ['ticket-similar', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/similar?limit=3`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  // ── CSAT Survey ────────────────────────────────────────────────────────────
  const { data: surveyData } = useQuery<{ available?: boolean; alreadyResponded?: boolean; template?: { id: string; name: string; questions: Array<{ id: string; type: string; label: string; required?: boolean }> } }>({
    queryKey: ['ticket-survey', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/surveys/ticket/${ticketId}`, { credentials: 'include' });
      if (!res.ok) return { available: false };
      return res.json();
    },
    enabled: !!ticket && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'),
  });

  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, unknown>>({});
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  const handleSurveySubmit = async () => {
    if (!surveyData?.template) return;
    setSurveySubmitting(true);
    try {
      const answers = Object.entries(surveyAnswers).map(([questionId, value]) => ({ questionId, value }));
      await fetch('/api/v1/surveys/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ticketId, templateId: surveyData.template.id, answers }),
      });
      setSurveySubmitted(true);
    } catch { /* ignore */ }
    setSurveySubmitting(false);
  };

  // ── KB suggestions ────────────────────────────────────────────────────────
  const { data: kbSuggestions } = useQuery<Array<{ id: string; articleNumber: number; title: string; summary: string | null }>>({
    queryKey: ['ticket-kb-suggestions', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/kb-suggestions?limit=3`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  // ── Initialize sidebar edit state from ticket ────────────────────────────
  useEffect(() => {
    if (ticket) {
      setEditAssignee(ticket.assignee?.id ?? '');
      setEditGroup(ticket.assignedGroup?.id ?? '');
      setEditQueue(ticket.queue?.id ?? '');
      setEditCategory(ticket.category?.id ?? '');
      setEditSla(ticket.slaPolicy?.id ?? '');
      setEditPriority(ticket.priority);
      setEditType(ticket.type);
    }
  }, [ticket]);

  // ── Dirty check ─────────────────────────────────────────────────────────
  const sidebarDirty = ticket ? (
    editAssignee !== (ticket.assignee?.id ?? '') ||
    editGroup !== (ticket.assignedGroup?.id ?? '') ||
    editQueue !== (ticket.queue?.id ?? '') ||
    editCategory !== (ticket.category?.id ?? '') ||
    editSla !== (ticket.slaPolicy?.id ?? '') ||
    editPriority !== ticket.priority ||
    editType !== ticket.type
  ) : false;

  useUnsavedChanges(sidebarDirty);

  // ── Save all sidebar changes at once ────────────────────────────────────
  const handleSidebarSave = async () => {
    setSidebarSaving(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          assignedToId: editAssignee || null,
          assignedGroupId: editGroup || null,
          queueId: editQueue || null,
          categoryId: editCategory || null,
          slaPolicyId: editSla || null,
          priority: editPriority,
          type: editType,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    } finally {
      setSidebarSaving(false);
    }
  };

  // ── Discard sidebar changes ─────────────────────────────────────────────
  const handleSidebarDiscard = () => {
    if (ticket) {
      setEditAssignee(ticket.assignee?.id ?? '');
      setEditGroup(ticket.assignedGroup?.id ?? '');
      setEditQueue(ticket.queue?.id ?? '');
      setEditCategory(ticket.category?.id ?? '');
      setEditSla(ticket.slaPolicy?.id ?? '');
      setEditPriority(ticket.priority);
      setEditType(ticket.type);
    }
  };

  // ── Create child ticket handler ─────────────────────────────────────────
  const handleCreateChild = async () => {
    if (!childTitle.trim()) return;
    setChildSubmitting(true);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/children`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ title: childTitle.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create child ticket');
      setChildTitle('');
      setShowChildModal(false);
      void qc.invalidateQueries({ queryKey: ['ticket-children', ticketId] });
    } catch { /* ignore */ }
    setChildSubmitting(false);
  };

  // ── Link ticket handler ───────────────────────────────────────────────
  const handleLinkTicket = async () => {
    if (!linkTicketNumber.trim()) return;
    setLinkSubmitting(true);
    try {
      // Search for ticket by number to get its ID
      const searchRes = await fetch(`/api/v1/tickets?search=${encodeURIComponent(linkTicketNumber.trim())}&pageSize=1`, { credentials: 'include' });
      if (!searchRes.ok) throw new Error('Ticket not found');
      const searchData = await searchRes.json();
      const tickets = searchData.data ?? searchData.tickets ?? [];
      if (tickets.length === 0) throw new Error('Ticket not found');
      const targetId = tickets[0].id;
      const res = await fetch(`/api/v1/tickets/${ticketId}/links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ targetTicketId: targetId, linkType }),
      });
      if (!res.ok) throw new Error('Failed to link ticket');
      setLinkTicketNumber('');
      setShowLinkModal(false);
      void qc.invalidateQueries({ queryKey: ['ticket-links', ticketId] });
    } catch { /* ignore */ }
    setLinkSubmitting(false);
  };

  // ── Merge tickets handler ─────────────────────────────────────────────
  const handleMerge = async () => {
    if (!mergeTicketNumbers.trim()) return;
    setMergeSubmitting(true);
    try {
      // Parse comma-separated ticket numbers/IDs and search each
      const numbers = mergeTicketNumbers.split(',').map(s => s.trim()).filter(Boolean);
      const sourceIds: string[] = [];
      for (const num of numbers) {
        const res = await fetch(`/api/v1/tickets?search=${encodeURIComponent(num)}&pageSize=1`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const tickets = data.data ?? data.tickets ?? [];
          if (tickets.length > 0) sourceIds.push(tickets[0].id);
        }
      }
      if (sourceIds.length === 0) throw new Error('No source tickets found');
      const res = await fetch(`/api/v1/tickets/${ticketId}/merge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sourceTicketIds: sourceIds }),
      });
      if (!res.ok) throw new Error('Merge failed');
      setMergeTicketNumbers('');
      setShowMergeModal(false);
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
    } catch { /* ignore */ }
    setMergeSubmitting(false);
  };

  // ── Add watcher handler ───────────────────────────────────────────────
  const handleAddWatcher = async (userId: string) => {
    await fetch(`/api/v1/tickets/${ticketId}/watchers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ userId }),
    });
    setWatcherUserId('');
    void qc.invalidateQueries({ queryKey: ['ticket-watchers', ticketId] });
  };

  const handleRemoveWatcher = async (userId: string) => {
    await fetch(`/api/v1/tickets/${ticketId}/watchers/${userId}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['ticket-watchers', ticketId] });
  };

  // ── Check approval requirement ────────────────────────────────────────
  const checkApproval = async () => {
    const res = await fetch(`/api/v1/tickets/${ticketId}/approvals/check`, { method: 'POST', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setApprovalRequired(data.approvalRequired);
      setApprovalChecked(true);
    }
  };

  const handleSubmitApproval = async () => {
    setApprovalSubmitting(true);
    await fetch(`/api/v1/tickets/${ticketId}/approvals/submit`, { method: 'POST', credentials: 'include' });
    setApprovalSubmitting(false);
    void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      await updateStatusMutation.mutateAsync(newStatus);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: commentBody.trim(), visibility: commentVisibility }),
      });
      if (!res.ok) throw new Error('Failed to post comment');
      setCommentBody('');
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading ticket...</div>;
  if (error || !ticket) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
        {error instanceof Error ? error.message : 'Ticket not found'}
        <div style={{ marginTop: 16 }}>
          <Link href="/dashboard/tickets" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Back to tickets</Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(ticket.status);
  const priorityStyle = getPriorityStyle(ticket.priority);
  const transitions = STATUS_TRANSITIONS[ticket.status] ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Back link ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14 }}>
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to tickets
        </Link>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-placeholder)' }}>{ticket.ticketNumber}</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {ticket.status.replace(/_/g, ' ')}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: priorityStyle.bg, color: priorityStyle.text }}>
                {ticket.priority}
              </span>
              {slaStatus && (
                <SlaCountdown
                  slaBreachAt={slaStatus.slaBreachAt}
                  isPaused={slaStatus.isPaused}
                  elapsedPercentage={slaStatus.elapsedPercentage}
                  pauseReason={slaStatus.pauseReason}
                />
              )}
              {/* Agent presence indicator */}
              {presenceData && presenceData.agents.length > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                  borderRadius: 12, fontSize: 11, fontWeight: 500,
                  backgroundColor: '#fef3c7', color: '#92400e',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                  {presenceData.agents.map(a => {
                    const u = (usersData ?? []).find(u => u.id === a.userId);
                    return u ? `${u.firstName} ${u.lastName}` : 'Agent';
                  }).join(', ')} also viewing
                </span>
              )}
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{ticket.title}</h1>
            {/* Description is rich HTML from TipTap editor — authored by authenticated users only */}
            {ticket.description && (
              <div style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: ticket.description }} />
            )}
          </div>

          {/* Status change */}
          {transitions.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <select
                onChange={(e) => { if (e.target.value) void handleStatusChange(e.target.value); e.target.value = ''; }}
                disabled={statusUpdating}
                defaultValue=""
                style={{ padding: '8px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="" disabled>Change status...</option>
                {transitions.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── CSAT Survey Prompt ────────────────────────────────────────────────── */}
      {surveyData?.available && !surveyData.alreadyResponded && !surveySubmitted && surveyData.template && (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#166534' }}>How was your experience?</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {surveyData.template.questions.map((q) => (
              <div key={q.id}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#15803d' }}>
                  {q.label}{q.required ? ' *' : ''}
                </label>
                {q.type === 'rating' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setSurveyAnswers(prev => ({ ...prev, [q.id]: n }))}
                        style={{
                          width: 40, height: 40, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                          border: surveyAnswers[q.id] === n ? '2px solid #16a34a' : '1px solid #bbf7d0',
                          backgroundColor: surveyAnswers[q.id] === n ? '#dcfce7' : '#fff',
                          color: '#166534',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'yes_no' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Yes', 'No'].map(v => (
                      <button
                        key={v}
                        onClick={() => setSurveyAnswers(prev => ({ ...prev, [q.id]: v }))}
                        style={{
                          padding: '6px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: surveyAnswers[q.id] === v ? '2px solid #16a34a' : '1px solid #bbf7d0',
                          backgroundColor: surveyAnswers[q.id] === v ? '#dcfce7' : '#fff',
                          color: '#166534',
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <textarea
                    value={(surveyAnswers[q.id] as string) ?? ''}
                    onChange={(e) => setSurveyAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your feedback..."
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => void handleSurveySubmit()}
            disabled={surveySubmitting}
            style={{ marginTop: 14, padding: '8px 20px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {surveySubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      )}
      {surveySubmitted && (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#166534' }}>Thank you for your feedback!</p>
        </div>
      )}

      {/* ── Content grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <div>
          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-primary)', marginBottom: 16, backgroundColor: 'var(--bg-primary)', borderRadius: '12px 12px 0 0', border: '1px solid var(--border-primary)', borderBottomColor: 'transparent' }}>
            {(['comments', 'activity', 'attachments', 'cis', 'children', 'links'] as const).map((tab) => {
              const hasAttachments = tab === 'attachments' && (ticket.attachments?.length ?? 0) > 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: activeTab === tab || hasAttachments ? 600 : 400,
                    color: activeTab === tab ? 'var(--accent-primary)' : hasAttachments ? 'var(--accent-warning)' : 'var(--text-muted)',
                    borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    marginBottom: -1,
                    textTransform: tab === 'cis' ? 'none' : 'capitalize',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {tab === 'cis' ? 'CMDB Relationship' : tab}
                  {hasAttachments && (
                    <span style={{
                      backgroundColor: 'var(--accent-warning)',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {ticket.attachments.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '0 0 12px 12px', padding: 20 }}>

            {/* Comments */}
            {activeTab === 'comments' && (
              <div>
                {/* Comment list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  {(commentsData?.comments ?? []).length === 0 && (
                    <p style={{ color: 'var(--text-placeholder)', fontSize: 14, margin: 0 }}>No comments yet.</p>
                  )}
                  {(commentsData?.comments ?? []).map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: comment.visibility === 'INTERNAL' ? '#fffbeb' : 'var(--bg-secondary)',
                        border: `1px solid ${comment.visibility === 'INTERNAL' ? '#fde68a' : 'var(--bg-tertiary)'}`,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Icon path={mdiAccountCircle} size={0.75} color="var(--text-placeholder)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : 'Unknown'}
                        </span>
                        {comment.visibility === 'INTERNAL' && (
                          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, backgroundColor: '#fde68a', color: '#92400e', textTransform: 'uppercase' }}>
                            Internal
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-placeholder)' }}>
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      {/* Comment body is rich HTML from TipTap — authored by authenticated users */}
                      <div style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: comment.body }} />
                      {comment.timeSpentMinutes != null && comment.timeSpentMinutes > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--text-placeholder)' }}>
                          <Icon path={mdiClockOutline} size={0.6} color="currentColor" />
                          {comment.timeSpentMinutes} min
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Comment form */}
                <div style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: 16 }}>
                  <RichTextField
                    value={commentBody}
                    onChange={setCommentBody}
                    placeholder="Add a comment..."
                    minHeight={100}
                    compact
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    <select
                      value={commentVisibility}
                      onChange={(e) => setCommentVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                      style={{ padding: '7px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
                    >
                      <option value="PUBLIC">Public</option>
                      <option value="INTERNAL">Internal</option>
                    </select>
                    <CannedResponsePicker onSelect={(content) => setCommentBody(prev => prev ? prev + content : content)} />
                    <button
                      onClick={() => void handleAddComment()}
                      disabled={commentSubmitting || !commentBody.trim()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        backgroundColor: commentSubmitting || !commentBody.trim() ? 'var(--badge-indigo-bg)' : 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: commentSubmitting || !commentBody.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon path={mdiSend} size={0.75} color="currentColor" />
                      {commentSubmitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                  {commentError && <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: 8 }}>{commentError}</p>}
                </div>
              </div>
            )}

            {/* Activity */}
            {activeTab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(activitiesData?.activities ?? []).length === 0 ? (
                  <p style={{ color: 'var(--text-placeholder)', fontSize: 14, margin: 0 }}>No activity yet.</p>
                ) : (
                  (activitiesData?.activities ?? []).map((act) => (
                    <div key={act.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-placeholder)', flexShrink: 0 }}>{formatDate(act.createdAt)}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {act.meta?.source === 'workflow' ? (
                          <>
                            <strong style={{ color: '#7c3aed' }}>Workflow: {(act.meta as Record<string, unknown>).workflowName as string ?? 'Automation'}</strong>
                            {' — '}{act.action.replace(/_/g, ' ')}
                            {act.fieldName && <span style={{ color: 'var(--text-muted)' }}> ({act.fieldName}: {act.oldValue ?? '—'} → {act.newValue ?? '—'})</span>}
                          </>
                        ) : (
                          <>
                            <strong>{act.actor ? `${act.actor.firstName} ${act.actor.lastName}` : 'System'}</strong>
                            {' — '}{act.action.replace(/_/g, ' ')}
                            {act.fieldName && <span style={{ color: 'var(--text-muted)' }}> ({act.fieldName}: {act.oldValue ?? '—'} → {act.newValue ?? '—'})</span>}
                          </>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Attachments */}
            {activeTab === 'attachments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Upload area */}
                <label
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '14px 16px', border: '2px dashed var(--border-secondary)', borderRadius: 8,
                    cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13,
                    backgroundColor: 'var(--bg-secondary)', transition: 'border-color 0.15s',
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = ''; }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '';
                    const files = e.dataTransfer.files;
                    if (!files.length) return;
                    for (const file of Array.from(files)) {
                      const form = new FormData();
                      form.append('file', file);
                      await fetch(`/api/v1/tickets/${ticketId}/attachments`, { method: 'POST', credentials: 'include', body: form });
                    }
                    void refetchAttachments();
                  }}
                >
                  <Icon path={mdiCloudUploadOutline} size={0.9} color="currentColor" />
                  Drop files here or click to upload (max 25 MB)
                  <input
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files?.length) return;
                      for (const file of Array.from(files)) {
                        const form = new FormData();
                        form.append('file', file);
                        await fetch(`/api/v1/tickets/${ticketId}/attachments`, { method: 'POST', credentials: 'include', body: form });
                      }
                      e.target.value = '';
                      void refetchAttachments();
                    }}
                  />
                </label>

                {/* Attachment list */}
                {(attachmentsData?.attachments ?? []).length === 0 ? (
                  <p style={{ color: 'var(--text-placeholder)', fontSize: 14, margin: 0 }}>No attachments yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(attachmentsData?.attachments ?? []).map((att) => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
                        <Icon path={mdiPaperclip} size={0.75} color="var(--text-placeholder)" />
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/v1/tickets/${ticketId}/attachments/${att.id}/url`, { credentials: 'include' });
                            if (res.ok) { const { url } = await res.json(); window.open(url, '_blank'); }
                          }}
                          style={{ flex: 1, background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                        >
                          {att.filename}
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                          {att.fileSize < 1024 ? `${att.fileSize} B` : att.fileSize < 1048576 ? `${Math.round(att.fileSize / 1024)} KB` : `${(att.fileSize / 1048576).toFixed(1)} MB`}
                        </span>
                        {att.uploadedBy && (
                          <span style={{ fontSize: 11, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>{att.uploadedBy.firstName} {att.uploadedBy.lastName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cis' && <CmdbLinksSection ticketId={ticketId} />}

            {/* Children */}
            {activeTab === 'children' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setShowChildModal(true)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}>
                  <Icon path={mdiPlus} size={0.65} color="currentColor" /> Add Child Ticket
                </button>
                {(childrenData ?? []).length === 0 ? (
                  <p style={{ color: 'var(--text-placeholder)', fontSize: 14, margin: 0 }}>No child tickets.</p>
                ) : (
                  (childrenData ?? []).map((child) => (
                    <Link key={child.id} href={`/dashboard/tickets/${child.id}`} style={{ textDecoration: 'none', display: 'block', padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--bg-tertiary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-primary)' }}>TKT-{child.ticketNumber}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{child.title}</span>
                        <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: getStatusStyle(child.status).bg, color: getStatusStyle(child.status).text }}>
                          {child.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
                {/* Create child modal */}
                {showChildModal && (
                  <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24 }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Create Child Ticket</h3>
                      <input type="text" value={childTitle} onChange={(e) => setChildTitle(e.target.value)} placeholder="Child ticket title..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowChildModal(false); setChildTitle(''); }} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>Cancel</button>
                        <button onClick={() => void handleCreateChild()} disabled={childSubmitting || !childTitle.trim()} style={{ padding: '8px 18px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                          {childSubmitting ? 'Creating...' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Links */}
            {activeTab === 'links' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <button onClick={() => setShowLinkModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <Icon path={mdiLinkVariant} size={0.65} color="currentColor" /> Link Ticket
                  </button>
                  <button onClick={() => setShowMergeModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                    <Icon path={mdiMerge} size={0.65} color="currentColor" /> Merge Into This
                  </button>
                </div>
                {(linksData ?? []).length === 0 ? (
                  <p style={{ color: 'var(--text-placeholder)', fontSize: 14, margin: 0 }}>No linked tickets.</p>
                ) : (
                  (linksData ?? []).map((link) => (
                    <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--bg-tertiary)' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-placeholder)', textTransform: 'uppercase', minWidth: 80 }}>
                        {link.linkType.replace(/_/g, ' ')}
                      </span>
                      <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-primary)' }}>TKT-{link.ticket.ticketNumber}</span>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{link.ticket.title}</span>
                      </Link>
                      <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: getStatusStyle(link.ticket.status).bg, color: getStatusStyle(link.ticket.status).text }}>
                        {link.ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))
                )}
                {/* Link ticket modal */}
                {showLinkModal && (
                  <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24 }}>
                      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Link Ticket</h3>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Ticket Number or Title</label>
                        <input type="text" value={linkTicketNumber} onChange={(e) => setLinkTicketNumber(e.target.value)} placeholder="e.g. TKT-42 or search by title..." style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Link Type</label>
                        <select value={linkType} onChange={(e) => setLinkType(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}>
                          <option value="RELATED_TO">Related To</option>
                          <option value="BLOCKS">Blocks</option>
                          <option value="BLOCKED_BY">Blocked By</option>
                          <option value="DUPLICATES">Duplicates</option>
                          <option value="DUPLICATED_BY">Duplicated By</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowLinkModal(false); setLinkTicketNumber(''); }} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>Cancel</button>
                        <button onClick={() => void handleLinkTicket()} disabled={linkSubmitting || !linkTicketNumber.trim()} style={{ padding: '8px 18px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                          {linkSubmitting ? 'Linking...' : 'Link'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Merge modal */}
                {showMergeModal && (
                  <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24 }}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Merge Tickets Into This One</h3>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Comments, attachments, and watchers from source tickets will be moved here. Source tickets will be closed.
                      </p>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Source Ticket Numbers (comma-separated)</label>
                        <input type="text" value={mergeTicketNumbers} onChange={(e) => setMergeTicketNumbers(e.target.value)} placeholder="e.g. TKT-10, TKT-15" style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowMergeModal(false); setMergeTicketNumbers(''); }} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>Cancel</button>
                        <button onClick={() => void handleMerge()} disabled={mergeSubmitting || !mergeTicketNumbers.trim()} style={{ padding: '8px 18px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                          {mergeSubmitting ? 'Merging...' : 'Merge'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {/* Assignee — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Assignee</span>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="">Unassigned</option>
                  {(usersData ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Assigned Group — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Assigned Group</span>
                <select
                  value={editGroup}
                  onChange={(e) => setEditGroup(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(groupsData ?? []).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              {/* Requester — read-only */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Requester</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {ticket.requester ? `${ticket.requester.firstName} ${ticket.requester.lastName}` : '—'}
                </span>
              </div>

              {/* Queue — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Queue</span>
                <select
                  value={editQueue}
                  onChange={(e) => setEditQueue(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(queuesData ?? []).map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>

              {/* Category — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Category</span>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(categoriesData ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* SLA Policy — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>SLA Policy</span>
                <select
                  value={editSla}
                  onChange={(e) => setEditSla(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(slaPoliciesData ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Priority</span>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              {/* Type — editable */}
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Type</span>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', cursor: 'pointer' }}
                >
                  <option value="INCIDENT">Incident</option>
                  <option value="SERVICE_REQUEST">Service Request</option>
                  <option value="PROBLEM">Problem</option>
                  <option value="CHANGE">Change</option>
                </select>
              </div>

              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Created</span>
                <span style={{ color: 'var(--text-secondary)' }}>{formatDate(ticket.createdAt)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Updated</span>
                <span style={{ color: 'var(--text-secondary)' }}>{formatDate(ticket.updatedAt)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-placeholder)', display: 'block', marginBottom: 2 }}>Source</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: {
                    PORTAL: 'var(--badge-blue-bg)',
                    EMAIL: 'var(--badge-yellow-bg)',
                    SERVICE_DESK: 'var(--badge-indigo-bg)',
                    WEBHOOK: 'var(--badge-purple-bg)',
                    SLACK: 'var(--badge-fuchsia-bg)',
                    TEAMS: 'var(--badge-blue-bg)',
                    API: 'var(--badge-green-bg)',
                  }[ticket.source] ?? 'var(--bg-tertiary)',
                  color: {
                    PORTAL: '#1e40af',
                    EMAIL: '#92400e',
                    SERVICE_DESK: '#3730a3',
                    WEBHOOK: '#5b21b6',
                    SLACK: '#6b21a8',
                    TEAMS: '#1e40af',
                    API: '#065f46',
                  }[ticket.source] ?? 'var(--text-secondary)',
                }}>
                  {ticket.source?.replace(/_/g, ' ') ?? 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Watchers ───────────────────────────────────────────────────────── */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Watchers ({watchersData?.length ?? 0})
            </h3>
            {(watchersData ?? []).length === 0 ? (
              <p style={{ color: 'var(--text-placeholder)', fontSize: 13, margin: 0 }}>No watchers</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(watchersData ?? []).map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <span>{w.user.firstName} {w.user.lastName}</span>
                    <button
                      onClick={() => void handleRemoveWatcher(w.user.id)}
                      title="Remove watcher"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-placeholder)' }}
                    >
                      <Icon path={mdiClose} size={0.55} color="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                onClick={() => void handleAddWatcher('')}
                style={{ fontSize: 12, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Icon path={mdiEyeOutline} size={0.55} color="currentColor" style={{ verticalAlign: 'middle', marginRight: 2 }} />
                Watch
              </button>
              <span style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>|</span>
              <select
                value={watcherUserId}
                onChange={(e) => { if (e.target.value) void handleAddWatcher(e.target.value); }}
                style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}
              >
                <option value="">+ Add user...</option>
                {(usersData ?? []).map(u => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Approval Status ─────────────────────────────────────────────────── */}
          {ticket.status === 'PENDING_APPROVAL' && (
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiCheckDecagram} size={0.7} color="#f59e0b" />
                Pending Approval
              </h3>
              <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>This ticket is waiting for approval before it can proceed.</p>
            </div>
          )}
          {ticket.status !== 'PENDING_APPROVAL' && ticket.status !== 'CLOSED' && ticket.status !== 'CANCELLED' && ticket.status !== 'RESOLVED' && (
            <div>
              {!approvalChecked ? (
                <button onClick={() => void checkApproval()} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Check if approval is required
                </button>
              ) : approvalRequired ? (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 8px' }}>Approval is required for this ticket.</p>
                  <button
                    onClick={() => void handleSubmitApproval()}
                    disabled={approvalSubmitting}
                    style={{ padding: '6px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {approvalSubmitting ? 'Submitting...' : 'Submit for Approval'}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Similar Tickets ─────────────────────────────────────────────────── */}
          {similarData && similarData.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Similar Tickets
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {similarData.map(t => (
                  <Link key={t.id} href={`/dashboard/tickets/${t.id}`} style={{ textDecoration: 'none', fontSize: 13 }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>TKT-{t.ticketNumber}</span>
                    {' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{t.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── KB Suggestions ──────────────────────────────────────────────────── */}
          {kbSuggestions && kbSuggestions.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 18 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suggested Articles
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {kbSuggestions.map(a => (
                  <Link key={a.id} href={`/dashboard/knowledge/${a.id}`} style={{ textDecoration: 'none', fontSize: 13 }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>KB-{a.articleNumber}</span>
                    {' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{a.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <UnsavedChangesToast
        visible={sidebarDirty}
        onSave={() => void handleSidebarSave()}
        onDiscard={handleSidebarDiscard}
        saving={sidebarSaving}
      />
    </div>
  );
}

// ─── CMDB Links Section (linked CIs on a ticket) ────────────────────────────

interface LinkedCi {
  id: string;
  impactRole: string | null;
  ci: {
    id: string;
    ciNumber: number;
    name: string;
    hostname: string | null;
    criticality: string | null;
    type: string;
    status: string;
    ciClass: { className: string } | null;
    lifecycleStatus: { statusName: string } | null;
  };
}

function CmdbLinksSection({ ticketId }: { ticketId: string }) {
  const [links, setLinks] = useState<{ incidents: LinkedCi[]; problems: LinkedCi[] }>({ incidents: [], problems: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; ciNumber: number; name: string; hostname: string | null; ciClass: { className: string } | null }>>([]);
  const [impactRole, setImpactRole] = useState('affected');

  const loadLinks = async () => {
    const res = await fetch(`/api/v1/tickets/${ticketId}/cmdb-links`, { credentials: 'include' });
    if (res.ok) setLinks(await res.json());
  };

  useEffect(() => { void loadLinks(); }, [ticketId]);

  const searchCis = async (q: string) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/v1/cmdb/cis?search=${encodeURIComponent(q)}&pageSize=20`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setSearchResults(data.data ?? []);
    }
  };

  const linkCi = async (ciId: string) => {
    const res = await fetch(`/api/v1/tickets/${ticketId}/cmdb-links`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ciId, impactRole }),
    });
    if (res.ok) { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); void loadLinks(); }
  };

  const unlinkCi = async (ciId: string) => {
    if (!confirm('Unlink this CI?')) return;
    const res = await fetch(`/api/v1/tickets/${ticketId}/cmdb-links/${ciId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok || res.status === 204) void loadLinks();
  };

  const allLinks = [...links.incidents, ...links.problems];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{allLinks.length} configuration item{allLinks.length !== 1 ? 's' : ''} linked</span>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          style={{ padding: '6px 12px', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          {searchOpen ? 'Cancel' : '+ Link CI'}
        </button>
      </div>

      {searchOpen && (
        <div style={{ padding: 12, backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="search"
              placeholder="Search by name, hostname, FQDN, IP..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); void searchCis(e.target.value); }}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13 }}
              autoFocus
            />
            <select value={impactRole} onChange={(e) => setImpactRole(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)' }}>
              <option value="affected">Affected</option>
              <option value="root_cause">Root Cause</option>
              <option value="related">Related</option>
            </select>
          </div>
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6 }}>
              {searchResults.map((ci) => (
                <button key={ci.id} onClick={() => linkCi(ci.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--bg-tertiary)', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                  <div style={{ fontWeight: 500 }}>CI-{ci.ciNumber} — {ci.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ci.ciClass?.className ?? ''} {ci.hostname ? `• ${ci.hostname}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {allLinks.length === 0 ? (
        <p style={{ color: 'var(--text-placeholder)', fontSize: 13, margin: 0 }}>No configuration items linked yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allLinks.map((link) => (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <Link href={`/dashboard/cmdb/${link.ci.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                  CI-{link.ci.ciNumber} — {link.ci.name}
                </Link>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {link.ci.ciClass?.className ?? ''}
                  {link.ci.lifecycleStatus?.statusName ? ` • ${link.ci.lifecycleStatus.statusName}` : ''}
                  {link.ci.criticality ? ` • ${link.ci.criticality}` : ''}
                  {link.impactRole ? ` • ${link.impactRole}` : ''}
                </div>
              </div>
              <button onClick={() => unlinkCi(link.ci.id)}
                style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--border-secondary)', borderRadius: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
