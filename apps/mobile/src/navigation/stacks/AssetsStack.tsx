import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AssetsStackParamList } from '../types';
import { AssetListScreen } from '../../screens/assets/AssetListScreen';
import { AssetDetailScreen } from '../../screens/assets/AssetDetailScreen';

const Stack = createStackNavigator<AssetsStackParamList>();

export function AssetsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="AssetList" component={AssetListScreen} options={{ title: 'Assets' }} />
      <Stack.Screen
        name="AssetDetail"
        component={AssetDetailScreen}
        options={{ title: 'Asset' }}
      />
    </Stack.Navigator>
  );
}
