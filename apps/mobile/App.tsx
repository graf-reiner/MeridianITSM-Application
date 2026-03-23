import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/auth.store';
import { linking } from './src/navigation/linking';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { OfflineBanner } from './src/components/OfflineBanner';

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'meridian-query-cache',
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 2,
    },
  },
});

function AppContent() {
  usePushNotifications();
  useOfflineSync();

  return (
    <>
      <OfflineBanner />
      <RootNavigator />
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      }}
    >
      <NavigationContainer linking={linking}>
        <AppContent />
      </NavigationContainer>
    </PersistQueryClientProvider>
  );
}
