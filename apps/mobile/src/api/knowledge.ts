import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  viewCount: number;
  author: { id: string; name: string };
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticlesResponse {
  articles: KbArticle[];
  total: number;
}

export function useKbArticles(filters?: { search?: string; page?: number }) {
  return useQuery({
    queryKey: ['kb-articles', filters],
    queryFn: () =>
      apiClient
        .get<KbArticlesResponse>('/api/v1/knowledge', { params: filters })
        .then((r) => r.data),
  });
}

export function useKbArticle(id: string) {
  return useQuery({
    queryKey: ['kb-article', id],
    queryFn: () => apiClient.get<KbArticle>(`/api/v1/knowledge/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}
