import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { KnowledgeStackParamList } from '../../navigation/types';

type Props = StackScreenProps<KnowledgeStackParamList, 'KbArticle'>;

export function KbArticleScreen({ route }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Article {route.params.id}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
});
