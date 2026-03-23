import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PendingWrite {
  id: string;
  type: 'add_comment' | 'update_status' | 'create_ticket';
  ticketId?: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
}

interface OfflineStore {
  queue: PendingWrite[];
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  enqueue: (write: Omit<PendingWrite, 'id' | 'createdAt' | 'retryCount'>) => void;
  dequeue: (id: string) => void;
  getQueue: () => PendingWrite[];
  persistQueue: () => Promise<void>;
  hydrateQueue: () => Promise<void>;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  queue: [],
  isOnline: true,

  setOnline: (online) => set({ isOnline: online }),

  enqueue: (write) => {
    const item: PendingWrite = {
      ...write,
      id: Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    set((s) => ({ queue: [...s.queue, item] }));
    void get().persistQueue();
  },

  dequeue: (id) => {
    set((s) => ({ queue: s.queue.filter((w) => w.id !== id) }));
    void get().persistQueue();
  },

  getQueue: () => get().queue,

  persistQueue: async () => {
    await AsyncStorage.setItem('meridian_offline_queue', JSON.stringify(get().queue));
  },

  hydrateQueue: async () => {
    try {
      const raw = await AsyncStorage.getItem('meridian_offline_queue');
      if (raw) set({ queue: JSON.parse(raw) as PendingWrite[] });
    } catch {
      // If parsing fails, start with empty queue
    }
  },
}));
