import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_resolved',
  category: 'trigger',
  label: 'Ticket Resolved',
  description: 'Fires when a ticket is resolved',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
