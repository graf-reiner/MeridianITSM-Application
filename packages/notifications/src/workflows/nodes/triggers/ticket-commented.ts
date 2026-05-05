import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_commented',
  category: 'trigger',
  notificationTrigger: 'TICKET_COMMENTED',
  label: 'Comment Added',
  description: 'Fires when a comment is added to a ticket',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
