import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<ProfileStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { user, tenantBranding, logout } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const roleLabel = user?.roles?.[0]
    ?.replace('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'User';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User avatar and info */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={[styles.avatarText, { color: accentColor }]}>
            {(user?.name ?? 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name ?? '—'}</Text>
        <Text style={styles.email}>{user?.email ?? '—'}</Text>
        <View style={[styles.roleBadge, { backgroundColor: accentColor + '20' }]}>
          <Text style={[styles.roleText, { color: accentColor }]}>{roleLabel}</Text>
        </View>
      </View>

      {/* Tenant info */}
      {(tenantBranding?.logo || user?.tenantId) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization</Text>
          {tenantBranding?.logo && (
            <View style={styles.logoRow}>
              <Image
                source={{ uri: tenantBranding.logo }}
                style={styles.tenantLogo}
                resizeMode="contain"
              />
            </View>
          )}
          {user?.tenantId && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tenant ID</Text>
              <Text style={styles.infoValue}>{user.tenantId}</Text>
            </View>
          )}
        </View>
      )}

      {/* Navigation links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <TouchableOpacity
          style={styles.navRow}
          onPress={() => navigation.navigate('PushPreferences')}
          activeOpacity={0.7}
        >
          <Text style={styles.navLabel}>Push Notification Preferences</Text>
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <View style={styles.signOutSection}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={() => void logout()}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    paddingBottom: 48,
  },
  profileHeader: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  email: {
    fontSize: 14,
    color: '#6b7280',
  },
  roleBadge: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  logoRow: {
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tenantLogo: {
    width: 120,
    height: 40,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
    textAlign: 'right',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  navLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '400',
  },
  navChevron: {
    fontSize: 20,
    color: '#9ca3af',
  },
  signOutSection: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  signOutButton: {
    height: 52,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
