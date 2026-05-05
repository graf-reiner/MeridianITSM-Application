import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_created',
  category: 'trigger',
  notificationTrigger: 'TICKET_CREATED',
  label: 'Ticket Created',
  description: 'Fires when a new ticket is created',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
