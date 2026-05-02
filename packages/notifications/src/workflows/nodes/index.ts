// ─── Node Registration ────────────────────────────────────────────────────────
// Import all node files to trigger self-registration via registerNode().

// Triggers
import './triggers/ticket-created.js';
import './triggers/ticket-updated.js';
import './triggers/ticket-assigned.js';
import './triggers/ticket-commented.js';
import './triggers/ticket-resolved.js';
import './triggers/sla-warning.js';
import './triggers/sla-breach.js';
import './triggers/ticket-status-changed.js';

// Conditions
import './conditions/field-condition.js';
import './conditions/form-field-condition.js';
import './conditions/condition-group.js';

// Actions
import './actions/send-email.js';
import './actions/send-in-app.js';
import './actions/send-slack.js';
import './actions/send-teams.js';
import './actions/send-webhook.js';
import './actions/send-discord.js';
import './actions/send-telegram.js';
import './actions/send-push.js';
import './actions/escalate-ticket.js';
import './actions/update-field.js';
import './actions/change-status.js';
import './actions/change-priority.js';
import './actions/assign-ticket.js';
import './actions/add-comment.js';
