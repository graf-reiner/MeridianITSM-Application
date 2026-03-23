import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Pressable,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../../api/client';

interface PushPreferences {
  TICKET_ASSIGNED: boolean;
  TICKET_UPDATED: boolean;
  TICKET_COMMENTED: boolean;
  TICKET_RESOLVED: boolean;
  TICKET_CREATED: boolean;
  SLA_WARNING: boolean;
  SLA_BREACH: boolean;
  CHANGE_APPROVAL: boolean;
  CHANGE_UPDATED: boolean;
  MENTION: boolean;
  SYSTEM: boolean;
  CAB_INVITATION: boolean;
}

const DEFAULT_PREFERENCES: PushPreferences = {
  TICKET_ASSIGNED: true,
  TICKET_UPDATED: true,
  TICKET_COMMENTED: true,
  TICKET_RESOLVED: true,
  TICKET_CREATED: true,
  SLA_WARNING: true,
  SLA_BREACH: true,
  CHANGE_APPROVAL: true,
  CHANGE_UPDATED: true,
  MENTION: true,
  SYSTEM: true,
  CAB_INVITATION: true,
};

const PREFERENCE_LABELS: Record<keyof PushPreferences, string> = {
  TICKET_ASSIGNED: 'Ticket Assigned',
  TICKET_UPDATED: 'Ticket Updated',
  TICKET_COMMENTED: 'New Comment',
  TICKET_RESOLVED: 'Ticket Resolved',
  TICKET_CREATED: 'Ticket Created',
  SLA_WARNING: 'SLA Warning',
  SLA_BREACH: 'SLA Breach',
  CHANGE_APPROVAL: 'Change Approval',
  CHANGE_UPDATED: 'Change Updated',
  MENTION: 'Mentioned',
  SYSTEM: 'System Notifications',
  CAB_INVITATION: 'CAB Invitation',
};

const PREFERENCE_GROUPS = [
  {
    title: 'Tickets',
    keys: ['TICKET_ASSIGNED', 'TICKET_UPDATED', 'TICKET_COMMENTED', 'TICKET_RESOLVED', 'TICKET_CREATED'] as const,
  },
  {
    title: 'SLA',
    keys: ['SLA_WARNING', 'SLA_BREACH'] as const,
  },
  {
    title: 'Changes',
    keys: ['CHANGE_APPROVAL', 'CHANGE_UPDATED', 'CAB_INVITATION'] as const,
  },
  {
    title: 'General',
    keys: ['MENTION', 'SYSTEM'] as const,
  },
];

export function PushPreferencesScreen() {
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(true);

  useEffect(() => {
    void loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      // Check notification permissions
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionsGranted(status === 'granted');

      const res = await apiClient.get<PushPreferences>('/api/v1/push/preferences');
      setPreferences(res.data);
    } catch {
      // Use defaults if API call fails
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(key: keyof PushPreferences, value: boolean) {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    try {
      await apiClient.patch('/api/v1/push/preferences', updated);
    } catch {
      // Revert on failure
      setPreferences(preferences);
      Alert.alert('Error', 'Failed to save notification preferences.');
    }
  }

  const allEnabled = Object.values(preferences).every(Boolean);

  function openSettings() {
    void Linking.openSettings();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!permissionsGranted && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Enable notifications to get ticket updates
          </Text>
          <Pressable onPress={openSettings} style={styles.settingsButton}>
            <Text style={styles.settingsButtonText}>Settings</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {allEnabled ? 'All notifications on' : 'Some notifications disabled'}
        </Text>
      </View>

      {PREFERENCE_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.keys.map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{PREFERENCE_LABELS[key]}</Text>
              <Switch
                value={preferences[key]}
                onValueChange={(value) => void handleToggle(key, value)}
                trackColor={{ false: '#d1d5db', true: '#4f46e5' }}
                thumbColor="#ffffff"
                disabled={!permissionsGranted}
              />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permissionBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permissionText: { color: '#92400e', fontSize: 13, flex: 1 },
  settingsButton: { marginLeft: 8 },
  settingsButtonText: { color: '#4f46e5', fontWeight: '600', fontSize: 13 },
  summaryRow: { marginBottom: 16 },
  summaryText: { color: '#6b7280', fontSize: 14 },
  group: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  label: { fontSize: 15, color: '#111827', flex: 1 },
});
