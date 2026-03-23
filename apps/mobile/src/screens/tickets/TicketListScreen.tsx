import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { TicketsStackParamList } from '../../navigation/types';
import { useTickets, Ticket } from '../../api/tickets';
import { TicketCard } from '../../components/TicketCard';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<TicketsStackParamList, 'TicketList'>;

type FilterTab = 'all' | 'open' | 'mine';

export function TicketListScreen({ navigation }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const filters = {
    status: activeFilter === 'open' ? 'OPEN' : undefined,
    assignedToMe: activeFilter === 'mine' ? true : undefined,
    search: search.trim() || undefined,
  };

  const { data, isError, refetch } = useTickets(filters);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const tabs: Array<{ key: FilterTab; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'mine', label: 'My Tickets' },
  ];

  const tickets: Ticket[] = data?.tickets ?? [];

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search tickets..."
          placeholderTextColor="#9ca3af"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              activeFilter === tab.key && { borderBottomColor: accentColor, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveFilter(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === tab.key && { color: accentColor, fontWeight: '700' },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TicketCard ticket={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          contentContainerStyle={tickets.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No tickets assigned to you</Text>
              <Text style={styles.emptySubtext}>
                {search ? 'Try adjusting your search.' : 'New tickets will appear here when assigned.'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={styles.listFooter} />}
        />
      )}

      {/* Create Ticket FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accentColor }]}
        onPress={() => navigation.navigate('CreateTicket')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ Create Ticket</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    fontSize: 16,
    color: '#374151',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6b7280',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  listFooter: {
    height: 80,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    borderRadius: 24,
    paddingHorizontal: 20,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
