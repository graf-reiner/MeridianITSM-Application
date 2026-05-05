import { registerNode } from '../../node-registry.js';

registerNode({
  type: 'trigger_cert_expiry_warning',
  category: 'trigger',
  notificationTrigger: 'CERT_EXPIRY_WARNING',
  label: 'Certificate Expiry Warning',
  description: 'Fires when an APM-monitored certificate is approaching expiry',
  icon: 'mdiCertificate',
  color: '#f59e0b',
  inputs: [],
  outputs: [{ id: 'out', label: 'Next', type: 'default' }],
  configSchema: [],
});
