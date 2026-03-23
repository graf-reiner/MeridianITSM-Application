import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOfflineStore } from '../stores/offline.store';

export function OfflineBanner() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You are offline. Changes will sync when you reconnect.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#fef3c7', padding: 8, alignItems: 'center' },
  text: { color: '#92400e', fontSize: 13 },
});
