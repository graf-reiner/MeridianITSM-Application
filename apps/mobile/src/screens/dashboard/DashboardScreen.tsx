import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useDashboard } from '../../api/dashboard';
import { useAuthStore } from '../../stores/auth.store';

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  P1: { bg: '#fee2e2', text: '#991b1b', label: 'Critical (P1)' },
  P2: { bg: '#fef3c7', text: '#92400e', label: 'High (P2)' },
  P3: { bg: '#dbeafe', text: '#1e40af', label: 'Medium (P3)' },
  P4: { bg: '#f3f4f6', text: '#6b7280', label: 'Low (P4)' },
};

export function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isError, refetch } = useDashboard();
  const { user, tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
      </View>
    );
  }

  const priorityKeys: Array<'P1' | 'P2' | 'P3' | 'P4'> = ['P1', 'P2', 'P3', 'P4'];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={accentColor}
          colors={[accentColor]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] ?? 'there'}</Text>
        <Text style={styles.title}>My Work</Text>
      </View>

      <View style={[styles.summaryCard, { borderLeftColor: accentColor }]}>
        <Text style={styles.summaryLabel}>Open Tickets</Text>
        <Text style={[styles.summaryCount, { color: accentColor }]}>
          {data?.openTickets ?? '—'}
        </Text>
        <Text style={styles.summarySubtext}>assigned to you</Text>
      </View>

      <Text style={styles.sectionHeader}>By Priority</Text>
      <View style={styles.priorityGrid}>
        {priorityKeys.map((p) => {
          const colors = PRIORITY_COLORS[p];
          const count = data?.ticketsByPriority?.[p] ?? 0;
          return (
            <View key={p} style={[styles.priorityCard, { backgroundColor: colors.bg }]}>
              <Text style={[styles.priorityCount, { color: colors.text }]}>{count}</Text>
              <Text style={[styles.priorityLabel, { color: colors.text }]}>{colors.label}</Text>
            </View>
          );
        })}
      </View>

      {data?.slaDueSoon && data.slaDueSoon.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>SLA At Risk</Text>
          <View style={styles.slaList}>
            {data.slaDueSoon.map((item) => (
              <View key={item.id} style={styles.slaItem}>
                <View style={styles.slaItemHeader}>
                  <Text style={styles.slaTicketNumber}>TKT-{item.number}</Text>
                  <Text
                    style={[
                      styles.slaPercent,
                      { color: item.slaPercent >= 90 ? '#dc2626' : '#f59e0b' },
                    ]}
                  >
                    {Math.round(item.slaPercent)}%
                  </Text>
                </View>
                <Text style={styles.slaTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.slaBarBg}>
                  <View
                    style={[
                      styles.slaBarFill,
                      {
                        width: `${Math.min(item.slaPercent, 100)}%` as `${number}%`,
                        backgroundColor:
                          item.slaPercent >= 90 ? '#dc2626' : item.slaPercent >= 75 ? '#f59e0b' : '#10b981',
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {data?.recentActivity && data.recentActivity.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Recent Activity</Text>
          <View style={styles.activityList}>
            {data.recentActivity.slice(0, 10).map((item) => (
              <View key={item.id} style={styles.activityItem}>
                <Text style={styles.activityMessage}>{item.message}</Text>
                <Text style={styles.activityTime}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 },
  greeting: { fontSize: 13, fontWeight: '400', color: '#6b7280' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  summaryCard: {
    marginHorizontal: 16, marginVertical: 16, padding: 20,
    backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb', borderLeftWidth: 4, alignItems: 'center',
  },
  summaryLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 },
  summaryCount: { fontSize: 48, fontWeight: '700', lineHeight: 56 },
  summarySubtext: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#374151', marginHorizontal: 16, marginTop: 24, marginBottom: 12 },
  priorityGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 12, gap: 8 },
  priorityCard: { flex: 1, minWidth: '45%', padding: 12, borderRadius: 8, alignItems: 'center' },
  priorityCount: { fontSize: 24, fontWeight: '700' },
  priorityLabel: { fontSize: 12, fontWeight: '400', marginTop: 4, textAlign: 'center' },
  slaList: { marginHorizontal: 16, gap: 8 },
  slaItem: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  slaItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  slaTicketNumber: { fontSize: 13, fontWeight: '700', color: '#4f46e5' },
  slaPercent: { fontSize: 13, fontWeight: '700' },
  slaTitle: { fontSize: 14, color: '#374151', marginBottom: 8 },
  slaBarBg: { height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' },
  slaBarFill: { height: 4, borderRadius: 2 },
  activityList: { marginHorizontal: 16, gap: 8 },
  activityItem: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  activityMessage: { fontSize: 14, color: '#374151' },
  activityTime: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  errorContainer: { flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
});
