// ─── Notification Rule → Workflow Migration ──────────────────────────────────
// Converts existing NotificationRule records into WorkflowGraph format
// so they can be imported as draft workflows for admin review.

import type { WorkflowGraph } from './types.js';

interface NotificationRuleData {
  id: string;
  name: string;
  trigger: string;
  conditionGroups: unknown;
  actions: unknown;
  scopedQueueId: string | null;
  description: string | null;
}

interface ConditionGroup {
  conditions: Array<{ field: string; operator: string; value: unknown }>;
}

interface ActionConfig {
  type: string;
  recipients?: unknown;
  emails?: unknown;
  subject?: string;
  body?: string;
  title?: string;
  [key: string]: unknown;
}

const ACTION_TYPE_MAP: Record<string, string> = {
  in_app: 'action_send_in_app',
  email: 'action_send_email',
  slack: 'action_send_slack',
  teams: 'action_send_teams',
  webhook: 'action_send_webhook',
  push: 'action_send_push',
  escalate: 'action_escalate',
  update_field: 'action_update_field',
  sms: 'action_send_in_app', // SMS fallback to in-app
  webhook_wait: 'action_webhook_wait',
};

const TRIGGER_TYPE_MAP: Record<string, string> = {
  TICKET_CREATED: 'trigger_ticket_created',
  TICKET_UPDATED: 'trigger_ticket_updated',
  TICKET_ASSIGNED: 'trigger_ticket_assigned',
  TICKET_COMMENTED: 'trigger_ticket_commented',
  TICKET_RESOLVED: 'trigger_ticket_resolved',
  SLA_WARNING: 'trigger_sla_warning',
  SLA_BREACH: 'trigger_sla_breach',
  TICKET_APPROVAL_REQUESTED: 'trigger_ticket_created', // Approximate mapping
};

/**
 * Convert a notification rule to a workflow graph.
 */
export function convertRuleToWorkflowGraph(rule: NotificationRuleData): { graph: WorkflowGraph; warnings: string[] } {
  const warnings: string[] = [];
  const nodes: WorkflowGraph['nodes'] = [];
  const edges: WorkflowGraph['edges'] = [];

  let nodeY = 50;
  const NODE_SPACING = 140;

  // 1. Trigger node
  const triggerType = TRIGGER_TYPE_MAP[rule.trigger] ?? 'trigger_ticket_created';
  if (!TRIGGER_TYPE_MAP[rule.trigger]) {
    warnings.push(`Unknown trigger "${rule.trigger}" — mapped to ticket_created`);
  }

  const triggerId = 'trigger-1';
  nodes.push({
    id: triggerId,
    type: triggerType,
    position: { x: 250, y: nodeY },
    data: { label: `Trigger: ${rule.trigger.replace(/_/g, ' ')}`, config: {} },
  });
  nodeY += NODE_SPACING;

  let lastNodeId = triggerId;

  // 2. Condition group node (if conditions exist)
  const conditionGroups = rule.conditionGroups as ConditionGroup[] | null;
  if (conditionGroups && Array.isArray(conditionGroups) && conditionGroups.length > 0) {
    // Flatten all conditions from all groups
    const allConditions = conditionGroups.flatMap(g => g.conditions ?? []);

    if (allConditions.length > 0) {
      if (allConditions.length === 1) {
        // Single condition → use field_condition node
        const cond = allConditions[0];
        const condId = 'condition-1';
        nodes.push({
          id: condId,
          type: 'condition_field',
          position: { x: 250, y: nodeY },
          data: {
            label: `If ${cond.field} ${cond.operator} ${cond.value}`,
            config: { field: cond.field, operator: cond.operator, value: cond.value },
          },
        });
        edges.push({ id: `e-${triggerId}-${condId}`, source: triggerId, target: condId });
        nodeY += NODE_SPACING;
        lastNodeId = condId;
        // The "true" branch continues to actions; "false" branch ends
      } else {
        // Multiple conditions → use condition_group node
        const condId = 'condition-1';
        nodes.push({
          id: condId,
          type: 'condition_group',
          position: { x: 250, y: nodeY },
          data: {
            label: `${allConditions.length} conditions`,
            config: { conditions: JSON.stringify(allConditions), logic: 'and' },
          },
        });
        edges.push({ id: `e-${triggerId}-${condId}`, source: triggerId, target: condId });
        nodeY += NODE_SPACING;
        lastNodeId = condId;
      }
    }
  }

  // 3. Action nodes
  const actions = rule.actions as ActionConfig[] | null;
  if (actions && Array.isArray(actions)) {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionNodeType = ACTION_TYPE_MAP[action.type] ?? 'action_send_in_app';

      if (!ACTION_TYPE_MAP[action.type]) {
        warnings.push(`Unknown action type "${action.type}" — mapped to send_in_app`);
      }

      const actionId = `action-${i + 1}`;
      const { type: _type, ...actionConfig } = action;

      nodes.push({
        id: actionId,
        type: actionNodeType,
        position: { x: 250, y: nodeY },
        data: {
          label: action.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          config: actionConfig,
        },
      });

      // Connect: if previous was a condition, use "true" handle; otherwise "out"
      const sourceHandle = lastNodeId.startsWith('condition') ? 'true' : 'out';
      edges.push({
        id: `e-${lastNodeId}-${actionId}`,
        source: lastNodeId,
        target: actionId,
        sourceHandle,
      });

      nodeY += NODE_SPACING;
      lastNodeId = actionId;
    }
  }

  if (actions?.length === 0 || !actions) {
    warnings.push('No actions found in rule — workflow will have no action nodes');
  }

  return { graph: { nodes, edges }, warnings };
}
