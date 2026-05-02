import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ticket } from '../api/tickets';
import { TicketsStackParamList } from '../navigation/types';
import { TicketStatusBadge, PriorityBadge } from './StatusBadge';
import { formatTicketNumber } from '../utils/record-numbers';

type TicketsNavProp = StackNavigationProp<TicketsStackParamList, 'TicketList'>;

interface TicketCardProps {
  ticket: Ticket;
}

const PRIORITY_ACCENT: Record<string, string> = {
  P1: '#dc2626',
  P2: '#f59e0b',
  P3: '#3b82f6',
  P4: '#6b7280',
};

export function TicketCard({ ticket }: TicketCardProps) {
  const navigation = useNavigation<TicketsNavProp>();

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: PRIORITY_ACCENT[ticket.priority] ?? '#6b7280' }]}
      onPress={() => navigation.navigate('TicketDetail', { id: ticket.id })}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.ticketNumber}>{formatTicketNumber(ticket.number)}</Text>
        <Text style={styles.timestamp}>
          {new Date(ticket.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {ticket.title}
      </Text>
      <View style={styles.badges}>
        <TicketStatusBadge status={ticket.status} />
        <View style={styles.badgeGap} />
        <PriorityBadge priority={ticket.priority} />
      </View>
      {ticket.assignedTo && (
        <Text style={styles.assignee}>Assigned to: {ticket.assignedTo.name}</Text>
      )}
      {ticket.sla && (
        <View style={styles.slaRow}>
          <View
            style={[
              styles.slaBar,
              {
                backgroundColor:
                  ticket.sla.elapsedPercent >= 100
                    ? '#dc2626'
                    : ticket.sla.elapsedPercent >= 90
                    ? '#dc2626'
                    : ticket.sla.elapsedPercent >= 75
                    ? '#f59e0b'
                    : '#10b981',
                width: `${Math.min(ticket.sla.elapsedPercent, 100)}%` as `${number}%`,
              },
            ]}
          />
          <Text style={styles.slaText}>
            SLA: {Math.round(ticket.sla.elapsedPercent)}%
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticketNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
  },
  timestamp: {
    fontSize: 13,
    color: '#6b7280',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeGap: {
    width: 8,
  },
  assignee: {
    fontSize: 13,
    color: '#6b7280',
  },
  slaRow: {
    marginTop: 8,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  slaBar: {
    height: 4,
    borderRadius: 2,
  },
  slaText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
});
