import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface DashboardData {
  openTickets: number;
  ticketsByPriority: { P1: number; P2: number; P3: number; P4: number };
  slaDueSoon: Array<{
    id: string;
    number: number;
    title: string;
    slaPercent: number;
    dueAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
  }>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/api/v1/dashboard').then((r) => r.data),
  });
}
