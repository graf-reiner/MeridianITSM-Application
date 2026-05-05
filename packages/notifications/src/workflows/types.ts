// ─── Workflow Engine Type Definitions ──────────────────────────────────────────

import type { EventContext } from '../conditions.js';
import type { NotificationTrigger } from '../types.js';

// ─── Graph Structure (React Flow compatible) ────────────────────────────────

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: string;                   // Maps to NodeDefinition.type
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;  // Node-specific configuration
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;          // For conditions: 'true' | 'false' | 'case_X'
  targetHandle?: string;
  label?: string;
}

// ─── Node Definition (for the registry) ─────────────────────────────────────

export interface NodeDefinition {
  type: string;
  category: 'trigger' | 'condition' | 'action' | 'control' | 'data';
  label: string;
  description: string;
  icon: string;                   // MDI icon path name (e.g., 'mdiTicketOutline')
  color: string;                  // CSS color for node header
  inputs: PortDefinition[];       // Input handles
  outputs: PortDefinition[];      // Output handles
  configSchema: FieldSchema[];    // Configuration form schema
  /**
   * For trigger nodes: the dispatcher trigger literal this node listens for.
   * Drives the create-workflow dropdown so the editor only offers triggers
   * that have a registered node. Required on category='trigger'; ignored
   * elsewhere.
   */
  notificationTrigger?: NotificationTrigger;
  /**
   * True when the node mutates ticket/change state when executed (assignment,
   * field updates, comments, escalations, webhook-wait response mapping).
   * The editor surfaces a warning so authors know the workflow can react to
   * its own updates if conditions are not scoped properly.
   */
  mutates?: boolean;
  execute?: (config: Record<string, unknown>, context: ExecutionContext) => Promise<NodeResult>;
}

export interface PortDefinition {
  id: string;
  label: string;
  type: 'default' | 'true' | 'false' | string;  // string for switch cases
}

export interface FieldSchema {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'select'
    | 'multiselect'
    | 'checkbox'
    | 'number'
    | 'json'
    | 'entity_select'
    | 'dynamic_select'
    | 'template_ref';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: unknown;
  /**
   * When set, the workflow builder renders this field with the variable
   * picker (`<VariableInput>` or `<VariableTextarea>`) instead of a
   * plain input. The values are the catalog keys from
   * `@meridian/core`'s `VariableContextKey` — e.g.
   * `['ticket', 'requester', 'tenant', 'now']`.
   */
  variableContext?: string[];
  /**
   * For `type: 'template_ref'` — the channel filter passed to the template
   * picker so it only lists compatible templates. One of EMAIL / TELEGRAM /
   * SLACK / TEAMS / DISCORD.
   */
  templateChannel?: 'EMAIL' | 'TELEGRAM' | 'SLACK' | 'TEAMS' | 'DISCORD';
  /**
   * For `type: 'template_ref'` — the keys of other fields in this node's
   * configSchema that should be hidden when a template is selected. Lets
   * inline subject/body fields disappear once a template takes over.
   */
  hidesKeys?: string[];
}

// ─── Execution Types ────────────────────────────────────────────────────────

export interface ExecutionContext {
  tenantId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  eventContext: EventContext;
  variables: Record<string, unknown>;   // Accumulated node outputs
  isSimulation: boolean;
  recursionDepth: number;
  /**
   * The id of the node currently executing. Set by the executor immediately
   * before calling `execute()`. Used by mutation nodes to build a stable
   * idempotency fingerprint that distinguishes one node from another in the
   * same workflow execution.
   */
  currentNodeId?: string;
  /**
   * BullMQ job id, when the workflow runs queue-backed (Phase 3). Written
   * once on the first step's outputData for traceability — lets operators
   * jump from a workflow step to the originating queue job.
   */
  queueJobId?: string;
  /** BullMQ attempt number (1 = first attempt, 2+ = retry). Same scope as queueJobId. */
  retryCount?: number;
}

export interface NodeResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  nextPort?: string;    // Which output port to follow (for conditions: 'true'/'false')
}

// ─── Serializable node definition for the frontend palette ──────────────────

export interface NodeDefinitionDTO {
  type: string;
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: FieldSchema[];
  notificationTrigger?: NotificationTrigger;
  mutates?: boolean;
}
