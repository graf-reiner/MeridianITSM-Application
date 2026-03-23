import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import RenderHtml from 'react-native-render-html';
import { KnowledgeStackParamList } from '../../navigation/types';
import { useKbArticle } from '../../api/knowledge';
import { useAuthStore } from '../../stores/auth.store';

type Props = StackScreenProps<KnowledgeStackParamList, 'KbArticle'>;

export function KbArticleScreen({ route }: Props) {
  const { id } = route.params;
  const { data: article, isLoading, isError } = useKbArticle(id);
  const { width } = useWindowDimensions();
  const { tenantBranding } = useAuthStore();
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  // Mobile-friendly HTML styles per UI-SPEC
  const tagsStyles = {
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: '#374151',
    },
    p: {
      marginBottom: 12,
      fontSize: 16,
      lineHeight: 24,
      color: '#374151',
    },
    h1: { fontSize: 20, fontWeight: '700' as const, color: '#111827', marginBottom: 12, marginTop: 20 },
    h2: { fontSize: 18, fontWeight: '700' as const, color: '#111827', marginBottom: 10, marginTop: 18 },
    h3: { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginBottom: 8, marginTop: 16 },
    ul: { marginBottom: 12 },
    ol: { marginBottom: 12 },
    li: { fontSize: 16, lineHeight: 24, color: '#374151', marginBottom: 4 },
    code: { fontFamily: 'Courier', backgroundColor: '#f3f4f6', fontSize: 14 },
    pre: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 6, marginBottom: 12 },
    a: { color: accentColor, textDecorationLine: 'underline' as const },
    img: { maxWidth: '100%' as const },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: '#d1d5db',
      paddingLeft: 12,
      color: '#6b7280',
      marginBottom: 12,
    },
    table: { width: '100%' as const, marginBottom: 12 },
    th: { fontWeight: '700' as const, padding: 8, backgroundColor: '#f3f4f6' },
    td: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !article) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Something went wrong. Pull down to retry.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Article header */}
      <View style={styles.header}>
        <Text style={styles.title}>{article.title}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaText}>By {article.author.name}</Text>
          {article.publishedAt && (
            <Text style={styles.metaText}>
              {new Date(article.publishedAt).toLocaleDateString()}
            </Text>
          )}
          <Text style={styles.metaText}>{article.viewCount} views</Text>
        </View>

        {article.tags.length > 0 && (
          <View style={styles.tagRow}>
            {article.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {article.summary && (
          <Text style={styles.summary}>{article.summary}</Text>
        )}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* HTML Content — mobile-friendly rendering */}
      <View style={styles.htmlContainer}>
        <RenderHtml
          contentWidth={width - 32}
          source={{ html: article.content }}
          tagsStyles={tagsStyles}
          enableExperimentalMarginCollapsing
        />
      </View>
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 28,
    marginBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
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
  },
  summary: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  htmlContainer: {
    backgroundColor: '#ffffff',
    padding: 16,
  },
});
