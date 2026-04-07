import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_ticket_status_changed',
  category: 'trigger',
  label: 'Status Changed',
  description: 'Fires when ticket status changes',
  icon: 'mdiTicketOutline',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [
    {
      key: 'newStatus',
      label: 'New Status',
      type: 'select',
      options: [
        { label: 'New', value: 'NEW' },
        { label: 'Open', value: 'OPEN' },
        { label: 'In Progress', value: 'IN_PROGRESS' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
        { label: 'Resolved', value: 'RESOLVED' },
        { label: 'Closed', value: 'CLOSED' },
        { label: 'Cancelled', value: 'CANCELLED' },
      ],
    },
  ],
});
