import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthStackParamList } from './types';
import { useAuthStore } from '../stores/auth.store';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { QrScanScreen } from '../screens/auth/QrScanScreen';
import { ManualServerScreen } from '../screens/auth/ManualServerScreen';
import { AppTabs } from './AppTabs';

const AuthStack = createStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <AuthStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <AuthStack.Screen
        name="QrScan"
        component={QrScanScreen}
        options={{ headerShown: false }}
      />
      <AuthStack.Screen
        name="ManualServer"
        component={ManualServerScreen}
        options={{ title: 'Server Address' }}
      />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { token, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return token ? <AppTabs /> : <AuthNavigator />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
