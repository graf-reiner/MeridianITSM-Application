import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface Asset {
  id: string;
  assetTag: string;
  hostname?: string;
  model?: string;
  serialNumber?: string;
  status: string;
  site?: { id: string; name: string };
  assignedTo?: { id: string; name: string; email: string };
  purchaseDate?: string;
  purchaseCost?: number;
  warrantyExpiry?: string;
  hardwareSpecs?: {
    cpu?: string;
    memoryGb?: number;
    disks?: Array<{ model?: string; sizeGb: number }>;
    os?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AssetsResponse {
  assets: Asset[];
  total: number;
}

export function useMyAssets(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['assets', 'mine', filters],
    queryFn: () =>
      apiClient
        .get<AssetsResponse>('/api/v1/assets', { params: { assignedToId: 'me', ...filters } })
        .then((r) => r.data),
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['asset', id],
    queryFn: () => apiClient.get<Asset>(`/api/v1/assets/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}
