import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { TicketsStackParamList } from '../types';
import { TicketListScreen } from '../../screens/tickets/TicketListScreen';
import { TicketDetailScreen } from '../../screens/tickets/TicketDetailScreen';
import { CreateTicketScreen } from '../../screens/tickets/CreateTicketScreen';

const Stack = createStackNavigator<TicketsStackParamList>();

export function TicketsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#111827',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="TicketList" component={TicketListScreen} options={{ title: 'Tickets' }} />
      <Stack.Screen
        name="TicketDetail"
        component={TicketDetailScreen}
        options={{ title: 'Ticket' }}
      />
      <Stack.Screen
        name="CreateTicket"
        component={CreateTicketScreen}
        options={{ title: 'New Ticket' }}
      />
    </Stack.Navigator>
  );
}
