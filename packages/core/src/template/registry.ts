import type { VariableContextKey, VariableDefinition } from './types.js';

/**
 * Static variable catalogs offered by the picker.
 *
 * Each catalog maps to one `VariableContextKey`. The web variable picker
 * accepts an array like `["ticket", "requester", "tenant"]` and merges
 * the corresponding catalogs. Dynamic variables (like per-form field
 * keys) come from `form-fields.ts` instead.
 *
 * Every key here MUST match a path in the runtime context object passed
 * to `renderTemplate()`. When you add a variable here, also make sure
 * every server-side substitution site populates the matching path.
 */

export const TICKET_VARIABLES: VariableDefinition[] = [
  { key: 'ticket.number', label: 'Ticket Number', description: 'Sequential ticket number (e.g. T-1234).', example: 'T-1234', category: 'Ticket' },
  { key: 'ticket.id', label: 'Ticket GUID', description: 'Internal UUID of the ticket — useful for building deep links.', example: 'c7ca6993-9e2e-4c1f-8d52-1c03de2bd03b', category: 'Ticket' },
  { key: 'ticket.title', label: 'Ticket Title', description: 'The short title of the ticket.', example: 'Cannot print from accounting PC', category: 'Ticket' },
  { key: 'ticket.description', label: 'Ticket Description', description: 'Full description text of the ticket.', example: 'Printer shows offline...', category: 'Ticket' },
  { key: 'ticket.status', label: 'Ticket Status', description: 'Current status (NEW, OPEN, IN_PROGRESS, ...).', example: 'IN_PROGRESS', category: 'Ticket' },
  { key: 'ticket.priority', label: 'Ticket Priority', description: 'Priority level (LOW, MEDIUM, HIGH, CRITICAL).', example: 'HIGH', category: 'Ticket' },
  { key: 'ticket.type', label: 'Ticket Type', description: 'INCIDENT, SERVICE_REQUEST, or PROBLEM.', example: 'INCIDENT', category: 'Ticket' },
  { key: 'ticket.category', label: 'Ticket Category', description: 'Category name (if assigned).', example: 'Hardware', category: 'Ticket' },
  { key: 'ticket.queue', label: 'Ticket Queue', description: 'Queue name (if assigned).', example: 'Tier 1 Support', category: 'Ticket' },
  { key: 'ticket.tags', label: 'Ticket Tags', description: 'Comma-separated list of tags.', example: 'printer, urgent', category: 'Ticket' },
  { key: 'ticket.createdAt', label: 'Created At', description: 'ISO timestamp when the ticket was created.', example: '2026-04-10T14:30:00Z', category: 'Ticket' },
  { key: 'ticket.resolvedAt', label: 'Resolved At', description: 'ISO timestamp when the ticket was resolved.', example: '2026-04-11T09:15:00Z', category: 'Ticket' },
  { key: 'ticket.dashboardUrl', label: 'Staff Dashboard URL', description: "Full clickable link to the ticket in the staff dashboard. Honors the tenant's vanity FQDN.", example: 'https://acme.meridianitsm.com/dashboard/tickets/c7ca6993-9e2e-4c1f-8d52-1c03de2bd03b', category: 'Ticket' },
  { key: 'ticket.portalUrl', label: 'End-User Portal URL', description: "Full clickable link to the ticket in the end-user portal. Honors the tenant's vanity FQDN.", example: 'https://acme.meridianitsm.com/portal/tickets/c7ca6993-9e2e-4c1f-8d52-1c03de2bd03b', category: 'Ticket' },
];

export const REQUESTER_VARIABLES: VariableDefinition[] = [
  { key: 'requester.firstName', label: 'Requester First Name', description: "Requester's first name.", example: 'Alex', category: 'Requester' },
  { key: 'requester.lastName', label: 'Requester Last Name', description: "Requester's last name.", example: 'Smith', category: 'Requester' },
  { key: 'requester.displayName', label: 'Requester Full Name', description: "Requester's full name.", example: 'Alex Smith', category: 'Requester' },
  { key: 'requester.email', label: 'Requester Email', description: "Requester's email address.", example: 'alex.smith@acme.com', category: 'Requester' },
  { key: 'requester.phone', label: 'Requester Phone', description: "Requester's phone number (if on file).", example: '+1 555-0100', category: 'Requester' },
];

