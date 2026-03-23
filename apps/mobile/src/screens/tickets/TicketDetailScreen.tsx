import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { TicketsStackParamList } from '../../navigation/types';
import { useTicket, useUpdateTicket } from '../../api/tickets';
import { CommentThread } from '../../components/CommentThread';
import { TicketStatusBadge, PriorityBadge } from '../../components/StatusBadge';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<TicketsStackParamList, 'TicketDetail'>;

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const TICKET_PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

export function TicketDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { data: ticket, isLoading, isError, refetch } = useTicket(id);
  const updateTicket = useUpdateTicket();
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const { user, tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const isStaff = user?.roles?.some((r) => ['admin', 'msp_admin', 'agent'].includes(r)) ?? false;

  const handleStatusChange = (status: string) => {
    setShowStatusPicker(false);
    updateTicket.mutate({ id, data: { status } });
  };

  const handlePriorityChange = (priority: string) => {
    setShowPriorityPicker(false);
    updateTicket.mutate({ id, data: { priority } });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !ticket) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
        <TouchableOpacity onPress={() => void refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.ticketNumber}>TKT-{ticket.number}</Text>
          <Text style={styles.title}>{ticket.title}</Text>
        </View>

        {/* Badges */}
        <View style={styles.badgeRow}>
          <TicketStatusBadge status={ticket.status} />
          <View style={styles.badgeGap} />
          <PriorityBadge priority={ticket.priority} />
        </View>

        {/* Meta */}
        <View style={styles.metaSection}>
          {ticket.assignedTo && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Assigned to</Text>
              <Text style={styles.metaValue}>{ticket.assignedTo.name}</Text>
            </View>
          )}
          {ticket.category && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Category</Text>
              <Text style={styles.metaValue}>{ticket.category.name}</Text>
            </View>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={styles.metaValue}>{ticket.type}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{new Date(ticket.createdAt).toLocaleString()}</Text>
          </View>
          {ticket.createdBy && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Reported by</Text>
              <Text style={styles.metaValue}>{ticket.createdBy.name}</Text>
            </View>
          )}
        </View>

        {/* SLA indicator */}
        {ticket.sla && (
          <View style={styles.slaSection}>
            <View style={styles.slaHeader}>
              <Text style={styles.sectionHeader}>SLA</Text>
              <Text
                style={[
                  styles.slaPercent,
                  {
                    color:
                      ticket.sla.elapsedPercent >= 100
                        ? '#dc2626'
                        : ticket.sla.elapsedPercent >= 75
                        ? '#f59e0b'
                        : '#10b981',
                  },
                ]}
              >
                {Math.round(ticket.sla.elapsedPercent)}% — {ticket.sla.status}
              </Text>
            </View>
            <Text style={styles.slaDue}>
              Due: {new Date(ticket.sla.dueAt).toLocaleString()}
            </Text>
            <View style={styles.slaBarBg}>
              <View
                style={[
                  styles.slaBarFill,
                  {
                    width: `${Math.min(ticket.sla.elapsedPercent, 100)}%` as `${number}%`,
                    backgroundColor:
                      ticket.sla.elapsedPercent >= 100
                        ? '#dc2626'
                        : ticket.sla.elapsedPercent >= 90
                        ? '#dc2626'
                        : ticket.sla.elapsedPercent >= 75
                        ? '#f59e0b'
                        : '#10b981',
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionHeader}>Description</Text>
          <Text style={styles.description}>{ticket.description}</Text>
        </View>

        {/* Action buttons (staff only) */}
        {isStaff && (
          <View style={styles.actionsSection}>
            <Text style={styles.sectionHeader}>Actions</Text>
            <View style={styles.actionButtonRow}>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: accentColor }]}
                onPress={() => setShowStatusPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionButtonText, { color: accentColor }]}>
                  Update Status
                </Text>
              </TouchableOpacity>
              <View style={styles.actionGap} />
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: accentColor }]}
                onPress={() => setShowPriorityPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionButtonText, { color: accentColor }]}>
                  Change Priority
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Comments */}
        <View style={styles.commentsSection}>
          <CommentThread
            ticketId={id}
            comments={ticket.comments ?? []}
            canPostInternal={isStaff}
          />
        </View>
      </ScrollView>

      {/* Status picker modal */}
      <Modal visible={showStatusPicker} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowStatusPicker(false)}
          activeOpacity={1}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Update Status</Text>
            {TICKET_STATUSES.map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.modalOption,
                  ticket.status === status && styles.modalOptionActive,
                ]}
                onPress={() => handleStatusChange(status)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ticket.status === status && { color: accentColor, fontWeight: '700' },
                  ]}
                >
                  {status.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Priority picker modal */}
      <Modal visible={showPriorityPicker} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowPriorityPicker(false)}
          activeOpacity={1}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Change Priority</Text>
            {TICKET_PRIORITIES.map((priority) => (
              <TouchableOpacity
                key={priority}
                style={[
                  styles.modalOption,
                  ticket.priority === priority && styles.modalOptionActive,
                ]}
                onPress={() => handlePriorityChange(priority)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    ticket.priority === priority && { color: accentColor, fontWeight: '700' },
                  ]}
                >
                  {priority}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f9fafb',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  ticketNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 28,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  badgeGap: {
    width: 8,
  },
  metaSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  metaLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '400',
  },
  metaValue: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
  },
  slaSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  slaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  slaPercent: {
    fontSize: 13,
    fontWeight: '700',
  },
  slaDue: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  slaBarBg: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  slaBarFill: {
    height: 6,
    borderRadius: 3,
  },
  descriptionSection: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  description: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    marginTop: 8,
  },
  actionsSection: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  actionButtonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionGap: {
    width: 12,
  },
  commentsSection: {
    marginTop: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalOptionActive: {
    backgroundColor: '#f0f0ff',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
  },
});
