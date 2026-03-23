import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { AssetsStackParamList } from '../../navigation/types';
import { useMyAssets, Asset } from '../../api/assets';
import { AssetStatusBadge } from '../../components/StatusBadge';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<AssetsStackParamList, 'AssetList'>;

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'DEPLOYED', 'IN_REPAIR', 'RETIRED'];

function AssetCard({ asset, onPress }: { asset: Asset; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.assetCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.assetTag}>{asset.assetTag}</Text>
        <AssetStatusBadge status={asset.status} />
      </View>
      {asset.hostname && (
        <Text style={styles.hostname}>{asset.hostname}</Text>
      )}
      {asset.model && (
        <Text style={styles.model}>{asset.model}</Text>
      )}
      {asset.assignedTo && (
        <Text style={styles.assignedTo}>Assigned to: {asset.assignedTo.name}</Text>
      )}
      {asset.site && (
        <Text style={styles.site}>Site: {asset.site.name}</Text>
      )}
    </TouchableOpacity>
  );
}

export function AssetListScreen({ navigation }: Props) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const { data, isError, refetch } = useMyAssets(
    statusFilter !== 'ALL' ? { status: statusFilter } : undefined
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const assets: Asset[] = data?.assets ?? [];

  return (
    <View style={styles.container}>
      {/* Status filter */}
      <View style={styles.filterContainer}>
        <FlatList
          data={STATUS_FILTERS}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                statusFilter === item && { backgroundColor: accentColor, borderColor: accentColor },
              ]}
              onPress={() => setStatusFilter(item)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === item && { color: '#ffffff' },
                ]}
              >
                {item === 'ALL' ? 'All' : item.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AssetCard
              asset={item}
              onPress={() => navigation.navigate('AssetDetail', { id: item.id })}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          contentContainerStyle={assets.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No assets assigned to you</Text>
              <Text style={styles.emptySubtext}>
                {statusFilter !== 'ALL'
                  ? 'Try changing the status filter.'
                  : 'Assets assigned to you will appear here.'}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={styles.listFooter} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#374151',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 32,
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
    height: 32,
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
  assetCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  assetTag: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
  },
  hostname: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  model: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  assignedTo: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  site: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
});
