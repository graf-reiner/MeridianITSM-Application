import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_sla_breach',
  category: 'trigger',
  label: 'SLA Breached',
  description: 'Fires when SLA is breached (100%+)',
  icon: 'mdiClockAlert',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
