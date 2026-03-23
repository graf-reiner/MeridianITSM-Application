import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '../../stores/auth.store';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{user?.name ?? 'Profile'}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={() => void logout()} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280' },
  logoutButton: { height: 44, paddingHorizontal: 24, backgroundColor: '#ef4444', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
