import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useOfflineStore } from '../stores/offline.store';
import { apiClient } from '../api/client';

export function useOfflineSync() {
  const { setOnline, hydrateQueue, dequeue } = useOfflineStore();

  useEffect(() => {
    void hydrateQueue();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? false;
      setOnline(online);

      if (online) {
        const queue = useOfflineStore.getState().queue;
        if (queue.length > 0) {
          void replayQueue(dequeue);
        }
      }
    });

    return () => unsubscribe();
  }, []);
}

async function replayQueue(dequeue: (id: string) => void) {
  const items = useOfflineStore.getState().queue;
  for (const item of items) {
    try {
      switch (item.type) {
        case 'add_comment':
          await apiClient.post(`/api/v1/tickets/${item.ticketId}/comments`, item.payload);
          break;
        case 'update_status':
          await apiClient.patch(`/api/v1/tickets/${item.ticketId}`, item.payload);
          break;
        case 'create_ticket':
          await apiClient.post('/api/v1/tickets', item.payload);
          break;
      }
      dequeue(item.id);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 409) {
        // Server conflict — server wins per CONTEXT.md
        dequeue(item.id);
        // Show conflict resolution notice (non-blocking)
        continue;
      }
      // Network error — stop replay, will retry next time online
      break;
    }
  }
}