export const ASSIGNEE_VARIABLES: VariableDefinition[] = [
  { key: 'assignee.firstName', label: 'Assignee First Name', description: 'First name of the assigned agent.', example: 'Jordan', category: 'Assignee' },
  { key: 'assignee.lastName', label: 'Assignee Last Name', description: 'Last name of the assigned agent.', example: 'Lee', category: 'Assignee' },
  { key: 'assignee.displayName', label: 'Assignee Full Name', description: 'Full name of the assigned agent.', example: 'Jordan Lee', category: 'Assignee' },
  { key: 'assignee.email', label: 'Assignee Email', description: 'Email of the assigned agent.', example: 'jordan.lee@meridian.com', category: 'Assignee' },
];

export const TENANT_VARIABLES: VariableDefinition[] = [
  { key: 'tenant.name', label: 'Organization Name', description: 'The tenant / organization name.', example: 'Acme Corp', category: 'Organization' },
  { key: 'tenant.subdomain', label: 'Organization Subdomain', description: 'Tenant subdomain on the service portal.', example: 'acme', category: 'Organization' },
  { key: 'tenant.url', label: 'Tenant Base URL', description: 'Canonical https://… root for this tenant. Honors vanity FQDN, then subdomain, then platform fallback.', example: 'https://acme.meridianitsm.com', category: 'Organization' },
  { key: 'tenant.dashboardUrlBase', label: 'Dashboard Tickets URL Prefix', description: 'Use with {{ticket.id}} to build a custom link, e.g. {{tenant.dashboardUrlBase}}/{{ticket.id}}. (No trailing slash.)', example: 'https://acme.meridianitsm.com/dashboard/tickets', category: 'Organization' },
  { key: 'tenant.portalUrlBase', label: 'Portal Tickets URL Prefix', description: 'Use with {{ticket.id}} to build a custom portal link. (No trailing slash.)', example: 'https://acme.meridianitsm.com/portal/tickets', category: 'Organization' },
];

export const FORM_META_VARIABLES: VariableDefinition[] = [
  { key: 'form.name', label: 'Form Name', description: 'The custom form name.', example: 'New Hire Request', category: 'Form' },
  { key: 'form.slug', label: 'Form Slug', description: 'URL slug of the form.', example: 'new-hire-request', category: 'Form' },
  { key: 'submission.date', label: 'Submission Date', description: 'ISO date when the form was submitted.', example: '2026-04-10', category: 'Form' },
  { key: 'submission.submitterEmail', label: 'Submitter Email', description: 'Email of the person who submitted the form (if authenticated or captured).', example: 'alex.smith@acme.com', category: 'Form' },
];

export const SLA_VARIABLES: VariableDefinition[] = [
  { key: 'sla.name', label: 'SLA Policy Name', description: 'Name of the SLA policy applied to the ticket.', example: 'Gold 24x7', category: 'SLA' },
  { key: 'sla.breachAt', label: 'SLA Breach Time', description: 'ISO timestamp when the SLA will breach.', example: '2026-04-10T18:00:00Z', category: 'SLA' },
  { key: 'sla.elapsedPct', label: 'SLA Elapsed %', description: 'Percentage of the SLA window that has elapsed.', example: '85', category: 'SLA' },
  { key: 'sla.status', label: 'SLA Status', description: 'OK, WARNING, CRITICAL, or BREACHED.', example: 'WARNING', category: 'SLA' },
];

export const CHANGE_VARIABLES: VariableDefinition[] = [
  { key: 'change.number', label: 'Change Number', description: 'Sequential change number.', example: 'C-042', category: 'Change' },
  { key: 'change.title', label: 'Change Title', description: 'Short title of the change request.', example: 'Upgrade firewall firmware', category: 'Change' },
  { key: 'change.status', label: 'Change Status', description: 'Current change status.', example: 'APPROVED', category: 'Change' },
];

