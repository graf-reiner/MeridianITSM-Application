import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_assigned',
  category: 'trigger',
  label: 'Ticket Assigned',
  description: 'Fires when a ticket is assigned or reassigned',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
