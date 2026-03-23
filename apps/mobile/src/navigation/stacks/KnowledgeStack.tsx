import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { KnowledgeStackParamList } from '../types';
import { KbListScreen } from '../../screens/knowledge/KbListScreen';
import { KbArticleScreen } from '../../screens/knowledge/KbArticleScreen';

const Stack = createStackNavigator<KnowledgeStackParamList>();

export function KnowledgeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="KbList" component={KbListScreen} options={{ title: 'Knowledge Base' }} />
      <Stack.Screen
        name="KbArticle"
        component={KbArticleScreen}
        options={{ title: 'Article' }}
      />
    </Stack.Navigator>
  );
}
