import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBadgeProps {
  label: string;
  backgroundColor: string;
  textColor: string;
}

export function StatusBadge({ label, backgroundColor, textColor }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const TICKET_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: '#dbeafe', text: '#1e40af' },
  IN_PROGRESS: { bg: '#fef3c7', text: '#92400e' },
  PENDING: { bg: '#e0e7ff', text: '#3730a3' },
  RESOLVED: { bg: '#d1fae5', text: '#065f46' },
  CLOSED: { bg: '#f3f4f6', text: '#6b7280' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  P1: { bg: '#fee2e2', text: '#991b1b' },
  P2: { bg: '#fef3c7', text: '#92400e' },
  P3: { bg: '#dbeafe', text: '#1e40af' },
  P4: { bg: '#f3f4f6', text: '#6b7280' },
};

const ASSET_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: '#d1fae5', text: '#065f46' },
  DEPLOYED: { bg: '#d1fae5', text: '#065f46' },
  IN_REPAIR: { bg: '#fef3c7', text: '#92400e' },
  RETIRED: { bg: '#f3f4f6', text: '#6b7280' },
  STORAGE: { bg: '#e0e7ff', text: '#3730a3' },
};

export function TicketStatusBadge({ status }: { status: string }) {
  const colors = TICKET_STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return <StatusBadge label={status.replace('_', ' ')} backgroundColor={colors.bg} textColor={colors.text} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return <StatusBadge label={priority} backgroundColor={colors.bg} textColor={colors.text} />;
}

export function AssetStatusBadge({ status }: { status: string }) {
  const colors = ASSET_STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return <StatusBadge label={status.replace('_', ' ')} backgroundColor={colors.bg} textColor={colors.text} />;
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
