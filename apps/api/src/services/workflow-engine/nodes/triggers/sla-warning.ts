import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_sla_warning',
  category: 'trigger',
  label: 'SLA Warning',
  description: 'Fires when SLA reaches warning threshold (75%+)',
  icon: 'mdiClockAlert',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