export const COMMENT_VARIABLES: VariableDefinition[] = [
  { key: 'comment.body', label: 'Comment Body', description: 'The comment text that triggered the notification.', example: 'I have restarted the service...', category: 'Comment' },
  { key: 'comment.author', label: 'Comment Author', description: 'Full name of the person who posted the comment.', example: 'Jordan Lee', category: 'Comment' },
];

export const NOW_VARIABLES: VariableDefinition[] = [
  { key: 'now.date', label: 'Current Date', description: 'Today in YYYY-MM-DD format.', example: '2026-04-10', category: 'System' },
  { key: 'now.time', label: 'Current Time', description: 'Current time in HH:MM format.', example: '14:30', category: 'System' },
  { key: 'now.iso', label: 'Current Timestamp', description: 'Current time as an ISO 8601 string.', example: '2026-04-10T14:30:00Z', category: 'System' },
];

// APM ↔ CMDB bridge — variables available in CERT_EXPIRY_WARNING templates.
// Populated by the cert-expiry-monitor worker via context.certExpiry.
export const CERT_VARIABLES: VariableDefinition[] = [
  { key: 'cert.applicationName', label: 'Application Name', description: 'The Application that this certificate belongs to.', example: 'Acme Portal', category: 'Certificate' },
  { key: 'cert.ciName', label: 'CI Name', description: 'The CMDB endpoint CI that holds the certificate.', example: 'portal.acme.com', category: 'Certificate' },
  { key: 'cert.url', label: 'Endpoint URL', description: 'The URL the certificate is served at.', example: 'https://portal.acme.com', category: 'Certificate' },
  { key: 'cert.daysUntilExpiry', label: 'Days Until Expiry', description: 'Number of days until the certificate expires (negative if already expired).', example: '14', category: 'Certificate' },
  { key: 'cert.certificateExpiryDate', label: 'Expiry Date', description: 'ISO timestamp when the certificate expires.', example: '2026-05-01T00:00:00Z', category: 'Certificate' },
  { key: 'cert.certificateIssuer', label: 'Issuer', description: 'The certificate authority that issued the cert.', example: "Let's Encrypt R3", category: 'Certificate' },
  { key: 'cert.threshold', label: 'Threshold Crossed', description: 'Which alert threshold was crossed: 60, 30, 14, 7, or expired.', example: '14', category: 'Certificate' },
];

/**
 * Lookup table — one catalog per `VariableContextKey`.
 * `formFields` is intentionally empty here because form field variables
 * are dynamic per-form and come from `getFormFieldVariables()`.
 */
const CATALOGS: Record<VariableContextKey, VariableDefinition[]> = {
  ticket: TICKET_VARIABLES,
  requester: REQUESTER_VARIABLES,
  assignee: ASSIGNEE_VARIABLES,
  tenant: TENANT_VARIABLES,
  form: FORM_META_VARIABLES,
  submission: FORM_META_VARIABLES,
  formFields: [],
  sla: SLA_VARIABLES,
  change: CHANGE_VARIABLES,
  comment: COMMENT_VARIABLES,
  now: NOW_VARIABLES,
  cert: CERT_VARIABLES,
};

/**
 * Merge one or more catalogs into a single deduplicated, ordered
 * variable list for the picker.
 *
 * Order is preserved by the order of `contextKeys`, and within each
 * catalog the original order is kept. Duplicates (same `key`) are
 * eliminated — the first occurrence wins.
 */
export function getVariablesForContext(
  contextKeys: VariableContextKey[],
): VariableDefinition[] {
  const seen = new Set<string>();
  const result: VariableDefinition[] = [];
  for (const ctx of contextKeys) {
    const catalog = CATALOGS[ctx];
    if (!catalog) continue;
    for (const v of catalog) {
      if (seen.has(v.key)) continue;
      seen.add(v.key);
      result.push(v);
    }
  }
  return result;
}
