import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = axios.create({
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const { token, serverUrl } = useAuthStore.getState();
  if (serverUrl) {
    config.baseURL = serverUrl;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: unknown) => {
    const err = error as { response?: { status?: number } };
    if (err.response?.status === 401) {
      void useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);
