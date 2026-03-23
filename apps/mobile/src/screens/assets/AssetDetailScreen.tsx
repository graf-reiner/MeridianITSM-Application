import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { AssetsStackParamList } from '../../navigation/types';
import { useAsset } from '../../api/assets';
import { AssetStatusBadge } from '../../components/StatusBadge';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<AssetsStackParamList, 'AssetDetail'>;

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value)}</Text>
    </View>
  );
}

export function AssetDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { data: asset, isLoading, isError } = useAsset(id);
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !asset) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.assetTag}>{asset.assetTag}</Text>
          <AssetStatusBadge status={asset.status} />
        </View>
        {asset.hostname && <Text style={styles.hostname}>{asset.hostname}</Text>}
        {asset.model && <Text style={styles.model}>{asset.model}</Text>}
      </View>

      {/* Asset Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Asset Information</Text>
        <InfoRow label="Serial Number" value={asset.serialNumber} />
        <InfoRow label="Status" value={asset.status} />
        <InfoRow label="Model" value={asset.model} />
        {asset.site && <InfoRow label="Site" value={asset.site.name} />}
        {asset.assignedTo && <InfoRow label="Assigned To" value={asset.assignedTo.name} />}
        <InfoRow label="Created" value={new Date(asset.createdAt).toLocaleDateString()} />
        <InfoRow label="Last Updated" value={new Date(asset.updatedAt).toLocaleDateString()} />
      </View>

      {/* Hardware Specs */}
      {asset.hardwareSpecs && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hardware Specifications</Text>
          <InfoRow label="CPU" value={asset.hardwareSpecs.cpu} />
          <InfoRow label="Memory" value={asset.hardwareSpecs.memoryGb ? `${asset.hardwareSpecs.memoryGb} GB` : undefined} />
          <InfoRow label="Operating System" value={asset.hardwareSpecs.os} />
          {asset.hardwareSpecs.disks && asset.hardwareSpecs.disks.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Storage</Text>
              <View style={styles.diskList}>
                {asset.hardwareSpecs.disks.map((disk, idx) => (
                  <Text key={idx} style={styles.infoValue}>
                    {disk.model ? `${disk.model} — ` : ''}{disk.sizeGb} GB
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Purchase Info */}
      {(asset.purchaseDate || asset.purchaseCost || asset.warrantyExpiry) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Purchase Information</Text>
          {asset.purchaseDate && (
            <InfoRow
              label="Purchase Date"
              value={new Date(asset.purchaseDate).toLocaleDateString()}
            />
          )}
          {asset.purchaseCost !== undefined && asset.purchaseCost !== null && (
            <InfoRow
              label="Purchase Cost"
              value={`$${asset.purchaseCost.toLocaleString()}`}
            />
          )}
          {asset.warrantyExpiry && (
            <InfoRow
              label="Warranty Expiry"
              value={new Date(asset.warrantyExpiry).toLocaleDateString()}
            />
          )}
        </View>
      )}
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
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  assetTag: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4f46e5',
  },
  hostname: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  model: {
    fontSize: 14,
    color: '#6b7280',
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
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: '#374151',
    flex: 2,
    textAlign: 'right',
  },
  diskList: {
    flex: 2,
    alignItems: 'flex-end',
    gap: 4,
  },
});
