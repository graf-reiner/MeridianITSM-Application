import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
}

interface TenantBranding {
  logo?: string;
  accentColor?: string;
}

interface AuthState {
  token: string | null;
  serverUrl: string | null;
  user: AuthUser | null;
  tenantBranding: TenantBranding | null;
  isLoading: boolean;
  login: (serverUrl: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  serverUrl: null,
  user: null,
  tenantBranding: null,
  isLoading: true,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('meridian_token');
      const serverUrl = await SecureStore.getItemAsync('meridian_server_url');
      const userJson = await SecureStore.getItemAsync('meridian_user');
      set({
        token,
        serverUrl,
        user: userJson ? JSON.parse(userJson) : null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setServerUrl: async (url: string) => {
    await SecureStore.setItemAsync('meridian_server_url', url);
    set({ serverUrl: url });
  },

  login: async (serverUrl: string, email: string, password: string) => {
    const response = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { message?: string }).message ?? 'Login failed');
    }

    const data = (await response.json()) as { token: string; user: AuthUser };
    const { token, user } = data;

    await SecureStore.setItemAsync('meridian_token', token);
    await SecureStore.setItemAsync('meridian_server_url', serverUrl);
    await SecureStore.setItemAsync('meridian_user', JSON.stringify(user));

    let tenantBranding: TenantBranding | null = null;
    try {
      const brandingRes = await fetch(`${serverUrl}/api/v1/settings/branding`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (brandingRes.ok) {
        tenantBranding = (await brandingRes.json()) as TenantBranding;
      }
    } catch {
      // branding is non-critical; proceed without it
    }

    set({ token, serverUrl, user, tenantBranding });
  },

  logout: async () => {
    try {
      await SecureStore.deleteItemAsync('meridian_token');
      await SecureStore.deleteItemAsync('meridian_user');
    } catch {
      // ignore cleanup errors
    }
    set({ token: null, user: null, tenantBranding: null });
  },
}));
