import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useOfflineStore } from '../stores/offline.store';

export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  categoryId?: string;
  category?: { id: string; name: string };
  assignedTo?: { id: string; name: string; email: string };
  createdBy?: { id: string; name: string; email: string };
  sla?: { dueAt: string; elapsedPercent: number; status: string } | null;
  comments?: TicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  body: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  author: { id: string; name: string; email: string };
  attachments?: Array<{ id: string; url: string; filename: string }>;
  createdAt: string;
  _optimistic?: boolean;
}

export interface TicketsResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export function useTickets(filters?: { status?: string; assignedToMe?: boolean; page?: number; search?: string }) {
  return useQuery({
    queryKey: ['tickets', filters],
    queryFn: () =>
      apiClient.get<TicketsResponse>('/api/v1/tickets', { params: filters }).then((r) => r.data),
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: () => apiClient.get<Ticket>(`/api/v1/tickets/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const { isOnline, enqueue } = useOfflineStore();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      type: string;
      priority: string;
      categoryId?: string;
    }) => {
      if (!isOnline) {
        // Queue for offline replay
        enqueue({ type: 'create_ticket', payload: { ...data, source: 'MOBILE' } });
        return Promise.resolve({} as Ticket);
      }
      return apiClient.post<Ticket>('/api/v1/tickets', { ...data, source: 'MOBILE' }).then((r) => r.data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const { isOnline, enqueue } = useOfflineStore();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ status: string; priority: string; assignedToId: string }>;
    }) => {
      if (!isOnline) {
        // Queue for offline replay
        enqueue({ type: 'update_status', ticketId: id, payload: data });
        return Promise.resolve({} as Ticket);
      }
      return apiClient.patch<Ticket>(`/api/v1/tickets/${id}`, data).then((r) => r.data);
    },
    onMutate: async ({ id, data }) => {
      // Optimistic update: cancel outgoing queries and snapshot
      await qc.cancelQueries({ queryKey: ['ticket', id] });
      const previousTicket = qc.getQueryData<Ticket>(['ticket', id]);
      // Apply optimistic update
      qc.setQueryData<Ticket>(['ticket', id], (old) => {
        if (!old) return old;
        return { ...old, ...data, updatedAt: new Date().toISOString() };
      });
      return { previousTicket };
    },
    onError: (_err, variables, context) => {
      // Revert on error if not offline (offline path already queued)
      if (context?.previousTicket) {
        qc.setQueryData(['ticket', variables.id], context.previousTicket);
      }
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['ticket', variables.id] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const { isOnline, enqueue } = useOfflineStore();
  return useMutation({
    mutationFn: async ({
      ticketId,
      body,
      visibility,
      photos,
    }: {
      ticketId: string;
      body: string;
      visibility: 'PUBLIC' | 'INTERNAL';
      photos?: Array<{ uri: string; type: string; name: string }>;
    }) => {
      if (!isOnline) {
        // Queue for offline replay (photos not supported in offline mode)
        enqueue({ type: 'add_comment', ticketId, payload: { body, visibility } });
        return {} as TicketComment;
      }

      // Use FormData for multipart/form-data to support photo attachments
      const formData = new FormData();
      formData.append('body', body);
      formData.append('visibility', visibility);
      if (photos && photos.length > 0) {
        photos.forEach((photo, index) => {
          formData.append('attachments', {
            uri: photo.uri,
            type: photo.type || 'image/jpeg',
            name: photo.name || `photo-${index}.jpg`,
          } as unknown as Blob);
        });
      }
      return apiClient
        .post<TicketComment>(`/api/v1/tickets/${ticketId}/comments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data);
    },
    onMutate: async ({ ticketId, body, visibility }) => {
      // Optimistic update: add comment to cache immediately
      await qc.cancelQueries({ queryKey: ['ticket', ticketId] });
      const previousTicket = qc.getQueryData<Ticket>(['ticket', ticketId]);

      const optimisticComment: TicketComment = {
        id: `optimistic-${Date.now()}`,
        body,
        visibility,
        author: { id: 'me', name: 'You', email: '' },
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };

      qc.setQueryData<Ticket>(['ticket', ticketId], (old) => {
        if (!old) return old;
        return {
          ...old,
          comments: [...(old.comments ?? []), optimisticComment],
        };
      });

      return { previousTicket };
    },
    onError: (_err, variables, context) => {
      // Revert optimistic update on error
      if (context?.previousTicket) {
        qc.setQueryData(['ticket', variables.ticketId], context.previousTicket);
      }
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
    },
  });
}

export function useMyTickets() {
  return useQuery({
    queryKey: ['tickets', 'mine'],
    queryFn: () =>
      apiClient
        .get<TicketsResponse>('/api/v1/tickets', { params: { assignedToMe: true } })
        .then((r) => r.data),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () =>
      apiClient
        .get<Array<{ id: string; name: string }>>('/api/v1/categories')
        .then((r) => r.data),
  });
}
