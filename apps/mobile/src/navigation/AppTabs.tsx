import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIconsRaw from 'react-native-vector-icons/MaterialCommunityIcons';

// React 19 JSX component type workaround for react-native-vector-icons
const MaterialCommunityIcons = MaterialCommunityIconsRaw as unknown as React.ComponentType<{
  name: string;
  size: number;
  color: string;
}>;
import { AppTabsParamList } from './types';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { TicketsStack } from './stacks/TicketsStack';
import { KnowledgeStack } from './stacks/KnowledgeStack';
import { AssetsStack } from './stacks/AssetsStack';
import { ProfileStack } from './stacks/ProfileStack';
import { useAuthStore } from '../stores/auth.store';

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  const tenantBranding = useAuthStore((s) => s.tenantBranding);
  const accentColor = tenantBranding?.accentColor ?? '#4f46e5';

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
        tabBarActiveTintColor: accentColor,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          title: 'My Work',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="TicketsTab"
        component={TicketsStack}
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="ticket-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="KnowledgeTab"
        component={KnowledgeStack}
        options={{
          title: 'Knowledge',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AssetsTab"
        component={AssetsStack}
        options={{
          title: 'Assets',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="laptop" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
