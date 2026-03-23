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
import { KnowledgeStackParamList } from '../../navigation/types';
import { useKbArticles, KbArticle } from '../../api/knowledge';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<KnowledgeStackParamList, 'KbList'>;

function ArticleCard({ article, onPress }: { article: KbArticle; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.articleCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.articleTitle} numberOfLines={2}>
        {article.title}
      </Text>
      {article.summary && (
        <Text style={styles.articleSummary} numberOfLines={2}>
          {article.summary}
        </Text>
      )}
      <View style={styles.articleMeta}>
        <Text style={styles.articleMetaText}>
          {article.viewCount} views
        </Text>
        {article.publishedAt && (
          <Text style={styles.articleMetaText}>
            {new Date(article.publishedAt).toLocaleDateString()}
          </Text>
        )}
      </View>
      {article.tags.length > 0 && (
        <View style={styles.tagRow}>
          {article.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

export function KbListScreen({ navigation }: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  const { data, isError, refetch } = useKbArticles(
    debouncedSearch ? { search: debouncedSearch } : undefined
  );

  const handleSearchChange = (text: string) => {
    setSearch(text);
    // Simple debounce using setTimeout
    const timer = setTimeout(() => setDebouncedSearch(text), 400);
    return () => clearTimeout(timer);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const articles = data?.articles ?? [];

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder="Search articles..."
          placeholderTextColor="#9ca3af"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
        </View>
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArticleCard
              article={item}
              onPress={() => navigation.navigate('KbArticle', { id: item.id })}
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
          contentContainerStyle={articles.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No articles available</Text>
              <Text style={styles.emptySubtext}>
                {debouncedSearch
                  ? 'No articles match your search.'
                  : 'Knowledge base articles will appear here.'}
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
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
  articleCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  articleSummary: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  articleMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  articleMetaText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#e0e7ff',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 12,
    color: '#3730a3',
    fontWeight: '400',
  },
});
