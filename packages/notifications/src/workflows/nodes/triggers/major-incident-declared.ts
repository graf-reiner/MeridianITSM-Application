import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_major_incident_declared',
  category: 'trigger',
  notificationTrigger: 'MAJOR_INCIDENT_DECLARED',
  label: 'Major Incident Declared',
  description: 'Fires when an incident is promoted to major',
  icon: 'mdiAlertOctagram',
  color: '#dc2626',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
