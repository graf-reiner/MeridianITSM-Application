import {
  mdiChartLine,
  mdiChartBar,
  mdiChartPie,
  mdiTicketOutline,
  mdiClockAlertOutline,
  mdiLightningBolt,
  mdiHandWave,
  mdiLink,
  mdiHistory,
  mdiAlertCircleOutline,
  mdiCounter,
} from '@mdi/js';
import type { WidgetTypeDefinition } from './types';

export const WIDGET_TYPES: WidgetTypeDefinition[] = [
  { type: 'stat_card', label: 'Stat Card', description: 'Single metric with icon', icon: mdiCounter, defaultW: 3, defaultH: 2, minW: 2, minH: 2 },
  { type: 'ticket_volume_chart', label: 'Ticket Volume', description: 'Line chart of ticket volume over 30 days', icon: mdiChartLine, defaultW: 6, defaultH: 4, minW: 4, minH: 3 },
  { type: 'priority_chart', label: 'Priority Distribution', description: 'Tickets by priority level', icon: mdiChartBar, defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
  { type: 'category_chart', label: 'Category Breakdown', description: 'Tickets by category', icon: mdiChartPie, defaultW: 4, defaultH: 4, minW: 3, minH: 3 },
  { type: 'recent_activity', label: 'Recent Activity', description: 'Latest ticket events', icon: mdiHistory, defaultW: 6, defaultH: 4, minW: 4, minH: 3 },
  { type: 'my_tickets', label: 'My Tickets', description: 'Tickets assigned to you', icon: mdiTicketOutline, defaultW: 6, defaultH: 4, minW: 4, minH: 3 },
  { type: 'unassigned_tickets', label: 'Unassigned Tickets', description: 'Tickets without an assignee', icon: mdiAlertCircleOutline, defaultW: 6, defaultH: 3, minW: 3, minH: 2 },
  { type: 'sla_status', label: 'SLA Status', description: 'SLA breach and warning summary', icon: mdiClockAlertOutline, defaultW: 4, defaultH: 3, minW: 3, minH: 2 },
  { type: 'quick_actions', label: 'Quick Actions', description: 'Shortcut buttons', icon: mdiLightningBolt, defaultW: 3, defaultH: 2, minW: 2, minH: 2 },
  { type: 'welcome', label: 'Welcome', description: 'Greeting with date', icon: mdiHandWave, defaultW: 6, defaultH: 2, minW: 3, minH: 2 },
  { type: 'links', label: 'Links', description: 'Custom URL bookmarks', icon: mdiLink, defaultW: 3, defaultH: 3, minW: 2, minH: 2 },
];

export const WIDGET_TYPE_MAP = new Map(WIDGET_TYPES.map(w => [w.type, w]));
