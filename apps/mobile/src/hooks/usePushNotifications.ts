import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/auth.store';

// Configure notification handling behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const navigation = useNavigation<any>();
  const token = useAuthStore((s) => s.token);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!token) return;

    // Register push token
    void registerForPushNotifications();

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((_notification) => {
      // Could update badge count or show in-app indicator
    });

    // Listen for notification taps (deep link routing)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const screen = data['screen'] as string | undefined;
      const entityId = data['entityId'] as string | undefined;
      if (screen && entityId) {
        navigateToScreen(navigation, screen, entityId);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [token]);
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return; // Push doesn't work in simulators

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return; // User denied — silently skip

  const expoPushToken = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-project-id', // From app.json extra.eas.projectId
  });

  // Register with server
  await apiClient.post('/api/v1/push/register', {
    token: expoPushToken.data,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
    deviceId: Device.modelId ?? Device.deviceName ?? 'unknown',
  });

  // Android requires notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

function navigateToScreen(navigation: any, screen: string, entityId: string) {
  switch (screen) {
    case 'ticket':
      navigation.navigate('TicketsTab', { screen: 'TicketDetail', params: { id: entityId } });
      break;
    case 'asset':
      navigation.navigate('AssetsTab', { screen: 'AssetDetail', params: { id: entityId } });
      break;
    case 'article':
      navigation.navigate('KnowledgeTab', { screen: 'KbArticle', params: { id: entityId } });
      break;
    case 'change':
      // Changes not in mobile v1, but handle gracefully
      break;
    default:
      break;
  }
}
