import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function TicketListScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tickets</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
});
