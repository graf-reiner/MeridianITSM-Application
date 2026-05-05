import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_updated',
  category: 'trigger',
  notificationTrigger: 'TICKET_UPDATED',
  label: 'Ticket Updated',
  description: 'Fires when a ticket field is changed',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
